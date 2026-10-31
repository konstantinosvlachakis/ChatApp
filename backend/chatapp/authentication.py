from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from .tokens import token_version_of


class CookieOrHeaderJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        # The user row is loaded anyway, so the revocation check is free: a
        # token minted before the last token_version bump (password reset,
        # email change, "log out of all devices") is rejected.
        user = super().get_user(validated_token)
        if token_version_of(validated_token) != int(getattr(user, "token_version", 0) or 0):
            raise InvalidToken("Token has been revoked")
        return user

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                token_value = raw_token.decode("utf-8", errors="ignore").strip()
                if token_value and token_value.lower() not in {"null", "undefined"}:
                    validated_token = self.get_validated_token(raw_token)
                    return self.get_user(validated_token), validated_token

        cookie_token = request.COOKIES.get(getattr(settings, "AUTH_COOKIE_ACCESS", "lv_access"))
        if not cookie_token:
            return None

        try:
            validated_token = self.get_validated_token(cookie_token)
            user = self.get_user(validated_token)
        except InvalidToken:
            # Expired or revoked cookie: anonymous (protected views answer 401,
            # which makes the web client refresh or log out).
            return None

        # Cookies are sent automatically by the browser, so cookie-authenticated
        # requests need the same CSRF protection as session auth. Bearer-header
        # clients (mobile) are not affected.
        if getattr(settings, "AUTH_COOKIE_ENFORCE_CSRF", True):
            self.enforce_csrf(request)
        return user, validated_token

    def enforce_csrf(self, request):
        def dummy_get_response(request):  # pragma: no cover
            return None

        check = CSRFCheck(dummy_get_response)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")
