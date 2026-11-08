from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated
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
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from core.exceptions import error_response

from . import social_auth
from .models import Profile, SocialAccount
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
    issue_token_pair,
    refresh_lifetime,
    revoke_user_tokens,
)
from .views import (
    USERNAME_PATTERN,
    ProfileFieldError,
    bump_profile_cache_version,
    clean_new_username,
    clean_profile_languages,
    release_db_connection,
)

import hashlib
import logging
import os
import re
import secrets
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


def _parse_remember_me(data):
    return str(data.get("remember_me", "")).lower() in ("1", "true", "yes", "on")


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
    # Not a credential: lets the web app skip the profile check when logged out.
    response.set_cookie(
        settings.AUTH_COOKIE_HINT,
        "1",
        max_age=_get_cookie_max_age(refresh_lifetime(remember_me)),
        **{**cookie_kwargs, "httponly": False},
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
    response.delete_cookie(
        settings.AUTH_COOKIE_HINT,
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
        remember_me = _parse_remember_me(data)
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
    # Own profile payload carries has_password (Google-only accounts set one here).
    bump_profile_cache_version(user.pk)
    # A reset proves control of the inbox: lift any login lockout for it.
    clear_login_failures(str(user.email or "").strip().lower())
    logger.info("Password reset completed for user_id=%s", user.pk)

    response = Response({"message": "Your password has been reset. You can now log in."})
    _clear_auth_cookies(response)
    return response


# --- Sign in with Google ----------------------------------------------------

GOOGLE_TOKEN_INVALID_MESSAGE = "We couldn't verify your Google sign-in. Please try again."
GOOGLE_EMAIL_UNVERIFIED_MESSAGE = (
    "Your Google account's email address isn't verified, so it can't be used to sign in."
)
ACCOUNT_DISABLED_MESSAGE = "This account has been disabled."
GENERATED_USERNAME_FALLBACK = "voyager"
USERNAME_MAX_LENGTH = 30


def _generated_username_base(claims):
    raw = str(claims.get("given_name") or "").strip()
    if not raw:
        raw = str(claims.get("email") or "").split("@")[0]
    # USERNAME_PATTERN's alphabet minus "@" (no address-looking names).
    base = re.sub(r"[^\w.+-]+", "", raw)[:USERNAME_MAX_LENGTH]
    if not base or not USERNAME_PATTERN.fullmatch(base):
        base = GENERATED_USERNAME_FALLBACK
    return base


def generate_unique_username(claims):
    """A free username from the Google first name (or the email's local part):
    the base itself, else base + the lowest free number, within 30 characters.
    One query."""
    base = _generated_username_base(claims)
    stem = base[: USERNAME_MAX_LENGTH - 4]
    taken = {
        name.lower()
        for name in Profile.objects.filter(username__istartswith=stem).values_list(
            "username", flat=True
        )
    }
    if base.lower() not in taken:
        return base
    for number in range(2, 10000):
        candidate = f"{stem}{number}"
        if candidate.lower() not in taken:
            return candidate
    return f"{base[: USERNAME_MAX_LENGTH - 8]}{secrets.token_hex(4)}"


def _clean_signup_profile(raw_profile):
    """Validated profile fields for a new social account, or None when no
    profile was sent. Same rules and error codes as register. Raises
    ProfileFieldError."""
    if raw_profile is None:
        return None
    if not isinstance(raw_profile, dict):
        raise ProfileFieldError("profile must be an object.", "invalid_request")
    native_language, practice_languages, levels = clean_profile_languages(
        raw_profile.get("nativeLanguage"),
        raw_profile.get("practiceLanguages"),
        raw_profile.get("practiceLanguageLevels", {}),
    )
    username = raw_profile.get("username")
    if username is not None and str(username).strip():
        username = clean_new_username(username)
    else:
        username = None
    return {
        "native_language": native_language,
        "languages_practicing": practice_languages,
        "practice_language_levels": levels,
        "username": username,
    }


def _create_google_user(claims, email, profile_fields, now):
    username = (profile_fields or {}).get("username") or generate_unique_username(claims)
    extra = {
        "email": email,
        "email_verified_at": now,
        "date_joined": now,
        "native_language": "",
        "languages_practicing": [],
        "practice_language_levels": {},
        "profile_completed": False,
    }
    if profile_fields:
        extra.update(
            native_language=profile_fields["native_language"],
            languages_practicing=profile_fields["languages_practicing"],
            practice_language_levels=profile_fields["practice_language_levels"],
            profile_completed=True,
        )
    # password=None → unusable password: sign-in only through Google until the
    # user sets one with "Forgot password".
    user = Profile.objects.create_user(username=username, password=None, **extra)
    SocialAccount.objects.create(
        user=user,
        provider=SocialAccount.PROVIDER_GOOGLE,
        subject=claims["sub"],
        email=email,
        last_login_at=now,
    )
    return user


def _link_google_account(user, claims, email, now):
    """Attach a Google identity to the existing account with the same email.

    Account-takeover rule: if that account never verified its email, whoever
    registered it may not own the address, so its password and every session
    are dropped and the Google owner (who proved the address) gets the account.
    """
    if user.email_verified_at is None:
        user.set_unusable_password()
        user.email_verified_at = now
        user.save(update_fields=["password", "email_verified_at"])
        revoke_user_tokens(user, deactivate_push=True)
        logger.info("Google sign-in took over an unverified account: user_id=%s", user.pk)
    SocialAccount.objects.create(
        user=user,
        provider=SocialAccount.PROVIDER_GOOGLE,
        subject=claims["sub"],
        email=email,
        last_login_at=now,
    )


def _google_account_for(subject):
    return (
        SocialAccount.objects.select_related("user")
        .filter(provider=SocialAccount.PROVIDER_GOOGLE, subject=subject)
        .first()
    )


@api_view(("POST",))
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def google_auth_view(request):
    """POST {credential, remember_me?, profile?, intent?} → sign in or sign up with a
    Google ID token. ``intent: "login"`` (the log-in page) never creates an account:
    an unknown Google account gets 404 ``account_not_found`` with its ``email``. Same tokens and cookies as password login, plus
    {created, profile_complete, username}. See system-map flows (Google)."""
    data = request.data if isinstance(request.data, dict) else {}
    credential = data.get("credential")
    if not isinstance(credential, str) or not credential.strip():
        return error_response("Missing Google credential.", "invalid_request", 400)
    if not getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", None):
        return error_response(
            "Google sign-in isn't available right now.", "google_not_configured", 503
        )
    remember_me = _parse_remember_me(data)

    # Verify (may fetch Google's keys) before any DB work.
    try:
        claims = social_auth.verify_google_id_token(credential)
    except social_auth.SocialTokenError:
        return error_response(GOOGLE_TOKEN_INVALID_MESSAGE, "google_token_invalid", 401)
    email = str(claims.get("email") or "").strip().lower()
    if claims.get("email_verified") not in (True, "true") or not email:
        return error_response(GOOGLE_EMAIL_UNVERIFIED_MESSAGE, "google_email_unverified", 401)

    now = timezone.now()
    created = False
    account = _google_account_for(claims["sub"])
    if account is not None:
        user = account.user
        if not getattr(user, "is_active", True):
            return error_response(ACCOUNT_DISABLED_MESSAGE, "account_disabled", 403)
        SocialAccount.objects.filter(pk=account.pk).update(last_login_at=now, email=email)
    else:
        user = Profile.objects.filter(email__iexact=email).order_by("id").first()
        profile_fields = None
        if user is None and data.get("intent") == "login":
            # Their own address (from their own Google token): the client offers sign-up.
            return error_response(
                "There's no LangVoyage account for this Google account yet.",
                "account_not_found",
                404,
                email=email,
            )
        if user is None:
            try:
                profile_fields = _clean_signup_profile(data.get("profile"))
            except ProfileFieldError as error:
                return error_response(error.message, error.code, 400)
        elif not getattr(user, "is_active", True):
            return error_response(ACCOUNT_DISABLED_MESSAGE, "account_disabled", 403)
        try:
            with transaction.atomic():
                if user is not None:
                    _link_google_account(user, claims, email, now)
                else:
                    user = _create_google_user(claims, email, profile_fields, now)
                    created = True
        except IntegrityError:
            # A concurrent request linked or created this Google identity (or
            # took the username) first: sign in to whatever won, once.
            created = False
            account = _google_account_for(claims["sub"])
            if account is None:
                logger.warning("Google sign-in hit a conflict and found no linked account")
                return error_response(
                    "Sign-in conflicted with another request. Please try again.", "conflict", 409
                )
            user = account.user
            if not getattr(user, "is_active", True):
                return error_response(ACCOUNT_DISABLED_MESSAGE, "account_disabled", 403)
        # email_verified / has_password may have changed (own profile cache).
        bump_profile_cache_version(user.pk)

    Profile.objects.filter(pk=user.pk).update(last_login=now)
    tokens = issue_token_pair(user, remember_me=remember_me)
    logger.info("Google sign-in: user_id=%s created=%s", user.pk, created)

    response = Response(
        {
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "created": created,
            "profile_complete": bool(user.profile_completed),
            "username": user.username,
        }
    )
    _set_auth_cookies(response, tokens["access"], tokens["refresh"], remember_me=remember_me)
    return response


@api_view(("POST",))
@permission_classes([IsAuthenticated])
def complete_profile_view(request):
    """POST {nativeLanguage, practiceLanguages, practiceLanguageLevels, username?}
    → finish a social sign-up. Only while profile_completed is False (409 after)."""
    user = request.user
    if user.profile_completed:
        return error_response("Your profile is already complete.", "profile_already_complete", 409)
    data = request.data if isinstance(request.data, dict) else {}
    try:
        native_language, practice_languages, levels = clean_profile_languages(
            data.get("nativeLanguage"),
            data.get("practiceLanguages"),
            data.get("practiceLanguageLevels", {}),
        )
        username = data.get("username")
        if username is not None and str(username).strip():
            username = clean_new_username(username, exclude_user_id=user.pk)
        else:
            username = None
    except ProfileFieldError as error:
        return error_response(error.message, error.code, 400)

    user.native_language = native_language
    user.languages_practicing = practice_languages
    user.practice_language_levels = levels
    user.profile_completed = True
    update_fields = [
        "native_language",
        "languages_practicing",
        "practice_language_levels",
        "profile_completed",
    ]
    if username:
        user.username = username
        update_fields.append("username")
    try:
        with transaction.atomic():
            user.save(update_fields=update_fields)
    except IntegrityError:
        return error_response("Username already exists", "username_taken", 400)
    # People lists pick the profile up within their 30 s TTL (as after register).
    bump_profile_cache_version(user.pk)
    return Response({"username": user.username, "profile_complete": True})
