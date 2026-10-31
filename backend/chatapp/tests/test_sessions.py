"""Session security (security/sessions): refresh rotation + blacklist, logout
revocation, token_version revocation (HTTP + websockets), log out of all
devices, and re-authentication for email change / account deletion."""

from datetime import timedelta
from unittest.mock import patch

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from chatapp.models import Profile, PushDevice
from chatapp.routing import websocket_urlpatterns
from chatapp.tokens import issue_token_pair, revoke_user_tokens

from .factory import make_conversation, make_user

PASSWORD = "old-Passphrase-77"
TOKEN_URL = "/api/token/"
REFRESH_URL = "/api/token/refresh/"
LOGOUT_URL = "/api/logout/"
LOGOUT_ALL_URL = "/api/auth/logout-all/"
EDIT_URL = "/api/profile/edit/"
DELETE_URL = "/api/profile/delete/"


class SessionTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user(username="voyager", email="voyager@example.com", password=PASSWORD)

    def tearDown(self):
        cache.clear()

    def login(self, client=None, remember_me=False):
        client = client or APIClient()
        response = client.post(
            TOKEN_URL,
            {"email": "voyager@example.com", "password": PASSWORD, "remember_me": remember_me},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return client, response.json()

    def bearer(self, access):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return client

    def refresh(self, refresh_token):
        return APIClient().post(REFRESH_URL, {"refresh": refresh_token}, format="json")


class RefreshRotationTests(SessionTestCase):
    def test_login_tokens_carry_version_and_session_claims(self):
        _, pair = self.login()
        refresh = RefreshToken(pair["refresh"])
        access = AccessToken(pair["access"])
        self.assertEqual(refresh["tv"], 0)
        self.assertEqual(access["tv"], 0)
        self.assertEqual(access["sid"], refresh["sid"])
        self.assertTrue(OutstandingToken.objects.filter(jti=refresh["jti"]).exists())

    def test_refresh_rotates_and_blacklists_the_old_token(self):
        _, pair = self.login()
        response = self.refresh(pair["refresh"])
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access", body)
        self.assertNotEqual(body["refresh"], pair["refresh"])
        old_jti = RefreshToken(pair["refresh"], verify=False)["jti"]
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=old_jti).exists())
        # The session id survives rotation.
        self.assertEqual(
            RefreshToken(body["refresh"])["sid"], RefreshToken(pair["refresh"], verify=False)["sid"]
        )
        # The new refresh token works.
        self.assertEqual(self.refresh(body["refresh"]).status_code, 200)

    def test_reusing_a_rotated_token_after_the_grace_window_is_401(self):
        _, pair = self.login()
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 200)
        cache.clear()  # the grace entry lives in the cache for 10 s
        response = self.refresh(pair["refresh"])
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "token_not_valid")
        self.assertIsInstance(response.json()["error"], str)

    def test_concurrent_refresh_within_grace_gets_the_same_pair(self):
        _, pair = self.login()
        first = self.refresh(pair["refresh"])
        second = self.refresh(pair["refresh"])
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json(), second.json())

    def test_grace_does_not_survive_logout_of_the_new_token(self):
        _, pair = self.login()
        new_pair = self.refresh(pair["refresh"]).json()
        APIClient().post(LOGOUT_URL, {"refresh": new_pair["refresh"]}, format="json")
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)

    def test_cookie_refresh_sets_the_rotated_refresh_cookie(self):
        client, pair = self.login()
        response = client.post(REFRESH_URL, {}, format="json")
        self.assertEqual(response.status_code, 200)
        cookie = response.cookies[settings.AUTH_COOKIE_REFRESH]
        self.assertEqual(cookie.value, response.json()["refresh"])
        self.assertNotEqual(cookie.value, pair["refresh"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(
            int(cookie["max-age"]),
            int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        )
        self.assertEqual(
            response.cookies[settings.AUTH_COOKIE_ACCESS].value, response.json()["access"]
        )

    def test_remember_me_lifetime_is_kept_across_rotation(self):
        client, pair = self.login(remember_me=True)
        response = client.post(REFRESH_URL, {}, format="json")
        self.assertEqual(response.status_code, 200)
        thirty_days = int(timedelta(days=30).total_seconds())
        self.assertEqual(int(response.cookies[settings.AUTH_COOKIE_REFRESH]["max-age"]), thirty_days)
        new_refresh = RefreshToken(response.json()["refresh"])
        self.assertTrue(new_refresh["remember_me"])
        self.assertGreater(new_refresh["exp"] - new_refresh["iat"], thirty_days - 60)


class LogoutTests(SessionTestCase):
    def test_web_logout_blacklists_the_cookie_refresh_token(self):
        client, pair = self.login()
        response = client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[settings.AUTH_COOKIE_REFRESH].value, "")
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)

    def test_mobile_logout_blacklists_the_body_refresh_token(self):
        _, pair = self.login()
        response = APIClient().post(LOGOUT_URL, {"refresh": pair["refresh"]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)

    def test_logout_is_idempotent_and_never_fails_on_bad_tokens(self):
        _, pair = self.login()
        client = APIClient()
        for body in ({"refresh": pair["refresh"]}, {"refresh": pair["refresh"]}, {"refresh": "garbage"}, {}):
            self.assertEqual(client.post(LOGOUT_URL, body, format="json").status_code, 200)
        self.assertEqual(client.post(LOGOUT_URL, {"refresh": pair["access"]}, format="json").status_code, 200)


class TokenVersionTests(SessionTestCase):
    def test_version_bump_rejects_old_access_and_refresh_tokens(self):
        _, pair = self.login()
        self.assertEqual(self.bearer(pair["access"]).get("/api/profile/").status_code, 200)

        revoke_user_tokens(self.user)

        self.assertEqual(self.bearer(pair["access"]).get("/api/profile/").status_code, 401)
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)
        # A fresh login works with the new version.
        _, new_pair = self.login()
        self.assertEqual(AccessToken(new_pair["access"])["tv"], 1)
        self.assertEqual(self.bearer(new_pair["access"]).get("/api/profile/").status_code, 200)

    def test_revoked_access_cookie_is_treated_as_anonymous(self):
        client, _ = self.login()
        self.assertEqual(client.get("/api/profile/").status_code, 200)
        revoke_user_tokens(self.user)
        self.assertEqual(client.get("/api/profile/").status_code, 401)

    def test_revoke_blacklists_outstanding_refresh_tokens(self):
        _, first = self.login()
        _, second = self.login()
        revoke_user_tokens(self.user)
        for pair in (first, second):
            jti = RefreshToken(pair["refresh"], verify=False)["jti"]
            self.assertTrue(BlacklistedToken.objects.filter(token__jti=jti).exists())

    def test_tokens_without_the_claim_count_as_version_zero(self):
        legacy = AccessToken.for_user(self.user)  # issued before token_version existed
        self.assertEqual(self.bearer(str(legacy)).get("/api/profile/").status_code, 200)
        revoke_user_tokens(self.user)
        self.assertEqual(self.bearer(str(legacy)).get("/api/profile/").status_code, 401)

    @override_settings(PASSWORD_RESET_EMAIL_ASYNC=False)
    def test_password_reset_revokes_every_session(self):
        _, pair = self.login()
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        response = APIClient().post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "a-Fresh-passphrase-91"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.bearer(pair["access"]).get("/api/profile/").status_code, 401)
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)


