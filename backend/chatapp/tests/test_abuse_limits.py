"""Abuse limits and hardening from security/abuse-limits: scoped throttles, the
per-account login lockout, removed legacy endpoints, upload signatures, profile
image cleanup, websocket limits and security headers."""

import logging
from types import SimpleNamespace
from unittest.mock import patch

from asgiref.sync import sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import base_user
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import HttpResponse
from django.test import RequestFactory, TestCase, TransactionTestCase, override_settings
from django.urls import resolve
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import UserRateThrottle
from rest_framework_simplejwt.tokens import AccessToken

from chatapp import consumers, views
from chatapp.apps import warn_if_rate_limits_are_per_process
from chatapp.auth_views import LOGIN_LOCKED_MESSAGE, login_failure_cache_key
from chatapp.models import Conversation, Message, PracticeStats, Profile, PushDevice
from chatapp.routing import websocket_urlpatterns
from chatapp.throttles import (
    BlockRateThrottle,
    ConversationCreateRateThrottle,
    MessageSendRateThrottle,
    RegisterRateThrottle,
    UploadRateThrottle,
)
from core.security_headers import SecurityHeadersMiddleware

from .factory import make_conversation, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 28
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 28
HTML = b"<!doctype html><script>alert(1)</script>"


def fake_save(name, content):
    return name


