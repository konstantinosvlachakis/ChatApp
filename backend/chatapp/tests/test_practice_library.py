"""Built-in practice library: data validation, no repeats per user, leaderboard photos."""

import json
import tempfile
from collections import Counter
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from rest_framework import status
from rest_framework.test import APIClient

from chatapp import views
from chatapp.models import PracticeStats
from chatapp.practice_library import (
    BUCKETS,
    LANGUAGE_SCRIPTS,
    PRACTICE_LIBRARY,
    PracticeLibraryError,
    load_practice_library,
    normalize_sentence,
    validate_library,
)

from .factory import make_user

# The four original items per bucket keep their ids (new items were appended).
ORIGINAL_FIRST_ITEMS = {
    ("english", 1): "I ___ to school every day.",
    ("spanish", 2): "Ayer, él ___ al mercado.",
    ("french", 3): "Si j'avais plus de temps, je ___ plus l'espagnol.",
    ("greek", 1): "Εγώ ___ στο σχολείο κάθε μέρα.",
    ("russian", 3): "Если бы у меня было больше времени, я бы ___ русский.",
}


class PracticeLibraryDataTests(SimpleTestCase):
    def test_library_is_valid(self):
        self.assertEqual(validate_library(PRACTICE_LIBRARY), [])

    def test_every_language_has_about_thirty_items_per_bucket(self):
        self.assertEqual(set(PRACTICE_LIBRARY), set(LANGUAGE_SCRIPTS))
        for language, buckets in PRACTICE_LIBRARY.items():
            self.assertEqual(set(buckets), set(BUCKETS), language)
            for bucket, items in buckets.items():
                self.assertGreaterEqual(len(items), 30, f"{language}:{bucket}")

    def test_items_follow_the_rules(self):
        for language, buckets in PRACTICE_LIBRARY.items():
            sentences = Counter()
            for bucket, items in buckets.items():
                for index, item in enumerate(items):
                    where = f"{language}:{bucket}:{index}"
                    self.assertEqual(item["sentence"].count("___"), 1, where)
                    self.assertEqual(len(item["options"]), 4, where)
                    self.assertEqual(
                        len({o.strip().casefold() for o in item["options"]}), 4, where
                    )
                    self.assertIn(item["answer"], item["options"], where)
                    self.assertTrue(10 <= len(item["sentence"]) <= 140, where)
                    self.assertIsInstance(item.get("hint", ""), str, where)
                    sentences[normalize_sentence(item["sentence"])] += 1
            duplicates = [s for s, count in sentences.items() if count > 1]
            self.assertEqual(duplicates, [], language)

    def test_script_matches_language(self):
        greek = PRACTICE_LIBRARY["greek"][2][10]["sentence"]
        russian = PRACTICE_LIBRARY["russian"][2][10]["sentence"]
        self.assertTrue(any("Ͱ" <= ch <= "Ͽ" or "ἀ" <= ch <= "῿" for ch in greek))
        self.assertTrue(any("Ѐ" <= ch <= "ӿ" for ch in russian))
        for language in ("english", "spanish", "french"):
            for items in PRACTICE_LIBRARY[language].values():
                for item in items:
                    self.assertFalse(
                        any("Ͱ" <= ch <= "ӿ" for ch in item["sentence"]), item
                    )

    def test_original_items_keep_their_ids(self):
        for (language, bucket), sentence in ORIGINAL_FIRST_ITEMS.items():
            self.assertEqual(PRACTICE_LIBRARY[language][bucket][0]["sentence"], sentence)
        answer, language = views.get_challenge_answer("english:1:0", user_id=1)
        self.assertEqual((answer, language), ("go", "english"))
        answer, _ = views.get_challenge_answer("russian:3:29", user_id=1)
        self.assertEqual(answer, PRACTICE_LIBRARY["russian"][3][29]["answer"])
        self.assertEqual(views.get_challenge_answer("english:1:999", user_id=1), (None, None))

    def test_validator_catches_bad_items(self):
        good = {"sentence": "I ___ here.", "answer": "am", "options": ["am", "is", "are", "be"]}
        bad_library = {
            "english": {
                1: [
                    good,
                    dict(good),  # duplicate
                    {**good, "sentence": "No blank here at all."},
                    {**good, "sentence": "Two ___ blanks ___ here.", "answer": "x"},
                    {**good, "sentence": "Options ___ repeat.", "options": ["am", "am", "is", "be"]},
                    {**good, "sentence": "Ρωσικά ___ γράμματα."},
                ],
                2: [],
                3: [good],
            }
        }
        problems = " | ".join(validate_library(bad_library))
        for expected in (
            "duplicate",
            "exactly one",
            "answer is not one of the options",
            "options are not unique",
            "expected LATIN",
            "bucket 2 is empty",
        ):
            self.assertIn(expected, problems)

    def test_loader_rejects_an_invalid_file(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "english.json").write_text(
                json.dumps({"1": [{"sentence": "bad", "answer": "a", "options": ["a"]}]}),
                encoding="utf-8",
            )
            with self.assertRaises(PracticeLibraryError):
                load_practice_library(directory)