class LogoutAllTests(SessionTestCase):
    def test_logout_all_revokes_every_device_and_clears_cookies(self):
        web, web_pair = self.login()
        _, phone_pair = self.login()
        response = self.bearer(phone_pair["access"]).post(LOGOUT_ALL_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[settings.AUTH_COOKIE_ACCESS].value, "")
        self.assertEqual(Profile.objects.get(pk=self.user.pk).token_version, 1)
        for pair in (web_pair, phone_pair):
            self.assertEqual(self.bearer(pair["access"]).get("/api/profile/").status_code, 401)
            self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)
        self.assertEqual(web.get("/api/profile/").status_code, 401)

    def test_logout_all_stops_push_to_signed_out_devices(self):
        device = PushDevice.objects.create(
            user=self.user, token="ExponentPushToken[abc]", platform="ios"
        )
        client = APIClient()
        client.force_authenticate(user=self.user)
        self.assertEqual(client.post(LOGOUT_ALL_URL).status_code, 200)
        device.refresh_from_db()
        self.assertFalse(device.is_active)

    def test_logout_all_requires_auth(self):
        response = APIClient().post(LOGOUT_ALL_URL)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "not_authenticated")

    def test_logout_all_is_throttled(self):
        from chatapp.throttles import LogoutAllRateThrottle

        with patch.object(LogoutAllRateThrottle, "get_rate", return_value="1/hour"):
            client = APIClient()
            client.force_authenticate(user=self.user)
            self.assertEqual(client.post(LOGOUT_ALL_URL).status_code, 200)
            response = client.post(LOGOUT_ALL_URL)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "throttled")


