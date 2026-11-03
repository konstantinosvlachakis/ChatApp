"""People feed (feat/people-feed): sections, filter panel params and quick filters."""

from datetime import timedelta

from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.models import BlockedUser, Profile

from .factory import make_user

# blocks, near exists, counts aggregate, paginator count, page.
MAX_FULL_PEOPLE_QUERIES = 6


class PeopleFeedTests(TestCase):
    def setUp(self):
        cache.clear()
        now = timezone.now()
        self.client = APIClient()
        # Speaks Greek (native) and English (fluent); learning Russian (beginner).
        self.user = make_user(
            username="viewer",
            native_language="Greek",
            languages_practicing=["English", "Russian"],
            practice_language_levels={"English": "fluent", "Russian": "beginner"},
            location="Athens, Greece",
        )
        self.client.force_authenticate(user=self.user)
        # Perfect exchanges.
        self.anya = make_user(
            username="anya", native_language="russian", languages_practicing=["english"],
            practice_language_levels={"english": "intermediate"}, location="Athens, Greece",
            last_seen=now - timedelta(hours=1),
        )
        self.boris = make_user(
            username="boris", native_language="Russian", languages_practicing=["Greek"],
            practice_language_levels={"Greek": "beginner"}, location="Thessaloniki, Greece",
        )
        # Native speaker only / learner only / neither.
        self.dmitri = make_user(
            username="dmitri", native_language="russian", languages_practicing=["french"],
            location="Moscow, Russia", last_seen=now - timedelta(days=10),
        )
        self.elena = make_user(
            username="elena", native_language="spanish", languages_practicing=["greek"],
            practice_language_levels={"greek": "advanced"}, location="athens,greece",
            last_seen=now - timedelta(days=3),
        )
        self.frank = make_user(
            username="frank", native_language="german", languages_practicing=["italian"],
            is_online=True,
        )
        Profile.objects.filter(username__in=["boris", "frank"]).update(date_joined=None)
        Profile.objects.filter(username="anya").update(date_joined=now - timedelta(days=2))
        Profile.objects.filter(username="dmitri").update(date_joined=now - timedelta(days=30))
        Profile.objects.filter(username="elena").update(date_joined=now - timedelta(days=1))

    def _get(self, query=""):
        response = self.client.get(f"/api/profile/data?page=1&page_size=50{query}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.json()

    def _names(self, query=""):
        return [p["username"] for p in self._get(query)["profiles"]]

    def test_sections_split_everyone_without_overlap(self):
        perfect = self._names("&section=perfect")
        others = self._names("&section=others")
        self.assertEqual(perfect, ["anya", "boris"])
        # One-way native speakers first, then learners of your languages, then others.
        self.assertEqual(others, ["dmitri", "elena", "frank"])
        self.assertFalse(set(perfect) & set(others))
        self.assertEqual(set(perfect) | set(others), set(self._names()))

    def test_section_overrides_the_old_match_param(self):
        self.assertEqual(self._names("&section=perfect&match=all"), ["anya", "boris"])

    def test_include_switches_narrow_more_people(self):
        self.assertEqual(self._names("&section=others&include=native"), ["dmitri"])
        self.assertEqual(self._names("&section=others&include=learners,rest"), ["elena", "frank"])
        self.assertEqual(self._names("&section=others&include=bogus"), ["dmitri", "elena", "frank"])
        # include never touches Perfect exchanges.
        self.assertEqual(self._names("&section=perfect&include=rest"), ["anya", "boris"])

    def test_they_speak_narrows_native_speakers(self):
        self.assertEqual(self._names("&section=perfect&they_speak=english"), [])
        self.assertEqual(self._names("&section=others&they_speak=english"), ["elena", "frank"])
        self.assertEqual(self._names("&section=perfect&they_speak=Russian"), ["anya", "boris"])
        # Values outside the viewer's learning languages are ignored.
        self.assertEqual(self._names("&section=perfect&they_speak=klingon"), ["anya", "boris"])

    def test_they_learn_narrows_learners(self):
        self.assertEqual(self._names("&section=perfect&they_learn=greek"), ["boris"])
        self.assertEqual(self._names("&section=others&they_learn=english"), ["dmitri", "frank"])
        self.assertEqual(self._names("&section=perfect&they_learn=russian"), ["anya", "boris"])

    def test_near_matches_the_same_city_case_insensitively(self):
        payload = self._get("&near=1")
        self.assertEqual([p["username"] for p in payload["profiles"]], ["anya", "elena"])
        self.assertEqual(payload["filters"]["near_scope"], "city")
        self.assertEqual(payload["filters"]["near_city"], "Athens")
        self.assertTrue(payload["filters"]["near_available"])
        self.assertEqual(self._names("&section=perfect&near=1"), ["anya"])

    def test_near_falls_back_to_the_same_country(self):
        self.user.location = "Patras, Greece"
        self.user.save(update_fields=["location"])
        payload = self._get("&near=1")
        self.assertEqual([p["username"] for p in payload["profiles"]], ["anya", "boris", "elena"])
        self.assertEqual(payload["filters"]["near_scope"], "country")

    def test_near_is_unavailable_without_a_city(self):
        self.user.location = ""
        self.user.save(update_fields=["location"])
        payload = self._get("&near=1")
        self.assertEqual(len(payload["profiles"]), 5)
        self.assertFalse(payload["filters"]["near_available"])
        self.assertIsNone(payload["filters"]["near_scope"])

    def test_cards_show_city_only_and_coarse_activity(self):
        by_name = {p["username"]: p for p in self._get()["profiles"]}
        self.assertEqual(by_name["anya"]["city"], "Athens")
        self.assertIsNone(by_name["frank"]["city"])
        self.assertEqual(by_name["anya"]["active_label"], "Active today")
        self.assertEqual(by_name["frank"]["active_label"], "Active today")
        self.assertEqual(by_name["elena"]["active_label"], "Active this week")
        self.assertIsNone(by_name["dmitri"]["active_label"])
        for card in by_name.values():
            for private in ("location", "last_seen", "is_online", "date_joined", "email"):
                self.assertNotIn(private, card)

    def test_active_today_window(self):
        self.assertEqual(self._names("&active=1"), ["anya", "frank"])

    def test_new_members_exclude_accounts_without_a_join_date(self):
        self.assertEqual(self._names("&new=1"), ["anya", "elena"])
        by_name = {p["username"]: p["is_new"] for p in self._get()["profiles"]}
        self.assertEqual(by_name, {"anya": True, "boris": False, "dmitri": False, "elena": True, "frank": False})

    def test_registration_sets_date_joined(self):
        client = APIClient()
        response = client.post(
            "/api/register/",
            {"username": "newbie", "email": "newbie@example.com", "password": "Sup3r-secret-pass",
             "nativeLanguage": "English"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertIsNotNone(Profile.objects.get(username="newbie").date_joined)

    def test_my_level_keeps_partners_within_one_step(self):
        # The viewer is a Russian beginner: Russian natives at Beginner/Intermediate
        # in Greek or English pass; a fluent one doesn't.
        make_user(username="petra", native_language="russian", languages_practicing=["english"],
                  practice_language_levels={"english": "fluent"})
        payload = self._get("&section=perfect&my_level=1")
        self.assertEqual([p["username"] for p in payload["profiles"]], ["anya", "boris"])
        self.assertTrue(payload["filters"]["my_level_available"])
        self.assertIn("petra", self._names("&section=perfect"))
        # Non-teachers: their level vs any level the viewer practises (English fluent
        # -> Advanced/Fluent); people without a level in your language drop out.
        self.assertEqual(self._names("&section=others&my_level=1"), ["elena"])

    def test_my_level_is_a_no_op_without_viewer_levels(self):
        self.user.practice_language_levels = {}
        self.user.save(update_fields=["practice_language_levels"])
        payload = self._get("&my_level=1&match=learns_mine")
        self.assertFalse(payload["filters"]["my_level_available"])
        self.assertEqual([p["username"] for p in payload["profiles"]], ["boris", "elena"])

    def test_level_filter_and_advanced_plus(self):
        self.assertEqual(self._names("&section=others&level=advanced_plus"), ["elena"])
        self.assertEqual(self._names("&section=perfect&level=beginner"), ["boris"])
        self.assertEqual(self._names("&section=perfect&level=intermediate"), ["anya"])

    def test_sorts(self):
        self.assertEqual(self._names("&section=others&sort=active"), ["elena", "dmitri", "frank"])
        self.assertEqual(self._names("&section=others&sort=newest"), ["elena", "dmitri", "frank"])
        self.assertEqual(self._names("&section=perfect&sort=newest"), ["anya", "boris"])
        self.assertEqual(self._names("&section=others&sort=bogus"), ["dmitri", "elena", "frank"])

    def test_total_and_counts_follow_the_filters(self):
        payload = self._get("&section=others&page_size=1&counts=1")
        self.assertEqual(payload["total"], 3)
        self.assertEqual(payload["pagination"]["total_count"], 3)
        self.assertEqual(payload["counts"], {"perfect": 2, "others": 3})
        narrowed = self._get("&section=others&include=native&near=1&counts=1")
        self.assertEqual(narrowed["counts"], {"perfect": 1, "others": 0})
        self.assertNotIn("counts", self._get())

    def test_filter_options_are_the_viewers_languages(self):
        filters = self._get()["filters"]
        self.assertEqual(filters["they_speak_options"], ["english", "russian"])
        self.assertEqual(filters["they_learn_options"], ["greek", "english"])

    def test_old_match_param_still_works(self):
        self.assertEqual(self._names("&match=reciprocal"), ["anya", "boris"])
        self.assertEqual(self._names("&match=teaches_me"), ["anya", "boris", "dmitri"])
        self.assertEqual(self._names("&match=learns_mine"), ["anya", "boris", "elena"])
        self.assertEqual(self._names("&match_only=1"), ["anya", "boris", "dmitri"])

    def test_blocks_are_excluded_from_both_sections_and_counts(self):
        BlockedUser.objects.create(blocker=self.anya, blocked=self.user)
        BlockedUser.objects.create(blocker=self.user, blocked=self.elena)
        self.assertEqual(self._names("&section=perfect"), ["boris"])
        self.assertEqual(self._names("&section=others"), ["dmitri", "frank"])
        self.assertEqual(self._get("&counts=1")["counts"], {"perfect": 1, "others": 2})

    def test_viewer_location_edit_is_not_served_from_a_stale_cache(self):
        self.assertEqual(self._names("&near=1"), ["anya", "elena"])
        self.user.location = "Moscow, Russia"
        self.user.save(update_fields=["location"])
        self.assertEqual(self._names("&near=1"), ["dmitri"])

    def test_query_count_is_bounded_with_every_filter(self):
        for index in range(20):
            make_user(username=f"r{index}", native_language="russian", languages_practicing=["english"],
                      practice_language_levels={"english": "beginner"}, location="Athens, Greece")
        queries_for = {
            "perfect": "&section=perfect&near=1&active=1&new=1&my_level=1&counts=1&they_speak=russian",
            "others": "&section=others&include=native,learners&near=1&sort=active&level=advanced_plus&counts=1",
        }
        for label, query in queries_for.items():
            cache.clear()
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(f"/api/profile/data?page=1&page_size=24{query}")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertLessEqual(len(queries), MAX_FULL_PEOPLE_QUERIES, label)
