"""Voice Repeat: server-side sentence library, no-repeat rounds and capped XP."""

import json
import logging
import tempfile
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import UserRateThrottle

from chatapp import views
from chatapp.models import PracticeLanguageProgress, PracticeStats
from chatapp.practice_library import (
    BUCKETS,
    LANGUAGE_SCRIPTS,
    PRACTICE_LIBRARY,
    PracticeLibraryError,
    normalize_sentence,
)
from chatapp.practice_library.voice import (
    VOICE_LIBRARY,
    WORD_BOUNDS,
    load_voice_library,
    parse_voice_sentence_id,
    validate_voice_library,
    voice_word_count,
)
from chatapp.throttles import VoiceCompleteRateThrottle, VoiceNextRateThrottle

from .factory import make_user
from .test_redis_resilience import install_failing_client, reset_resilience

NEXT_URL = "/api/practice/voice/next/"
COMPLETE_URL = "/api/practice/voice/complete/"
# complete/: stats get_or_create, update, refresh, leaderboard top 10, rank count.
MAX_VOICE_COMPLETE_QUERIES = 6

# The three sentences the clients used to hard-code stay first in bucket 1.
ORIGINAL_FIRST_ITEMS = {
    "english": ["I practice English every day.", "The weather is beautiful today.", "Please repeat this sentence clearly."],
    "spanish": ["Practico español todos los días.", "Hoy hace muy buen tiempo.", "Por favor repite esta frase claramente."],
    "french": ["Je pratique le français chaque jour.", "Il fait très beau aujourd'hui.", "Répète cette phrase avec une bonne prononciation."],
    "greek": ["Εξασκούμαι στα ελληνικά κάθε μέρα.", "Σήμερα ο καιρός είναι υπέροχος.", "Παρακαλώ επανάλαβε αυτή την πρόταση καθαρά."],
    "russian": ["Я практикую русский язык каждый день.", "Сегодня очень хорошая погода.", "Пожалуйста, повтори это предложение чётко."],
}


class VoiceLibraryDataTests(SimpleTestCase):
    def test_library_is_valid(self):
        self.assertEqual(validate_voice_library(VOICE_LIBRARY), [])

    def test_same_languages_as_the_drill_and_thirty_per_bucket(self):
        self.assertEqual(set(VOICE_LIBRARY), set(LANGUAGE_SCRIPTS))
        self.assertEqual(set(VOICE_LIBRARY), set(PRACTICE_LIBRARY))
        for language, buckets in VOICE_LIBRARY.items():
            self.assertEqual(set(buckets), set(BUCKETS), language)
            for bucket, items in buckets.items():
                self.assertGreaterEqual(len(items), 30, f"{language}:{bucket}")

    def test_items_follow_the_rules(self):
        for language, buckets in VOICE_LIBRARY.items():
            seen = set()
            for bucket, items in buckets.items():
                low, high = WORD_BOUNDS[bucket]
                for index, item in enumerate(items):
                    where = f"{language}:{bucket}:{index}"
                    self.assertLessEqual(set(item), {"text", "translation_hint"}, where)
                    self.assertTrue(low <= voice_word_count(item["text"]) <= high, where)
                    key = normalize_sentence(item["text"])
                    self.assertNotIn(key, seen, where)
                    seen.add(key)
                    if language != "english":
                        self.assertTrue(item.get("translation_hint"), where)

    def test_script_matches_language(self):
        greek_range = lambda ch: "Ͱ" <= ch <= "Ͽ" or "ἀ" <= ch <= "῿"  # noqa: E731
        cyrillic_range = lambda ch: "Ѐ" <= ch <= "ӿ"  # noqa: E731
        for language, buckets in VOICE_LIBRARY.items():
            for items in buckets.values():
                for item in items:
                    letters = [ch for ch in item["text"] if ch.isalpha()]
                    if language == "greek":
                        self.assertTrue(all(greek_range(ch) for ch in letters), item)
                    elif language == "russian":
                        self.assertTrue(all(cyrillic_range(ch) for ch in letters), item)
                    else:
                        self.assertFalse(
                            any(greek_range(ch) or cyrillic_range(ch) for ch in letters), item
                        )

    def test_original_sentences_keep_the_first_ids(self):
        for language, sentences in ORIGINAL_FIRST_ITEMS.items():
            texts = [item["text"] for item in VOICE_LIBRARY[language][1][:3]]
            self.assertEqual(texts, sentences, language)

    def test_validator_catches_bad_items(self):
        good = {"text": "This is a fine sentence."}
        bad_library = {
            "english": {
                1: [
                    good,
                    dict(good),  # duplicate
                    {"text": "Too short."},
                    {"text": "This one has far too many words for the easiest level of all."},
                    {"text": "Это не английский язык."},
                    {"text": "Has a ___ blank in it."},
                    {"text": "An extra key is here.", "answer": "x"},
                    {"text": "An empty hint is here.", "translation_hint": " "},
                ],
                2: [],
                3: [{"text": "Short again."}],
            }
        }
        problems = " | ".join(validate_voice_library(bad_library))
        for expected in (
            "duplicate",
            "bucket 1 needs 4-7",
            "bucket 3 needs 10-15",
            "expected LATIN",
            "must not contain a blank",
            "unknown keys",
            "translation_hint",
            "bucket 2 is empty",
        ):
            self.assertIn(expected, problems)

    def test_loader_rejects_an_invalid_file(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "english.json").write_text(
                json.dumps({"1": [{"text": "bad"}]}), encoding="utf-8"
            )
            with self.assertRaises(PracticeLibraryError):
                load_voice_library(directory)

    def test_ids_parse_only_for_existing_items(self):
        self.assertEqual(parse_voice_sentence_id("voice:english:1:0")[:3], ("english", 1, 0))
        for bad in ("english:1:0", "voice:english:1:999", "voice:klingon:1:0",
                    "voice:english:4:0", "voice:english:1:-1", "voice:english:1", None, 5):
            self.assertIsNone(parse_voice_sentence_id(bad), bad)

    def test_pass_threshold_mirrors_the_clients(self):
        self.assertEqual(views.voice_pass_threshold("Thank you for help."), 0.62)
        self.assertEqual(views.voice_pass_threshold("The weather is beautiful today."), 0.68)
        self.assertEqual(
            views.voice_pass_threshold("Yesterday I went to the market with my mother."), 0.72
        )


class VoiceApiTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def next(self, language="english"):
        response = self.client.get(NEXT_URL, {"language": language})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        return response.json()

    def complete(self, sentence_id, score=1.0):
        return self.client.post(COMPLETE_URL, {"id": sentence_id, "score": score}, format="json")


class VoiceNextTests(VoiceApiTestCase):
    def test_payload_shape(self):
        body = self.next("spanish")
        self.assertRegex(body["id"], r"^voice:spanish:1:\d+$")
        self.assertEqual(body["language"], "spanish")
        self.assertEqual(body["bucket"], 1)
        self.assertFalse(body["round_complete"])
        index = int(body["id"].rsplit(":", 1)[1])
        item = VOICE_LIBRARY["spanish"][1][index]
        self.assertEqual(body["text"], item["text"])
        self.assertEqual(body["translation_hint"], item["translation_hint"])
        self.assertIn(body["pass_threshold"], (0.62, 0.68, 0.72))

    def test_requires_auth(self):
        response = APIClient().get(NEXT_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("code", response.json())

    def test_bucket_follows_the_language_progress(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="english", bucket=3)
        body = self.next()
        self.assertEqual(body["bucket"], 3)
        self.assertTrue(body["id"].startswith("voice:english:3:"))

    def test_xp_alone_does_not_raise_the_bucket(self):
        # XP from another language no longer decides difficulty.
        PracticeStats.objects.create(
            user=self.user, xp=450, level=5, preferred_language="spanish"
        )
        self.assertEqual(self.next()["bucket"], 1)

    def test_voice_passes_do_not_change_the_bucket(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="english", bucket=2)
        for _ in range(20):
            sentence_id = self.next()["id"]
            self.assertTrue(sentence_id.startswith("voice:english:2:"))
            self.complete(sentence_id)
        progress = PracticeLanguageProgress.objects.get(user=self.user, language="english")
        self.assertEqual((progress.bucket, progress.attempts_in_bucket), (2, 0))
        self.assertEqual(progress.recent_results, "")

    def test_unknown_language_falls_back(self):
        body = self.next("klingon")
        self.assertEqual(body["language"], "english")

    def test_no_repeat_within_a_round_then_round_complete(self):
        size = len(VOICE_LIBRARY["english"][1])
        first_round = [self.next() for _ in range(size)]
        self.assertEqual(len({item["id"] for item in first_round}), size)
        self.assertFalse(any(item["round_complete"] for item in first_round))
        opener = self.next()
        self.assertTrue(opener["round_complete"])
        self.assertNotEqual(opener["id"], first_round[-1]["id"])
        second = [opener] + [self.next() for _ in range(size - 1)]
        self.assertEqual(len({item["id"] for item in second}), size)
        self.assertFalse(any(item["round_complete"] for item in second[1:]))

    def test_voice_rounds_are_separate_from_drill_rounds(self):
        self.next()
        voice_key = views.library_round_cache_key(self.user.id, "english", 1, "voice_round")
        self.assertEqual(voice_key, f"practice:voice_round:v1:user:{self.user.id}:lang:english:bucket:1")
        self.assertEqual(cache.get(voice_key)["cursor"], 1)
        self.assertIsNone(cache.get(views.library_round_cache_key(self.user.id, "english", 1)))

    def test_records_the_served_id(self):
        body = self.next()
        self.assertEqual(
            cache.get(views.practice_voice_served_cache_key(self.user.id, body["id"])), 1
        )

    def test_throttled_with_envelope(self):
        with mock.patch.object(VoiceNextRateThrottle, "THROTTLE_RATES", {"voice_next": "2/minute"}):
            codes = [self.client.get(NEXT_URL).status_code for _ in range(2)]
            blocked = self.client.get(NEXT_URL)
        self.assertEqual(codes, [200, 200])
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(blocked.json()["code"], "throttled")

    def test_views_keep_the_global_user_throttle(self):
        for view in (views.practice_voice_next_view, views.practice_voice_complete_view):
            self.assertIn(UserRateThrottle, view.cls.throttle_classes)


class VoiceCompleteTests(VoiceApiTestCase):
    def test_awards_xp_and_points_for_a_served_passed_sentence(self):
        sentence = self.next()
        response = self.complete(sentence["id"], 0.9)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["awarded_xp"], views.PRACTICE_VOICE_XP)
        self.assertEqual(body["awarded_points"], views.PRACTICE_VOICE_POINTS)
        self.assertEqual(body["reason"], "awarded")
        self.assertTrue(body["passed"])
        self.assertFalse(body["already_scored"])
        self.assertFalse(body["daily_limit_reached"])
        self.assertFalse(body["awards_unavailable"])
        self.assertEqual(body["stats"]["xp"], 5)
        self.assertEqual(body["stats"]["points"], 2)
        self.assertEqual(body["stats"]["total_answers"], 0)
        self.assertIn("leaderboard", body)
        self.assertEqual(body["current_rank"], 1)

    def test_level_follows_xp(self):
        PracticeStats.objects.create(user=self.user, xp=98, points=0, level=1)
        response = self.complete(self.next()["id"])
        self.assertEqual(response.json()["stats"]["level"], 2)
        self.assertEqual(PracticeStats.objects.get(user=self.user).level, 2)

    def test_unserved_id_awards_nothing(self):
        response = self.complete("voice:english:1:0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual((body["awarded_xp"], body["reason"]), (0, "not_served"))
        # Served to someone else doesn't count either.
        other = APIClient()
        other.force_authenticate(user=make_user())
        served = other.get(NEXT_URL).json()["id"]
        self.assertEqual(self.complete(served).json()["reason"], "not_served")

    def test_once_per_sentence_per_day(self):
        sentence_id = self.next()["id"]
        first = self.complete(sentence_id).json()
        second = self.complete(sentence_id).json()
        self.assertEqual(first["awarded_xp"], 5)
        self.assertEqual(second["awarded_xp"], 0)
        self.assertTrue(second["already_scored"])
        self.assertEqual(second["stats"]["xp"], 5)

    def test_below_threshold_awards_nothing_and_can_retry(self):
        sentence = self.next()
        low = self.complete(sentence["id"], sentence["pass_threshold"] - 0.01).json()
        self.assertFalse(low["passed"])
        self.assertEqual((low["awarded_xp"], low["reason"]), (0, "below_threshold"))
        retry = self.complete(sentence["id"], sentence["pass_threshold"]).json()
        self.assertEqual(retry["awarded_xp"], 5)

    def test_daily_voice_cap(self):
        with mock.patch.object(views, "PRACTICE_VOICE_DAILY_AWARDS", 2):
            results = [self.complete(self.next()["id"]).json() for _ in range(3)]
        self.assertEqual([r["awarded_xp"] for r in results], [5, 5, 0])
        self.assertTrue(results[2]["daily_voice_limit_reached"])
        self.assertTrue(results[2]["daily_limit_reached"])
        self.assertFalse(results[2]["already_scored"])
        self.assertEqual(PracticeStats.objects.get(user=self.user).xp, 10)

    def test_daily_xp_cap_is_shared_with_the_drill(self):
        with mock.patch.object(views, "PRACTICE_DAILY_XP_LIMIT", 8):
            first = self.complete(self.next()["id"]).json()
            second = self.complete(self.next()["id"]).json()
            third = self.complete(self.next()["id"]).json()
        self.assertEqual(first["awarded_xp"], 5)
        self.assertEqual(second["awarded_xp"], 3)  # partial grant up to the cap
        self.assertTrue(second["daily_xp_limit_reached"])
        self.assertEqual((third["awarded_xp"], third["awarded_points"]), (0, 0))
        self.assertEqual(third["reason"], "daily_xp_limit")
        self.assertTrue(third["daily_limit_reached"])
        self.assertEqual(PracticeStats.objects.get(user=self.user).xp, 8)

    def test_bad_input_uses_the_error_envelope(self):
        sentence_id = self.next()["id"]
        cases = [
            ({"id": "english:1:0", "score": 1}, "invalid_voice_id"),
            ({"id": "voice:english:1:999", "score": 1}, "invalid_voice_id"),
            ({"score": 1}, "invalid_voice_id"),
            ({"id": sentence_id}, "invalid_score"),
            ({"id": sentence_id, "score": 1.5}, "invalid_score"),
            ({"id": sentence_id, "score": "abc"}, "invalid_score"),
            ({"id": sentence_id, "score": True}, "invalid_score"),
        ]
        for payload, code in cases:
            response = self.client.post(COMPLETE_URL, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, payload)
            self.assertEqual(response.json()["code"], code, payload)
            self.assertIsInstance(response.json()["error"], str)

    def test_voice_ids_are_not_drill_challenges(self):
        sentence_id = self.next()["id"]
        response = self.client.post(
            "/api/practice/submit/",
            {"challenge_id": sentence_id, "selected_word": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_throttled_with_envelope(self):
        sentence_id = self.next()["id"]
        with mock.patch.object(
            VoiceCompleteRateThrottle, "THROTTLE_RATES", {"voice_complete": "2/minute"}
        ):
            codes = [self.complete(sentence_id).status_code for _ in range(2)]
            blocked = self.complete(sentence_id)
        self.assertEqual(codes, [200, 200])
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(blocked.json()["code"], "throttled")

    def test_failed_stats_update_releases_the_claim(self):
        sentence_id = self.next()["id"]
        client = APIClient(raise_request_exception=False)
        client.force_authenticate(user=self.user)
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        with mock.patch.object(
            views.PracticeStats.objects, "filter", side_effect=RuntimeError("db down")
        ):
            failed = client.post(COMPLETE_URL, {"id": sentence_id, "score": 1}, format="json")
        self.assertEqual(failed.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(self.complete(sentence_id).json()["awarded_xp"], 5)

    def test_complete_query_count_is_bounded(self):
        for index in range(12):
            PracticeStats.objects.create(
                user=make_user(), points=index, xp=index, level=1, preferred_language="english"
            )
        # The caller's row exists (the first practice call creates it).
        PracticeStats.objects.create(user=self.user, preferred_language="english")
        sentence_id = self.next()["id"]
        with CaptureQueriesContext(connection) as awarded:
            self.assertEqual(self.complete(sentence_id).json()["awarded_xp"], 5)
        with CaptureQueriesContext(connection) as repeat:
            self.assertTrue(self.complete(sentence_id).json()["already_scored"])
        self.assertLessEqual(len(awarded.captured_queries), MAX_VOICE_COMPLETE_QUERIES)
        self.assertLessEqual(len(repeat.captured_queries), MAX_VOICE_COMPLETE_QUERIES)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "core.cache.ResilientRedisCache",
            "LOCATION": "redis://cache.placeholder.test:6379/0",
            "OPTIONS": {"socket_connect_timeout": 0.5, "socket_timeout": 0.5},
        }
    }
)
class VoiceRedisOutageTests(TestCase):
    """Redis down: next still serves (random pick), complete returns 200 with no XP."""

    def setUp(self):
        reset_resilience()
        install_failing_client(self)
        self.user = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        logging.disable(logging.WARNING)

    def tearDown(self):
        logging.disable(logging.NOTSET)
        reset_resilience()

    def test_next_still_serves_sentences(self):
        bodies = [self.client.get(NEXT_URL).json() for _ in range(5)]
        for body in bodies:
            self.assertTrue(body["id"].startswith("voice:english:1:"))
            self.assertFalse(body["round_complete"])

    def test_complete_fails_closed_with_200(self):
        sentence_id = self.client.get(NEXT_URL).json()["id"]
        response = self.client.post(COMPLETE_URL, {"id": sentence_id, "score": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual((body["awarded_xp"], body["awarded_points"]), (0, 0))
        self.assertTrue(body["awards_unavailable"])
        self.assertEqual(body["reason"], "unavailable")
        self.assertEqual(PracticeStats.objects.get(user=self.user).xp, 0)

    def test_complete_fails_closed_before_the_breaker_opens(self):
        reset_resilience()  # breaker closed: the served lookup itself fails
        response = self.client.post(
            COMPLETE_URL, {"id": "voice:english:1:0", "score": 1}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["reason"], "unavailable")
