from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from django.core.cache import cache
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from core.exceptions import error_response

from .models import Profile
from .throttles import (
    AuthRateThrottle,
    LogoutAllRateThrottle,
    PasswordResetEmailThrottle,
    PasswordResetIPThrottle,
    with_default_throttles,
)
from .tokens import (
    LoginSerializer,
    RotatingTokenRefreshSerializer,
    blacklist_refresh_token,
    refresh_lifetime,
    revoke_user_tokens,
)
from .views import release_db_connection

import hashlib
import logging
import os
import threading

logger = logging.getLogger(__name__)

# Per-account login lockout (on top of the per-IP "auth" throttle): after this
# many failed logins for one email within the window, further attempts for that
# email get 429 from any IP until the window expires; a success resets it.
LOGIN_MAX_FAILURES_PER_EMAIL = int(os.environ.get("LOGIN_MAX_FAILURES_PER_EMAIL", "10"))
LOGIN_FAILURE_WINDOW_SECONDS = int(os.environ.get("LOGIN_FAILURE_WINDOW_SECONDS", "3600"))
LOGIN_LOCKED_MESSAGE = (
    "Too many failed sign-in attempts for this account. "
    "Try again later or reset your password."
)


def login_failure_cache_key(email):
    # Hash of the normalised email: the raw address never goes into the cache.
    digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
    return f"auth:login_failures:v1:{digest}"


def login_is_locked(email):
    if LOGIN_MAX_FAILURES_PER_EMAIL <= 0 or not email:
        return False
    try:
        failures = cache.get(login_failure_cache_key(email)) or 0
    except Exception:
        return False
    return int(failures) >= LOGIN_MAX_FAILURES_PER_EMAIL


def record_login_failure(email):
    if LOGIN_MAX_FAILURES_PER_EMAIL <= 0 or not email:
        return
    key = login_failure_cache_key(email)
    try:
        # add + incr is atomic; the window starts at the first failure.
        cache.add(key, 0, timeout=LOGIN_FAILURE_WINDOW_SECONDS)
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=LOGIN_FAILURE_WINDOW_SECONDS)
    except Exception:
        logger.warning("Could not record a login failure")


def clear_login_failures(email):
    try:
        cache.delete(login_failure_cache_key(email))
    except Exception:
        pass


def _get_cookie_max_age(delta):
    return int(delta.total_seconds())


def _set_auth_cookies(response, access_token, refresh_token, remember_me=False):
    access_lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]

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
        max_age=_get_cookie_max_age(refresh_lifetime(remember_me)),
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
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        data = request.data
        remember_me = str(data.get("remember_me", "")).lower() in ("1", "true", "yes", "on")
        serializer_data = {
            "email": str(data.get("email") or "").strip().lower(),
            "password": data.get("password"),
        }
        logger.info("Login attempt")

        email = serializer_data["email"]
        if login_is_locked(email):
            # Checked before the password so a locked account is no oracle. The
            # same answer for unknown emails (the counter is per email string).
            retry_after = LOGIN_FAILURE_WINDOW_SECONDS
            # "message" is the legacy copy of "error" all token errors carry.
            response = Response(
                {
                    "error": LOGIN_LOCKED_MESSAGE,
                    "code": "throttled",
                    "retry_after": retry_after,
                    "message": LOGIN_LOCKED_MESSAGE,
                },
                status=429,
            )
            response["Retry-After"] = str(retry_after)
            return response

        # Unknown emails still run the password hasher: Django's ModelBackend
        # hashes the password when the user doesn't exist, so the timing of a
        # failed login doesn't reveal whether the account exists.
        serializer = LoginSerializer(
            data=serializer_data, context={"remember_me": remember_me}
        )

        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            # "message" duplicates "error" for clients built before the envelope
            # (older mobile builds); drop it after one release.
            message = "Email and password are required."
            return Response(
                {"error": message, "code": "invalid_request", "message": message},
                status=400,
            )
        except AuthenticationFailed:
            record_login_failure(email)
            message = "No active account found with the given credentials"
            return Response(
                {"error": message, "code": "no_active_account", "message": message},
                status=401,
            )

        clear_login_failures(email)
        # The refresh token carries the remember_me claim (30 days instead of
        # 7) and keeps it across rotations.
        access_token = serializer.validated_data["access"]
        refresh_token = serializer.validated_data["refresh"]

        response = Response({"access": str(access_token), "refresh": str(refresh_token)})
        _set_auth_cookies(response, access_token, refresh_token, remember_me=remember_me)
        return response


# Custom JWT Token Refresh View
class CustomRefreshJWTToken(TokenRefreshView):
    """Rotates: every refresh returns a new {access, refresh} pair and
    blacklists the used refresh token (chatapp/tokens.py). Web sends an empty
    body and gets both cookies reset (remember-me lifetime kept); mobile sends
    {refresh} and must store the returned refresh token."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]
    serializer_class = RotatingTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        request_data = request.data.copy() if hasattr(request.data, "copy") else {}
        if not request_data.get("refresh"):
            cookie_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
            if cookie_refresh:
                request_data["refresh"] = cookie_refresh
        request._full_data = request_data

        serializer = self.get_serializer(data=request_data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as error:
            raise InvalidToken(error.args[0]) from error

        response = Response(serializer.validated_data, status=200)
        _set_auth_cookies(
            response,
            serializer.validated_data["access"],
            serializer.validated_data["refresh"],
            remember_me=getattr(serializer, "remember_me", False),
        )
        return response


def _refresh_token_from_request(request):
    data = request.data if isinstance(request.data, dict) else {}
    body_token = data.get("refresh")
    if isinstance(body_token, str) and body_token.strip():
        return body_token.strip()
    return request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)


@api_view(("POST",))
@authentication_classes([])
@permission_classes([AllowAny])
def logout_view(request):
    """Blacklists the refresh token (body {refresh} from mobile, else the
    lv_refresh cookie) and clears the cookies. Idempotent: a missing, invalid,
    expired or already-blacklisted token still answers 200."""
    try:
        blacklist_refresh_token(_refresh_token_from_request(request))
    except Exception:
        logger.warning("Logout could not read the request")
    response = Response({"detail": "Logged out."})
    _clear_auth_cookies(response)
    return response


@api_view(("POST",))
@throttle_classes(with_default_throttles(LogoutAllRateThrottle))
def logout_all_view(request):
    """Log out of every device: bump token_version (all access and refresh
    tokens die), blacklist outstanding refresh tokens, close the user's sockets
    (4401) and clear this browser's cookies."""
    revoke_user_tokens(request.user, deactivate_push=True)
    logger.info("Logged out of all devices: user_id=%s", request.user.pk)
    response = Response({"message": "You have been logged out on all devices."})
    _clear_auth_cookies(response)
    return response


