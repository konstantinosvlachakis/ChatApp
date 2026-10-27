"""Push device registration and new-message push delivery (network always mocked)."""

import json
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from chatapp import push
from chatapp.models import BlockedUser, PushDevice

from .factory import make_conversation, make_user
from .test_query_counts import MAX_QUERIES

TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
TOKEN_B = "ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]"
TOKEN_C = "ExponentPushToken[cccccccccccccccccccccc]"


class PushDeviceEndpointTests(TestCase):
    url = "/api/push/devices/"

    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_register_creates_then_upserts(self):
        response = self.client.post(
            self.url, {"token": TOKEN_A, "platform": "ios"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        PushDevice.objects.filter(token=TOKEN_A).update(is_active=False)

        response = self.client.post(
            self.url, {"token": TOKEN_A, "platform": "android"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        device = PushDevice.objects.get(token=TOKEN_A)
        self.assertEqual(device.user_id, self.user.id)
        self.assertEqual(device.platform, "android")
        self.assertTrue(device.is_active)
        self.assertEqual(PushDevice.objects.count(), 1)

    def test_register_moves_token_to_current_user(self):
        other = make_user()
        PushDevice.objects.create(user=other, token=TOKEN_B, platform="android")
        response = self.client.post(
            self.url, {"token": TOKEN_B, "platform": "android"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PushDevice.objects.get(token=TOKEN_B).user_id, self.user.id)

    def test_register_rejects_bad_token_and_platform(self):
        for payload, code in (
            ({"token": "not-a-token", "platform": "ios"}, "invalid_push_token"),
            ({"token": "ExponentPushToken[]", "platform": "ios"}, "invalid_push_token"),
            ({"token": TOKEN_A, "platform": "web"}, "invalid_platform"),
        ):
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], code)
                self.assertIsInstance(response.data["error"], str)
        self.assertFalse(PushDevice.objects.exists())

    def test_delete_removes_only_own_device(self):
        other = make_user()
        PushDevice.objects.create(user=self.user, token=TOKEN_A, platform="ios")
        PushDevice.objects.create(user=other, token=TOKEN_B, platform="ios")

        self.assertEqual(
            self.client.delete(self.url, {"token": TOKEN_A}, format="json").status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(self.url, {"token": TOKEN_B}, format="json").status_code,
            200,
        )
        self.assertFalse(PushDevice.objects.filter(token=TOKEN_A).exists())
        self.assertTrue(PushDevice.objects.filter(token=TOKEN_B).exists())

    def test_requires_authentication(self):
        response = APIClient().post(
            self.url, {"token": TOKEN_A, "platform": "ios"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("code", response.data)


def run_inline(func, **kwargs):
    func(**kwargs)


@override_settings(PUSH_NOTIFICATIONS_ENABLED=True)
@mock.patch.object(push, "_submit", side_effect=run_inline)
class MessagePushDeliveryTests(TestCase):
    def setUp(self):
        cache.clear()
        self.sender = make_user(username="alice")
        self.recipient = make_user(username="bob", native_language="greek")
        self.conversation = make_conversation(sender=self.sender, receiver=self.recipient)
        self.client = APIClient()
        self.client.force_authenticate(user=self.sender)
        self.url = f"/api/conversations/{self.conversation.id}/messages/"
        PushDevice.objects.create(user=self.recipient, token=TOKEN_A, platform="ios")
        PushDevice.objects.create(user=self.recipient, token=TOKEN_B, platform="android")
        PushDevice.objects.create(
            user=self.recipient, token=TOKEN_C, platform="ios", is_active=False
        )
        PushDevice.objects.create(
            user=self.sender, token="ExponentPushToken[sender]", platform="ios"
        )

    def send(self, data):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_push_sent_to_recipient_active_devices_with_payload(self, _submit):
        with mock.patch.object(push, "send_expo_push_batch", return_value=[]) as sender:
            self.send({"text": "x" * 300})
        sender.assert_called_once()
        messages = sender.call_args.args[0]
        self.assertEqual([m["to"] for m in messages], [TOKEN_A, TOKEN_B])
        message = messages[0]
        self.assertEqual(message["title"], "alice")
        self.assertLessEqual(len(message["body"]), push.PUSH_BODY_MAX_LENGTH)
        self.assertTrue(message["body"].endswith("…"))
        self.assertEqual(
            message["data"], {"type": "message", "conversation_id": self.conversation.id}
        )
        self.assertEqual(message["sound"], "default")
        self.assertEqual(message["channelId"], "messages")
        self.assertEqual(message["threadId"], f"conversation-{self.conversation.id}")
        # Nothing beyond the username and preview (no emails or other profile data).
        self.assertNotIn("@", json.dumps(messages))

    def test_attachment_only_message_uses_label(self, _submit):
        image = SimpleUploadedFile("p.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")
        with mock.patch.object(push, "send_expo_push_batch", return_value=[]) as sender:
            self.send({"attachment": image})
        self.assertEqual(sender.call_args.args[0][0]["body"], "📷 Photo")

    def test_body_labels(self, _submit):
        self.assertEqual(push.build_message_push_body("", "audio/webm"), "🎤 Voice message")
        self.assertEqual(push.build_message_push_body("", "video/mp4"), "📎 File")
        self.assertEqual(push.build_message_push_body("  hi\nthere ", "image/png"), "hi there")

    def test_blocked_pair_gets_no_push(self, _submit):
        BlockedUser.objects.create(blocker=self.recipient, blocked=self.sender)
        with mock.patch.object(push, "send_expo_push_batch") as sender:
            push.deliver_message_push(
                conversation_id=self.conversation.id,
                sender_id=self.sender.id,
                recipient_id=self.recipient.id,
                title="alice",
                body="hi",
            )
        sender.assert_not_called()

    def test_disabled_flag_sends_nothing(self, _submit):
        with override_settings(PUSH_NOTIFICATIONS_ENABLED=False), mock.patch.object(
            push, "send_expo_push_batch"
        ) as sender:
            self.send({"text": "hi"})
        sender.assert_not_called()

    def test_device_not_registered_deactivates_token(self, _submit):
        tickets = [
            {
                "status": "error",
                "message": "not registered",
                "details": {"error": "DeviceNotRegistered"},
            },
            {"status": "ok", "id": "ticket-1"},
        ]
        with mock.patch.object(push, "send_expo_push_batch", return_value=tickets):
            self.send({"text": "hi"})
        self.assertFalse(PushDevice.objects.get(token=TOKEN_A).is_active)
        self.assertTrue(PushDevice.objects.get(token=TOKEN_B).is_active)

    def test_batches_of_at_most_100(self, _submit):
        PushDevice.objects.bulk_create(
            PushDevice(user=self.recipient, token=f"ExponentPushToken[t{i}]", platform="ios")
            for i in range(150)
        )
        with mock.patch.object(push, "send_expo_push_batch", return_value=[]) as sender:
            self.send({"text": "hi"})
        sizes = [len(call.args[0]) for call in sender.call_args_list]
        self.assertEqual(sizes, [100, 52])

    def test_send_query_count_unchanged_by_push(self, _submit):
        # Scheduling runs no queries on the request path; delivery runs after commit.
        cache.clear()
        with mock.patch.object(push, "send_expo_push_batch", return_value=[]):
            with CaptureQueriesContext(connection) as context:
                response = self.client.post(self.url, {"text": "hi"})
        self.assertEqual(response.status_code, 201)
        self.assertLessEqual(len(context.captured_queries), MAX_QUERIES["send"])


class ExpoHttpSenderTests(TestCase):
    @override_settings(EXPO_ACCESS_TOKEN="test-access-token")
    def test_posts_json_with_bearer_and_timeout(self):
        response = mock.MagicMock()
        response.read.return_value = json.dumps({"data": [{"status": "ok"}]}).encode()
        response.__enter__.return_value = response
        with mock.patch.object(push, "urlopen", return_value=response) as urlopen:
            tickets = push.send_expo_push_batch([{"to": TOKEN_A}])
        self.assertEqual(tickets, [{"status": "ok"}])
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, push.EXPO_PUSH_URL)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-access-token")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], push.EXPO_PUSH_TIMEOUT_SECONDS)

    def test_network_error_returns_no_tickets(self):
        with mock.patch.object(push, "urlopen", side_effect=OSError("down")):
            self.assertEqual(push.send_expo_push_batch([{"to": TOKEN_A}]), [])
