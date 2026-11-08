"""Social sign-in: Google ID token verification and the incomplete-profile gate.

``verify_google_id_token`` checks a Google Identity Services / native SDK ID
token offline against Google's published signing keys (fetched once and cached
by ``jwt.PyJWKClient``): RS256 signature, ``aud`` in
``settings.GOOGLE_OAUTH_CLIENT_IDS``, Google issuer, ``exp``/``iat``. The token
itself is never logged.

Accounts created by social sign-in without languages have
``Profile.profile_completed = False`` until ``POST /api/auth/complete-profile/``;
``RequireCompleteProfile`` keeps them from starting chats or sending messages.
"""

import logging
import threading

import jwt
from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

logger = logging.getLogger(__name__)

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"]
GOOGLE_CLAIMS = ("sub", "email", "email_verified", "given_name", "name", "picture", "locale")
# Seconds of clock skew tolerated on exp/iat.
GOOGLE_TOKEN_LEEWAY_SECONDS = 60
GOOGLE_JWKS_TIMEOUT_SECONDS = 5

PROFILE_INCOMPLETE_CODE = "profile_incomplete"
PROFILE_INCOMPLETE_MESSAGE = "Finish your profile first."


class SocialTokenError(Exception):
    """The provider token is missing, malformed, expired, for another app or
    its signing keys could not be fetched."""


_jwks_client = None
_jwks_client_lock = threading.Lock()


def _google_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        with _jwks_client_lock:
            if _jwks_client is None:
                _jwks_client = jwt.PyJWKClient(
                    GOOGLE_CERTS_URL, cache_keys=True, timeout=GOOGLE_JWKS_TIMEOUT_SECONDS
                )
    return _jwks_client


def verify_google_id_token(token):
    """Return the claims of a valid Google ID token or raise SocialTokenError."""
    audiences = list(getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", []) or [])
    if not audiences:
        raise SocialTokenError("Google sign-in is not configured")
    if not isinstance(token, str) or not token.strip():
        raise SocialTokenError("Missing token")
    token = token.strip()
    try:
        signing_key = _google_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audiences,
            issuer=GOOGLE_ISSUERS,
            leeway=GOOGLE_TOKEN_LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.PyJWKClientError as error:
        # Network failure fetching the keys, or an unknown key id.
        logger.warning("Google ID token key lookup failed: %s", type(error).__name__)
        raise SocialTokenError("Could not verify the Google token") from error
    except jwt.InvalidTokenError as error:
        logger.info("Rejected a Google ID token: %s", type(error).__name__)
        raise SocialTokenError("Invalid Google token") from error
    except Exception as error:
        logger.warning("Google ID token verification failed: %s", type(error).__name__)
        raise SocialTokenError("Could not verify the Google token") from error

    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise SocialTokenError("Invalid Google token")
    return {name: claims.get(name) for name in GOOGLE_CLAIMS}


def profile_is_complete(user):
    return bool(getattr(user, "profile_completed", True))


class RequireCompleteProfile(BasePermission):
    """403 ``profile_incomplete`` on unsafe methods for users who signed up
    with a social provider and haven't chosen their languages yet."""

    message = PROFILE_INCOMPLETE_MESSAGE
    code = PROFILE_INCOMPLETE_CODE

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return True  # IsAuthenticated answers 401 first.
        return profile_is_complete(user)
