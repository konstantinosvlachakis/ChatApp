from unittest.mock import patch
import urllib.error

from django.test import TestCase
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.gemini import (
    CoachAIError,
    CoachAIQuotaError,
    generate_coach_reply,
    get_gemini_model_chain,
)

from .factory import make_user


class CoachChatEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(
            username="coachuser",
            email="coachuser@example.com",
            native_language="greek",
            base_translate_language="french",
        )
        self.client.force_authenticate(user=self.user)
        cache.clear()

    def test_coach_chat_requires_message(self):
        response = self.client.post("/api/coach/chat/", data={}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "Message is required.")

    @patch("chatapp.views.generate_coach_reply", return_value="Salut, on continue en francais.")
    def test_coach_chat_returns_gemini_reply(self, mock_generate):
        response = self.client.post(
            "/api/coach/chat/",
            data={"message": "Bonjour, corrige-moi si besoin."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["reply"], "Salut, on continue en francais.")
        self.assertEqual(response.json()["target_language"], "french")
        self.assertEqual(response.json()["native_language"], "greek")
        mock_generate.assert_called_once_with(
            message="Bonjour, corrige-moi si besoin.",
            target_language="french",
            native_language="greek",
            mode="casual_chat",
        )

    @patch("chatapp.views.generate_coach_reply", return_value="Tres bien, on continue.")
    def test_coach_chat_accepts_language_and_mode_overrides(self, mock_generate):
        response = self.client.post(
            "/api/coach/chat/",
            data={
                "message": "Let's do a travel roleplay.",
                "target_language": "spanish",
                "mode": "roleplay",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["target_language"], "spanish")
        self.assertEqual(response.json()["mode"], "roleplay")
        mock_generate.assert_called_once_with(
            message="Let's do a travel roleplay.",
            target_language="spanish",
            native_language="greek",
            mode="roleplay",
        )

    @patch("chatapp.views.generate_coach_reply", side_effect=CoachAIError("Missing GEMINI_API_KEY."))
    def test_coach_chat_returns_503_when_gemini_is_unavailable(self, mock_generate):
        response = self.client.post(
            "/api/coach/chat/",
            data={"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json()["detail"], "Missing GEMINI_API_KEY.")
        mock_generate.assert_called_once()

    @patch(
        "chatapp.views.generate_coach_reply",
        side_effect=CoachAIQuotaError(
            "The AI coach is temporarily busy right now. Please wait a moment and try again."
        ),
    )
    def test_coach_chat_returns_429_when_gemini_quota_is_hit(self, mock_generate):
        response = self.client.post(
            "/api/coach/chat/",
            data={"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(
            response.json()["detail"],
            "The AI coach is temporarily busy right now. Please wait a moment and try again.",
        )
        mock_generate.assert_called_once()

    @patch("chatapp.views.COACH_CHAT_RATE_LIMIT_REQUESTS", 2)
    @patch("chatapp.views.generate_coach_reply", return_value="Salut encore.")
    def test_coach_chat_rate_limits_per_user(self, mock_generate):
        first_response = self.client.post(
            "/api/coach/chat/",
            data={"message": "One"},
            format="json",
        )
        second_response = self.client.post(
            "/api/coach/chat/",
            data={"message": "Two"},
            format="json",
        )
        third_response = self.client.post(
            "/api/coach/chat/",
            data={"message": "Three"},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(third_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(
            third_response.json()["detail"],
            "You are sending messages too quickly. Please wait a moment before asking the coach again.",
        )
        self.assertEqual(mock_generate.call_count, 2)


class GeminiFallbackTests(TestCase):
    def test_model_chain_keeps_primary_and_fallbacks_without_duplicates(self):
        with patch("chatapp.gemini.GEMINI_MODEL", "gemini-primary"), patch(
            "chatapp.gemini.GEMINI_FALLBACK_MODELS",
            ["gemini-secondary", "gemini-primary", "gemini-tertiary"],
        ):
            self.assertEqual(
                get_gemini_model_chain(),
                ["gemini-primary", "gemini-secondary", "gemini-tertiary"],
            )

    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False)
    def test_generate_coach_reply_falls_back_after_quota_error(self):
        recorded_urls = []

        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def read(self):
                return self.payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        class FakeQuotaHTTPError(urllib.error.HTTPError):
            def __init__(self):
                super().__init__(
                    url="https://example.test",
                    code=429,
                    msg="Too Many Requests",
                    hdrs=None,
                    fp=None,
                )

            def read(self):
                return b'{"error":{"status":"RESOURCE_EXHAUSTED"}}'

        def fake_urlopen(request, timeout=0):
            recorded_urls.append(request.full_url)
            if "gemini-primary" in request.full_url:
                raise FakeQuotaHTTPError()
            return FakeResponse(
                b'{"candidates":[{"content":{"parts":[{"text":"Fallback reply"}]}}]}'
            )

        with patch("chatapp.gemini.GEMINI_MODEL", "gemini-primary"), patch(
            "chatapp.gemini.GEMINI_FALLBACK_MODELS",
            ["gemini-secondary"],
        ), patch("chatapp.gemini.urlopen", side_effect=fake_urlopen):
            reply = generate_coach_reply(
                "Bonjour",
                target_language="French",
                native_language="Greek",
            )

        self.assertEqual(reply, "Fallback reply")
        self.assertEqual(len(recorded_urls), 2)
        self.assertIn("gemini-primary", recorded_urls[0])
        self.assertIn("gemini-secondary", recorded_urls[1])

    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}, clear=False)
    def test_generate_coach_reply_raises_quota_error_when_all_models_fail(self):
        class FakeQuotaHTTPError(urllib.error.HTTPError):
            def __init__(self):
                super().__init__(
                    url="https://example.test",
                    code=429,
                    msg="Too Many Requests",
                    hdrs=None,
                    fp=None,
                )

            def read(self):
                return b'{"error":{"status":"RESOURCE_EXHAUSTED"}}'

        with patch("chatapp.gemini.GEMINI_MODEL", "gemini-primary"), patch(
            "chatapp.gemini.GEMINI_FALLBACK_MODELS",
            ["gemini-secondary"],
        ), patch("chatapp.gemini.urlopen", side_effect=FakeQuotaHTTPError()):
            with self.assertRaises(CoachAIQuotaError):
                generate_coach_reply(
                    "Hello",
                    target_language="English",
                    native_language="Greek",
                )
