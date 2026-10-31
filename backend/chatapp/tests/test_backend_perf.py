"""Connection release, translate upstream errors, community-list cache
invalidation rules and the practice-pool refill lock."""

import json
import urllib.error
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from chatapp import views
from chatapp.models import MessageTranslation

from .factory import make_conversation, make_message, make_user


class ReleaseDbConnectionTests(TransactionTestCase):
    def test_closes_idle_connection(self):
        make_user()  # opens the connection
        with patch.object(connection, "close") as close:
            views.release_db_connection()
        close.assert_called_once()

    def test_leaves_connection_inside_transaction(self):
        with transaction.atomic():
            make_user()
            with patch.object(connection, "close") as close:
                views.release_db_connection()
        close.assert_not_called()


def fake_translate_response(body):
    response = MagicMock()
    response.__enter__.return_value.read.return_value = body
    return response


class TranslateUpstreamErrorTests(TestCase):
    def setUp(self):
        cache.clear()
        self.conversation = make_conversation()
        self.message = make_message(self.conversation, text="Hola, que tal")
        self.client = APIClient()
        self.client.force_authenticate(user=self.conversation.receiver)

    def _translate(self, **urlopen_kwargs):
        with patch("chatapp.views.urlopen", **urlopen_kwargs):
            return self.client.post(
                "/api/messages/translate/",
                {"message_id": self.message.id, "target_language": "english"},
                format="json",
            )

    def _assert_unavailable(self, response):
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "translation_unavailable")
        self.assertIsInstance(response.json()["error"], str)
        self.assertFalse(MessageTranslation.objects.exists())

    def test_read_timeout_returns_502(self):
        self._assert_unavailable(self._translate(side_effect=TimeoutError()))

    def test_malformed_json_returns_502(self):
        self._assert_unavailable(
            self._translate(return_value=fake_translate_response(b"<html>nope"))
        )

    def test_unexpected_payload_shape_returns_502(self):
        self._assert_unavailable(
            self._translate(return_value=fake_translate_response(b"[[[null]]]"))
        )

    def test_url_error_still_returns_502(self):
        self._assert_unavailable(
            self._translate(side_effect=urllib.error.URLError("down"))
        )

    def test_success_is_unchanged(self):
        body = json.dumps([[["Hi, how are you", "Hola, que tal"]], None, "es"])
        response = self._translate(
            return_value=fake_translate_response(body.encode("utf-8"))
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["translated_text"], "Hi, how are you")
        self.assertTrue(MessageTranslation.objects.filter(message=self.message).exists())


class CommunityListInvalidationTests(TestCase):
    """Only blocks and account deletion bump the global community-list version."""

    def setUp(self):
        cache.clear()
        self.user = make_user(username="viewer")
        self.other = make_user(username="other")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _version(self):
        return views.get_profile_list_cache_version()

    def test_registration_does_not_bump(self):
        before = self._version()
        response = APIClient().post(
            "/api/register/",
            {
                "username": "newcomer",
                "password": "a-Strong-passphrase-42",
                "nativeLanguage": "spanish",
                "email": "newcomer@example.com",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self._version(), before)

    def test_profile_edit_does_not_bump(self):
        before = self._version()
        response = self.client.patch(
            "/api/profile/edit/",
            {"username": "renamed", "native_language": "greek"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._version(), before)

    def test_block_and_unblock_bump(self):
        before = self._version()
        self.assertEqual(
            self.client.post(f"/api/profile/public/{self.other.username}/block/").status_code,
            200,
        )
        after_block = self._version()
        self.assertGreater(after_block, before)
        self.client.delete(f"/api/profile/public/{self.other.username}/block/")
        self.assertGreater(self._version(), after_block)

    def test_blocked_user_disappears_from_cached_list(self):
        names = lambda r: [p["username"] for p in r.json()["profiles"]]  # noqa: E731
        self.assertIn("other", names(self.client.get("/api/profile/data")))
        self.client.post("/api/profile/public/other/block/")
        self.assertNotIn("other", names(self.client.get("/api/profile/data")))

    def test_account_deletion_bumps(self):
        before = self._version()
        client = APIClient()
        client.force_authenticate(user=self.other)
        # Deleting needs the current password (security/sessions).
        response = client.delete(
            "/api/profile/delete/", {"current_password": "pass1234"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreater(self._version(), before)


GENERATED = {
    "sentence": "I ___ to school.",
    "answer": "go",
    "options": ["go", "goes", "went", "gone"],
    "hint": "Present simple.",
}


@patch("chatapp.views.PRACTICE_GENERATOR_ENABLED", True)
class PracticeRefillLockTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.bucket = views.practice_bucket_for_level(1)

    def _lock_key(self):
        return views.daily_library_refill_lock_key("english", self.bucket)

    @patch("chatapp.views.PRACTICE_GENERATOR_MODE", "daily")
    def test_request_makes_one_call_and_releases_lock(self):
        with patch(
            "chatapp.views.fetch_generated_challenge", return_value=dict(GENERATED)
        ) as fetch:
            challenge = views.build_challenge("english", 1, self.user.id)
        fetch.assert_called_once()
        self.assertEqual(challenge["source"], "generator_daily")
        pool = cache.get(views.daily_library_cache_key("english", self.bucket))
        self.assertEqual(len(pool), 1)
        self.assertIsNone(cache.get(self._lock_key()))

    @patch("chatapp.views.PRACTICE_GENERATOR_MODE", "daily")
    def test_concurrent_request_skips_generator_and_serves_library(self):
        cache.add(self._lock_key(), 1, timeout=60)
        with patch("chatapp.views.fetch_generated_challenge") as fetch:
            challenge = views.build_challenge("english", 1, self.user.id)
        fetch.assert_not_called()
        self.assertEqual(challenge["source"], "library")

    @patch("chatapp.views.PRACTICE_GENERATOR_MODE", "daily")
    def test_full_pool_makes_no_call(self):
        pool = [
            {**GENERATED, "sentence": f"Sentence {i} ___.", "difficulty_bucket": self.bucket}
            for i in range(views.PRACTICE_DAILY_LIBRARY_MIN_READY)
        ]
        cache.set(views.daily_library_cache_key("english", self.bucket), pool, 60)
        with patch("chatapp.views.fetch_generated_challenge") as fetch:
            challenge = views.build_challenge("english", 1, self.user.id)
        fetch.assert_not_called()
        self.assertEqual(challenge["source"], "generator_daily")

    @patch("chatapp.views.PRACTICE_GENERATOR_MODE", "hybrid")
    def test_hybrid_failed_refill_does_not_also_call_realtime(self):
        with patch(
            "chatapp.views.fetch_generated_challenge", return_value=None
        ) as fetch:
            challenge = views.build_challenge("english", 1, self.user.id)
        fetch.assert_called_once()
        self.assertEqual(challenge["source"], "library")

    def test_prewarm_still_bulk_fills(self):
        sentences = iter(f"Item {i} ___." for i in range(100))
        with patch(
            "chatapp.views.fetch_generated_challenge",
            side_effect=lambda *a: {**GENERATED, "sentence": next(sentences)},
        ):
            pool = views.get_or_build_daily_library(
                "english", 1, self.bucket, target_size=5, min_ready=5
            )
        self.assertEqual(len(pool), 5)