class RemovedEndpointsTests(TestCase):
    def test_admin_is_not_routed(self):
        self.assertNotIn("django.contrib.admin", settings.INSTALLED_APPS)
        # /admin/ is just another SPA path now: no login form to brute-force.
        self.assertEqual(resolve("/admin/").url_name, "home")
        response = self.client.post(
            "/admin/login/", {"username": "a@example.com", "password": "x"}
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_legacy_login_endpoint_is_gone(self):
        user = make_user(email="legacy@example.com", password="pass1234")
        response = APIClient().post(
            "/api/login/", {"email": user.email, "password": "pass1234"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["code"], "not_found")


class ScopedThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.carol = make_user(username="carol", email="carol@example.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def test_views_keep_the_global_user_throttle(self):
        # Explicit throttle_classes replace the defaults; these views must keep them.
        for view in (
            views.translate_message_view,
            views.react_to_message_view,
            views.block_user_view,
            views.public_profile_view,
            views.profile_data_view,
            views.practice_submit_view,
            views.update_profile_image,
            views.push_devices_view,
            views.report_user_view,
        ):
            self.assertIn(UserRateThrottle, view.cls.throttle_classes, view.__name__)
        self.assertIn(UserRateThrottle, views.MessageListView.throttle_classes)

    def test_message_send_is_throttled_with_envelope_and_retry_after(self):
        conversation = make_conversation(sender=self.alice, receiver=self.bob)
        url = f"/api/conversations/{conversation.id}/messages/"
        with patch.object(MessageSendRateThrottle, "THROTTLE_RATES", {"message_send": "2/minute"}):
            codes = [self.client.post(url, {"text": f"hi {i}"}).status_code for i in range(2)]
            blocked = self.client.post(url, {"text": "one too many"})
            history = self.client.get(url)

        self.assertEqual(codes, [201, 201])
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        body = blocked.json()
        self.assertEqual(body["code"], "throttled")
        self.assertIsInstance(body["error"], str)
        self.assertGreater(body["retry_after"], 0)
        self.assertEqual(blocked["Retry-After"], str(body["retry_after"]))
        # Reading history is not counted.
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(Message.objects.count(), 2)

    def test_only_new_conversations_count_toward_the_create_limit(self):
        with patch.object(
            ConversationCreateRateThrottle, "THROTTLE_RATES", {"conversation_create": "1/hour"}
        ):
            first = self.client.post("/api/conversations/", {"participant": "bob"}, format="json")
            reopen = self.client.post("/api/conversations/", {"participant": "bob"}, format="json")
            new = self.client.post("/api/conversations/", {"participant": "carol"}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(reopen.status_code, status.HTTP_200_OK)
        self.assertEqual(reopen.data["id"], first.data["id"])
        self.assertEqual(new.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(new.json()["code"], "throttled")
        self.assertFalse(
            Conversation.objects.filter(receiver=self.carol).exists()
            or Conversation.objects.filter(sender=self.carol).exists()
        )

    @patch("django.core.files.storage.FileSystemStorage._save", side_effect=fake_save)
    def test_attachments_and_profile_images_share_the_upload_bucket(self, _save):
        conversation = make_conversation(sender=self.alice, receiver=self.bob)
        with patch.object(UploadRateThrottle, "THROTTLE_RATES", {"uploads": "1/hour"}):
            attachment = self.client.post(
                f"/api/conversations/{conversation.id}/messages/",
                {"attachment": SimpleUploadedFile("a.png", PNG, content_type="image/png")},
                format="multipart",
            )
            text_only = self.client.post(
                f"/api/conversations/{conversation.id}/messages/", {"text": "no file"}
            )
            image = self.client.patch(
                f"/api/profile/{self.alice.id}/update-image/",
                {"profile_image": SimpleUploadedFile("p.png", PNG, content_type="image/png")},
                format="multipart",
            )

        self.assertEqual(attachment.status_code, status.HTTP_201_CREATED)
        self.assertEqual(text_only.status_code, status.HTTP_201_CREATED)
        self.assertEqual(image.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(image.json()["code"], "throttled")

    def test_block_and_unblock_share_a_bucket(self):
        with patch.object(BlockRateThrottle, "THROTTLE_RATES", {"block": "1/hour"}):
            block = self.client.post("/api/profile/public/bob/block/")
            unblock = self.client.delete("/api/profile/public/bob/block/")

        self.assertEqual(block.status_code, status.HTTP_200_OK)
        self.assertEqual(unblock.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_register_has_its_own_per_ip_limit(self):
        anonymous = APIClient()
        with patch.object(RegisterRateThrottle, "THROTTLE_RATES", {"register": "2/hour"}):
            codes = [
                anonymous.post(
                    "/api/register/",
                    {
                        "username": f"newbie{i}",
                        "email": f"newbie{i}@example.com",
                        "password": "a-Strong-passphrase-42",
                        "nativeLanguage": "english",
                    },
                    format="json",
                    REMOTE_ADDR="203.0.113.7",
                ).status_code
                for i in range(3)
            ]

        self.assertEqual(codes, [201, 201, 429])

    def test_coach_counters_are_atomic_and_global_budget_applies(self):
        with patch.object(views, "COACH_CHAT_RATE_LIMIT_REQUESTS", 2):
            results = [views.consume_coach_chat_rate_limit(self.alice.id) for _ in range(3)]
        self.assertEqual(results, [True, True, False])

        bob_client = APIClient()
        bob_client.force_authenticate(user=self.bob)
        with patch.object(views, "COACH_GLOBAL_DAILY_LIMIT", 1), patch(
            "chatapp.views.generate_coach_reply", return_value="Hola"
        ):
            first = self.client.post("/api/coach/chat/", {"message": "hola"}, format="json")
            second = bob_client.post("/api/coach/chat/", {"message": "hola"}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.json()["code"], "coach_global_limit")
        self.assertIsInstance(second.json()["error"], str)

    def test_practice_xp_is_capped_per_day(self):
        PracticeStats.objects.create(user=self.alice, xp=0, points=0, level=1)

        def submit(challenge_id):
            with patch("chatapp.views.get_challenge_answer", return_value=("casa", "spanish")):
                return self.client.post(
                    "/api/practice/submit/",
                    {"challenge_id": challenge_id, "selected_word": "casa", "language": "spanish"},
                )

        with patch.object(views, "PRACTICE_DAILY_XP_LIMIT", 20):
            responses = [submit(f"spanish:1:{i}") for i in range(3)]

        self.assertEqual([r.data["awarded_xp"] for r in responses], [15, 5, 0])
        self.assertEqual([r.data["daily_xp_limit_reached"] for r in responses], [False, True, True])
        self.assertEqual(responses[-1].data["awarded_points"], 0)
        stats = PracticeStats.objects.get(user=self.alice)
        self.assertEqual(stats.xp, 20)
        self.assertEqual(stats.total_answers, 3)


class LoginLockoutTests(TestCase):
    URL = "/api/token/"

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.user = make_user(email="victim@example.com", password="right-Passphrase-1")

    def login(self, email, password, ip):
        return self.client.post(
            self.URL, {"email": email, "password": password}, format="json", REMOTE_ADDR=ip
        )

    def test_ten_failures_lock_the_account_from_any_ip(self):
        codes = [
            self.login("Victim@Example.com", "wrong", f"198.51.100.{i}").status_code
            for i in range(10)
        ]
        locked = self.login("victim@example.com", "right-Passphrase-1", "192.0.2.200")

        self.assertEqual(codes, [401] * 10)
        self.assertEqual(locked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(locked.json()["code"], "throttled")
        self.assertEqual(locked.json()["error"], LOGIN_LOCKED_MESSAGE)
        self.assertTrue(locked.has_header("Retry-After"))
        self.assertNotIn("lv_access", locked.cookies)

    def test_unknown_emails_lock_the_same_way_and_still_hash(self):
        with patch.object(base_user, "make_password", wraps=base_user.make_password) as hasher:
            first = self.login("nobody@example.com", "x", "198.51.100.1")
        self.assertEqual(first.status_code, status.HTTP_401_UNAUTHORIZED)
        # Django's ModelBackend hashes for missing users (timing parity).
        self.assertEqual(hasher.call_count, 1)

        for i in range(9):
            self.login("nobody@example.com", "x", f"198.51.100.{i + 2}")
        self.assertEqual(
            self.login("nobody@example.com", "x", "192.0.2.9").status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )

    def test_success_resets_the_counter(self):
        for i in range(9):
            self.login("victim@example.com", "wrong", f"198.51.100.{i}")
        self.assertEqual(
            self.login("victim@example.com", "right-Passphrase-1", "192.0.2.1").status_code, 200
        )
        for i in range(9):
            self.login("victim@example.com", "wrong", f"198.51.100.{i + 20}")
        self.assertEqual(
            self.login("victim@example.com", "right-Passphrase-1", "192.0.2.2").status_code, 200
        )

    def test_cache_key_never_contains_the_email(self):
        key = login_failure_cache_key("victim@example.com")
        self.assertNotIn("victim", key)
        self.assertNotIn("example.com", key)


class RegisterEnumerationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        make_user(username="taken", email="taken@example.com")

    def register(self, username, email):
        return APIClient().post(
            "/api/register/",
            {
                "username": username,
                "email": email,
                "password": "a-Strong-passphrase-42",
                "nativeLanguage": "english",
            },
            format="json",
        )

    def test_existing_email_gets_a_generic_error(self):
        response = self.register("someone_new", "Taken@example.com")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        body = response.json()
        self.assertEqual(body["code"], "registration_failed")
        self.assertNotIn("exist", body["error"].lower())
        self.assertNotIn("email", body["error"].lower())
        self.assertEqual(Profile.objects.filter(username="someone_new").count(), 0)

    def test_taken_username_is_still_specific(self):
        response = self.register("Taken", "fresh@example.com")

        self.assertEqual(response.json()["code"], "username_taken")


class UploadSignatureTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def post_attachment(self, content, content_type, name="file.bin"):
        return self.client.post(
            f"/api/conversations/{self.conversation.id}/messages/",
            {"attachment": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_signature_table(self):
        cases = {
            ("image/png", PNG): True,
            ("image/jpeg", JPEG): True,
            ("image/gif", b"GIF89a" + b"\x00" * 10): True,
            ("image/webp", b"RIFF\x00\x00\x00\x00WEBPVP8 "): True,
            ("image/heic", b"\x00\x00\x00\x18ftypheic" + b"\x00" * 8): True,
            ("video/mp4", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 8): True,
            ("audio/x-m4a", b"\x00\x00\x00\x1cftypM4A " + b"\x00" * 8): True,
            ("audio/webm", WEBM): True,
            ("audio/ogg", b"OggS\x00\x02" + b"\x00" * 10): True,
            ("audio/mpeg", b"ID3\x04\x00" + b"\x00" * 10): True,
            ("audio/wav", b"RIFF\x00\x00\x00\x00WAVEfmt "): True,
            ("audio/aac", b"\xff\xf1\x50\x80" + b"\x00" * 10): True,
            ("image/png", JPEG): False,
            ("image/jpeg", HTML): False,
            ("video/mp4", HTML): False,
            ("audio/wav", b"RIFF\x00\x00\x00\x00WEBPVP8 "): False,
        }
        for (content_type, content), expected in cases.items():
            upload = SimpleUploadedFile("f", content, content_type=content_type)
            _, error = views.validate_uploaded_file(
                upload, views.ALLOWED_ATTACHMENT_TYPES, 10 * 1024 * 1024
            )
            self.assertEqual(error is None, expected, (content_type, content[:12]))

    def test_mismatched_attachment_is_rejected_with_envelope(self):
        response = self.post_attachment(HTML, "image/png", "x.png")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "invalid")
        self.assertFalse(Message.objects.exists())

    @patch("django.core.files.storage.FileSystemStorage._save", side_effect=fake_save)
    def test_matching_voice_note_is_accepted(self, _save):
        response = self.post_attachment(WEBM, "audio/webm", "voice.webm")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_mismatched_profile_image_is_rejected(self):
        response = self.client.patch(
            f"/api/profile/{self.alice.id}/update-image/",
            {"profile_image": SimpleUploadedFile("p.jpg", HTML, content_type="image/jpeg")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@patch("django.core.files.storage.FileSystemStorage._save", side_effect=fake_save)
class ProfileImageReplacementTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.alice = make_user(username="alice", email="alice@example.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def upload(self, slot="profile"):
        return self.client.patch(
            f"/api/profile/{self.alice.id}/update-image/",
            {
                "profile_image": SimpleUploadedFile("p.png", PNG, content_type="image/png"),
                "slot": slot,
            },
            format="multipart",
        )

    def test_replaced_file_is_deleted_after_save(self, _save):
        Profile.objects.filter(id=self.alice.id).update(
            complementary_image_1_url="/media/profile_images/old.png"
        )
        with patch("django.core.files.storage.FileSystemStorage.delete") as delete:
            response = self.upload("complementary_1")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        delete.assert_called_once_with("profile_images/old.png")
        self.alice.refresh_from_db()
        self.assertNotEqual(self.alice.complementary_image_1_url, "/media/profile_images/old.png")

    def test_default_avatar_and_shared_files_are_kept(self, _save):
        other = make_user(profile_image_url="/media/profile_images/shared.png")
        with patch("django.core.files.storage.FileSystemStorage.delete") as delete:
            self.upload()  # replaces the default avatar
            Profile.objects.filter(id=self.alice.id).update(
                profile_image_url=other.profile_image_url
            )
            self.upload()  # replaces a file the other account still uses

        delete.assert_not_called()

    def test_only_our_cloudinary_cloud_is_deleted(self, _save):
        with patch.object(views, "get_cloudinary_cloud_name", return_value="ourcloud"):
            ours = views.own_cloudinary_public_id(
                "https://res.cloudinary.com/ourcloud/image/upload/v17/profile_images/a_b.jpg"
            )
            theirs = views.own_cloudinary_public_id(
                "https://res.cloudinary.com/othercloud/image/upload/v17/profile_images/a.jpg"
            )
            lookalike = views.own_cloudinary_public_id(
                "https://res.cloudinary.com.evil.example/ourcloud/image/upload/v1/a.jpg"
            )
            Profile.objects.filter(id=self.alice.id).update(
                profile_image_url="https://res.cloudinary.com/othercloud/image/upload/v1/x.jpg"
            )
            with patch("cloudinary.uploader.destroy") as destroy:
                self.upload()

        self.assertEqual(ours, "profile_images/a_b")
        self.assertIsNone(theirs)
        self.assertIsNone(lookalike)
        destroy.assert_not_called()


class PushTokenMoveTests(TestCase):
    TOKEN = "ExponentPushToken[shared-device-token]"

    def test_registering_a_used_token_moves_it_and_stops_the_old_owner(self):
        old_owner = make_user()
        new_owner = make_user()
        PushDevice.objects.create(user=old_owner, token=self.TOKEN, platform="ios")
        client = APIClient()
        client.force_authenticate(user=new_owner)

        response = client.post(
            "/api/push/devices/", {"token": self.TOKEN, "platform": "ios"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(PushDevice.objects.filter(user=old_owner).exists())
        self.assertEqual(PushDevice.objects.get(token=self.TOKEN).user_id, new_owner.id)


class SecurityHeaderTests(TestCase):
    def test_json_responses_get_permissions_policy_but_no_csp(self):
        response = self.client.get("/api/health/")

        self.assertIn("camera=(self)", response["Permissions-Policy"])
        self.assertIn("microphone=(self)", response["Permissions-Policy"])
        self.assertIn("geolocation=(self)", response["Permissions-Policy"])
        self.assertEqual(response["Cross-Origin-Opener-Policy"], "same-origin")
        self.assertFalse(response.has_header("Content-Security-Policy"))
        self.assertFalse(response.has_header("Content-Security-Policy-Report-Only"))

    def _html_response(self):
        middleware = SecurityHeadersMiddleware(
            lambda request: HttpResponse("<html></html>", content_type="text/html")
        )
        return middleware(RequestFactory().get("/"))

    def test_html_gets_report_only_csp_by_default(self):
        response = self._html_response()

        self.assertFalse(response.has_header("Content-Security-Policy"))
        policy = response["Content-Security-Policy-Report-Only"]
        self.assertIn("default-src 'self'", policy)
        self.assertIn("frame-ancestors 'none'", policy)
        self.assertIn("https://res.cloudinary.com", policy)
        self.assertIn("https://fonts.gstatic.com", policy)

    @override_settings(CSP_MODE="enforce")
    def test_csp_can_be_enforced(self):
        self.assertTrue(self._html_response().has_header("Content-Security-Policy"))

    @override_settings(CSP_MODE="off")
    def test_csp_can_be_turned_off(self):
        response = self._html_response()
        self.assertFalse(response.has_header("Content-Security-Policy"))
        self.assertFalse(response.has_header("Content-Security-Policy-Report-Only"))

    def test_warns_when_production_limits_are_per_process(self):
        locmem = SimpleNamespace(
            ENVIRONMENT="production",
            CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
        )
        redis = SimpleNamespace(
            ENVIRONMENT="production",
            CACHES={"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache"}},
        )
        local = SimpleNamespace(ENVIRONMENT="local", CACHES=locmem.CACHES)
        with self.assertLogs("chatapp.apps", level=logging.WARNING):
            self.assertTrue(warn_if_rate_limits_are_per_process(locmem))
        self.assertFalse(warn_if_rate_limits_are_per_process(redis))
        self.assertFalse(warn_if_rate_limits_are_per_process(local))


ws_application = URLRouter(websocket_urlpatterns)


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class WebsocketLimitTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        self.chat_path = f"/ws/socket-server/{self.conversation.id}/"

    def bearer(self, user):
        return [(b"authorization", f"Bearer {AccessToken.for_user(user)}".encode())]

    async def connect(self, path, user):
        communicator = WebsocketCommunicator(ws_application, path, headers=self.bearer(user))
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def assert_closed_with(self, communicator, code):
        closed = await communicator.receive_output(timeout=2)
        self.assertEqual(closed, {"type": "websocket.close", "code": code})
        await communicator.wait()

    async def test_query_string_token_is_rejected(self):
        token = AccessToken.for_user(self.alice)
        for path, code in ((self.chat_path, 4403), ("/ws/presence/", 4401)):
            communicator = WebsocketCommunicator(ws_application, f"{path}?token={token}")
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await self.assert_closed_with(communicator, code)

    async def test_deleted_user_presence_socket_is_rejected(self):
        headers = self.bearer(self.alice)
        await sync_to_async(Profile.objects.filter(id=self.alice.id).delete)()
        communicator = WebsocketCommunicator(ws_application, "/ws/presence/", headers=headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await self.assert_closed_with(communicator, 4401)

    async def test_excess_frames_are_dropped_silently(self):
        with patch.object(consumers, "WS_FRAME_RATE_PER_SECOND", 0.001), patch.object(
            consumers, "WS_FRAME_BURST", 3
        ):
            alice = await self.connect(self.chat_path, self.alice)
        bob = await self.connect(self.chat_path, self.bob)
        try:
            for _ in range(5):
                await alice.send_json_to({"type": "call_end", "durationSeconds": 1})
            received = []
            while not await bob.receive_nothing(timeout=0.3):
                received.append(await bob.receive_json_from(timeout=1))
            self.assertEqual(len(received), 3)
            # Dropping is silent: alice's socket stays open and gets no error.
            self.assertTrue(await alice.receive_nothing(timeout=0.1))
        finally:
            await alice.disconnect()
            await bob.disconnect()

    async def test_typing_and_call_invite_have_their_own_budgets(self):
        with patch.object(consumers, "WS_TYPING_RATE_PER_SECOND", 0.001), patch.object(
            consumers, "WS_TYPING_BURST", 2
        ):
            alice = await self.connect(self.chat_path, self.alice)
        bob = await self.connect(self.chat_path, self.bob)
        try:
            for _ in range(4):
                await alice.send_json_to({"type": "user_typing"})
            for _ in range(7):
                await alice.send_json_to({"type": "call_invite", "callMode": "audio"})
            types = []
            while not await bob.receive_nothing(timeout=0.3):
                types.append((await bob.receive_json_from(timeout=1))["type"])
            self.assertEqual(types.count("user_typing"), 2)
            self.assertEqual(types.count("call_invite"), 5)
        finally:
            await alice.disconnect()
            await bob.disconnect()

    async def test_sustained_abuse_closes_with_4429(self):
        with patch.object(consumers, "WS_FRAME_RATE_PER_SECOND", 0.001), patch.object(
            consumers, "WS_FRAME_BURST", 1
        ), patch.object(consumers, "WS_MAX_DROPPED_FRAMES_PER_MINUTE", 2):
            alice = await self.connect(self.chat_path, self.alice)
            for _ in range(4):
                await alice.send_to(text_data='{"type": "call_end"}')
            await self.assert_closed_with(alice, 4429)

    async def test_open_sockets_per_user_are_capped(self):
        with patch.object(consumers, "WS_MAX_PRESENCE_SOCKETS_PER_USER", 1):
            first = await self.connect("/ws/presence/", self.alice)
            await first.receive_json_from(timeout=2)  # initial_online_users
            second = await self.connect("/ws/presence/", self.alice)
            await self.assert_closed_with(second, 4429)
            await first.disconnect()
            # The slot is released on disconnect.
            third = await self.connect("/ws/presence/", self.alice)
            initial = await third.receive_json_from(timeout=2)
            self.assertEqual(initial["type"], "initial_online_users")
            await third.disconnect()

        with patch.object(consumers, "WS_MAX_CHAT_SOCKETS_PER_USER", 1):
            chat = await self.connect(self.chat_path, self.alice)
            extra = await self.connect(self.chat_path, self.alice)
            await self.assert_closed_with(extra, 4429)
            await chat.disconnect()
        count = await sync_to_async(
            Profile.objects.filter(id=self.alice.id).values_list("ws_connection_count", flat=True).get
        )()
        self.assertEqual(count, 0)
