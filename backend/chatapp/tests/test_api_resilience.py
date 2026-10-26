"""Error envelope, unknown-path handling, health check, request ids and Sentry init."""

import logging
from unittest.mock import patch

from django.core.cache import cache
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import DatabaseError
from django.http import Http404
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework import exceptions, serializers
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView

from core.exceptions import GENERIC_SERVER_ERROR
from core.observability import (
    RequestIdLogFilter,
    clean_request_id,
    init_sentry,
    reset_request_id,
    scrub_sentry_event,
    set_request_id,
)

from .factory import make_conversation, make_user


class _NameSerializer(serializers.Serializer):
    name = serializers.CharField()


def _raising_view(exc):
    class RaisingView(APIView):
        authentication_classes = []
        permission_classes = [AllowAny]
        throttle_classes = []

        def get(self, request):
            raise exc

    return RaisingView.as_view()


class _ValidatingView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def post(self, request):
        serializer = _NameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return None


class _AuthRequiredView(APIView):
    # Default auth classes + IsAuthenticated.
    def get(self, request):  # pragma: no cover - never reached
        return None


class ExceptionHandlerEnvelopeTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def _get(self, exc):
        response = _raising_view(exc)(self.factory.get("/api/x/"))
        response.render()
        return response

    def assertEnvelope(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code)
        body = response.data
        self.assertIsInstance(body["error"], str)
        self.assertTrue(body["error"])
        self.assertEqual(body["code"], code)
        return body

    def test_validation_error_is_400_invalid_with_field_details(self):
        response = _ValidatingView.as_view()(self.factory.post("/api/x/", {}, format="json"))
        body = self.assertEnvelope(response, 400, "invalid")
        self.assertIn("name", body["details"])
        self.assertTrue(body["error"].startswith("name: "))

    def test_not_authenticated_is_401(self):
        response = _AuthRequiredView.as_view()(self.factory.get("/api/x/"))
        body = self.assertEnvelope(response, 401, "not_authenticated")
        self.assertEqual(body["detail"], body["error"])  # legacy key kept
        self.assertIn("WWW-Authenticate", response)

    def test_authentication_failed_is_401(self):
        # simplejwt's InvalidToken (an AuthenticationFailed) carries a dict detail.
        request = self.factory.get("/api/x/", HTTP_AUTHORIZATION="Bearer not-a-jwt")
        response = _AuthRequiredView.as_view()(request)
        body = self.assertEnvelope(response, 401, "token_not_valid")
        self.assertNotIn("messages", body)

    def test_permission_denied_is_403(self):
        self.assertEnvelope(self._get(exceptions.PermissionDenied()), 403, "permission_denied")
        self.assertEnvelope(self._get(DjangoPermissionDenied()), 403, "permission_denied")

    def test_csrf_failure_has_its_own_code(self):
        response = self._get(exceptions.PermissionDenied("CSRF Failed: CSRF token missing."))
        self.assertEnvelope(response, 403, "csrf_failed")

    def test_not_found_is_404(self):
        self.assertEnvelope(self._get(exceptions.NotFound()), 404, "not_found")
        self.assertEnvelope(self._get(Http404("secret detail")), 404, "not_found")

    def test_method_not_allowed_is_405(self):
        self.assertEnvelope(
            self._get(exceptions.MethodNotAllowed("PUT")), 405, "method_not_allowed"
        )

    def test_throttled_is_429_with_retry_after(self):
        response = self._get(exceptions.Throttled(wait=12.2))
        body = self.assertEnvelope(response, 429, "throttled")
        self.assertEqual(response["Retry-After"], "13")
        self.assertEqual(body["retry_after"], 13)

    def test_unhandled_exception_is_generic_500_with_request_id(self):
        token = set_request_id("abc-123")
        try:
            with self.assertLogs("core.api", level="ERROR") as logs:
                response = self._get(RuntimeError("database password is hunter2"))
        finally:
            reset_request_id(token)
        body = self.assertEnvelope(response, 500, "server_error")
        self.assertEqual(body["error"], GENERIC_SERVER_ERROR)
        self.assertEqual(body["request_id"], "abc-123")
        self.assertNotIn("hunter2", response.content.decode())
        self.assertIn("Traceback", "\n".join(logs.output))


class ApiEnvelopeIntegrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user()

    def test_unauthenticated_request_uses_envelope(self):
        response = self.client.get("/api/profile/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "not_authenticated")

    def test_hand_written_errors_get_a_code(self):
        self.client.force_authenticate(self.user)
        other = make_conversation()
        response = self.client.get(f"/api/conversations/{other.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "not_participant")

        response = self.client.post("/api/conversations/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["error"], "Missing participant username")
        self.assertEqual(body["code"], "invalid")  # default code from the middleware

    def test_token_errors_keep_legacy_message_key(self):
        response = self.client.post(
            "/api/token/", {"email": self.user.email, "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        body = response.json()
        self.assertEqual(body["code"], "no_active_account")
        self.assertEqual(body["error"], body["message"])

    def test_coach_errors_keep_legacy_detail_key(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/coach/chat/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["error"], "Message is required.")
        self.assertEqual(body["detail"], body["error"])
        self.assertEqual(body["code"], "invalid")

    def test_wrong_content_type_is_415_envelope(self):
        self.client.force_authenticate(self.user)
        conversation = make_conversation(sender=self.user)
        response = self.client.post(
            f"/api/conversations/{conversation.id}/messages/", {"text": "hi"}, format="json"
        )
        self.assertEqual(response.status_code, 415)
        self.assertEqual(response.json()["code"], "unsupported_media_type")

    @patch("chatapp.views.get_profile_cache_version", side_effect=RuntimeError("boom secret"))
    def test_unhandled_view_error_returns_request_id_from_header(self, _mock):
        self.client.force_authenticate(self.user)
        with self.assertLogs("core.api", level="ERROR"):
            response = self.client.get("/api/profile/")
        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertEqual(body["code"], "server_error")
        self.assertEqual(body["request_id"], response["X-Request-ID"])
        self.assertNotIn("boom secret", response.content.decode())


class UnknownPathTests(TestCase):
    def test_unknown_api_path_is_json_404(self):
        for path in ("/api/does-not-exist/", "/api/profile", "/api"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 404, path)
            self.assertEqual(response["Content-Type"], "application/json")
            self.assertEqual(response.json()["code"], "not_found")

    def test_unknown_api_path_post_is_json_404_not_csrf_page(self):
        response = self.client.post("/api/nope/", {})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")

    def test_non_get_to_spa_path_is_405(self):
        response = self.client.post("/some/page/", {})
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response["Allow"], "GET, HEAD")


class HealthCheckTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_health_ok_without_auth(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["checks"]["database"]["status"], "ok")
        self.assertEqual(body["checks"]["cache"]["status"], "ok")
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_health_reports_failing_database(self):
        with patch("core.views.connection.cursor", side_effect=DatabaseError("host db.internal down")):
            with self.assertLogs("core.views", level="WARNING"):
                response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["status"], "error")
        self.assertEqual(body["code"], "unhealthy")
        self.assertEqual(body["checks"]["database"]["status"], "error")
        self.assertEqual(body["checks"]["cache"]["status"], "ok")
        self.assertNotIn("db.internal", response.content.decode())

    def test_health_reports_failing_cache(self):
        with patch("core.views.cache.get", return_value=None):
            with self.assertLogs("core.views", level="WARNING"):
                response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["checks"]["cache"]["status"], "error")

    @override_settings(
        REST_FRAMEWORK={
            "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
            "DEFAULT_THROTTLE_RATES": {"anon": "1/minute"},
        }
    )
    def test_health_is_not_throttled(self):
        for _ in range(3):
            self.assertEqual(self.client.get("/api/health/").status_code, 200)


class RequestIdTests(TestCase):
    def test_generates_request_id(self):
        response = self.client.get("/api/health/")
        request_id = response["X-Request-ID"]
        self.assertRegex(request_id, r"^[0-9a-f]{32}$")

    def test_echoes_valid_incoming_request_id(self):
        response = self.client.get("/api/health/", HTTP_X_REQUEST_ID="client-req-42")
        self.assertEqual(response["X-Request-ID"], "client-req-42")

    def test_replaces_invalid_incoming_request_id(self):
        for bad in ("a" * 65, "bad id", "x<script>", "id;drop"):
            response = self.client.get("/api/health/", HTTP_X_REQUEST_ID=bad)
            self.assertNotEqual(response["X-Request-ID"], bad)
            self.assertRegex(response["X-Request-ID"], r"^[0-9a-f]{32}$")

    def test_error_responses_carry_request_id(self):
        response = self.client.get("/api/missing/")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response["X-Request-ID"])

    def test_clean_request_id(self):
        self.assertEqual(clean_request_id("abc-DEF-123"), "abc-DEF-123")
        self.assertIsNone(clean_request_id(""))
        self.assertIsNone(clean_request_id("a" * 65))

    def test_log_filter_adds_request_id(self):
        record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)
        token = set_request_id("rid-1")
        try:
            RequestIdLogFilter().filter(record)
        finally:
            reset_request_id(token)
        self.assertEqual(record.request_id, "rid-1")

        record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)
        RequestIdLogFilter().filter(record)
        self.assertEqual(record.request_id, "-")


