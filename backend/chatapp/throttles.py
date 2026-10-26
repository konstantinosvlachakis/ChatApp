from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


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
