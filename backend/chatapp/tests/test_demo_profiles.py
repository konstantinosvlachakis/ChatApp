from collections import Counter
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from chatapp.demo_profiles import LANGUAGES, demo_profile_specs, seed_demo_profiles
from chatapp.models import Conversation, Message, Profile
from .factory import make_conversation, make_message, make_user


class DemoProfileTests(TestCase):
    def test_default_population_is_complete_and_non_login(self):
        result = seed_demo_profiles()
        self.assertEqual(result["created"], 40)
        self.assertEqual(Counter(Profile.objects.values_list("native_language", flat=True)), dict.fromkeys(LANGUAGES, 8))
        self.assertEqual(len(set(Profile.objects.values_list("profile_image_url", flat=True))), 40)
        for user in Profile.objects.all():
            self.assertFalse(user.has_usable_password())
            self.assertFalse(user.email_verified)
            self.assertFalse(user.is_online)
            self.assertTrue(user.username.startswith("demo_"))
            self.assertTrue(user.bio.startswith("Demo profile."))
            self.assertTrue(user.learning_goal)
            self.assertTrue(user.location)
            self.assertGreaterEqual(user.age, 18)
            self.assertTrue(user.profile_image_url.startswith("https://randomuser.me/api/portraits/"))
            self.assertEqual(set(user.languages_practicing), set(user.practice_language_levels))
            self.assertNotIn(user.native_language, user.languages_practicing)
        self.assertEqual(Conversation.objects.count(), 0)
        self.assertEqual(Message.objects.count(), 0)

    def test_repeat_runs_and_larger_runs_preserve_existing_data(self):
        user = make_user(bio="A real profile")
        conversation = make_conversation(user)
        message = make_message(conversation, user)
        seed_demo_profiles()
        first = Profile.objects.get(username="demo_emma_brooks")
        Profile.objects.filter(pk=first.pk).update(location="Edited fixture location")
        result = seed_demo_profiles()
        self.assertEqual((result["created"], result["existing"]), (0, 40))
        first.refresh_from_db()
        self.assertEqual(first.location, "Edited fixture location")
        self.assertEqual(seed_demo_profiles(10)["created"], 10)
        user.refresh_from_db()
        self.assertEqual(user.bio, "A real profile")
        message.refresh_from_db()
        self.assertEqual(message.conversation_id, conversation.pk)
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(Message.objects.count(), 1)

    def test_dry_run_writes_nothing(self):
        output = StringIO()
        call_command("load_dummy_data", "--dry-run", stdout=output)
        self.assertIn("Would create 40", output.getvalue())
        self.assertFalse(Profile.objects.exists())

    def test_case_insensitive_username_collision_aborts_every_insert(self):
        user = make_user(username="DEMO_EMMA_BROOKS")
        with self.assertRaises(CommandError):
            seed_demo_profiles()
        self.assertEqual(Profile.objects.count(), 1)
        user.refresh_from_db()
        self.assertTrue(user.has_usable_password())

    def test_email_collision_aborts_every_insert(self):
        user = make_user(email=demo_profile_specs()[0]["email"])
        with self.assertRaises(CommandError):
            seed_demo_profiles()
        self.assertEqual(Profile.objects.count(), 1)
        self.assertTrue(user.has_usable_password())

    def test_people_endpoint_can_find_reciprocal_greek_partners(self):
        seed_demo_profiles()
        user = make_user(native_language="greek", languages_practicing=["english"])
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user)
        response = client.get("/api/profile/data", {"match": "reciprocal"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(row["username"] == "demo_emma_brooks" for row in response.json()["profiles"]))

    def test_bounds_and_management_command(self):
        for invalid in (0, 4, 11, 1000):
            with self.assertRaises(CommandError):
                seed_demo_profiles(invalid)
        output = StringIO()
        call_command("load_dummy_data", per_language=5, stdout=output)
        self.assertIn("Created 25", output.getvalue())
