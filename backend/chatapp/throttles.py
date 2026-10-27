import hashlib

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


# Rates are configured in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].
class AuthRateThrottle(AnonRateThrottle):
    """Per-IP limit for login / register / token refresh (brute-force protection)."""

    scope = "auth"

    def get_cache_key(self, request, view):
        # Unlike AnonRateThrottle, apply even if the request carries a valid token.
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class TranslateRateThrottle(UserRateThrottle):
    scope = "translate"


class ReportRateThrottle(UserRateThrottle):
    scope = "report"


class PushDeviceRateThrottle(UserRateThrottle):
    scope = "push_devices"


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
