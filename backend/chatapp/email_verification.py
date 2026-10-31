"""Email verification: 6-digit codes (web + mobile) and a signed link.

New accounts start with ``Profile.email_verified_at = None``. Until they verify,
``RequireVerifiedEmail`` blocks messaging people (conversation create, message
send, reactions), the coach, and the chat socket's typing/call frames.

* ``issue_verification_code(user)`` stores an HMAC of a fresh code bound to the
  current address (one row per user, replaced on every send) and returns the
  plain code for the email. Stored in the database so it survives Redis outages.
* ``send_verification_email(user)`` = issue + mail (background thread unless
  ``EMAIL_VERIFICATION_EMAIL_ASYNC`` is false; failures are logged by user id
  and never raised). Called on register, on email change and by the send view.
* ``confirm_verification_code(user, code)`` checks attempts, expiry and the code
  (constant-time) and marks the user verified.
"""

import hashlib
import logging
import math
import secrets
import threading
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.utils.html import escape
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import SAFE_METHODS, AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response

from core.exceptions import error_response
from core.realtime import broadcast

from .models import EmailVerificationCode, Profile
from .tokens import user_session_group_name
from .throttles import (
    EMAIL_VERIFY_SEND_THROTTLES,
    AuthRateThrottle,
    EmailVerifyConfirmRateThrottle,
    with_default_throttles,
)

logger = logging.getLogger(__name__)

CODE_HMAC_SALT = "chatapp.email_verification.code"
LINK_SIGNING_SALT = "chatapp.email_verification.link"
EMAIL_UNVERIFIED_CODE = "email_unverified"
EMAIL_UNVERIFIED_MESSAGE = "Verify your email to message people and chat with Lumi."


def _code_ttl_seconds():
    return int(getattr(settings, "EMAIL_VERIFICATION_CODE_TTL_SECONDS", 15 * 60))


def _max_attempts():
    return int(getattr(settings, "EMAIL_VERIFICATION_MAX_ATTEMPTS", 5))


def _normalize_email(email):
    return str(email or "").strip().lower()


def _code_hash(user_id, email, code):
    return salted_hmac(
        CODE_HMAC_SALT, f"{user_id}:{_normalize_email(email)}:{code}", algorithm="sha256"
    ).hexdigest()


def _email_fingerprint(email):
    return hashlib.sha256(_normalize_email(email).encode("utf-8")).hexdigest()[:24]


# --- Permission -----------------------------------------------------------


class RequireVerifiedEmail(BasePermission):
    """403 ``email_unverified`` for unverified users on unsafe methods (reads
    like a conversation's message history stay open)."""

    message = EMAIL_UNVERIFIED_MESSAGE
    code = EMAIL_UNVERIFIED_CODE

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return True  # IsAuthenticated answers 401 first.
        return getattr(user, "email_verified_at", None) is not None


# --- Codes ------------------------------------------------------------------


@transaction.atomic
def issue_verification_code(user):
    # Serialize code replacement, guesses and per-user mail budgets in the DB.
    # Redis is only an additional per-IP/user throttle, never the sole limit.
    current = Profile.objects.select_for_update().get(pk=user.pk)
    if _normalize_email(current.email) != _normalize_email(user.email):
        raise VerificationError("Your email changed. Refresh your profile and try again.", "code_expired")
    record = EmailVerificationCode.objects.filter(user=user).first()
    now = timezone.now()
    timestamp = now.timestamp()
    history = [value for value in (record.send_history if record else []) if value > timestamp - 86400]
    for limit, window in ((3, 600), (10, 86400)):
        recent = [value for value in history if value > timestamp - window]
        if len(recent) >= limit:
            raise VerificationError("Too many codes requested. Please wait before trying again.",
                                    "throttled", retry_after=max(1, math.ceil(recent[-limit] + window - timestamp)))
    code = f"{secrets.randbelow(10 ** 6):06d}"
    email = _normalize_email(user.email)
    EmailVerificationCode.objects.update_or_create(
        user=user,
        defaults={
            "email": email,
            "code_hash": _code_hash(user.pk, email, code),
            "send_history": history + [timestamp],
            "expires_at": timezone.now() + timedelta(seconds=_code_ttl_seconds()),
            "attempts": 0,
            "created_at": timezone.now(),
        },
    )
    return code


