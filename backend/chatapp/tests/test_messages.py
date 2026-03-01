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
