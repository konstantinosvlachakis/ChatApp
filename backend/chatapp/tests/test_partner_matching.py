from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
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
            {
                "teaches_me": True,
                "learns_mine": True,
                "reciprocal": True,
                "score": 2,
                "they_teach": "greek",
                "they_learn": "english",
                "you_speak": "native",
            },
        )
        self.assertEqual(by_name["bruno"]["they_teach"], "spanish")
        self.assertIsNone(by_name["bruno"]["they_learn"])
        self.assertIsNone(by_name["dana"]["they_teach"])
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


# Queries per people-list request (session/auth excluded by force_authenticate):
# blocks, count, page. Must not grow with the number of profiles.
MAX_PEOPLE_LIST_QUERIES = 4


class SpokenLanguageMatchingTests(TestCase):
    """"Languages you speak" = native + practised at Advanced/Fluent."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        # Speaks Greek (native) and English (fluent); learning Russian.
        self.user = make_user(
            username="viewer",
            native_language="Greek",
            languages_practicing=["English", "Russian"],
            practice_language_levels={"English": "fluent", "Russian": "beginner"},
        )
        self.client.force_authenticate(user=self.user)
        self.russian_learns_english = make_user(
            username="anya", native_language="russian", languages_practicing=["english"]
        )
        self.russian_learns_greek = make_user(
            username="boris", native_language="Russian", languages_practicing=["Greek"]
        )
        self.russian_learns_french = make_user(
            username="dmitri", native_language="russian", languages_practicing=["french"]
        )
        self.spanish_learns_greek = make_user(
            username="elena", native_language="spanish", languages_practicing=["greek"]
        )

    def _get(self, query=""):
        response = self.client.get(f"/api/profile/data?page=1&page_size=50{query}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.json()

    def _names(self, query=""):
        return [p["username"] for p in self._get(query)["profiles"]]

    def test_best_matches_are_only_real_exchanges(self):
        self.assertEqual(self._names("&match=reciprocal"), ["anya", "boris"])

    def test_learning_your_language_mode(self):
        # Practising Greek or English (spoken), whatever their native language.
        self.assertEqual(self._names("&match=learns_mine"), ["anya", "boris", "elena"])
        self.assertNotIn("elena", self._names("&match=reciprocal"))
        self.assertNotIn("dmitri", self._names("&match=learns_mine"))

    def test_unknown_mode_falls_back_to_all(self):
        self.assertEqual(len(self._names("&match=best")), 4)

    def test_native_speakers_include_one_way_teachers(self):
        self.assertEqual(self._names("&match=teaches_me"), ["anya", "boris", "dmitri"])

    def test_all_mode_ranks_by_new_learns_mine(self):
        profiles = {p["username"]: p["match"] for p in self._get()["profiles"]}
        self.assertEqual(self._names()[:2], ["anya", "boris"])
        self.assertEqual(profiles["elena"]["score"], 1)
        self.assertTrue(profiles["elena"]["learns_mine"])
        self.assertFalse(profiles["elena"]["reciprocal"])
        self.assertEqual(profiles["dmitri"]["score"], 1)
        self.assertFalse(profiles["dmitri"]["learns_mine"])

    def test_match_explains_which_languages_each_side_brings(self):
        by_name = {p["username"]: p["match"] for p in self._get("&match=reciprocal")["profiles"]}
        self.assertEqual(
            (by_name["anya"]["they_teach"], by_name["anya"]["they_learn"], by_name["anya"]["you_speak"]),
            ("russian", "english", "fluent"),
        )
        self.assertEqual(
            (by_name["boris"]["they_teach"], by_name["boris"]["they_learn"], by_name["boris"]["you_speak"]),
            ("Russian", "Greek", "native"),
        )

    def test_intermediate_language_is_not_spoken(self):
        self.user.practice_language_levels = {"English": "intermediate", "Russian": "beginner"}
        self.user.save(update_fields=["practice_language_levels"])
        self.assertEqual(self._names("&match=reciprocal"), ["boris"])

    def test_advanced_counts_as_spoken(self):
        self.user.practice_language_levels = {"english": "advanced"}
        self.user.save(update_fields=["practice_language_levels"])
        self.assertEqual(self._names("&match=reciprocal"), ["anya", "boris"])

    def test_level_keys_and_values_match_case_insensitively(self):
        self.user.languages_practicing = ["ENGLISH", "russian"]
        self.user.practice_language_levels = {"english": "Fluent"}
        self.user.save(update_fields=["languages_practicing", "practice_language_levels"])
        make_user(username="fedor", native_language="RUSSIAN", languages_practicing=["English"])
        self.assertEqual(self._names("&match=reciprocal"), ["anya", "boris", "fedor"])

    def test_editing_own_levels_is_not_served_from_a_stale_cache(self):
        self.assertIn("anya", self._names("&match=reciprocal"))
        self.user.practice_language_levels = {"English": "beginner"}
        self.user.save(update_fields=["practice_language_levels"])
        self.assertNotIn("anya", self._names("&match=reciprocal"))

    def test_blocked_users_are_excluded(self):
        BlockedUser.objects.create(blocker=self.user, blocked=self.russian_learns_english)
        self.assertEqual(self._names("&match=reciprocal"), ["boris"])

    def test_pagination_counts_only_reciprocal(self):
        response = self.client.get("/api/profile/data?page=2&page_size=1&match=reciprocal")
        payload = response.json()
        self.assertEqual([p["username"] for p in payload["profiles"]], ["boris"])
        self.assertEqual(payload["pagination"]["total_count"], 2)
        self.assertFalse(payload["pagination"]["has_next"])
        self.assertTrue(payload["pagination"]["has_previous"])

    def test_query_count_is_bounded(self):
        for index in range(20):
            make_user(native_language="russian", languages_practicing=["english"], username=f"r{index}")
        for mode in ("all", "reciprocal", "teaches_me", "learns_mine"):
            cache.clear()
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(f"/api/profile/data?page=1&page_size=24&match={mode}")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertLessEqual(len(queries), MAX_PEOPLE_LIST_QUERIES, mode)