def library_only():
    return mock.patch.object(views, "PRACTICE_GENERATOR_ENABLED", False)


class LibraryNoRepeatTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user()

    def serve(self, language="english", bucket=1, user_id=None):
        with library_only():
            return views.build_challenge(language, bucket, user_id or self.user.id)

    def test_no_repeat_within_a_full_round_for_every_bucket(self):
        for language, buckets in PRACTICE_LIBRARY.items():
            for bucket, items in buckets.items():
                ids = [self.serve(language, bucket)["id"] for _ in range(len(items))]
                self.assertEqual(len(set(ids)), len(items), f"{language}:{bucket}")
                self.assertTrue(all(i.startswith(f"{language}:{bucket}:") for i in ids))

    def test_new_round_after_exhaustion_sets_round_complete_once(self):
        size = len(PRACTICE_LIBRARY["english"][1])
        first_round = [self.serve() for _ in range(size)]
        self.assertFalse(any(c["round_complete"] for c in first_round))
        next_challenge = self.serve()
        self.assertTrue(next_challenge["round_complete"])
        # A new round never opens with the item that was just served.
        self.assertNotEqual(next_challenge["id"], first_round[-1]["id"])
        second_round = [next_challenge] + [self.serve() for _ in range(size - 1)]
        self.assertEqual(len({c["id"] for c in second_round}), size)
        self.assertFalse(any(c["round_complete"] for c in second_round[1:]))

    def test_rounds_are_per_user(self):
        other = make_user()
        self.serve()
        cache_key = views.library_round_cache_key(self.user.id, "english", 1)
        self.assertEqual(cache.get(cache_key)["cursor"], 1)
        self.assertIsNone(cache.get(views.library_round_cache_key(other.id, "english", 1)))

    def test_library_change_keeps_served_items_and_adds_new_ones(self):
        items = list(PRACTICE_LIBRARY["english"][1])
        served = {self.serve()["id"] for _ in range(5)}
        extra = {
            "sentence": "My cat ___ on the sofa all day.",
            "answer": "sleeps",
            "options": ["sleep", "sleeps", "slept", "sleeping"],
            "hint": "Present simple, third person.",
        }
        grown = {**PRACTICE_LIBRARY, "english": {**PRACTICE_LIBRARY["english"], 1: items + [extra]}}
        with mock.patch.object(views, "PRACTICE_LIBRARY", grown):
            rest = [self.serve()["id"] for _ in range(len(items) + 1 - 5)]
        self.assertFalse(served & set(rest))
        self.assertEqual(len(served | set(rest)), len(items) + 1)
        self.assertIn(f"english:1:{len(items)}", served | set(rest))

    def test_corrupt_state_is_rebuilt(self):
        cache.set(
            views.library_round_cache_key(self.user.id, "english", 1),
            {"order": "nope", "cursor": "x"},
            60,
        )
        challenge = self.serve()
        self.assertTrue(challenge["id"].startswith("english:1:"))
        self.assertFalse(challenge["round_complete"])

    def test_cache_misses_fall_back_to_a_random_pick(self):
        # ResilientRedisCache with Redis down returns misses and drops writes.
        with mock.patch.object(views.cache, "get", return_value=None), mock.patch.object(
            views.cache, "set", return_value=None
        ):
            challenges = [self.serve() for _ in range(10)]
        self.assertTrue(all(c["source"] == "library" for c in challenges))
        self.assertFalse(any(c["round_complete"] for c in challenges))

    def test_cache_errors_never_break_serving(self):
        with mock.patch.object(views.cache, "get", side_effect=RuntimeError("down")), mock.patch.object(
            views.cache, "set", side_effect=RuntimeError("down")
        ):
            index, round_complete = views.next_library_index(
                self.user.id, "english", 1, PRACTICE_LIBRARY["english"][1], set()
            )
        self.assertTrue(0 <= index < len(PRACTICE_LIBRARY["english"][1]))
        self.assertFalse(round_complete)

    def test_challenge_endpoint_returns_round_complete(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        with library_only():
            response = client.get("/api/practice/challenge/", {"language": "english"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(response.data["challenge"]["round_complete"], False)


class DailyPoolRoundTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user()

    @mock.patch.object(views, "PRACTICE_GENERATOR_ENABLED", True)
    @mock.patch.object(views, "PRACTICE_GENERATOR_MODE", "daily")
    def test_daily_pool_serves_each_item_once_then_flags_a_new_round(self):
        pool = [
            {
                "sentence": f"Daily sentence {i} ___ here.",
                "answer": "is",
                "options": ["is", "are", "am", "be"],
                "hint": "",
                "difficulty_bucket": 1,
            }
            for i in range(views.PRACTICE_DAILY_LIBRARY_MIN_READY)
        ]
        cache.set(views.daily_library_cache_key("english", 1), pool, 600)
        with mock.patch("chatapp.views.fetch_generated_challenge") as fetch:
            served = [views.build_challenge("english", 1, self.user.id) for _ in pool]
            again = views.build_challenge("english", 1, self.user.id)
        fetch.assert_not_called()
        self.assertEqual(len({c["id"] for c in served}), len(pool))
        self.assertFalse(any(c["round_complete"] for c in served))
        self.assertTrue(again["round_complete"])


class LeaderboardPhotoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.me = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.me)

    def _seed(self, count):
        for index in range(count):
            user = make_user()
            user.profile_image_url = f"profile_images/user_{index}.jpg"
            user.save(update_fields=["profile_image_url"])
            PracticeStats.objects.create(
                user=user, points=100 - index, xp=10, level=1, preferred_language="english"
            )

    def test_entries_carry_absolute_profile_photo_urls(self):
        self._seed(2)
        cloud = make_user()
        cloud.profile_image_url = "https://res.cloudinary.com/demo/image/upload/v1/a.jpg"
        cloud.save(update_fields=["profile_image_url"])
        PracticeStats.objects.create(user=cloud, points=500, xp=10, level=1, preferred_language="english")

        response = self.client.get("/api/practice/state/", {"language": "english"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        board = response.data["leaderboard"]
        self.assertEqual(board[0]["profile_image_url"], cloud.profile_image_url)
        self.assertTrue(board[1]["profile_image_url"].startswith("http://testserver/media/profile_images/"))
        for entry in board:
            self.assertIn("profile_image_url", entry)

    def test_photo_change_shows_up_on_the_next_request(self):
        self._seed(1)
        stats = PracticeStats.objects.exclude(user=self.me).get()
        stats.user.profile_image_url = "profile_images/new_photo.jpg"
        stats.user.save(update_fields=["profile_image_url"])
        response = self.client.get("/api/practice/state/", {"language": "english"})
        urls = [entry["profile_image_url"] for entry in response.data["leaderboard"]]
        self.assertTrue(any(url and url.endswith("new_photo.jpg") for url in urls))
