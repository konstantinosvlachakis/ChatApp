"""Practice submit idempotency: a challenge is scored once per serving."""

from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.models import PracticeStats

from .factory import make_user


class PracticeSubmitIdempotencyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.me = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.me)
        PracticeStats.objects.create(user=self.me, xp=0, points=0, level=1)

    def submit(self, challenge_id="spanish:1:0", word="casa"):
        with mock.patch(
            "chatapp.views.get_challenge_answer", return_value=("casa", "spanish")
        ):
            return self.client.post(
                "/api/practice/submit/",
                {"challenge_id": challenge_id, "selected_word": word, "language": "spanish"},
            )

    def test_repeat_submit_awards_nothing_and_keeps_response_shape(self):
        first = self.submit()
        second = self.submit()

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["awarded_xp"], 15)
        self.assertFalse(first.data["already_scored"])
        self.assertEqual(set(first.data.keys()), set(second.data.keys()))
        self.assertTrue(second.data["already_scored"])
        self.assertEqual(second.data["awarded_xp"], 0)
        self.assertEqual(second.data["awarded_points"], 0)
        self.assertTrue(second.data["correct"])
        self.assertEqual(second.data["stats"]["xp"], 15)

        stats = PracticeStats.objects.get(user=self.me)
        self.assertEqual((stats.xp, stats.points, stats.total_answers), (15, 10, 1))

    def test_repeat_keeps_first_result_even_with_another_word(self):
        self.submit(word="perro")
        second = self.submit(word="casa")

        self.assertFalse(second.data["correct"])
        self.assertEqual(second.data["awarded_xp"], 0)
        stats = PracticeStats.objects.get(user=self.me)
        self.assertEqual((stats.xp, stats.correct_answers, stats.total_answers), (3, 0, 1))

    def test_other_challenges_still_score(self):
        self.submit(challenge_id="spanish:1:0")
        other = self.submit(challenge_id="spanish:1:1")

        self.assertEqual(other.data["awarded_xp"], 15)
        self.assertEqual(PracticeStats.objects.get(user=self.me).xp, 30)

    def test_serving_the_challenge_again_makes_it_scorable_again(self):
        self.submit(challenge_id="spanish:1:0")
        challenge = {
            "id": "spanish:1:0",
            "sentence_parts": ["Mi", "es grande."],
            "options": ["casa", "perro"],
            "hint": "",
            "difficulty_bucket": 1,
            "language": "spanish",
            "source": "library",
        }
        with mock.patch("chatapp.views.build_challenge", return_value=challenge):
            served = self.client.get("/api/practice/challenge/", {"language": "spanish"})
        self.assertEqual(served.status_code, status.HTTP_200_OK)

        again = self.submit(challenge_id="spanish:1:0")
        self.assertEqual(again.data["awarded_xp"], 15)
        self.assertFalse(again.data["already_scored"])
        self.assertEqual(PracticeStats.objects.get(user=self.me).xp, 30)
