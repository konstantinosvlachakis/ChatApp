"""JWT issuing, refresh rotation and revocation.

Claims we add to every refresh token (and, through SimpleJWT's claim copying,
to the access tokens made from it):

- ``tv``  (TOKEN_VERSION_CLAIM): the user's ``Profile.token_version`` at issue
  time. Bumping the version (password reset, email change, "log out of all
  devices", account deletion) invalidates every access and refresh token issued
  before. Tokens without the claim (issued before this existed) count as 0.
- ``sid`` (SESSION_ID_CLAIM): random id of one login, kept across rotations, so
  a revocation can spare the session that asked for it (email change).
- ``remember_me``: the login asked for a 30-day session; rotation keeps it.

Refresh tokens rotate on every use and the used one is blacklisted
(``rest_framework_simplejwt.token_blacklist``). A blacklisted token is still
accepted for ``REFRESH_GRACE_SECONDS`` after its rotation and answers with the
same new pair, so two tabs (or a retried request) refreshing at the same moment
don't log each other out.
"""

import hashlib
import logging
import uuid
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainSerializer
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch

from .models import Profile, PushDevice

logger = logging.getLogger(__name__)

TOKEN_VERSION_CLAIM = "tv"
SESSION_ID_CLAIM = "sid"
REMEMBER_ME_CLAIM = "remember_me"
REMEMBER_ME_REFRESH_LIFETIME = timedelta(days=30)
REFRESH_GRACE_SECONDS = 10
# Websocket close code for "your token was revoked"; both clients refresh once
# on it and log out if the refresh fails.
SESSION_REVOKED_CLOSE_CODE = 4401


def token_version_of(token):
    try:
        return int(token.get(TOKEN_VERSION_CLAIM, 0) or 0)
    except (TypeError, ValueError):
        return -1


def user_session_group_name(user_id):
    """Channels group every socket of a user joins (chat and presence)."""
    return f"session_user_{user_id}"


def refresh_lifetime(remember_me):
    if remember_me:
        return REMEMBER_ME_REFRESH_LIFETIME
    return settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]


def issue_refresh_token(user, remember_me=False, session_id=None):
    """A new refresh token for user, recorded as outstanding (one INSERT)."""
    refresh = RefreshToken()
    refresh["user_id"] = user.pk
    refresh[TOKEN_VERSION_CLAIM] = int(user.token_version or 0)
    refresh[SESSION_ID_CLAIM] = session_id or uuid.uuid4().hex
    if remember_me:
        refresh[REMEMBER_ME_CLAIM] = True
    refresh.set_exp(lifetime=refresh_lifetime(remember_me))
    OutstandingToken.objects.create(
        user=user,
        jti=refresh["jti"],
        token=str(refresh),
        created_at=refresh.current_time,
        expires_at=datetime_from_epoch(refresh["exp"]),
    )
    return refresh


def token_pair(refresh):
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def issue_token_pair(user, remember_me=False, session_id=None):
    return token_pair(issue_refresh_token(user, remember_me, session_id))


def _blacklist_jti(user, refresh):
    """Blacklist refresh; True if this call did it (False: already blacklisted)."""
    outstanding, _ = OutstandingToken.objects.get_or_create(
        jti=refresh["jti"],
        defaults={
            "user": user,
            "token": str(refresh),
            "created_at": refresh.current_time,
            "expires_at": datetime_from_epoch(refresh["exp"]),
        },
    )
    try:
        with transaction.atomic():
            _, created = BlacklistedToken.objects.get_or_create(token=outstanding)
    except IntegrityError:
        created = False
    return created


def blacklist_refresh_token(raw_token):
    """Logout: blacklist one refresh token. Never raises (bad/expired → no-op)."""
    if not raw_token or not isinstance(raw_token, str):
        return False
    try:
        refresh = RefreshToken(raw_token)
    except TokenError:
        return False
    user = Profile.objects.filter(pk=refresh.get("user_id")).first()
    try:
        return _blacklist_jti(user, refresh)
    except Exception:
        logger.warning("Could not blacklist a refresh token on logout")
        return False


def _grace_cache_key(raw_token):
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"auth:refresh_grace:v1:{digest}"