class EmailChangeReauthTests(SessionTestCase):
    def edit(self, client, **body):
        return client.patch(EDIT_URL, body, format="json")

    def test_email_change_without_password_is_400(self):
        _, pair = self.login()
        response = self.edit(self.bearer(pair["access"]), email="new@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "password_required")
        self.assertEqual(Profile.objects.get(pk=self.user.pk).email, "voyager@example.com")

    def test_email_change_with_wrong_password_is_403(self):
        _, pair = self.login()
        response = self.edit(
            self.bearer(pair["access"]), email="new@example.com", current_password="nope"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "invalid_password")
        self.assertEqual(Profile.objects.get(pk=self.user.pk).email, "voyager@example.com")

    def test_same_email_and_other_fields_need_no_password(self):
        _, pair = self.login()
        response = self.edit(
            self.bearer(pair["access"]), email="Voyager@Example.com", bio="hi"
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("tokens", response.json())
        self.assertEqual(Profile.objects.get(pk=self.user.pk).token_version, 0)

    def test_email_change_with_password_keeps_this_session_and_revokes_others(self):
        _, other_device = self.login()
        _, pair = self.login()
        response = self.edit(
            self.bearer(pair["access"]), email="new@example.com", current_password=PASSWORD
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["updated_profile"]["email"], "new@example.com")
        tokens = body["tokens"]
        self.assertEqual(AccessToken(tokens["access"])["sid"], AccessToken(pair["access"])["sid"])
        # This device continues with the new pair; every old token is dead.
        self.assertEqual(self.bearer(tokens["access"]).get("/api/profile/").status_code, 200)
        self.assertEqual(self.refresh(tokens["refresh"]).status_code, 200)
        for old in (pair, other_device):
            self.assertEqual(self.bearer(old["access"]).get("/api/profile/").status_code, 401)
            self.assertEqual(self.refresh(old["refresh"]).status_code, 401)

    def test_cookie_email_change_sets_new_cookies_without_body_tokens(self):
        client, _ = self.login(remember_me=True)
        response = self.edit(client, email="new@example.com", current_password=PASSWORD)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("tokens", response.json())
        refresh_cookie = response.cookies[settings.AUTH_COOKIE_REFRESH]
        self.assertTrue(RefreshToken(refresh_cookie.value)["remember_me"])
        self.assertEqual(int(refresh_cookie["max-age"]), int(timedelta(days=30).total_seconds()))
        self.assertEqual(client.get("/api/profile/").status_code, 200)

    def test_wrong_passwords_count_toward_the_login_lockout(self):
        _, pair = self.login()
        client = self.bearer(pair["access"])
        with patch("chatapp.auth_views.LOGIN_MAX_FAILURES_PER_EMAIL", 3):
            for _ in range(3):
                response = self.edit(client, email="new@example.com", current_password="wrong")
                self.assertEqual(response.status_code, 403)
            locked = self.edit(client, email="new@example.com", current_password=PASSWORD)
            self.assertEqual(locked.status_code, 429)
            self.assertEqual(locked.json()["code"], "throttled")
            # Same counter as /api/token/.
            login = APIClient().post(
                TOKEN_URL, {"email": "voyager@example.com", "password": PASSWORD}, format="json"
            )
            self.assertEqual(login.status_code, 429)
        self.assertEqual(Profile.objects.get(pk=self.user.pk).email, "voyager@example.com")


class DeleteAccountReauthTests(SessionTestCase):
    def test_delete_requires_the_current_password(self):
        _, pair = self.login()
        client = self.bearer(pair["access"])
        missing = client.delete(DELETE_URL, {}, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.json()["code"], "password_required")
        wrong = client.delete(DELETE_URL, {"current_password": "nope"}, format="json")
        self.assertEqual(wrong.status_code, 403)
        self.assertEqual(wrong.json()["code"], "invalid_password")
        self.assertTrue(Profile.objects.filter(pk=self.user.pk).exists())

        ok = client.delete(DELETE_URL, {"current_password": PASSWORD}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertFalse(Profile.objects.filter(pk=self.user.pk).exists())
        self.assertEqual(self.refresh(pair["refresh"]).status_code, 401)

    def test_delete_wrong_passwords_are_limited(self):
        _, pair = self.login()
        client = self.bearer(pair["access"])
        with patch("chatapp.auth_views.LOGIN_MAX_FAILURES_PER_EMAIL", 2):
            for _ in range(2):
                self.assertEqual(
                    client.delete(DELETE_URL, {"current_password": "x"}, format="json").status_code,
                    403,
                )
            response = client.delete(DELETE_URL, {"current_password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 429)
        self.assertTrue(Profile.objects.filter(pk=self.user.pk).exists())


ws_application = URLRouter(websocket_urlpatterns)


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class WebsocketRevocationTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        self.chat_path = f"/ws/socket-server/{self.conversation.id}/"

    def tearDown(self):
        cache.clear()

    async def _connect(self, path, access):
        communicator = WebsocketCommunicator(
            ws_application, path, headers=[(b"authorization", f"Bearer {access}".encode())]
        )
        connected, _ = await communicator.connect()
        return communicator, connected

    async def _pair(self, user):
        return await database_sync_to_async(issue_token_pair)(user)

    async def _revoke(self, user, keep_session_id=None):
        def run():
            fresh = Profile.objects.get(pk=user.pk)
            revoke_user_tokens(fresh, keep_session_id=keep_session_id)

        await database_sync_to_async(run)()

    async def _assert_closed(self, communicator, code=4401):
        while True:
            output = await communicator.receive_output(timeout=2)
            if output["type"] == "websocket.close":
                break
        self.assertEqual(output, {"type": "websocket.close", "code": code})
        await communicator.wait()

    async def test_revoked_token_is_rejected_on_connect(self):
        pair = await self._pair(self.alice)
        await self._revoke(self.alice)
        for path in ("/ws/presence/", self.chat_path):
            communicator, connected = await self._connect(path, pair["access"])
            self.assertTrue(connected)
            await self._assert_closed(communicator)

    async def test_open_sockets_close_with_4401_on_revocation(self):
        pair = await self._pair(self.alice)
        presence, _ = await self._connect("/ws/presence/", pair["access"])
        initial = await presence.receive_json_from(timeout=2)
        self.assertEqual(initial["type"], "initial_online_users")
        chat, chat_connected = await self._connect(self.chat_path, pair["access"])
        self.assertTrue(chat_connected)

        await self._revoke(self.alice)

        await self._assert_closed(presence)
        await self._assert_closed(chat)

    async def test_the_session_that_made_the_change_stays_connected(self):
        keep = await self._pair(self.alice)
        other = await self._pair(self.alice)
        kept, _ = await self._connect(self.chat_path, keep["access"])
        dropped, _ = await self._connect(self.chat_path, other["access"])

        await self._revoke(self.alice, keep_session_id=AccessToken(keep["access"])["sid"])

        await self._assert_closed(dropped)
        self.assertTrue(await kept.receive_nothing(timeout=0.3))
        await kept.disconnect()
