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
        )
        self.client.force_authenticate(user=self.user)

    def test_profile_get_returns_200_and_expected_fields(self):
        response = self.client.get("/api/profile/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], "alice")
        self.assertIn("location", response.json())
        self.assertIn("native_language", response.json())
        self.assertIn("languages_practicing", response.json())
        self.assertIn("email", response.json())

    def test_public_profile_returns_200_for_existing_user(self):
        response = self.client.get(f"/api/profile/public/{self.user.username}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], self.user.username)

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
