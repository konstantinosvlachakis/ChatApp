from collections import Counter
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from django.contrib.auth.hashers import make_password

from chatapp.demo_profiles import DEMO_EMAIL_DOMAIN, LANGUAGES, demo_profile_specs, seed_demo_profiles
from chatapp.models import Conversation, Message, Profile
from .factory import make_conversation, make_message, make_user


class DemoProfileTests(TestCase):
    def test_default_population_is_complete_and_non_login(self):
        result = seed_demo_profiles()
        self.assertEqual(result["created"], 25)
        self.assertEqual(Counter(Profile.objects.values_list("native_language", flat=True)), dict.fromkeys(LANGUAGES, 5))
        self.assertEqual(len(set(Profile.objects.values_list("profile_image_url", flat=True))), 25)
        for user in Profile.objects.all():
            self.assertFalse(user.has_usable_password())
            self.assertFalse(user.email_verified)
            self.assertFalse(user.is_online)
            self.assertTrue(user.username.startswith("demo_"))
            self.assertTrue(user.bio.startswith("Demo profile."))
            self.assertTrue(user.learning_goal)
            self.assertTrue(user.location)
            self.assertGreaterEqual(user.age, 18)
            self.assertRegex(user.profile_image_url, r"^https://i\.pravatar\.cc/600\?img=\d+$")
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
        self.assertEqual((result["created"], result["existing"]), (0, 25))
        first.refresh_from_db()
        self.assertEqual(first.location, "Edited fixture location")
        self.assertEqual(seed_demo_profiles(3)["created"], 0)
        user.refresh_from_db()
        self.assertEqual(user.bio, "A real profile")
        message.refresh_from_db()
        self.assertEqual(message.conversation_id, conversation.pk)
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(Message.objects.count(), 1)

    def test_dry_run_writes_nothing(self):
        output = StringIO()
        call_command("load_dummy_data", "--dry-run", stdout=output)
        self.assertIn("Would create 25", output.getvalue())
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
        for invalid in (0, 6, 1000):
            with self.assertRaises(CommandError):
                seed_demo_profiles(invalid)
        output = StringIO()
        call_command("load_dummy_data", per_language=2, stdout=output)
        self.assertIn("Created 10", output.getvalue())

    def _old_fixture(self, **changes):
        """A row as an earlier, larger seed left it (randomuser portrait, persona beyond five)."""
        spec = {**demo_profile_specs()[0], "username": "demo_lucas_hayes", "email": f"english.06@{DEMO_EMAIL_DOMAIN}",
                "profile_image_url": "https://randomuser.me/api/portraits/men/12.jpg", **changes}
        return Profile.objects.create(**spec, password=make_password(None))

    def test_refresh_photos_updates_only_existing_demo_portraits(self):
        seed_demo_profiles()
        Profile.objects.filter(username="demo_emma_brooks").update(
            profile_image_url="https://randomuser.me/api/portraits/women/10.jpg", location="Edited")
        real = make_user(profile_image_url="https://example.com/me.jpg")
        self.assertEqual(seed_demo_profiles()["refreshed"], 0)
        dry = seed_demo_profiles(dry_run=True, refresh_photos=True)
        self.assertEqual((dry["refreshed"], dry["would_refresh"]), (0, 1))
        self.assertEqual(seed_demo_profiles(refresh_photos=True)["refreshed"], 1)
        emma = Profile.objects.get(username="demo_emma_brooks")
        self.assertEqual(emma.profile_image_url, "https://i.pravatar.cc/600?img=5")
        self.assertEqual(emma.location, "Edited")
        real.refresh_from_db()
        self.assertEqual(real.profile_image_url, "https://example.com/me.jpg")

    def test_prune_deletes_only_demo_rows_outside_the_list(self):
        seed_demo_profiles()
        old = self._old_fixture()
        lookalike = make_user(username="demo_fan", email=f"fan@{DEMO_EMAIL_DOMAIN}")  # has a password
        conversation = make_conversation(old)
        make_message(conversation, old)
        self.assertEqual(seed_demo_profiles(dry_run=True, prune=True)["would_prune"], 1)
        self.assertTrue(Profile.objects.filter(pk=old.pk).exists())
        result = seed_demo_profiles(prune=True)
        self.assertEqual(result["pruned"], 1)
        self.assertFalse(Profile.objects.filter(pk=old.pk).exists())
        self.assertTrue(Profile.objects.filter(pk=lookalike.pk).exists())
        self.assertEqual(Profile.objects.filter(username__startswith="demo_", email__endswith=DEMO_EMAIL_DOMAIN).count(), 26)

    def test_command_flags(self):
        seed_demo_profiles()
        self._old_fixture()
        output = StringIO()
        call_command("load_dummy_data", "--refresh-photos", "--prune", "--dry-run", stdout=output)
        self.assertIn("Would refresh 0 photos; would prune 1.", output.getvalue())
