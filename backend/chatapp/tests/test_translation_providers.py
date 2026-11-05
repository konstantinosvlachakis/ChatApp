"""Translation providers (chatapp/translation.py): DeepL first when configured, then Google's
free endpoint, which is skipped for a while after it answers 429."""

import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from chatapp import translation
from chatapp.models import MessageTranslation

from .factory import make_conversation, make_message

FREE_KEY = "test-key-123:fx"


def json_response(payload):
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(payload).encode("utf-8")
    return response


def http_error(code):
    return urllib.error.HTTPError("https://example.test", code, "error", {}, io.BytesIO(b""))


DEEPL_OK = {"translations": [{"detected_source_language": "ES", "text": "Hi, how are you"}]}
FREE_OK = [[["Hi, how are you (free)", "Hola, que tal"]], None, "es"]


class TranslationProviderTests(TestCase):
    def setUp(self):
        cache.clear()
        self.conversation = make_conversation()
        self.message = make_message(self.conversation, text="Hola, que tal")
        self.client = APIClient()
        self.client.force_authenticate(user=self.conversation.receiver)

    def post(self, urlopen_mock, target="english"):
        with patch("chatapp.translation.urlopen", urlopen_mock):
            return self.client.post(
                "/api/messages/translate/",
                {"message_id": self.message.id, "target_language": target},
                format="json",
            )

    @override_settings(DEEPL_API_KEY=FREE_KEY)
    def test_deepl_is_used_when_configured(self):
        urlopen = MagicMock(return_value=json_response(DEEPL_OK))
        response = self.post(urlopen)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["translated_text"], "Hi, how are you")
        self.assertEqual(response.json()["source_language"], "es")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api-free.deepl.com/v2/translate")
        self.assertEqual(request.get_header("Authorization"), f"DeepL-Auth-Key {FREE_KEY}")
        self.assertEqual(json.loads(request.data)["target_lang"], "EN-US")
        self.assertTrue(MessageTranslation.objects.filter(message=self.message).exists())

    @override_settings(DEEPL_API_KEY="paid-key")
    def test_paid_keys_use_the_paid_host(self):
        urlopen = MagicMock(return_value=json_response(DEEPL_OK))
        self.post(urlopen)
        self.assertEqual(urlopen.call_args.args[0].full_url, "https://api.deepl.com/v2/translate")

    @override_settings(DEEPL_API_KEY=FREE_KEY)
    def test_deepl_failure_falls_back_to_free_endpoint(self):
        # e.g. 456 Quota Exceeded or an unsupported target language.
        urlopen = MagicMock(side_effect=[http_error(456), json_response(FREE_OK)])
        with self.assertLogs("chatapp.translation", level="WARNING") as logs:
            response = self.post(urlopen)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["translated_text"], "Hi, how are you (free)")
        self.assertNotIn(FREE_KEY, "\n".join(logs.output))

    @override_settings(DEEPL_API_KEY=FREE_KEY)
    def test_same_language_is_detected_from_deepl(self):
        urlopen = MagicMock(
            return_value=json_response(
                {"translations": [{"detected_source_language": "EN", "text": "Hola, que tal"}]}
            )
        )
        response = self.post(urlopen)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "same_language")

    def test_free_endpoint_429_starts_a_cooldown(self):
        urlopen = MagicMock(side_effect=http_error(429))
        first = self.post(urlopen)
        self.assertEqual(first.status_code, 502)
        self.assertEqual(first.json()["code"], "translation_unavailable")
        self.assertEqual(urlopen.call_count, 1)

        # Within the cooldown the free endpoint is not called again.
        second = self.post(urlopen)
        self.assertEqual(second.status_code, 502)
        self.assertEqual(urlopen.call_count, 1)

    @override_settings(DEEPL_API_KEY=FREE_KEY)
    def test_deepl_still_works_during_the_free_endpoint_cooldown(self):
        cache.set(translation.FREE_ENDPOINT_COOLDOWN_KEY, True, timeout=60)
        urlopen = MagicMock(return_value=json_response(DEEPL_OK))
        response = self.post(urlopen)
        self.assertEqual(response.status_code, 200)

    def test_other_free_endpoint_errors_dont_start_a_cooldown(self):
        urlopen = MagicMock(side_effect=[http_error(503), json_response(FREE_OK)])
        self.assertEqual(self.post(urlopen).status_code, 502)
        self.assertEqual(self.post(urlopen).status_code, 200)
