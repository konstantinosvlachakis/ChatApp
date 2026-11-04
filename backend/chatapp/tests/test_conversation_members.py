"""Conversation membership layer (participants table, groundwork for group chats)."""
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.conversation_members import (
    conversation_member_ids,
    is_conversation_member,
    other_member_ids,
)
from chatapp.models import Conversation, ConversationParticipant

from .factory import make_conversation, make_message, make_user


def make_group(owner, members=(), pending=()):
    conversation = Conversation.objects.create(
        kind=Conversation.KIND_GROUP, name="Greek club", sender=owner
    )
    now = timezone.now()
    ConversationParticipant.objects.create(
        conversation=conversation, user=owner, role="owner", status="active", joined_at=now
    )
    for user in members:
        ConversationParticipant.objects.create(
            conversation=conversation, user=user, status="active", joined_at=now, invited_by=owner
        )
    for user in pending:
        ConversationParticipant.objects.create(
            conversation=conversation, user=user, status="pending", invited_by=owner
        )
    return conversation


class DirectConversationParticipantTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")

    def test_creating_a_chat_adds_both_participants(self):
        self.client.force_authenticate(user=self.alice)

        response = self.client.post("/api/conversations/", {"participant": "bob"}, format="json")

        self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        conversation = Conversation.objects.get(id=response.json()["id"])
        self.assertEqual(conversation.kind, Conversation.KIND_DIRECT)
        self.assertEqual(
            set(conversation.participants.values_list("user_id", "status")),
            {(self.alice.id, "active"), (self.bob.id, "active")},
        )

    def test_reopening_a_chat_does_not_duplicate_participants(self):
        self.client.force_authenticate(user=self.alice)
        first = self.client.post("/api/conversations/", {"participant": "bob"}, format="json")
        self.client.force_authenticate(user=self.bob)
        second = self.client.post("/api/conversations/", {"participant": "alice"}, format="json")

        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(ConversationParticipant.objects.count(), 2)

    def test_direct_membership_reads_the_pair_without_queries(self):
        conversation = make_conversation(sender=self.alice, receiver=self.bob)
        conversation = Conversation.objects.get(id=conversation.id)

        with self.assertNumQueries(0):
            self.assertEqual(conversation_member_ids(conversation), [self.alice.id, self.bob.id])
            self.assertTrue(is_conversation_member(self.bob.id, conversation))
            self.assertEqual(other_member_ids(conversation, self.alice.id), [self.bob.id])

    def test_direct_chat_requires_a_receiver(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Conversation.objects.create(kind=Conversation.KIND_DIRECT, sender=self.alice)

    def test_group_cannot_have_a_receiver(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Conversation.objects.create(
                kind=Conversation.KIND_GROUP, sender=self.alice, receiver=self.bob
            )

    def test_participant_is_unique_per_conversation(self):
        conversation = make_conversation(sender=self.alice, receiver=self.bob)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConversationParticipant.objects.create(conversation=conversation, user=self.alice)


class GroupMembershipTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user(username="owner", email="owner@example.com")
        self.member = make_user(username="member", email="member@example.com")
        self.invitee = make_user(username="invitee", email="invitee@example.com")
        self.stranger = make_user(username="stranger", email="stranger@example.com")
        self.group = make_group(self.owner, members=[self.member], pending=[self.invitee])
        self.message = make_message(conversation=self.group, sender=self.owner, text="Γεια σας")

    def test_only_active_participants_are_members(self):
        self.assertEqual(conversation_member_ids(self.group), [self.owner.id, self.member.id])
        self.assertTrue(is_conversation_member(self.member.id, self.group))
        self.assertFalse(is_conversation_member(self.invitee.id, self.group))
        self.assertFalse(is_conversation_member(self.stranger.id, self.group))

    def test_members_can_read_and_send_messages(self):
        self.client.force_authenticate(user=self.member)

        listed = self.client.get(f"/api/conversations/{self.group.id}/messages/")
        sent = self.client.post(f"/api/conversations/{self.group.id}/messages/", {"text": "Καλησπέρα"})

        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED)

    def test_pending_invitee_and_stranger_are_refused(self):
        for user in (self.invitee, self.stranger):
            self.client.force_authenticate(user=user)

            listed = self.client.get(f"/api/conversations/{self.group.id}/messages/")
            sent = self.client.post(f"/api/conversations/{self.group.id}/messages/", {"text": "hi"})
            reacted = self.client.post(f"/api/messages/{self.message.id}/react/", {"emoji": "👍"}, format="json")

            self.assertEqual(listed.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(sent.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(reacted.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_chats_get_no_openers(self):
        group = make_group(self.owner, members=[self.member])
        self.client.force_authenticate(user=self.member)

        response = self.client.get(f"/api/conversations/{group.id}/openers/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"openers": [], "source": "template"})

    def test_group_messages_are_not_marked_delivered(self):
        self.client.force_authenticate(user=self.member)

        self.client.get(f"/api/conversations/{self.group.id}/messages/")

        self.message.refresh_from_db()
        self.assertEqual(self.message.status, "sent")


class BackfillMigrationTests(TransactionTestCase):
    """0039 gives every existing conversation its two participant rows."""

    migrate_from = ("chatapp", "0038_follow")
    migrate_to = ("chatapp", "0039_group_conversations")

    def test_backfill_creates_participants_for_existing_chats(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        Profile = old_apps.get_model("chatapp", "Profile")
        OldConversation = old_apps.get_model("chatapp", "Conversation")
        alice = Profile.objects.create(username="alice", email="a@example.com", native_language="english")
        bob = Profile.objects.create(username="bob", email="b@example.com", native_language="greek")
        pair = OldConversation.objects.create(sender=alice, receiver=bob)
        self_chat = OldConversation.objects.create(sender=alice, receiver=alice)

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate([self.migrate_to])
        new_apps = executor.loader.project_state([self.migrate_to]).apps
        Participant = new_apps.get_model("chatapp", "ConversationParticipant")
        NewConversation = new_apps.get_model("chatapp", "Conversation")

        self.assertEqual(NewConversation.objects.get(id=pair.id).kind, "direct")
        self.assertEqual(
            set(Participant.objects.filter(conversation_id=pair.id).values_list("user_id", "status")),
            {(alice.id, "active"), (bob.id, "active")},
        )
        self.assertEqual(Participant.objects.filter(conversation_id=self_chat.id).count(), 1)

    def tearDown(self):
        # Leave the schema fully migrated for the tests that run after this one.
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

