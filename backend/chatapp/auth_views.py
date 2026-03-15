from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.exceptions import AuthenticationFailed
from datetime import timedelta

import logging

logger = logging.getLogger(__name__)


def _get_cookie_max_age(delta):
    return int(delta.total_seconds())


def _set_auth_cookies(response, access_token, refresh_token, remember_me=False):
    access_lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]
    refresh_lifetime = timedelta(days=30) if remember_me else settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]

    cookie_kwargs = {
        "httponly": True,
        "secure": settings.CSRF_COOKIE_SECURE,
        "samesite": settings.SESSION_COOKIE_SAMESITE,
        "path": "/",
    }

    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        str(access_token),
        max_age=_get_cookie_max_age(access_lifetime),
        **cookie_kwargs,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH,
        str(refresh_token),
        max_age=_get_cookie_max_age(refresh_lifetime),
        **cookie_kwargs,
    )


def _clear_auth_cookies(response):
    response.delete_cookie(
        settings.AUTH_COOKIE_ACCESS,
        path="/",
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH,
        path="/",
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )


# Custom JWT Token Obtain Pair View
class CustomObtainJWTToken(TokenObtainPairView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        data = request.data
        data["email"] = data["email"].lower()  # Assuming you are using email
        remember_me = str(data.get("remember_me", "")).lower() in ("1", "true", "yes", "on")
        serializer_data = {
            "email": data.get("email"),
            "password": data.get("password"),
        }
        logger.info("Login attempt")

        serializer = TokenObtainPairSerializer(data=serializer_data)

        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            return Response(
                {
                    "message": "No active account found with the given credentials",
                    "code": "no_active_account",
                },
                status=401,
            )

        access_token = serializer.validated_data["access"]
        refresh_token = serializer.validated_data["refresh"]

        # For remembered sessions, extend refresh token lifetime.
        if remember_me:
            refresh_token_obj = RefreshToken(refresh_token)
            refresh_token_obj.set_exp(lifetime=timedelta(days=30))
            refresh_token = str(refresh_token_obj)
            access_token = str(refresh_token_obj.access_token)

        response = Response({"access": str(access_token), "refresh": str(refresh_token)})
        _set_auth_cookies(response, access_token, refresh_token, remember_me=remember_me)
        return response


# Custom JWT Token Refresh View
class CustomRefreshJWTToken(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        request_data = request.data.copy()
        if not request_data.get("refresh"):
            cookie_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
            if cookie_refresh:
                request_data["refresh"] = cookie_refresh
        request._full_data = request_data

        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            access_token = response.data.get("access")
            refresh_token = response.data.get("refresh") or request_data.get("refresh")
            if access_token and refresh_token:
                _set_auth_cookies(response, access_token, refresh_token)
        return response


@api_view(("POST",))
@permission_classes([AllowAny])
def logout_view(_request):
    response = Response({"detail": "Logged out."})
    _clear_auth_cookies(response)
    return response
