"""Per-language, mastery-based practice difficulty (PracticeLanguageProgress)."""

import logging
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient

from chatapp import practice_progress as pp
from chatapp import views
from chatapp.models import PracticeLanguageProgress, PracticeStats

from .factory import make_user
from .test_redis_resilience import install_failing_client, reset_resilience

STATE_URL = "/api/practice/state/"
CHALLENGE_URL = "/api/practice/challenge/"
SUBMIT_URL = "/api/practice/submit/"
VOICE_NEXT_URL = "/api/practice/voice/next/"
# submit/ (row exists): stats get_or_create, update, refresh, progress
# select_for_update + update, leaderboard top 10, rank count (savepoints excluded).
MAX_PRACTICE_SUBMIT_QUERIES = 7


def results(*bits):
    return [bool(bit) for bit in bits]


class ApplyResultTests(SimpleTestCase):
    """The promotion/demotion rule on an unsaved row."""

    def progress(self, bucket=1):
        return PracticeLanguageProgress(language="spanish", bucket=bucket)

    def run_answers(self, progress, answers):
        return [pp.apply_practice_result(progress, answer) for answer in answers]

    def test_promotes_exactly_at_min_attempts_and_accuracy(self):
        progress = self.progress()
        # 3 wrong then 12 right: 15 attempts at exactly 80 %.
        changes = self.run_answers(progress, results(0, 0, 0) + results(*[1] * 12))
        self.assertEqual(changes[:-1], [None] * 14)
        self.assertEqual(changes[-1], "promoted")
        self.assertEqual(progress.bucket, 2)
        self.assertEqual((progress.attempts_in_bucket, progress.recent_results), (0, ""))
        self.assertIsNotNone(progress.promoted_at)

    def test_no_promotion_below_min_attempts(self):
        progress = self.progress()
        changes = self.run_answers(progress, results(*[1] * 14))
        self.assertEqual(changes, [None] * 14)
        self.assertEqual((progress.bucket, progress.attempts_in_bucket), (1, 14))

    def test_no_promotion_just_below_accuracy(self):
        progress = self.progress()
        changes = self.run_answers(progress, results(0, 0, 0, 0) + results(*[1] * 11))
        self.assertEqual(changes, [None] * 15)  # 11/15 = 73 %
        self.assertEqual(progress.bucket, 1)
        # One more correct answer: 12/16 = 75 %, still below.
        self.assertIsNone(pp.apply_practice_result(progress, True))
        # Accuracy climbs to 80 % over the window -> promoted.
        self.assertEqual(
            self.run_answers(progress, results(1, 1, 1, 1))[-1], "promoted"
        )

    def test_demotes_at_min_attempts_below_half(self):
        progress = self.progress(bucket=2)
        changes = self.run_answers(progress, results(1, 1, 1, 1, 0, 0, 0, 0, 0, 0))
        self.assertEqual(changes[:-1], [None] * 9)
        self.assertEqual(changes[-1], "demoted")  # 4/10 = 40 %
        self.assertEqual((progress.bucket, progress.attempts_in_bucket), (1, 0))
        self.assertIsNotNone(progress.demoted_at)

    def test_exactly_half_is_not_demoted(self):
        progress = self.progress(bucket=2)
        changes = self.run_answers(progress, results(1, 0) * 5)
        self.assertEqual(changes, [None] * 10)
        self.assertEqual(progress.bucket, 2)

    def test_bucket_caps(self):
        top = self.progress(bucket=3)
        self.assertEqual(self.run_answers(top, [True] * 30), [None] * 30)
        self.assertEqual(top.bucket, 3)
        bottom = self.progress(bucket=1)
        self.assertEqual(self.run_answers(bottom, [False] * 30), [None] * 30)
        self.assertEqual(bottom.bucket, 1)

    def test_window_keeps_the_last_results(self):
        progress = self.progress(bucket=3)
        self.run_answers(progress, [False] * 5 + [True] * 20)
        self.assertEqual(progress.recent_results, "1" * pp.PRACTICE_WINDOW)
        self.assertEqual(progress.attempts_in_bucket, 25)
        self.assertEqual(pp.window_accuracy(progress), 1.0)

    def test_challenge_bucket_parsing(self):
        self.assertEqual(pp.challenge_bucket("spanish:2:7"), 2)
        self.assertEqual(pp.challenge_bucket("dailygen:20261102:greek:3:1"), 3)
        self.assertIsNone(pp.challenge_bucket("gen:abc"))
        self.assertIsNone(pp.challenge_bucket("x"))