def _active_user_for(token):
    user = Profile.objects.filter(pk=token.get("user_id")).first()
    if user is None or not getattr(user, "is_active", True):
        raise AuthenticationFailed(
            "No active account found for the given token.", "no_active_account"
        )
    if token_version_of(token) != int(user.token_version or 0):
        raise TokenError("Token has been revoked")
    return user


def rotate_refresh_token(raw_token):
    """Validate raw_token and return a new pair, blacklisting the old token.

    Raises TokenError (→ 401 token_not_valid) for an invalid, expired,
    blacklisted or revoked token, AuthenticationFailed for a deleted account.
    """
    grace_key = _grace_cache_key(raw_token)
    try:
        cached = cache.get(grace_key)
    except Exception:
        cached = None
    if cached:
        # The same token was rotated a moment ago (another tab / a retry): hand
        # back that pair if it is still good (not revoked or logged out since).
        new_refresh = RefreshToken(cached["refresh"])
        _active_user_for(new_refresh)
        return dict(cached)

    refresh = RefreshToken(raw_token)  # signature, expiry, type, blacklist
    user = _active_user_for(refresh)
    if not _blacklist_jti(user, refresh):
        # Lost a race with a concurrent rotation of the same token.
        raise TokenError("Token is blacklisted")

    new_refresh = issue_refresh_token(
        user,
        remember_me=bool(refresh.get(REMEMBER_ME_CLAIM)),
        session_id=refresh.get(SESSION_ID_CLAIM),
    )
    pair = token_pair(new_refresh)
    try:
        cache.set(grace_key, pair, timeout=REFRESH_GRACE_SECONDS)
    except Exception:
        pass
    return pair


class RotatingTokenRefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate(self, attrs):
        pair = rotate_refresh_token(attrs["refresh"])
        payload = RefreshToken(pair["refresh"], verify=False).payload
        self.remember_me = bool(payload.get(REMEMBER_ME_CLAIM))
        return pair


class LoginSerializer(TokenObtainSerializer):
    """Email/password → our versioned pair (remember_me from the context)."""

    def validate(self, attrs):
        super().validate(attrs)  # authenticates, sets self.user
        return issue_token_pair(
            self.user, remember_me=bool(self.context.get("remember_me"))
        )


def broadcast_session_revoked(user_id, token_version, keep_session_id=None):
    """Tell the user's open sockets that tokens older than token_version died.

    Sockets authenticated by an older token close with 4401, except the ones
    from keep_session_id (the session that asked for the change).
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            user_session_group_name(user_id),
            {
                "type": "session_revoked_event",
                "token_version": token_version,
                "keep_session_id": keep_session_id,
            },
        )
    except Exception:
        logger.warning("Could not broadcast session revocation for user_id=%s", user_id)


def revoke_user_tokens(user, keep_session_id=None, broadcast=True, deactivate_push=False):
    """Invalidate every token the user holds: bump token_version (access and
    refresh tokens carry it), blacklist outstanding refresh tokens and close
    the user's sockets. With deactivate_push, signed-out devices also stop
    getting push notifications (they re-register on their next login).
    Returns the new version (also set on ``user``)."""
    Profile.objects.filter(pk=user.pk).update(token_version=F("token_version") + 1)
    user.token_version = (
        Profile.objects.filter(pk=user.pk).values_list("token_version", flat=True).first()
        or 0
    )
    outstanding_ids = list(
        OutstandingToken.objects.filter(
            user_id=user.pk,
            expires_at__gt=timezone.now(),
            blacklistedtoken__isnull=True,
        ).values_list("id", flat=True)
    )
    if outstanding_ids:
        BlacklistedToken.objects.bulk_create(
            [BlacklistedToken(token_id=token_id) for token_id in outstanding_ids],
            ignore_conflicts=True,
        )
    if deactivate_push:
        PushDevice.objects.filter(user_id=user.pk, is_active=True).update(is_active=False)
    if broadcast:
        version = user.token_version
        user_id = user.pk
        transaction.on_commit(
            lambda: broadcast_session_revoked(user_id, version, keep_session_id)
        )
    return user.token_version
