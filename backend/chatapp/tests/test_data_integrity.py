import os
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.models import Conversation, Profile

from .factory import make_conversation, make_user


class CreateSuperuserTests(TestCase):
    def test_manager_create_superuser_does_not_crash(self):
        user = Profile.objects.create_superuser(
            username="root", email="Root@Example.com", password="pass1234"
        )
        self.assertEqual(user.email, "root@example.com")
        self.assertTrue(user.check_password("pass1234"))

    def test_createsuperuser_command_creates_account(self):
        with mock.patch.dict(os.environ, {"DJANGO_SUPERUSER_PASSWORD": "pass1234"}):
            call_command(
                "createsuperuser",
                interactive=False,
                email="admin@example.com",
                username="admin",
                stdout=StringIO(),
            )
        user = Profile.objects.get(username="admin")
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.check_password("pass1234"))


class ConversationCreateTests(TestCase):
    def setUp(self):
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="Bob", email="bob@example.com")
        self.client = APIClient()

    def _create(self, actor, participant):
        self.client.force_authenticate(user=actor)
        return self.client.post("/api/conversations/", {"participant": participant})

    def test_participant_lookup_is_case_insensitive(self):
        response = self._create(self.alice, "bob")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        conversation = Conversation.objects.get(id=response.data["id"])
        self.assertEqual(conversation.receiver_id, self.bob.id)

    def test_same_pair_reuses_one_conversation_in_both_directions(self):
        first = self._create(self.alice, "BOB")
        second = self._create(self.alice, "bob")
        reverse = self._create(self.bob, "Alice")

        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["id"], reverse.data["id"])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_legacy_duplicates_resolve_to_the_oldest_conversation(self):
        oldest = make_conversation(sender=self.bob, receiver=self.alice)
        make_conversation(sender=self.alice, receiver=self.bob)

        response = self._create(self.alice, "bob")

        self.assertEqual(response.data["id"], oldest.id)
        self.assertEqual(Conversation.objects.count(), 2)

    def test_unknown_participant_still_returns_404_error_shape(self):
        response = self._create(self.alice, "nobody")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data, {"error": "User not found"})
