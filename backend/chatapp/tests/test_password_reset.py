import re
from unittest.mock import patch

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.auth_views import PASSWORD_RESET_REQUEST_MESSAGE
from chatapp.throttles import PasswordResetEmailThrottle, PasswordResetIPThrottle

from .factory import make_user

RESET_URL = "/api/auth/password-reset/"
CONFIRM_URL = "/api/auth/password-reset/confirm/"
NEW_PASSWORD = "a-Fresh-passphrase-91"


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_RESET_URL_BASE="https://app.example.test",
    PASSWORD_RESET_EMAIL_ASYNC=False,
)
class PasswordResetTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user(
            username="forgetful", email="forgetful@example.com", password="old-Passphrase-77"
        )

    def tearDown(self):
        cache.clear()

    def _request(self, email):
        return self.client.post(RESET_URL, {"email": email}, format="json")

    def _confirm(self, uid, token, new_password=NEW_PASSWORD):
        return self.client.post(
            CONFIRM_URL,
            {"uid": uid, "token": token, "new_password": new_password},
            format="json",
        )

    def _link_parts(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        return uid, default_token_generator.make_token(self.user)

    def test_unknown_email_gets_the_same_generic_response_and_no_email(self):
        unknown = self._request("nobody@example.com")
        known = self._request("forgetful@example.com")

        self.assertEqual(unknown.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown.json(), known.json())
        self.assertEqual(unknown.json(), {"message": PASSWORD_RESET_REQUEST_MESSAGE})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["forgetful@example.com"])

    def test_blank_or_malformed_payload_is_still_generic(self):
        for payload in ({}, {"email": ""}, {"email": 42}):
            response = self.client.post(RESET_URL, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.json(), {"message": PASSWORD_RESET_REQUEST_MESSAGE})
        self.assertEqual(len(mail.outbox), 0)

    def test_known_email_receives_a_working_link(self):
        response = self._request("  Forgetful@Example.COM ")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        message = mail.outbox[0]
        self.assertIn("Reset your LangVoyage password", message.subject)
        html_bodies = [content for content, mime in message.alternatives if mime == "text/html"]
        self.assertEqual(len(html_bodies), 1)
        match = re.search(
            r"https://app\.example\.test/reset-password/([\w-]+)/([\w-]+)", message.body
        )
        self.assertIsNotNone(match)
        self.assertIn(match.group(0), html_bodies[0])

        confirm = self._confirm(match.group(1), match.group(2))
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)

        login = self.client.post(
            "/api/token/",
            {"email": "forgetful@example.com", "password": NEW_PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_link_falls_back_to_base_url(self):
        with override_settings(PASSWORD_RESET_URL_BASE="", BASE_URL="http://site.test"):
            self._request("forgetful@example.com")

        self.assertIn("http://site.test/reset-password/", mail.outbox[0].body)

    def test_smtp_failure_still_returns_generic_response_without_logging_email(self):
        with patch(
            "chatapp.auth_views.EmailMultiAlternatives.send",
            side_effect=OSError("smtp down"),
        ), self.assertLogs("chatapp.auth_views", level="ERROR") as logs:
            response = self._request("forgetful@example.com")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"message": PASSWORD_RESET_REQUEST_MESSAGE})
        self.assertNotIn("forgetful@example.com", "\n".join(logs.output))

    def test_confirm_sets_password_and_link_is_single_use(self):
        uid, token = self._link_parts()

        response = self._confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

        reuse = self._confirm(uid, token, "another-Passphrase-55")
        self.assertEqual(reuse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(reuse.json()["code"], "invalid_reset_link")

    def test_bad_token_or_uid_is_rejected(self):
        uid, _ = self._link_parts()
        cases = [
            (uid, "bad-token"),
            ("not-base64!", "bad-token"),
            (urlsafe_base64_encode(force_bytes(999999)), "bad-token"),
            ("", ""),
        ]
        for bad_uid, bad_token in cases:
            response = self._confirm(bad_uid, bad_token)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            body = response.json()
            self.assertEqual(body["code"], "invalid_reset_link")
            self.assertIsInstance(body["error"], str)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-Passphrase-77"))

    def test_expired_token_is_rejected(self):
        uid, token = self._link_parts()
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self._confirm(uid, token)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "invalid_reset_link")

    def test_weak_password_returns_validator_messages(self):
        uid, token = self._link_parts()

        response = self._confirm(uid, token, "123")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        body = response.json()
        self.assertEqual(body["code"], "invalid_password")
        self.assertIn("too short", body["error"])
        self.assertIsInstance(body["details"], list)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-Passphrase-77"))

        # The link still works after a rejected password.
        self.assertEqual(self._confirm(uid, token).status_code, status.HTTP_200_OK)

    def test_missing_password_is_invalid_password(self):
        uid, token = self._link_parts()

        response = self.client.post(CONFIRM_URL, {"uid": uid, "token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "invalid_password")

    def test_endpoints_need_no_auth_or_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.cookies["lv_access"] = "stale-or-garbage"

        response = client.post(RESET_URL, {"email": "forgetful@example.com"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_request_is_throttled_per_ip(self):
        with patch.object(
            PasswordResetIPThrottle, "THROTTLE_RATES", {"password_reset": "3/hour"}
        ), patch.object(
            PasswordResetEmailThrottle, "THROTTLE_RATES", {"password_reset_email": "100/hour"}
        ):
            codes = [self._request(f"someone{i}@example.com").status_code for i in range(5)]

        self.assertEqual(codes[:3], [200, 200, 200])
        self.assertEqual(codes[-1], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_request_is_throttled_per_email(self):
        with patch.object(
            PasswordResetIPThrottle, "THROTTLE_RATES", {"password_reset": "100/hour"}
        ), patch.object(
            PasswordResetEmailThrottle, "THROTTLE_RATES", {"password_reset_email": "2/hour"}
        ):
            responses = [
                self.client.post(
                    RESET_URL,
                    {"email": "Forgetful@example.com"},
                    format="json",
                    REMOTE_ADDR=f"192.0.2.{i + 1}",
                )
                for i in range(3)
            ]
            other = self._request("other@example.com").status_code

        self.assertEqual([r.status_code for r in responses], [200, 200, 429])
        self.assertEqual(responses[-1].json()["code"], "throttled")
        self.assertEqual(other, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)


class PasswordResetSettingsTests(TestCase):
    def test_reset_links_expire_after_one_hour(self):
        from django.conf import settings

        self.assertEqual(settings.PASSWORD_RESET_TIMEOUT, 3600)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_RESET_URL_BASE="https://app.example.test",
    PASSWORD_RESET_EMAIL_ASYNC=True,
)
class PasswordResetAsyncTests(TestCase):
    def test_email_is_sent_off_the_request_thread(self):
        user = make_user(username="asyncuser", email="async@example.test")
        with patch("chatapp.auth_views.threading.Thread") as thread_cls:
            response = APIClient().post(
                "/api/auth/password-reset/", {"email": user.email}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        thread_cls.assert_called_once()
        self.assertEqual(len(mail.outbox), 0)
        thread_cls.call_args.kwargs["target"]()
        self.assertEqual(len(mail.outbox), 1)
