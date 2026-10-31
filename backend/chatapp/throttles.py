import hashlib
import re

from rest_framework.exceptions import Throttled
from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


# Rates are configured in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
# (each overridable by the env var DRF_THROTTLE_<SCOPE>).
#
# A view's explicit throttle_classes REPLACE the global defaults, so views that
# add a scope use with_default_throttles(...) to keep the anon/user limits too.
# A scope with two windows (per minute AND per day) is two classes.


def with_default_throttles(*throttle_classes):
    return [*api_settings.DEFAULT_THROTTLE_CLASSES, *throttle_classes]


class ScopedUserThrottle(UserRateThrottle):
    """Per user when authenticated, per client IP otherwise.

    ``methods`` limits the throttle to some HTTP methods (e.g. only POST on a
    view that also lists with GET); other methods are not counted.
    """

    methods = None

    def get_cache_key(self, request, view):
        if self.methods and request.method not in self.methods:
            return None
        return super().get_cache_key(request, view)


def check_throttles(request, view, throttle_classes):
    """Run throttles inside a view (for limits that only apply on some paths,
    e.g. uploads or creating a new conversation). Raises Throttled (429
    envelope with Retry-After via core.exceptions)."""
    waits = []
    for throttle_class in throttle_classes:
        throttle = throttle_class()
        if not throttle.allow_request(request, view):
            waits.append(throttle.wait())
    if waits:
        known = [wait for wait in waits if wait is not None]
        raise Throttled(wait=max(known) if known else None)


class AuthRateThrottle(AnonRateThrottle):
    """Per-IP limit for login / register / token refresh (brute-force protection)."""

    scope = "auth"

    def get_cache_key(self, request, view):
        # Unlike AnonRateThrottle, apply even if the request carries a valid token.
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class LogoutAllRateThrottle(ScopedUserThrottle):
    """"Log out of all devices" (each call bumps token_version)."""

    scope = "logout_all"


class RegisterRateThrottle(AuthRateThrottle):
    """Per-IP account creation limit (on top of the shared auth bucket)."""

    scope = "register"


class TranslateRateThrottle(ScopedUserThrottle):
    scope = "translate"


class TranslateDailyRateThrottle(ScopedUserThrottle):
    scope = "translate_daily"


class ReportRateThrottle(ScopedUserThrottle):
    scope = "report"


class PushDeviceRateThrottle(ScopedUserThrottle):
    scope = "push_devices"


class ConversationCreateRateThrottle(ScopedUserThrottle):
    scope = "conversation_create"


class ConversationCreateDailyRateThrottle(ScopedUserThrottle):
    scope = "conversation_create_daily"


class MessageSendRateThrottle(ScopedUserThrottle):
    scope = "message_send"
    methods = {"POST"}


class MessageSendDailyRateThrottle(ScopedUserThrottle):
    scope = "message_send_daily"
    methods = {"POST"}


class UploadRateThrottle(ScopedUserThrottle):
    """Shared by message attachments and profile image uploads."""

    scope = "uploads"


class UploadDailyRateThrottle(ScopedUserThrottle):
    scope = "uploads_daily"


class BlockRateThrottle(ScopedUserThrottle):
    scope = "block"


class PracticeSubmitRateThrottle(ScopedUserThrottle):
    scope = "practice_submit"


class PublicProfileRateThrottle(ScopedUserThrottle):
    scope = "profile_view"


class PeopleRateThrottle(ScopedUserThrottle):
    scope = "people"


class ReactionRateThrottle(ScopedUserThrottle):
    scope = "reactions"


CONVERSATION_CREATE_THROTTLES = (
    ConversationCreateRateThrottle,
    ConversationCreateDailyRateThrottle,
)
UPLOAD_THROTTLES = (UploadRateThrottle, UploadDailyRateThrottle)


class MultiWindowRateMixin:
    """Accept rates like "3/10m" (3 per 10 minutes) as well as DRF's
    "3/minute" (DRF only reads the unit's first letter)."""

    def parse_rate(self, rate):
        if rate is None:
            return (None, None)
        num, period = rate.split("/")
        match = re.fullmatch(r"\s*(\d*)\s*([smhd])\w*\s*", period)
        if not match:
            return super().parse_rate(rate)
        multiplier = int(match.group(1) or 1)
        unit = {"s": 1, "m": 60, "h": 3600, "d": 86400}[match.group(2)]
        return (int(num), multiplier * unit)


class EmailVerifySendRateThrottle(MultiWindowRateMixin, ScopedUserThrottle):
    scope = "email_verify_send"


class EmailVerifySendDailyRateThrottle(MultiWindowRateMixin, ScopedUserThrottle):
    scope = "email_verify_send_daily"


class EmailVerifySendIPThrottle(MultiWindowRateMixin, AuthRateThrottle):
    """Per IP, even when authenticated (many accounts behind one client)."""

    scope = "email_verify_send_ip"


class EmailVerifyConfirmRateThrottle(MultiWindowRateMixin, ScopedUserThrottle):
    scope = "email_verify_confirm"


EMAIL_VERIFY_SEND_THROTTLES = (
    EmailVerifySendRateThrottle,
    EmailVerifySendDailyRateThrottle,
    EmailVerifySendIPThrottle,
)


class PasswordResetIPThrottle(AuthRateThrottle):
    """Per-IP limit on password reset emails."""

    scope = "password_reset"


class PasswordResetEmailThrottle(SimpleRateThrottle):
    """Per-address limit on password reset emails (stops mail-bombing one inbox
    from many IPs). The cache key holds a hash, never the address itself."""

    scope = "password_reset_email"

    def get_cache_key(self, request, view):
        try:
            email = str(request.data.get("email") or "").strip().lower()
        except Exception:
            return None
        if not email:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": hashlib.sha256(email.encode("utf-8")).hexdigest(),
        }
