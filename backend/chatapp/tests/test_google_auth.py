import time
from types import SimpleNamespace
from unittest import mock

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from chatapp import social_auth
from chatapp.models import Conversation, Follow, Profile, SocialAccount
from chatapp.tokens import issue_token_pair
from .factory import make_user

CLIENT_ID = "web-client.apps.googleusercontent.com"
GOOGLE_URL = "/api/auth/google/"
COMPLETE_URL = "/api/auth/complete-profile/"
VERIFY = "chatapp.social_auth.verify_google_id_token"


def google_claims(**overrides):
    claims = {
        "sub": "google-sub-1",
        "email": "Maria@Example.com",
        "email_verified": True,
        "given_name": "Maria",
        "name": "Maria P",
        "picture": None,
        "locale": "en",
    }
    claims.update(overrides)
    return claims


VALID_PROFILE = {
    "nativeLanguage": "Greek",
    "practiceLanguages": ["Spanish", "english"],
    "practiceLanguageLevels": {"spanish": "intermediate"},
}


@override_settings(GOOGLE_OAUTH_CLIENT_IDS=[CLIENT_ID])
class GoogleAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def sign_in(self, claims=None, **body):
        payload = {"credential": "id-token", **body}
        with mock.patch(VERIFY, return_value=claims or google_claims()):
            return self.client.post(GOOGLE_URL, payload, format="json")

    # --- sign-up -------------------------------------------------------------

    def test_new_user_with_profile_is_complete(self):
        response = self.sign_in(profile={**VALID_PROFILE, "username": "maria_p"}, remember_me=True)

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["created"])
        self.assertTrue(body["profile_complete"])
        self.assertEqual(body["username"], "maria_p")
        self.assertTrue(body["access"] and body["refresh"])
        user = Profile.objects.get(username="maria_p")
        self.assertEqual(user.email, "maria@example.com")
        self.assertIsNotNone(user.email_verified_at)
        self.assertIsNotNone(user.date_joined)
        self.assertIsNotNone(user.last_login)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.native_language, "Greek")
        self.assertEqual(user.languages_practicing, ["spanish", "english"])
        self.assertEqual(
            user.practice_language_levels, {"spanish": "intermediate", "english": "beginner"}
        )
        self.assertTrue(user.profile_completed)
        account = SocialAccount.objects.get(user=user)
        self.assertEqual((account.provider, account.subject), ("google", "google-sub-1"))
        # Same cookies as password login; remember me → 30-day refresh cookie.
        self.assertIn(settings.AUTH_COOKIE_ACCESS, response.cookies)
        refresh_cookie = response.cookies[settings.AUTH_COOKIE_REFRESH]
        self.assertTrue(refresh_cookie["httponly"])
        self.assertEqual(int(refresh_cookie["max-age"]), 30 * 24 * 3600)

    def test_new_user_without_profile_is_incomplete_with_unique_username(self):
        make_user(username="Maria")
        response = self.sign_in()

        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["created"])
        self.assertFalse(body["profile_complete"])
        self.assertEqual(body["username"], "Maria2")
        user = Profile.objects.get(username="Maria2")
        self.assertFalse(user.profile_completed)
        self.assertEqual(user.native_language, "")
        self.assertEqual(user.languages_practicing, [])

        second = self.sign_in(google_claims(sub="google-sub-2", email="m2@example.com"))
        self.assertEqual(second.json()["username"], "Maria3")

    def test_generated_username_falls_back_to_email_local_part(self):
        response = self.sign_in(google_claims(given_name="", email="jo.doe+x@example.com"))
        self.assertEqual(response.json()["username"], "jo.doe+x")
        response = self.sign_in(google_claims(sub="s2", given_name="  ", email="!!!@example.org"))
        self.assertEqual(response.json()["username"], "voyager")

    def test_invalid_profile_on_sign_up_uses_register_codes(self):
        make_user(username="taken")
        cases = [
            ({**VALID_PROFILE, "practiceLanguages": []}, "practice_language_required"),
            ({**VALID_PROFILE, "practiceLanguages": ["greek"]}, "practice_language_is_native"),
            ({**VALID_PROFILE, "practiceLanguages": [42]}, "invalid_practice_language"),
            ({**VALID_PROFILE, "practiceLanguageLevels": {"spanish": "pro"}}, "invalid_practice_level"),
            ({**VALID_PROFILE, "nativeLanguage": ""}, "invalid_native_language"),
            ({**VALID_PROFILE, "username": "bad name"}, "invalid_username"),
            ({**VALID_PROFILE, "username": "TAKEN"}, "username_taken"),
        ]
        for profile, code in cases:
            with self.subTest(code=code):
                response = self.sign_in(profile=profile)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], code)
        self.assertFalse(SocialAccount.objects.exists())

    # --- sign-in and linking ---------------------------------------------------

    def test_existing_social_account_signs_in_and_ignores_profile(self):
        self.sign_in()
        user = Profile.objects.get(email="maria@example.com")
        response = self.sign_in(
            google_claims(email="maria.new@example.com"), profile=VALID_PROFILE
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["created"])
        self.assertFalse(response.json()["profile_complete"])
        self.assertEqual(Profile.objects.count(), 1)
        account = SocialAccount.objects.get(user=user)
        self.assertEqual(account.email, "maria.new@example.com")
        self.assertIsNotNone(account.last_login_at)

    def test_links_to_verified_email_account(self):
        user = make_user(email="maria@example.com", native_language="greek")
        version = user.token_version

        response = self.sign_in(profile=VALID_PROFILE)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["created"])
        self.assertTrue(response.json()["profile_complete"])
        user.refresh_from_db()
        self.assertTrue(user.check_password("pass1234"))
        self.assertEqual(user.token_version, version)
        self.assertEqual(user.native_language, "greek")
        self.assertTrue(SocialAccount.objects.filter(user=user, subject="google-sub-1").exists())

    def test_takeover_of_unverified_email_account(self):
        squatter = make_user(email="maria@example.com", email_verified_at=None)
        old_tokens = issue_token_pair(squatter)
        version = squatter.token_version

        response = self.sign_in()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["created"])
        squatter.refresh_from_db()
        self.assertFalse(squatter.has_usable_password())
        self.assertGreater(squatter.token_version, version)
        self.assertIsNotNone(squatter.email_verified_at)
        # The squatter's old session is dead, the Google session works.
        stale = APIClient()
        stale.credentials(HTTP_AUTHORIZATION=f"Bearer {old_tokens['access']}")
        self.assertEqual(stale.get("/api/profile/").status_code, 401)
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
        profile = fresh.get("/api/profile/").json()
        self.assertFalse(profile["has_password"])
        self.assertTrue(profile["email_verified"])

    # --- errors ----------------------------------------------------------------

    def test_unverified_google_email_rejected(self):
        for value in (False, None, "false"):
            with self.subTest(email_verified=value):
                response = self.sign_in(google_claims(email_verified=value))
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json()["code"], "google_email_unverified")
        self.assertFalse(Profile.objects.exists())

    def test_invalid_token_401(self):
        with mock.patch(VERIFY, side_effect=social_auth.SocialTokenError("bad")):
            response = self.client.post(GOOGLE_URL, {"credential": "x"}, format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "google_token_invalid")

    def test_missing_credential_400(self):
        response = self.client.post(GOOGLE_URL, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_request")

    @override_settings(GOOGLE_OAUTH_CLIENT_IDS=[])
    def test_not_configured_503(self):
        with mock.patch(VERIFY) as verify:
            response = self.client.post(GOOGLE_URL, {"credential": "x"}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "google_not_configured")
        verify.assert_not_called()

    def test_inactive_user_403(self):
        self.sign_in()
        with mock.patch.object(Profile, "is_active", False):
            response = self.sign_in()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "account_disabled")

    def test_no_cookies_without_remember_me_lifetime(self):
        response = self.sign_in()
        self.assertIn(settings.AUTH_COOKIE_REFRESH, response.cookies)
        lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()
        self.assertEqual(int(response.cookies[settings.AUTH_COOKIE_REFRESH]["max-age"]), int(lifetime))


