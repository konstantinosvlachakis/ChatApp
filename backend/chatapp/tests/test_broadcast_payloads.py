"""Websocket payloads must survive json.dumps (ChatConsumer) and msgpack
(channels_redis): plain JSON types only, no datetime objects."""
import json
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from .factory import make_conversation, make_message, make_user


class ReplyBroadcastPayloadTests(TestCase):
    def setUp(self):
        self.alice = make_user()
        self.bob = make_user(native_language="greek")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        self.original = make_message(conversation=self.conversation, sender=self.bob, text="Original")
        self.reply = make_message(
            conversation=self.conversation, sender=self.alice, text="A reply", reply_to=self.original
        )
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def captured_payloads(self, send_request):
        with mock.patch("chatapp.views.broadcast_chat_room_event") as broadcast:
            response = send_request()
        self.assertLess(response.status_code, 300, getattr(response, "data", None))
        return [call.kwargs["message"] for call in broadcast.call_args_list if "message" in call.kwargs]

    def assert_json_safe(self, payloads):
        self.assertTrue(payloads)
        for payload in payloads:
            self.assertIsNotNone(payload["reply_to"])
            json.dumps(payload)  # raises TypeError on datetime
            self.assertIsInstance(payload["reply_to"]["timestamp"], str)

    def test_send_reply(self):
        url = f"/api/conversations/{self.conversation.id}/messages/"
        self.assert_json_safe(
            self.captured_payloads(lambda: self.client.post(url, {"text": "hi", "reply_to": str(self.original.id)}))
        )

    def test_react_edit_pin_reply(self):
        message_url = f"/api/messages/{self.reply.id}"
        for send_request in (
            lambda: self.client.post(f"{message_url}/react/", {"emoji": "👍"}),
            lambda: self.client.patch(f"{message_url}/edit/", {"text": "edited reply"}),
            lambda: self.client.patch(f"{message_url}/pin/", {"is_pinned": True}),
        ):
            self.assert_json_safe(self.captured_payloads(send_request))
