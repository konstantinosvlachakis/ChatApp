from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from chatapp.models import BlockedUser

from .factory import make_conversation, make_message, make_user


class BlockedConversationVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(username="alice", email="alice@example.com")
        self.other_user = make_user(
            username="bob",
            email="bob@example.com",
            native_language="greek",
        )
        self.conversation = make_conversation(sender=self.user, receiver=self.other_user)
        make_message(
            conversation=self.conversation,
            sender=self.user,
            text="Hello before block",
        )
        make_message(
            conversation=self.conversation,
            sender=self.other_user,
            text="Reply before block",
        )
        BlockedUser.objects.create(blocker=self.user, blocked=self.other_user)
        self.client.force_authenticate(user=self.user)

    def test_blocked_conversation_still_appears_in_list(self):
        response = self.client.get("/api/conversations/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        conversation_ids = [entry["id"] for entry in response.json()]
        self.assertIn(self.conversation.id, conversation_ids)

    def test_blocked_conversation_detail_still_returns_history(self):
        response = self.client.get(f"/api/conversations/{self.conversation.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["id"], self.conversation.id)
        self.assertEqual(len(payload["messages"]), 2)
        self.assertEqual(payload["messages"][0]["text"], "Hello before block")
        self.assertEqual(payload["messages"][1]["text"], "Reply before block")

    def test_blocked_conversation_messages_endpoint_still_returns_history(self):
        response = self.client.get(f"/api/conversations/{self.conversation.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["pagination"]["total_count"], 2)
        self.assertEqual([message["text"] for message in payload["messages"]], [
            "Hello before block",
            "Reply before block",
        ])

    def test_blocked_conversation_still_rejects_new_messages(self):
        response = self.client.post(
            f"/api/conversations/{self.conversation.id}/messages/",
            {"text": "Should not send"},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json()["error"], "You cannot message a blocked user.")
