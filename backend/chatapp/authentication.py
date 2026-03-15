from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieOrHeaderJWTAuthentication(JWTAuthentication):
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
        except InvalidToken:
            return None

        return self.get_user(validated_token), validated_token