class SeedingTests(TestCase):
    def seed(self, levels, language="spanish"):
        user = make_user(languages_practicing=list(levels), practice_language_levels=levels)
        return pp.get_language_progress(user, language).bucket

    def test_each_profile_level_maps_to_a_bucket(self):
        for value, bucket in (
            ("beginner", 1),
            ("intermediate", 2),
            ("advanced", 3),
            ("fluent", 3),
            ("Upper intermediate", 3),
            ("elementary", 1),
            ("something-else", 1),
        ):
            with self.subTest(value=value):
                self.assertEqual(self.seed({"spanish": value}), bucket)

    def test_missing_level_defaults_to_basics(self):
        self.assertEqual(self.seed({}), 1)
        self.assertEqual(self.seed({"french": "fluent"}), 1)

    def test_language_key_is_case_insensitive(self):
        self.assertEqual(self.seed({"Spanish": "advanced"}), 3)

    def test_existing_users_keep_their_xp_bucket_for_their_last_language(self):
        user = make_user(practice_language_levels={"russian": "intermediate"})
        PracticeStats.objects.create(user=user, xp=450, level=5, preferred_language="spanish")
        self.assertEqual(pp.get_language_progress(user, "spanish").bucket, 3)
        # Other languages seed from the profile only.
        self.assertEqual(pp.get_language_progress(user, "russian").bucket, 2)
        self.assertEqual(pp.get_language_progress(user, "french").bucket, 1)

    def test_profile_level_wins_over_a_lower_xp_bucket(self):
        user = make_user(practice_language_levels={"spanish": "fluent"})
        PracticeStats.objects.create(user=user, xp=50, level=1, preferred_language="spanish")
        self.assertEqual(pp.get_language_progress(user, "spanish").bucket, 3)

    def test_seeded_once(self):
        user = make_user(practice_language_levels={"spanish": "advanced"})
        pp.get_language_progress(user, "spanish")
        user.practice_language_levels = {"spanish": "beginner"}
        user.save()
        self.assertEqual(pp.get_language_progress(user, "spanish").bucket, 3)
        self.assertEqual(PracticeLanguageProgress.objects.filter(user=user).count(), 1)


class ProgressApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user(languages_practicing=["spanish", "russian"])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        PracticeStats.objects.create(user=self.user, preferred_language="spanish")

    def submit(self, challenge_id, correct=True, language="spanish"):
        with mock.patch(
            "chatapp.views.get_challenge_answer", return_value=("casa", language)
        ):
            response = self.client.post(
                SUBMIT_URL,
                {
                    "challenge_id": challenge_id,
                    "selected_word": "casa" if correct else "perro",
                    "language": language,
                },
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        return response.json()

    def progress_row(self, language="spanish"):
        return PracticeLanguageProgress.objects.get(user=self.user, language=language)

    def test_state_includes_progress(self):
        self.user.practice_language_levels = {"spanish": "intermediate"}
        self.user.save()
        body = self.client.get(STATE_URL, {"language": "spanish"}).json()
        self.assertEqual(
            body["progress"],
            {
                "language": "spanish",
                "bucket": 2,
                "max_bucket": 3,
                "bucket_label": "Everyday grammar",
                "cefr": "A2–B1",
                "attempts_in_bucket": 0,
                "window_size": 0,
                "window_accuracy": None,
                "needed_for_promotion": {
                    "attempts_remaining": pp.PRACTICE_PROMOTE_MIN_ATTEMPTS,
                    "min_attempts": pp.PRACTICE_PROMOTE_MIN_ATTEMPTS,
                    "accuracy_target": pp.PRACTICE_PROMOTE_ACCURACY,
                },
                "can_promote": True,
                "change": None,
            },
        )

    def test_top_bucket_has_no_promotion_target(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="spanish", bucket=3)
        progress = self.client.get(STATE_URL, {"language": "spanish"}).json()["progress"]
        self.assertFalse(progress["can_promote"])
        self.assertIsNone(progress["needed_for_promotion"])
        self.assertEqual((progress["bucket_label"], progress["cefr"]), ("Advanced grammar", "B1–B2"))

    def test_promotion_via_submit_is_reported_once_and_per_language(self):
        self.submit("russian:1:0", language="russian")
        bodies = [self.submit(f"spanish:1:{index}") for index in range(15)]
        self.assertEqual([b["progress"]["change"] for b in bodies[:-1]], [None] * 14)
        self.assertEqual(bodies[13]["progress"]["attempts_in_bucket"], 14)
        self.assertEqual(bodies[13]["progress"]["window_accuracy"], 1.0)
        self.assertEqual(bodies[13]["progress"]["needed_for_promotion"]["attempts_remaining"], 1)
        last = bodies[-1]["progress"]
        self.assertEqual((last["change"], last["bucket"]), ("promoted", 2))
        self.assertEqual(last["attempts_in_bucket"], 0)

        # The next challenge comes from the new bucket.
        with mock.patch.object(views, "PRACTICE_GENERATOR_ENABLED", False):
            challenge = self.client.get(CHALLENGE_URL, {"language": "spanish"}).json()
        self.assertTrue(challenge["challenge"]["id"].startswith("spanish:2:"))
        after = self.submit(challenge["challenge"]["id"])
        self.assertIsNone(after["progress"]["change"])
        self.assertEqual(after["progress"]["attempts_in_bucket"], 1)

        russian = self.progress_row("russian")
        self.assertEqual((russian.bucket, russian.attempts_in_bucket), (1, 1))

    def test_demotion_via_submit(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="spanish", bucket=2)
        bodies = [self.submit(f"spanish:2:{index}", correct=False) for index in range(10)]
        self.assertEqual(bodies[-1]["progress"]["change"], "demoted")
        self.assertEqual(self.progress_row().bucket, 1)

    def test_replays_are_not_counted_twice(self):
        first = self.submit("spanish:1:0")
        replay = self.submit("spanish:1:0", correct=False)
        self.assertTrue(replay["already_scored"])
        self.assertEqual(replay["progress"]["attempts_in_bucket"], 1)
        self.assertIsNone(replay["progress"]["change"])
        self.assertEqual(first["progress"]["attempts_in_bucket"], 1)
        self.assertEqual(self.progress_row().recent_results, "1")

    def test_answers_past_the_daily_xp_cap_still_count(self):
        with mock.patch.object(views, "PRACTICE_DAILY_XP_LIMIT", 15):
            self.submit("spanish:1:0")
            capped = self.submit("spanish:1:1")
        self.assertTrue(capped["daily_xp_limit_reached"])
        self.assertEqual(capped["awarded_xp"], 0)
        self.assertEqual(capped["progress"]["attempts_in_bucket"], 2)

    def test_answer_from_another_bucket_is_not_counted(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="spanish", bucket=2)
        body = self.submit("spanish:1:3")
        self.assertEqual(body["awarded_xp"], 15)  # still scored for XP
        self.assertEqual(body["progress"]["attempts_in_bucket"], 0)

    def test_xp_does_not_raise_difficulty(self):
        PracticeStats.objects.filter(user=self.user).update(xp=5000, level=51)
        self.submit("spanish:1:0")  # creates the row: legacy seed applies once
        PracticeLanguageProgress.objects.filter(user=self.user).update(bucket=1)
        for index in range(1, 6):
            self.submit(f"spanish:1:{index}", correct=False)
        self.assertEqual(self.progress_row().bucket, 1)
        with mock.patch.object(views, "PRACTICE_GENERATOR_ENABLED", False):
            challenge = self.client.get(CHALLENGE_URL, {"language": "spanish"}).json()
        self.assertTrue(challenge["challenge"]["id"].startswith("spanish:1:"))

    def test_voice_next_uses_the_language_bucket(self):
        PracticeLanguageProgress.objects.create(user=self.user, language="spanish", bucket=3)
        body = self.client.get(VOICE_NEXT_URL, {"language": "spanish"}).json()
        self.assertTrue(body["id"].startswith("voice:spanish:3:"))
        russian = self.client.get(VOICE_NEXT_URL, {"language": "russian"}).json()
        self.assertTrue(russian["id"].startswith("voice:russian:1:"))

    def test_submit_query_count_is_bounded(self):
        for index in range(12):
            PracticeStats.objects.create(
                user=make_user(), points=index, xp=index, preferred_language="spanish"
            )
        self.submit("spanish:1:0")  # creates the progress row

        def measure(challenge_id):
            with CaptureQueriesContext(connection) as ctx:
                self.submit(challenge_id)
            # SAVEPOINT/RELEASE come from the test's outer transaction (in
            # production the atomic block is a plain BEGIN/COMMIT).
            return sum(
                1
                for query in ctx.captured_queries
                if "SAVEPOINT" not in query["sql"].upper()
            )

        scored = measure("spanish:1:1")
        replay = measure("spanish:1:1")
        self.assertLessEqual(scored, MAX_PRACTICE_SUBMIT_QUERIES)
        self.assertLessEqual(replay, MAX_PRACTICE_SUBMIT_QUERIES)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "core.cache.ResilientRedisCache",
            "LOCATION": "redis://cache.placeholder.test:6379/0",
            "OPTIONS": {"socket_connect_timeout": 0.5, "socket_timeout": 0.5},
        }
    }
)
class ProgressRedisOutageTests(TestCase):
    """Progress lives in the DB: with Redis down answers still move it."""

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

    def test_submit_records_progress_without_the_cache(self):
        with mock.patch(
            "chatapp.views.get_challenge_answer", return_value=("casa", "english")
        ):
            for index in range(15):
                response = self.client.post(
                    SUBMIT_URL,
                    {"challenge_id": f"english:1:{index}", "selected_word": "casa", "language": "english"},
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["progress"]["change"], "promoted")
        state = self.client.get(STATE_URL, {"language": "english"}).json()
        self.assertEqual(state["progress"]["bucket"], 2)