# --- Password reset -------------------------------------------------------

PASSWORD_RESET_REQUEST_MESSAGE = (
    "If an account exists for that email, we've sent a link to reset your password."
)
INVALID_RESET_LINK_MESSAGE = (
    "This password reset link is invalid or has expired. Please request a new one."
)


def _password_reset_link(user):
    base = settings.PASSWORD_RESET_URL_BASE or str(getattr(settings, "BASE_URL", "")).rstrip("/")
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{base}/reset-password/{uid}/{token}"


def _send_password_reset_email(user):
    link = _password_reset_link(user)
    minutes = max(1, int(settings.PASSWORD_RESET_TIMEOUT // 60))
    name = user.username or "there"
    subject = "Reset your LangVoyage password"
    text_body = (
        f"Hi {name},\n\n"
        "We received a request to reset the password for your LangVoyage account.\n"
        f"Open this link to choose a new password (it expires in {minutes} minutes):\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email; your password stays the same.\n\n"
        "The LangVoyage team\n"
    )
    safe_link = escape(link)
    html_body = (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a37;line-height:1.5;'
        'max-width:520px;margin:0 auto;padding:24px;background:#fffaf3;border-radius:16px">'
        f"<p>Hi {escape(name)},</p>"
        "<p>We received a request to reset the password for your LangVoyage account.</p>"
        f'<p style="margin:24px 0"><a href="{safe_link}" style="background:#16324f;color:#ffffff;'
        'padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">'
        "Choose a new password</a></p>"
        f"<p>This link expires in {minutes} minutes. If the button doesn't work, copy this link "
        f'into your browser:<br><a href="{safe_link}">{safe_link}</a></p>'
        "<p>If you didn't ask for this, you can ignore this email; your password stays the same.</p>"
        "<p>The LangVoyage team</p></div>"
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


@api_view(("POST",))
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetIPThrottle, PasswordResetEmailThrottle])
def password_reset_request_view(request):
    """Email a reset link if an active account has this address.

    Always answers 200 with the same message so the endpoint can't be used to
    find out which emails have accounts.
    """
    data = request.data if isinstance(request.data, dict) else {}
    email = str(data.get("email") or "").strip().lower()
    response = Response({"message": PASSWORD_RESET_REQUEST_MESSAGE})
    if not email or len(email) > 255:
        return response

    user = (
        Profile.objects.filter(email__iexact=email)
        .only("id", "email", "username", "password", "last_login")
        .first()
    )
    if user is None or not getattr(user, "is_active", True) or not user.email:
        return response

    # The SMTP round trip can take seconds; don't hold a pooled DB connection.
    release_db_connection()

    def send():
        try:
            _send_password_reset_email(user)
        except Exception:
            # Never log the address; the user id is enough to investigate.
            logger.exception("Password reset email failed for user_id=%s", user.pk)

    if getattr(settings, "PASSWORD_RESET_EMAIL_ASYNC", True):
        # Off the request so the response time doesn't reveal whether the account exists.
        threading.Thread(target=send, name="password-reset-email", daemon=True).start()
    else:
        send()
    return response


@api_view(("POST",))
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def password_reset_confirm_view(request):
    data = request.data if isinstance(request.data, dict) else {}
    uidb64 = str(data.get("uid") or "").strip()
    token = str(data.get("token") or "").strip()
    new_password = data.get("new_password")

    user = None
    if uidb64 and token:
        try:
            user_id = int(force_str(urlsafe_base64_decode(uidb64)))
            user = Profile.objects.filter(pk=user_id).first()
        except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
            user = None
    if (
        user is None
        or not getattr(user, "is_active", True)
        or not default_token_generator.check_token(user, token)
    ):
        return error_response(INVALID_RESET_LINK_MESSAGE, "invalid_reset_link", 400)

    if not isinstance(new_password, str) or not new_password:
        return error_response("Enter a new password.", "invalid_password", 400)
    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as error:
        messages = list(error.messages)
        return error_response(" ".join(messages), "invalid_password", 400, details=messages)

    user.set_password(new_password)
    user.save(update_fields=["password"])
    # The new password hash invalidates this and every other reset link, and
    # the token_version bump signs out every device (access + refresh tokens).
    revoke_user_tokens(user, deactivate_push=True)
    # A reset proves control of the inbox: lift any login lockout for it.
    clear_login_failures(str(user.email or "").strip().lower())
    logger.info("Password reset completed for user_id=%s", user.pk)

    response = Response({"message": "Your password has been reset. You can now log in."})
    _clear_auth_cookies(response)
    return response
