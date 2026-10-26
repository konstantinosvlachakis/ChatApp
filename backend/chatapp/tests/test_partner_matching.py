from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.models import BlockedUser

from .factory import make_user


class PartnerMatchingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user(
            username="alice",
            native_language="english",
            languages_practicing=["greek", "spanish"],
        )
        self.client.force_authenticate(user=self.user)

        # Native Greek, learning English: perfect exchange.
        self.reciprocal = make_user(
            username="zoe",
            native_language="greek",
            languages_practicing=["english"],
            practice_language_levels={"english": "intermediate"},
        )
        # Native Spanish, learning French: can teach Alice only.
        self.teacher = make_user(
            username="bruno",
            native_language="spanish",
            languages_practicing=["french"],
        )
        # Native German, learning English: wants Alice's language only.
        self.learner = make_user(
            username="carl",
            native_language="german",
            languages_practicing=["english"],
        )
        # No overlap at all.
        self.unrelated = make_user(
            username="dana",
            native_language="japanese",
            languages_practicing=["korean"],
        )
        # Learning "old english" must not count as learning English.
        self.near_miss = make_user(
            username="eve",
            native_language="italian",
            languages_practicing=["old english"],
        )

    def _get(self, query=""):
        response = self.client.get(f"/api/profile/data?page=1&page_size=50{query}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.json()["profiles"]

    def test_all_mode_ranks_reciprocal_first_then_teachers(self):
        profiles = self._get()
        usernames = [p["username"] for p in profiles]

        self.assertEqual(usernames[:3], ["zoe", "bruno", "carl"])
        self.assertEqual(set(usernames[3:]), {"dana", "eve"})

    def test_match_object_describes_each_direction(self):
        by_name = {p["username"]: p["match"] for p in self._get()}

        self.assertEqual(
            by_name["zoe"],
            {"teaches_me": True, "learns_mine": True, "reciprocal": True, "score": 2},
        )
        self.assertEqual(by_name["bruno"]["teaches_me"], True)
        self.assertEqual(by_name["bruno"]["reciprocal"], False)
        self.assertEqual(by_name["carl"]["learns_mine"], True)
        self.assertEqual(by_name["carl"]["teaches_me"], False)
        self.assertEqual(by_name["eve"]["score"], 0)

    def test_reciprocal_mode_returns_only_two_way_matches(self):
        usernames = [p["username"] for p in self._get("&match=reciprocal")]

        self.assertEqual(usernames, ["zoe"])

    def test_teaches_me_mode_and_legacy_match_only_agree(self):
        teaches_me = [p["username"] for p in self._get("&match=teaches_me")]
        legacy = [p["username"] for p in self._get("&match_only=1")]

        self.assertEqual(teaches_me, ["zoe", "bruno"])
        self.assertEqual(legacy, teaches_me)

    def test_level_filter_uses_partner_level_in_my_native_language(self):
        intermediate = [p["username"] for p in self._get("&level=intermediate")]
        beginner = [p["username"] for p in self._get("&level=beginner")]

        self.assertEqual(intermediate, ["zoe"])
        self.assertEqual(beginner, [])

    def test_invalid_mode_and_level_fall_back_to_all(self):
        usernames = [p["username"] for p in self._get("&match=bogus&level=expert")]

        self.assertEqual(len(usernames), 5)

    def test_blocked_users_are_excluded_from_matches(self):
        BlockedUser.objects.create(blocker=self.reciprocal, blocked=self.user)

        usernames = [p["username"] for p in self._get("&match=reciprocal")]

        self.assertEqual(usernames, [])