@override_settings(GOOGLE_OAUTH_CLIENT_IDS=[CLIENT_ID])
class CompleteProfileAndGatingTests(TestCase):
    def setUp(self):
        cache.clear()
        with mock.patch(VERIFY, return_value=google_claims()):
            APIClient().post(GOOGLE_URL, {"credential": "t"}, format="json")
        self.newbie = Profile.objects.get(email="maria@example.com")
        self.client = APIClient()
        self.client.force_authenticate(self.newbie)
        self.other = make_user(native_language="english", languages_practicing=["greek"])
        self.other_client = APIClient()
        self.other_client.force_authenticate(self.other)

    def test_profile_payload_flags(self):
        body = self.client.get("/api/profile/").json()
        self.assertFalse(body["profile_complete"])
        self.assertFalse(body["has_password"])
        other = self.other_client.get("/api/profile/").json()
        self.assertTrue(other["profile_complete"])
        self.assertTrue(other["has_password"])

    def test_complete_profile_happy_path_then_409(self):
        # Warm the own-profile cache: completing must invalidate it.
        self.assertFalse(self.client.get("/api/profile/").json()["profile_complete"])
        response = self.client.post(
            COMPLETE_URL, {**VALID_PROFILE, "username": "maria_new"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {"username": "maria_new", "profile_complete": True})
        self.newbie.refresh_from_db()
        self.assertTrue(self.newbie.profile_completed)
        self.assertEqual(self.newbie.native_language, "Greek")
        self.assertEqual(self.newbie.languages_practicing, ["spanish", "english"])
        self.assertTrue(self.client.get("/api/profile/").json()["profile_complete"])

        again = self.client.post(COMPLETE_URL, VALID_PROFILE, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["code"], "profile_already_complete")
        self.assertEqual(
            self.other_client.post(COMPLETE_URL, VALID_PROFILE, format="json").status_code, 409
        )

    def test_complete_profile_keeps_username_when_omitted(self):
        response = self.client.post(COMPLETE_URL, VALID_PROFILE, format="json")
        self.assertEqual(response.json()["username"], "Maria")

    def test_complete_profile_validation_errors(self):
        cases = [
            ({**VALID_PROFILE, "practiceLanguages": []}, "practice_language_required"),
            ({**VALID_PROFILE, "practiceLanguages": ["GREEK"]}, "practice_language_is_native"),
            ({**VALID_PROFILE, "practiceLanguageLevels": {"spanish": 3}}, "invalid_practice_level"),
            ({**VALID_PROFILE, "username": "no spaces"}, "invalid_username"),
            ({**VALID_PROFILE, "username": self.other.username.upper()}, "username_taken"),
            ({"practiceLanguages": ["spanish"]}, "invalid_native_language"),
        ]
        for body, code in cases:
            with self.subTest(code=code):
                response = self.client.post(COMPLETE_URL, body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], code)
        self.newbie.refresh_from_db()
        self.assertFalse(self.newbie.profile_completed)

    def test_complete_profile_requires_auth(self):
        self.assertEqual(APIClient().post(COMPLETE_URL, VALID_PROFILE, format="json").status_code, 401)

    def test_incomplete_user_is_hidden(self):
        people = self.other_client.get("/api/profile/data").json()
        usernames = [card["username"] for card in people["profiles"]]
        self.assertNotIn(self.newbie.username, usernames)
        self.assertEqual(
            self.other_client.get(f"/api/profile/public/{self.newbie.username}/").status_code, 404
        )
        self.assertEqual(
            self.other_client.post(f"/api/profile/public/{self.newbie.username}/follow/").status_code,
            404,
        )
        # A follow made earlier doesn't surface them in the following list either.
        Follow.objects.create(follower=self.other, following=self.newbie)
        following = self.other_client.get("/api/profile/following/").json()["profiles"]
        self.assertEqual(following, [])
        # They can still see their own public profile.
        self.assertEqual(
            self.client.get(f"/api/profile/public/{self.newbie.username}/").status_code, 200
        )

        self.client.post(COMPLETE_URL, VALID_PROFILE, format="json")
        cache.clear()
        people = self.other_client.get("/api/profile/data").json()
        self.assertIn(self.newbie.username, [card["username"] for card in people["profiles"]])

    def test_incomplete_user_cannot_start_or_be_messaged(self):
        response = self.client.post(
            "/api/conversations/", {"participant": self.other.username}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "profile_incomplete")

        response = self.other_client.post(
            "/api/conversations/", {"participant": self.newbie.username}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "profile_incomplete")

        response = self.client.post(
            "/api/conversations/groups/", {"members": [self.other.username]}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "profile_incomplete")
        response = self.other_client.post(
            "/api/conversations/groups/", {"members": [self.newbie.username]}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "profile_incomplete")
        self.assertFalse(Conversation.objects.exists())

    def test_incomplete_user_cannot_send_messages(self):
        from .factory import make_conversation

        conversation = make_conversation(self.newbie, self.other)
        response = self.client.post(
            f"/api/conversations/{conversation.id}/messages/", {"text": "hi"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "profile_incomplete")
        # Reading stays open.
        self.assertEqual(
            self.client.get(f"/api/conversations/{conversation.id}/messages/").status_code, 200
        )

    def test_delete_account_with_confirm_for_passwordless_user(self):
        response = self.client.delete("/api/profile/delete/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "confirmation_required")
        response = self.client.delete(
            "/api/profile/delete/", {"current_password": "anything"}, format="json"
        )
        self.assertEqual(response.json()["code"], "confirmation_required")

        response = self.client.delete("/api/profile/delete/", {"confirm": "DELETE"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Profile.objects.filter(pk=self.newbie.pk).exists())
        self.assertFalse(SocialAccount.objects.exists())

    def test_delete_account_still_needs_password_when_set(self):
        response = self.other_client.delete(
            "/api/profile/delete/", {"confirm": "DELETE"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "password_required")
        self.assertTrue(Profile.objects.filter(pk=self.other.pk).exists())


@override_settings(GOOGLE_OAUTH_CLIENT_IDS=[CLIENT_ID, "ios-client"])
class VerifyGoogleIdTokenTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def token(self, **overrides):
        now = int(time.time())
        claims = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "1234",
            "email": "a@example.com",
            "email_verified": True,
            "iat": now,
            "exp": now + 3600,
        }
        claims.update(overrides)
        return jwt.encode(claims, self.private_key, algorithm="RS256", headers={"kid": "k1"})

    def verify(self, token):
        signing_key = SimpleNamespace(key=self.private_key.public_key())
        with mock.patch.object(
            jwt.PyJWKClient, "get_signing_key_from_jwt", return_value=signing_key
        ):
            return social_auth.verify_google_id_token(token)

    def test_valid_token_returns_claims(self):
        claims = self.verify(self.token(aud="ios-client", iss="accounts.google.com"))
        self.assertEqual(claims["sub"], "1234")
        self.assertTrue(claims["email_verified"])
        self.assertIn("given_name", claims)

    def test_rejects_wrong_audience_issuer_expiry_and_key(self):
        bad_tokens = {
            "audience": self.token(aud="someone-elses-app"),
            "issuer": self.token(iss="https://evil.example.com"),
            "expired": self.token(exp=int(time.time()) - 3600, iat=int(time.time()) - 7200),
            "missing sub": self.token(sub=None),
        }
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        bad_tokens["other key"] = jwt.encode(
            {"iss": "accounts.google.com", "aud": CLIENT_ID, "sub": "1",
             "iat": int(time.time()), "exp": int(time.time()) + 60},
            other_key, algorithm="RS256",
        )
        for name, token in bad_tokens.items():
            with self.subTest(name):
                with self.assertRaises(social_auth.SocialTokenError):
                    self.verify(token)

    def test_key_fetch_failure_is_a_token_error(self):
        with mock.patch.object(
            jwt.PyJWKClient,
            "get_signing_key_from_jwt",
            side_effect=jwt.PyJWKClientConnectionError("down"),
        ):
            with self.assertRaises(social_auth.SocialTokenError):
                social_auth.verify_google_id_token(self.token())

    @override_settings(GOOGLE_OAUTH_CLIENT_IDS=[])
    def test_unconfigured_rejects(self):
        with self.assertRaises(social_auth.SocialTokenError):
            social_auth.verify_google_id_token(self.token())
