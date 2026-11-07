"""Sign-up starts every account with at least one language and per-language levels."""

import json

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from chatapp.models import Profile


class RegisterPracticeLanguageTests(TestCase):
    def setUp(self):
        cache.clear()  # register throttles
        self.client = APIClient()

    def register(self, **overrides):
        payload = {
            "username": "newbie",
            "email": "newbie@example.com",
            "password": "Str0ng!pass",
            "nativeLanguage": "english",
            "practiceLanguage": "spanish",
            "dateOfBirth": "1995-01-01",
        }
        payload.update(overrides)
        payload = {key: value for key, value in payload.items() if value is not None}
        return self.client.post(
            "/api/register/", data=json.dumps(payload), content_type="application/json"
        )

    def test_new_account_starts_with_the_language_and_level(self):
        response = self.register(practiceLevel="intermediate")

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.languages_practicing, ["spanish"])
        self.assertEqual(user.practice_language_levels, {"spanish": "intermediate"})

    def test_level_defaults_to_beginner(self):
        self.assertEqual(self.register().status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.practice_language_levels, {"spanish": "beginner"})

    def test_practice_language_is_required(self):
        for missing in (None, "", "   "):
            response = self.register(practiceLanguage=missing)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["code"], "practice_language_required")
        self.assertFalse(Profile.objects.filter(username="newbie").exists())

    def test_practice_language_must_differ_from_native(self):
        response = self.register(nativeLanguage="Spanish", practiceLanguage="spanish")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "practice_language_is_native")

    def test_unknown_level_is_rejected(self):
        response = self.register(practiceLevel="expert")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_practice_level")

    def test_plural_languages_keep_selection_order_and_their_own_levels(self):
        response = self.register(
            practiceLanguages=[" Spanish ", "greek", "SPANISH", "French"],
            practiceLanguageLevels={" SPANISH ": " Intermediate ", "Greek": "advanced"},
        )

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.languages_practicing, ["spanish", "greek", "french"])
        self.assertEqual(user.practice_language_levels, {
            "spanish": "intermediate", "greek": "advanced", "french": "beginner",
        })

    def test_plural_payload_does_not_need_legacy_fields(self):
        response = self.register(
            practiceLanguage=None,
            practiceLanguages=["spanish", "greek"],
        )

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.practice_language_levels, {"spanish": "beginner", "greek": "beginner"})

    def test_plural_fields_are_authoritative_over_legacy_fields(self):
        response = self.register(
            practiceLanguage="french", practiceLevel="expert",
            practiceLanguages=["greek"], practiceLanguageLevels={"greek": "fluent"},
        )

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.languages_practicing, ["greek"])
        self.assertEqual(user.practice_language_levels, {"greek": "fluent"})

    def test_empty_plural_selection_does_not_fall_back_to_legacy_language(self):
        response = self.register(practiceLanguages=[])

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "practice_language_required")
        self.assertFalse(Profile.objects.filter(username="newbie").exists())

    def test_plural_native_language_is_rejected_without_creating_an_account(self):
        response = self.register(practiceLanguages=["spanish", " English "])

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "practice_language_is_native")
        self.assertFalse(Profile.objects.filter(username="newbie").exists())

    def test_malformed_plural_languages_are_rejected(self):
        for value in ("spanish", {"spanish": True}, ["spanish", 42], ["x" * 51], ["spanish"] * 21):
            with self.subTest(value=value):
                cache.clear()
                response = self.register(practiceLanguages=value)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "invalid_practice_language")
        # Send an explicit null (the helper normally omits None for legacy tests).
        response = self.client.post("/api/register/", {
            "username": "newbie", "email": "newbie@example.com", "password": "Str0ng!pass",
            "nativeLanguage": "english", "practiceLanguage": "spanish", "practiceLanguages": None,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_practice_language")
        self.assertFalse(Profile.objects.filter(username="newbie").exists())

    def test_invalid_plural_levels_are_rejected_without_creating_an_account(self):
        for levels in ([], "beginner", {"spanish": "expert"}, {"spanish": 1}, {"spanish": None}):
            with self.subTest(levels=levels):
                cache.clear()
                response = self.register(practiceLanguages=["spanish"], practiceLanguageLevels=levels)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "invalid_practice_level")
        self.assertFalse(Profile.objects.filter(username="newbie").exists())

    def test_unselected_level_keys_are_not_saved(self):
        response = self.register(
            practiceLanguages=["spanish"],
            practiceLanguageLevels={"spanish": "advanced", "english": "expert", "french": "fluent"},
        )

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(username="newbie")
        self.assertEqual(user.practice_language_levels, {"spanish": "advanced"})