def make_verification_link_token(user):
    return signing.dumps(
        {"u": user.pk, "e": _email_fingerprint(user.email), "v": user.token_version},
        salt=LINK_SIGNING_SALT,
        compress=True,
    )


def verification_link(user):
    base = settings.PASSWORD_RESET_URL_BASE or str(getattr(settings, "BASE_URL", "")).rstrip("/")
    return f"{base}/verify-email?token={make_verification_link_token(user)}"


def _deliver_verification_email(user_id, username, email, code, link):
    minutes = max(1, _code_ttl_seconds() // 60)
    name = username or "there"
    subject = f"Your LangVoyage code is {code}"
    text_body = (
        f"Hi {name},\n\n"
        f"Your LangVoyage verification code is {code}\n\n"
        f"Enter it in the app to confirm your email. It expires in {minutes} minutes.\n"
        f"Or open this link to verify (valid for 24 hours):\n\n{link}\n\n"
        "If you didn't sign up for LangVoyage or change your email, you can ignore this email.\n\n"
        "The LangVoyage team\n"
    )
    safe_link = escape(link)
    html_body = (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a37;line-height:1.5;'
        'max-width:520px;margin:0 auto;padding:24px;background:#fffaf3;border-radius:16px">'
        f"<p>Hi {escape(name)},</p>"
        "<p>Your LangVoyage verification code is</p>"
        '<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0;'
        f'color:#16324f">{escape(code)}</p>'
        f"<p>Enter it in the app to confirm your email. It expires in {minutes} minutes.</p>"
        f'<p style="margin:24px 0"><a href="{safe_link}" style="background:#16324f;color:#ffffff;'
        'padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">'
        "Verify my email</a></p>"
        "<p>If you didn't sign up for LangVoyage or change your email, you can ignore this email.</p>"
        "<p>The LangVoyage team</p></div>"
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    message.attach_alternative(html_body, "text/html")
    try:
        message.send(fail_silently=False)
    except Exception:
        # Never log the address; the user id is enough to investigate.
        logger.error("Verification email failed for user_id=%s", user_id)
        return False
    return True


def send_verification_email(user, *, raise_errors=False):
    """Issue a new code and mail it to the user's current address. Never
    raises: registration and email changes must not fail on SMTP problems."""
    if not user.email:
        return False
    try:
        code = issue_verification_code(user)
        link = verification_link(user)
    except VerificationError:
        if raise_errors:
            raise
        return False
    except Exception:
        logger.exception("Could not issue a verification code for user_id=%s", user.pk)
        return False
    args = (user.pk, user.username, _normalize_email(user.email), code, link)
    if getattr(settings, "EMAIL_VERIFICATION_EMAIL_ASYNC", True):
        # The SMTP round trip can take seconds; keep it off the request.
        try:
            threading.Thread(
                target=_deliver_verification_email, args=args, name="verify-email", daemon=True
            ).start()
        except RuntimeError:
            logger.error("Could not schedule verification email for user_id=%s", user.pk)
            return False
    else:
        return _deliver_verification_email(*args)
    return True


def mark_email_verified(user):
    """Set email_verified_at, drop the code, refresh the cached profile and
    let open chat sockets accept typing/call frames."""
    from .views import bump_profile_cache_version

    now = timezone.now()
    updated = Profile.objects.filter(pk=user.pk, email__iexact=user.email).update(email_verified_at=now)
    if not updated:
        raise VerificationError("Your email changed. Request a new code.", "code_expired")
    user.email_verified_at = now
    EmailVerificationCode.objects.filter(user_id=user.pk).update(code_hash="", expires_at=now)
    def notify_verified():
        bump_profile_cache_version(user.pk)
        broadcast(user_session_group_name(user.pk), {"type": "email_verified_event"})

    transaction.on_commit(notify_verified)
    logger.info("Email verified for user_id=%s", user.pk)


class VerificationError(Exception):
    def __init__(self, message, code, **extra):
        super().__init__(message)
        self.message = message
        self.code = code
        self.extra = extra


def confirm_verification_code(user, code):
    # Catch inside atomic so wrong guesses still commit their attempt counter.
    failure = None
    with transaction.atomic():
        current = Profile.objects.select_for_update().get(pk=user.pk)
        if current.email_verified:
            return
        try:
            _confirm_verification_code(current, code)
        except VerificationError as error:
            failure = error
    if failure:
        raise failure
    user.email_verified_at = current.email_verified_at


def _confirm_verification_code(user, code):
    """Raise VerificationError (invalid_code / code_expired /
    too_many_attempts) or mark the user verified."""
    code = "".join(str(code or "").split())
    if len(code) != 6 or not code.isdigit():
        raise VerificationError("Enter the 6-digit code from the email.", "invalid_code")

    record = EmailVerificationCode.objects.filter(user_id=user.pk).first()
    if record is None or record.email != _normalize_email(user.email):
        raise VerificationError(
            "That code is no longer valid. Send a new code and try again.", "code_expired"
        )
    max_attempts = _max_attempts()
    if record.attempts >= max_attempts:
        raise VerificationError(
            "Too many wrong codes. Send a new code and try again.", "too_many_attempts"
        )
    if record.expires_at <= timezone.now():
        raise VerificationError(
            "That code has expired. Send a new code and try again.", "code_expired"
        )
    # Count the attempt atomically before comparing, so parallel guesses
    # can't exceed the limit.
    counted = EmailVerificationCode.objects.filter(
        pk=record.pk, attempts__lt=max_attempts
    ).update(attempts=F("attempts") + 1)
    if not counted:
        raise VerificationError(
            "Too many wrong codes. Send a new code and try again.", "too_many_attempts"
        )
    if not constant_time_compare(_code_hash(user.pk, user.email, code), record.code_hash):
        remaining = max(0, max_attempts - (record.attempts + 1))
        message = (
            "That code isn't right. Check the email and try again."
            if remaining
            else "That code isn't right. Send a new code and try again."
        )
        raise VerificationError(message, "invalid_code", attempts_remaining=remaining)
    mark_email_verified(user)


# --- Views ------------------------------------------------------------------


def _verified_response():
    return Response({"message": "Your email is verified.", "email_verified": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(*EMAIL_VERIFY_SEND_THROTTLES))
def verify_email_send_view(request):
    user = request.user
    if user.email_verified_at is not None:
        return _verified_response()
    if not user.email:
        return error_response("Add an email address to your profile first.", "no_email", 400)
    try:
        sent = send_verification_email(user, raise_errors=True)
    except VerificationError as error:
        response = error_response(error.message, error.code, 429, **error.extra)
        response["Retry-After"] = str(error.extra["retry_after"])
        return response
    if not sent:
        return error_response(
            "We couldn't send a code right now. Please try again.", "email_send_failed", 503
        )
    return Response(
        {
            "message": "We sent a 6-digit code to your email.",
            "email": user.email,
            "expires_in": _code_ttl_seconds(),
            "email_verified": False,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(EmailVerifyConfirmRateThrottle))
def verify_email_confirm_view(request):
    user = request.user
    if user.email_verified_at is not None:
        return _verified_response()
    data = request.data if isinstance(request.data, dict) else {}
    try:
        confirm_verification_code(user, data.get("code"))
    except VerificationError as error:
        return error_response(error.message, error.code, 400, **error.extra)
    return _verified_response()


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def verify_email_confirm_link_view(request):
    """The link in the email (``/verify-email?token=``) posts here. No session
    needed: the signed token names the user and the address it was sent to."""
    data = request.data if isinstance(request.data, dict) else {}
    token = str(data.get("token") or "").strip()
    invalid = error_response(
        "This verification link is invalid or has expired. Send a new code from the app.",
        "invalid_link",
        400,
    )
    if not token or len(token) > 512:
        return invalid
    try:
        payload = signing.loads(
            token,
            salt=LINK_SIGNING_SALT,
            max_age=int(getattr(settings, "EMAIL_VERIFICATION_LINK_MAX_AGE_SECONDS", 86400)),
        )
        user_id = int(payload["u"])
        fingerprint = str(payload["e"])
    except (signing.BadSignature, KeyError, TypeError, ValueError):
        return invalid
    with transaction.atomic():
        user = Profile.objects.select_for_update().filter(pk=user_id).first()
        if user is None or not user.email or payload.get("v") != user.token_version or not constant_time_compare(
            fingerprint, _email_fingerprint(user.email)
        ):
            return invalid
        if user.email_verified_at is None:
            mark_email_verified(user)
    return _verified_response()
