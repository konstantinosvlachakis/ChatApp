from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .factory import make_conversation, make_message, make_user


class MessageReplyValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = make_user(username="alice", email="alice@example.com")
        self.user2 = make_user(
            username="bob", email="bob@example.com", native_language="greek"
        )
        self.conversation = make_conversation(sender=self.user1, receiver=self.user2)

        # Bypass JWT in tests and authenticate directly.
        self.client.force_authenticate(user=self.user1)

    def test_post_message_with_invalid_reply_to_returns_400(self):
        url = f"/api/conversations/{self.conversation.id}/messages/"
        payload = {
            "text": "Hello",
            "reply_to": "999999",  # message id that does not exist in this conversation
        }

        # IMPORTANT: send form-style payload (your view uses MultiPart/Form parsers).
        response = self.client.post(url, payload)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["error"],
            "Reply target message not found in this conversation",
        )

    def test_post_message_with_valid_reply_to_returns_201(self):
        # First, create a message to reply to.
        original_message = make_message(
            conversation=self.conversation,
            sender=self.user1,
            text="Original message",
        )

        url = f"/api/conversations/{self.conversation.id}/messages/"
        payload = {
            "text": "This is a reply",
            "reply_to": str(
                original_message.id
            ),  # valid message id in this conversation
        }

        response = self.client.post(url, payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["text"], "This is a reply")
        self.assertIsNotNone(response.data["reply_to"])
        self.assertEqual(response.data["reply_to"]["id"], original_message.id)
        self.assertEqual(response.data["reply_to"]["text"], "Original message")


class MessageEditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = make_user(username="carol", email="carol@example.com")
        self.user2 = make_user(username="dave", email="dave@example.com")
        self.conversation = make_conversation(sender=self.user1, receiver=self.user2)
        self.message = make_message(
            conversation=self.conversation,
            sender=self.user1,
            text="Original text",
        )

    def test_sender_can_edit_message(self):
        self.client.force_authenticate(user=self.user1)

        response = self.client.patch(
            f"/api/messages/{self.message.id}/edit/",
            {"text": "Updated text"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["text"], "Updated text")
        self.assertIsNotNone(response.data["edited_at"])

        self.message.refresh_from_db()
        self.assertEqual(self.message.text, "Updated text")
        self.assertIsNotNone(self.message.edited_at)

    def test_non_sender_cannot_edit_message(self):
        self.client.force_authenticate(user=self.user2)

        response = self.client.patch(
            f"/api/messages/{self.message.id}/edit/",
            {"text": "Should fail"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MessagePinTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = make_user(username="erin", email="erin@example.com")
        self.user2 = make_user(username="frank", email="frank@example.com")
        self.conversation = make_conversation(sender=self.user1, receiver=self.user2)
        self.message = make_message(
            conversation=self.conversation,
            sender=self.user2,
            text="Pin me",
        )

    def test_participant_can_pin_message(self):
        self.client.force_authenticate(user=self.user1)

        response = self.client.patch(
            f"/api/messages/{self.message.id}/pin/",
            {"is_pinned": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_pinned"])
        self.assertIsNotNone(response.data["pinned_at"])
        self.assertEqual(response.data["pinned_by"]["id"], self.user1.id)

        self.message.refresh_from_db()
        self.assertIsNotNone(self.message.pinned_at)
        self.assertEqual(self.message.pinned_by_id, self.user1.id)

    def test_participant_can_unpin_message(self):
        self.message.pinned_at = self.message.timestamp
        self.message.pinned_by = self.user1
        self.message.save(update_fields=["pinned_at", "pinned_by"])
        self.client.force_authenticate(user=self.user2)

        response = self.client.patch(
            f"/api/messages/{self.message.id}/pin/",
            {"is_pinned": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_pinned"])
        self.assertIsNone(response.data["pinned_at"])
        self.assertIsNone(response.data["pinned_by"])

        self.message.refresh_from_db()
        self.assertIsNone(self.message.pinned_at)
        self.assertIsNone(self.message.pinned_by)

    def test_non_participant_cannot_pin_message(self):
        outsider = make_user(username="grace", email="grace@example.com")
        self.client.force_authenticate(user=outsider)

        response = self.client.patch(
            f"/api/messages/{self.message.id}/pin/",
            {"is_pinned": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