class SentryTests(SimpleTestCase):
    def test_init_skipped_without_dsn(self):
        with patch.dict("os.environ", {"SENTRY_DSN": ""}):
            with patch("sentry_sdk.init") as mock_init:
                self.assertFalse(init_sentry())
        mock_init.assert_not_called()

    def test_init_with_dsn_disables_pii(self):
        env = {
            "SENTRY_DSN": "https://public@example.invalid/1",
            "SENTRY_TRACES_SAMPLE_RATE": "0.25",
            "HEROKU_SLUG_COMMIT": "abc123",
        }
        with patch.dict("os.environ", env):
            with patch("sentry_sdk.init") as mock_init:
                self.assertTrue(init_sentry(environment="production"))
        kwargs = mock_init.call_args.kwargs
        self.assertFalse(kwargs["send_default_pii"])
        self.assertEqual(kwargs["traces_sample_rate"], 0.25)
        self.assertEqual(kwargs["release"], "abc123")
        self.assertEqual(kwargs["environment"], "production")
        self.assertIs(kwargs["before_send"], scrub_sentry_event)

    def test_scrubber_removes_sensitive_data_and_tags_request_id(self):
        event = {
            "request": {
                "cookies": {"lv_access": "x"},
                "data": {"text": "private chat"},
                "headers": {"Authorization": "Bearer x", "Cookie": "a=b", "Accept": "json"},
            },
            "user": {"id": 7, "email": "a@example.com", "username": "alice"},
            "message": "failed for bob@example.com",
            "exception": {"values": [{"value": "user carol@example.com missing"}]},
            "breadcrumbs": {"values": [{"message": "dave@example.com", "data": {"x": 1}}]},
        }
        token = set_request_id("rid-9")
        try:
            scrubbed = scrub_sentry_event(event)
        finally:
            reset_request_id(token)
        self.assertNotIn("cookies", scrubbed["request"])
        self.assertNotIn("data", scrubbed["request"])
        self.assertEqual(scrubbed["request"]["headers"]["Authorization"], "[Filtered]")
        self.assertEqual(scrubbed["request"]["headers"]["Cookie"], "[Filtered]")
        self.assertEqual(scrubbed["request"]["headers"]["Accept"], "json")
        self.assertEqual(scrubbed["user"], {"id": 7})
        self.assertNotIn("@example.com", str(scrubbed))
        self.assertEqual(scrubbed["tags"]["request_id"], "rid-9")

