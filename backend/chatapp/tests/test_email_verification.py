from datetime import timedelta
from importlib import import_module
from unittest.mock import patch

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.apps import apps
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from chatapp.email_verification import (
    VerificationError, confirm_verification_code, issue_verification_code,
    make_verification_link_token, mark_email_verified,
)
from chatapp.models import EmailVerificationCode, Profile
from chatapp.routing import websocket_urlpatterns
from chatapp.tokens import issue_token_pair
from .factory import make_conversation, make_message, make_user

SEND = "/api/auth/verify-email/send/"
CONFIRM = "/api/auth/verify-email/confirm/"
LINK = "/api/auth/verify-email/confirm-link/"
PASSWORD = "a-Strong-passphrase-77"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", EMAIL_VERIFICATION_EMAIL_ASYNC=False)
class EmailVerificationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user(password=PASSWORD, email_verified_at=None)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def tearDown(self):
        cache.clear()

    def test_registration_sends_code_and_does_not_verify(self):
        response = APIClient().post("/api/register/", {
            "username": "newvoyager", "email": "new@example.com", "password": PASSWORD,
            "nativeLanguage": "English",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["verification_email_sent"])
        user = Profile.objects.get(username="newvoyager")
        self.assertFalse(user.email_verified)
        record = EmailVerificationCode.objects.get(user=user)
        code = mail.outbox[-1].subject.rsplit(" ", 1)[-1]
        self.assertRegex(code, r"^\d{6}$")
        self.assertNotEqual(record.code_hash, code)
        self.assertIn("/verify-email?token=", mail.outbox[-1].body)
        self.assertAlmostEqual((record.expires_at - timezone.now()).total_seconds(), 900, delta=5)

    @patch("chatapp.email_verification.EmailMultiAlternatives.send", side_effect=OSError("SMTP unavailable"))
    def test_mail_failure_does_not_fail_signup(self, send):
        response = APIClient().post("/api/register/", {
            "username": "offline", "email": "offline@example.com", "password": PASSWORD,
            "nativeLanguage": "English",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["verification_email_sent"])
        self.assertFalse(Profile.objects.get(username="offline").email_verified)

    def test_code_verifies_and_invalidates_cached_profile(self):
        self.assertFalse(self.client.get("/api/profile/").json()["email_verified"])
        code = issue_verification_code(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(CONFIRM, {"code": code}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.client.get("/api/profile/").json()["email_verified"])
        self.assertEqual(EmailVerificationCode.objects.get(user=self.user).code_hash, "")
        # A repeated confirmation is harmless.
        self.assertEqual(self.client.post(CONFIRM, {"code": code}, format="json").status_code, 200)

    def test_five_wrong_guesses_require_new_code(self):
        with patch("chatapp.email_verification.secrets.randbelow", return_value=123456):
            issue_verification_code(self.user)
        for remaining in range(4, -1, -1):
            response = self.client.post(CONFIRM, {"code": "000000"}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["attempts_remaining"], remaining)
        response = self.client.post(CONFIRM, {"code": "123456"}, format="json")
        self.assertEqual(response.json()["code"], "too_many_attempts")
        new = issue_verification_code(self.user)
        self.assertEqual(self.client.post(CONFIRM, {"code": new}, format="json").status_code, 200)

    def test_expired_code_and_replaced_code_are_rejected(self):
        old = issue_verification_code(self.user)
        EmailVerificationCode.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.post(CONFIRM, {"code": old}, format="json").json()["code"], "code_expired")
        with patch("chatapp.email_verification.secrets.randbelow", return_value=(int(old) + 1) % 1000000):
            issue_verification_code(self.user)
        self.assertEqual(self.client.post(CONFIRM, {"code": old}, format="json").json()["code"], "invalid_code")

    def test_send_limits_survive_cache_loss(self):
        for _ in range(3):
            cache.clear()
            self.assertEqual(self.client.post(SEND).status_code, 200)
        cache.clear()
        response = self.client.post(SEND)
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response["Retry-After"]), 0)
        self.assertEqual(len(mail.outbox), 3)

    def test_daily_limit_survives_cache_loss(self):
        now = timezone.now().timestamp()
        issue_verification_code(self.user)
        EmailVerificationCode.objects.filter(user=self.user).update(send_history=[now - 700 - i for i in range(10)])
        cache.clear()
        self.assertEqual(self.client.post(SEND).status_code, 429)

    def test_signed_link_works_without_login_and_is_idempotent(self):
        token = make_verification_link_token(self.user)
        for _ in range(2):
            response = APIClient().post(LINK, {"token": token}, format="json")
            self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)

    def test_bad_or_expired_link_cannot_verify(self):
        token = make_verification_link_token(self.user)
        for invalid in ("bad", token + "x", "x" * 513):
            self.assertEqual(APIClient().post(LINK, {"token": invalid}, format="json").status_code, 400)
        with patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 86401):
            self.assertEqual(APIClient().post(LINK, {"token": token}, format="json").status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

    def test_email_change_sends_new_code_revokes_proof_and_pauses_messaging(self):
        code = issue_verification_code(self.user)
        token = make_verification_link_token(self.user)
        mark_email_verified(self.user)
        response = self.client.patch("/api/profile/edit/", {"email": "changed@example.com", "current_password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["updated_profile"]["email_verified"])
        self.assertEqual(mail.outbox[-1].to, ["changed@example.com"])
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)
        self.assertEqual(self.client.post(CONFIRM, {"code": code}, format="json").status_code, 400)
        self.assertEqual(APIClient().post(LINK, {"token": token}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/conversations/", {}).status_code, 403)

    def test_gate_covers_writes_but_leaves_browsing_and_practice_open(self):
        other = make_user()
        conversation = make_conversation(self.user, other)
        message = make_message(conversation, self.user)
        for url, payload in (
            ("/api/conversations/", {"receiver": other.username}),
            (f"/api/conversations/{conversation.pk}/messages/", {"text": "hello"}),
            (f"/api/messages/{message.pk}/react/", {"emoji": "👍"}),
            ("/api/coach/chat/", {"message": "hello"}),
        ):
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, 403, (url, response.content))
            self.assertEqual(response.json()["code"], "email_unverified")
        for url in ("/api/profile/", "/api/profile/data", "/api/practice/state/", "/api/conversations/", f"/api/conversations/{conversation.pk}/messages/"):
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.assertEqual(self.client.patch("/api/profile/edit/", {"bio": "still exploring"}, format="json").status_code, 200)

    def test_verification_endpoints_require_auth_except_signed_link(self):
        for url in (SEND, CONFIRM):
            self.assertEqual(APIClient().post(url, {}, format="json").status_code, 401)

    def test_migration_grandfathers_existing_users_only(self):
        migration = import_module("chatapp.migrations.0035_email_verification")
        migration.mark_existing_users_verified(apps, None)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        new = make_user(email_verified_at=None)
        self.assertFalse(new.email_verified)


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class EmailVerificationSocketTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user(email_verified_at=None)
        self.bob = make_user()
        self.conversation = make_conversation(self.alice, self.bob)
        self.alice_token = issue_token_pair(self.alice)["access"]
        self.bob_token = issue_token_pair(self.bob)["access"]

    async def test_open_socket_checks_current_email_state_even_when_notification_is_lost(self):
        app = URLRouter(websocket_urlpatterns)
        path = f"/ws/socket-server/{self.conversation.pk}/"
        alice = WebsocketCommunicator(app, path, headers=[(b"authorization", f"Bearer {self.alice_token}".encode())])
        bob = WebsocketCommunicator(app, path, headers=[(b"authorization", f"Bearer {self.bob_token}".encode())])
        self.assertTrue((await alice.connect())[0])
        self.assertTrue((await bob.connect())[0])
        try:
            await alice.send_json_to({"type": "webrtc_offer", "sdp": "blocked"})
            self.assertEqual((await alice.receive_json_from())["code"], "email_unverified")
            self.assertTrue(await bob.receive_nothing(timeout=.1))
            await database_sync_to_async(Profile.objects.filter(pk=self.alice.pk).update)(email_verified_at=timezone.now())
            await alice.send_json_to({"type": "webrtc_offer", "sdp": "allowed"})
            self.assertEqual((await bob.receive_json_from())["sdp"], "allowed")
            await database_sync_to_async(Profile.objects.filter(pk=self.alice.pk).update)(email_verified_at=None)
            await alice.send_json_to({"type": "webrtc_offer", "sdp": "blocked again"})
            self.assertEqual((await alice.receive_json_from())["code"], "email_unverified")
        finally:
            await alice.disconnect()
            await bob.disconnect()
