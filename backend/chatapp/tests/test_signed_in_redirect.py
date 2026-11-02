from unittest.mock import patch

from django.conf import settings
from django.http import HttpResponse
from django.test import TestCase

from chatapp.tokens import blacklist_refresh_token, issue_token_pair, revoke_user_tokens

from .factory import make_user


class SignedInRedirectTests(TestCase):
    """Signed-in users opening /, /login or /register go straight to /profile
    instead of seeing the login form until the SPA has checked the session."""

    def setUp(self):
        self.user = make_user()
        self.refresh = issue_token_pair(self.user)["refresh"]
        render_patch = patch("core.views.render", return_value=HttpResponse("page"))
        self.render = render_patch.start()
        self.addCleanup(render_patch.stop)

    def get(self, path, refresh=None):
        if refresh:
            self.client.cookies[settings.AUTH_COOKIE_REFRESH] = refresh
        return self.client.get(path)

    def test_entry_pages_redirect_with_a_valid_session(self):
        for path in ("/", "/login", "/login/", "/register"):
            with self.subTest(path=path):
                response = self.get(path, self.refresh)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response["Location"], "/profile")
                self.assertIn("no-cache", response["Cache-Control"])

    def test_no_cookie_shows_the_page(self):
        response = self.get("/login")
        self.assertEqual(response.status_code, 200)

    def test_invalid_token_shows_the_page(self):
        response = self.get("/login", "not-a-token")
        self.assertEqual(response.status_code, 200)

    def test_logged_out_token_shows_the_page(self):
        blacklist_refresh_token(self.refresh)
        response = self.get("/login", self.refresh)
        self.assertEqual(response.status_code, 200)

    def test_revoked_session_shows_the_page(self):
        revoke_user_tokens(self.user, broadcast=False)
        response = self.get("/login", self.refresh)
        self.assertEqual(response.status_code, 200)

    def test_other_pages_are_not_redirected(self):
        for path in ("/forgot-password", "/privacy-policy", "/reset-password/MQ/abc"):
            with self.subTest(path=path):
                self.assertEqual(self.get(path, self.refresh).status_code, 200)

    def test_a_database_error_never_breaks_the_page(self):
        with patch("chatapp.tokens._active_user_for", side_effect=RuntimeError("db down")):
            response = self.get("/login", self.refresh)
        self.assertEqual(response.status_code, 200)
