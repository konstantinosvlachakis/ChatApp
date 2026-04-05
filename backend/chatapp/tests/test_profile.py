import json

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .factory import make_user


class ProfileEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(
            username="alice",
            email="alice@example.com",
            native_language="english",
            base_translate_language="english",
            languages_practicing=["greek", "spanish"],
            practice_language_levels={"greek": "intermediate", "spanish": "beginner"},
            bio="Avid language learner.",
            learning_goal="Speak Greek more naturally.",
        )
        self.client.force_authenticate(user=self.user)

    def test_profile_get_returns_200_and_expected_fields(self):
        response = self.client.get("/api/profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], "alice")
        self.assertIn("location", response.json())
        self.assertIn("native_language", response.json())
        self.assertIn("languages_practicing", response.json())
        self.assertIn("practice_language_levels", response.json())
        self.assertIn("email", response.json())
        self.assertEqual(response.json()["bio"], "Avid language learner.")
        self.assertEqual(response.json()["learning_goal"], "Speak Greek more naturally.")
        self.assertIn("recent_profile_viewers", response.json())

    def test_public_profile_returns_200_for_existing_user(self):
        response = self.client.get(f"/api/profile/public/{self.user.username}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], self.user.username)
        self.assertEqual(response.json()["bio"], "Avid language learner.")
        self.assertEqual(response.json()["learning_goal"], "Speak Greek more naturally.")

    def test_public_profile_view_records_recent_viewer(self):
        viewer = make_user(
            username="bob",
            email="bob@example.com",
            native_language="greek",
        )
        self.client.force_authenticate(user=viewer)

        response = self.client.get(f"/api/profile/public/{self.user.username}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.user)
        profile_response = self.client.get("/api/profile/")
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        recent_viewers = profile_response.json()["recent_profile_viewers"]
        self.assertEqual(len(recent_viewers), 1)
        self.assertEqual(recent_viewers[0]["username"], "bob")

    def test_public_profile_view_updates_existing_viewer_instead_of_duplicating(self):
        viewer = make_user(
            username="bob",
            email="bob@example.com",
            native_language="greek",
        )
        self.client.force_authenticate(user=viewer)

        first_response = self.client.get(f"/api/profile/public/{self.user.username}/")
        second_response = self.client.get(f"/api/profile/public/{self.user.username}/")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.user)
        profile_response = self.client.get("/api/profile/")
        recent_viewers = profile_response.json()["recent_profile_viewers"]
        self.assertEqual(len(recent_viewers), 1)
        self.assertEqual(recent_viewers[0]["username"], "bob")

    def test_public_profile_returns_404_for_unknown_user(self):
        response = self.client.get("/api/profile/public/does-not-exist/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_profile_data_excludes_current_user(self):
        make_user(
            username="bob",
            email="bob@example.com",
            native_language="greek",
        )
        response = self.client.get("/api/profile/data?page=1&page_size=10")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [p["username"] for p in response.json()["profiles"]]
        self.assertNotIn("alice", usernames)

    def test_profile_edit_with_invalid_languages_type_returns_400(self):
        payload = {"languages_practicing": "not-a-list"}
        response = self.client.patch(
            "/api/profile/edit/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.json()["error"], "languages_practicing must be a list of strings"
        )

    def test_profile_edit_with_valid_payload_returns_200(self):
        payload = {
            "base_translate_language": "french",
            "languages_practicing": ["french", "italian"],
            "practice_language_levels": {
                "french": "advanced",
                "italian": "beginner",
            },
        }
        response = self.client.patch(
            "/api/profile/edit/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["updated_profile"]["base_translate_language"], "french"
        )
        self.assertEqual(
            response.json()["updated_profile"]["languages_practicing"],
            ["french", "italian"],
        )
        self.assertEqual(
            response.json()["updated_profile"]["practice_language_levels"],
            {"french": "advanced", "italian": "beginner"},
        )

    def test_profile_edit_with_invalid_practice_language_levels_returns_400(self):
        payload = {
            "languages_practicing": ["french"],
            "practice_language_levels": {"french": "legendary"},
        }
        response = self.client.patch(
            "/api/profile/edit/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.json()["error"],
            "practice language levels must be beginner, intermediate, advanced, or fluent",
        )

    def test_profile_edit_supports_location_and_date_of_birth(self):
        payload = {
            "location": "Athens, Greece",
            "date_of_birth": "2000-01-02",
        }
        response = self.client.patch(
            "/api/profile/edit/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["updated_profile"]["location"], "Athens, Greece")
        self.assertEqual(response.json()["updated_profile"]["date_of_birth"], "2000-01-02")

    def test_profile_edit_persists_bio_and_learning_goal(self):
        payload = {
            "bio": "I like thoughtful, patient conversations.",
            "learning_goal": "Reach confident daily fluency.",
        }
        response = self.client.patch(
            "/api/profile/edit/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["updated_profile"]["bio"],
            "I like thoughtful, patient conversations.",
        )
        self.assertEqual(
            response.json()["updated_profile"]["learning_goal"],
            "Reach confident daily fluency.",
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, "I like thoughtful, patient conversations.")
        self.assertEqual(self.user.learning_goal, "Reach confident daily fluency.")

    def test_profile_location_update_returns_200_and_updates_profile(self):
        payload = {
            "city": "Athens",
            "country": "Greece",
        }
        response = self.client.patch(
            "/api/profile/location/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["location"], "Athens, Greece")

        self.user.refresh_from_db()
        self.assertEqual(self.user.location, "Athens, Greece")
