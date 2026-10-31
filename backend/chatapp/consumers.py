import functools
import json
import logging
import os
import time
import uuid
from http.cookies import SimpleCookie
from urllib.parse import urlparse

from channels.db import database_sync_to_async
from channels.exceptions import StopConsumer
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.core.cache import cache
from django.db.models import Exists, F, OuterRef, Q
from django.http.request import validate_host
from django.utils import timezone

from core.observability import reset_request_id, set_request_id
from core.realtime import safe_group_add, safe_group_discard, safe_group_send

from .models import BlockedUser, Conversation, Profile
from .tokens import (
    SESSION_ID_CLAIM,
    SESSION_REVOKED_CLOSE_CODE,
    token_version_of,
    user_session_group_name,
)

logger = logging.getLogger(__name__)

# Internal error: clients treat it like any drop and reconnect with backoff.
CHANNEL_LAYER_UNAVAILABLE_CLOSE_CODE = 1011


ONLINE_FRESHNESS_SECONDS = int(os.environ.get("ONLINE_FRESHNESS_SECONDS", "90"))
# Heartbeats arrive every ~20s; last_seen only needs refreshing often enough to
# stay inside the freshness window, so most heartbeats skip the database.
PRESENCE_TOUCH_INTERVAL_SECONDS = int(
    os.environ.get("PRESENCE_TOUCH_INTERVAL_SECONDS", "60")
)
# Generous enough for WebRTC SDP payloads, small enough to stop memory abuse.
WS_MAX_MESSAGE_BYTES = int(os.environ.get("WS_MAX_MESSAGE_BYTES", str(64 * 1024)))

# Abuse limits (all per connection unless noted). Excess frames are dropped
# silently; only sustained abuse closes the socket with WS_RATE_LIMIT_CLOSE_CODE.
WS_FRAME_RATE_PER_SECOND = float(os.environ.get("WS_FRAME_RATE_PER_SECOND", "10"))
WS_FRAME_BURST = float(os.environ.get("WS_FRAME_BURST", "20"))
WS_TYPING_RATE_PER_SECOND = float(os.environ.get("WS_TYPING_RATE_PER_SECOND", "2"))
# Clients only send typing on start/stop transitions; a small burst keeps a
# quick type-clear-type from dropping the "stopped" frame.
WS_TYPING_BURST = float(os.environ.get("WS_TYPING_BURST", "4"))
WS_CALL_INVITES_PER_MINUTE = float(os.environ.get("WS_CALL_INVITES_PER_MINUTE", "5"))
WS_MAX_DROPPED_FRAMES_PER_MINUTE = int(
    os.environ.get("WS_MAX_DROPPED_FRAMES_PER_MINUTE", "100")
)
# Open sockets per user (across processes when the cache is Redis).
WS_MAX_CHAT_SOCKETS_PER_USER = int(os.environ.get("WS_MAX_CHAT_SOCKETS_PER_USER", "10"))
WS_MAX_PRESENCE_SOCKETS_PER_USER = int(
    os.environ.get("WS_MAX_PRESENCE_SOCKETS_PER_USER", "5")
)
# The per-user socket counters expire this long after the first socket opened,
# so counts leaked by a crashed process heal themselves (the cap briefly fails
# open when a counter expires under live sockets).
WS_CONNECTION_COUNT_TTL_SECONDS = int(
    os.environ.get("WS_CONNECTION_COUNT_TTL_SECONDS", "3600")
)
WS_RATE_LIMIT_CLOSE_CODE = 4429

# Consumer DB calls run on the default thread pool. The default
# thread_sensitive=True would funnel every socket in the process through
# asgiref's single shared thread (Channels sets no per-connection context).
# DatabaseSyncToAsync still runs close_old_connections around each call, so
# pooled connections go back to the pool afterwards.
db_async = functools.partial(database_sync_to_async, thread_sensitive=False)


def user_presence_group_name(user_id):
    return f"presence_user_{user_id}"


def get_presence_contact_ids(user_id):
    """Ids of users who share a conversation with user_id, minus blocked pairs.

    Presence (online/offline changes and the initial online list) is only ever
    shared with these users; a block in either direction hides it. One query.
    """
    blocked_pair = BlockedUser.objects.filter(
        Q(blocker_id=OuterRef("sender_id"), blocked_id=OuterRef("receiver_id"))
        | Q(blocker_id=OuterRef("receiver_id"), blocked_id=OuterRef("sender_id"))
    )
    rows = (
        Conversation.objects.filter(Q(sender_id=user_id) | Q(receiver_id=user_id))
        .exclude(Exists(blocked_pair))
        .values_list("sender_id", "receiver_id")
        .distinct()
    )
    contact_ids = set()
    for sender_id, receiver_id in rows:
        other_id = receiver_id if sender_id == user_id else sender_id
        if other_id and other_id != user_id:
            contact_ids.add(other_id)
    return contact_ids


def increment_presence_count(user_id, token_version=None):
    """Count a new socket; return True if the user just came online.

    Atomic UPDATEs only (no row lock). A user still flagged online but with
    a stale last_seen (e.g. counts left behind by a crash) counts as coming
    online, so contacts get told. Returns None if the user no longer exists
    (a deleted account whose access token is still valid) or, when
    token_version is given, if the token was revoked since it was issued.
    """
    now = timezone.now()
    threshold = now - timezone.timedelta(seconds=ONLINE_FRESHNESS_SECONDS)
    profiles = Profile.objects.filter(id=user_id)
    if token_version is not None:
        profiles = profiles.filter(token_version=token_version)
    if profiles.filter(is_online=True, last_seen__gte=threshold).update(
        ws_connection_count=F("ws_connection_count") + 1, last_seen=now
    ):
        return False
    updated = profiles.update(
        ws_connection_count=F("ws_connection_count") + 1,
        is_online=True,
        last_seen=now,
    )
    return True if updated else None


def get_online_user_ids(user_ids):
    if not user_ids:
        return []
    threshold = timezone.now() - timezone.timedelta(seconds=ONLINE_FRESHNESS_SECONDS)
    return list(
        Profile.objects.filter(
            id__in=user_ids,
            is_online=True,
            last_seen__gte=threshold,
        ).values_list("id", flat=True)
    )


async def send_presence_update(channel_layer, user_id, is_online, contact_ids):
    """Send a presence change to each contact's own group, never to everyone."""
    if not channel_layer or not user_id:
        return
    event = {
        "type": "presence_update_event",
        "user_id": int(user_id),
        "is_online": bool(is_online),
    }
    for contact_id in contact_ids or ():
        # Best effort: an outage is logged and skipped (core/realtime).
        await safe_group_send(channel_layer, user_presence_group_name(contact_id), event)


class TokenBucket:
    """Classic token bucket on the monotonic clock (one per connection/type)."""

    def __init__(self, rate_per_second, burst):
        self.rate = float(rate_per_second)
        self.capacity = max(1.0, float(burst))
        self.tokens = self.capacity
        self.updated = time.monotonic()

    def allow(self):
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


def socket_count_cache_key(kind, user_id):
    return f"ws:connections:v1:{kind}:user:{user_id}"


def reserve_socket_slot(kind, user_id, limit):
    """Count an opening socket; False (and nothing counted) if over the cap."""
    if limit <= 0:
        return True
    key = socket_count_cache_key(kind, user_id)
    try:
        cache.add(key, 0, timeout=WS_CONNECTION_COUNT_TTL_SECONDS)
        try:
            count = int(cache.incr(key))
        except ValueError:
            cache.set(key, 1, timeout=WS_CONNECTION_COUNT_TTL_SECONDS)
            return True
        if count > limit:
            cache.decr(key)
            return False
    except Exception:
        # A cache outage must not take realtime down: fail open.
        logger.warning("Websocket connection counter unavailable")
    return True


def release_socket_slot(kind, user_id):
    key = socket_count_cache_key(kind, user_id)
    try:
        if int(cache.decr(key)) < 0:
            cache.set(key, 0, timeout=WS_CONNECTION_COUNT_TTL_SECONDS)
    except ValueError:
        pass  # Counter expired: nothing to release.
    except Exception:
        logger.warning("Websocket connection counter unavailable")


class PresenceTrackingMixin:
    # "chat" / "presence": which per-user socket cap applies.
    socket_kind = None

    def init_abuse_limits(self):
        self.socket_slot_reserved = False
        self.frame_bucket = TokenBucket(WS_FRAME_RATE_PER_SECOND, WS_FRAME_BURST)
        self.type_buckets = {
            "typing": TokenBucket(WS_TYPING_RATE_PER_SECOND, WS_TYPING_BURST),
            "call_invite": TokenBucket(
                WS_CALL_INVITES_PER_MINUTE / 60.0, WS_CALL_INVITES_PER_MINUTE
            ),
        }
        self.dropped_window_start = time.monotonic()
        self.dropped_in_window = 0
        self.closing_for_abuse = False

    def socket_limit(self):
        if self.socket_kind == "chat":
            return WS_MAX_CHAT_SOCKETS_PER_USER
        return WS_MAX_PRESENCE_SOCKETS_PER_USER

    async def reserve_socket_slot(self, user_id):
        # Cache calls can block (Redis), so they run off the event loop too.
        reserved = await db_async(reserve_socket_slot)(
            self.socket_kind, user_id, self.socket_limit()
        )
        self.socket_slot_reserved = bool(reserved)
        return reserved

    async def release_socket_slot(self, user_id):
        if getattr(self, "socket_slot_reserved", False):
            self.socket_slot_reserved = False
            await db_async(release_socket_slot)(self.socket_kind, user_id)

    async def reject(self, code):
        # Accept first so the client receives the close code; closing during the
        # handshake shows up in browsers as a bare 1006.
        await self.accept()
        await self.close(code=code)

    async def reject_unavailable(self, group_name=None):
        """The channel layer is down (Redis outage): undo the connect and close
        with 1011 so clients retry with their normal backoff."""
        user_id, self.user_id = self.user_id, None
        await self.release_socket_slot(user_id)
        if group_name:
            await safe_group_discard(self.channel_layer, group_name, self.channel_name)
        await self.leave_session_group(user_id)
        await self.reject(CHANNEL_LAYER_UNAVAILABLE_CLOSE_CODE)

    def _type_bucket(self, message_type):
        if message_type in {"user_typing", "user_stopped_typing"}:
            return self.type_buckets["typing"]
        if message_type == "call_invite":
            return self.type_buckets["call_invite"]
        return None

    async def allow_frame(self):
        """Per-connection frame budget. False means drop the frame (silently)."""
        if getattr(self, "closing_for_abuse", False):
            return False
        if self.frame_bucket.allow():
            return True
        await self.record_dropped_frame("frame rate")
        return False

    async def record_dropped_frame(self, reason):
        """Count a dropped frame; more than WS_MAX_DROPPED_FRAMES_PER_MINUTE in a
        minute closes the socket with 4429 (sustained abuse)."""
        now = time.monotonic()
        if now - self.dropped_window_start >= 60:
            self.dropped_window_start = now
            self.dropped_in_window = 0
        self.dropped_in_window += 1
        logger.debug("Dropped websocket frame (%s) on %s", reason, self.connection_id)
        if self.dropped_in_window > WS_MAX_DROPPED_FRAMES_PER_MINUTE and not self.closing_for_abuse:
            self.closing_for_abuse = True
            logger.info(
                "Closing websocket %s for sustained frame abuse (user %s)",
                self.connection_id,
                getattr(self, "user_id", None),
            )
            await self.close(code=WS_RATE_LIMIT_CLOSE_CODE)

    @property
    def connection_id(self):
        """Per-connection id used as the log "request id" for this socket."""
        value = getattr(self, "_connection_id", None)
        if value is None:
            value = self._connection_id = f"ws-{uuid.uuid4().hex}"
        return value

    async def dispatch(self, message):
        # Bind the connection id to every log line written while handling this
        # frame, and log unexpected errors with it before Channels closes the socket.
        token = set_request_id(self.connection_id)
        try:
            await super().dispatch(message)
        except StopConsumer:
            raise
        except Exception:
            logger.exception(
                "%s error handling %s (connection %s)",
                self.__class__.__name__,
                message.get("type"),
                self.connection_id,
            )
            raise
        finally:
            reset_request_id(token)

    async def get_user_id_from_token(self):
        token = self._get_token_from_authorization_header()
        if not token:
            token = self._get_token_from_cookies()
            # Browsers attach cookies to cross-site WebSocket handshakes, so a
            # cookie-authenticated socket must come from one of our origins
            # (prevents cross-site WebSocket hijacking).
            if token and not self._origin_is_allowed():
                return None
        # The legacy ?token= query parameter is not accepted: URLs end up in
        # proxy/server logs and browser history.
        if not token:
            return None

        try:
            from rest_framework_simplejwt.tokens import AccessToken
            payload = AccessToken(token)
            user_id = payload.get("user_id")
            if not user_id:
                return None
            # Checked against Profile.token_version by each consumer's first
            # query (no extra round trip); see session_revoked_event.
            self.token_version = token_version_of(payload)
            self.session_id = payload.get(SESSION_ID_CLAIM)
            return int(user_id)
        except Exception:
            return None

    async def join_session_group(self):
        self.session_group_joined = await safe_group_add(
            self.channel_layer, user_session_group_name(self.user_id), self.channel_name
        )
        return self.session_group_joined

    async def leave_session_group(self, user_id):
        if getattr(self, "session_group_joined", False):
            self.session_group_joined = False
            await safe_group_discard(
                self.channel_layer, user_session_group_name(user_id), self.channel_name
            )

    async def session_revoked_event(self, event):
        """The user's tokens were revoked (password reset, email change, log
        out of all devices, account deletion): close sockets opened with an
        older token, except the session that made the change."""
        keep = event.get("keep_session_id")
        if keep and keep == getattr(self, "session_id", None):
            self.email_verified = False
            return
        if getattr(self, "token_version", 0) < int(event.get("token_version") or 0):
            await self.close(code=SESSION_REVOKED_CLOSE_CODE)

    async def email_verified_event(self, event):
        self.email_verified = True
        await self.send(text_data=json.dumps({"type": "email_verified"}))

    @db_async
    def has_verified_email(self):
        # Read current state: an email change can keep this socket alive and a
        # Redis outage can drop the verification notification.
        return Profile.objects.filter(pk=self.user_id, email_verified_at__isnull=False).exists()

    def _origin_is_allowed(self):
        raw_headers = dict(self.scope.get("headers", []))
        origin = raw_headers.get(b"origin", b"").decode("latin1").strip()
        if not origin:
            # Non-browser clients (mobile) do not need to send an Origin.
            return True
        if origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []):
            return True
        hostname = urlparse(origin).hostname
        if not hostname:
            return False
        # Same host as the handshake itself (covers LAN-IP dev setups).
        request_host = raw_headers.get(b"host", b"").decode("latin1")
        if hostname == urlparse(f"//{request_host}").hostname:
            return True
        # The "*" wildcard used in local dev must not allow every origin.
        explicit_hosts = [host for host in settings.ALLOWED_HOSTS if host != "*"]
        return validate_host(hostname, explicit_hosts)

    def _get_token_from_cookies(self):
        try:
            raw_headers = dict(self.scope.get("headers", []))
            cookie_header = raw_headers.get(b"cookie", b"").decode()
            if not cookie_header:
                return None
            cookies = SimpleCookie()
            cookies.load(cookie_header)
            cookie = cookies.get(getattr(settings, "AUTH_COOKIE_ACCESS", "lv_access"))
            return cookie.value if cookie else None
        except Exception:
            return None

    def _get_token_from_authorization_header(self):
        try:
            raw_headers = dict(self.scope.get("headers", []))
            auth_header = raw_headers.get(b"authorization", b"").decode().strip()
            if not auth_header.lower().startswith("bearer "):
                return None
            token = auth_header[7:].strip()
            return token or None
        except Exception:
            return None

    @db_async
    def increment_presence(self, user_id):
        return increment_presence_count(user_id)

    @db_async
    def touch_presence(self, user_id):
        # The guard skips the write when another socket of the same user touched
        # last_seen recently. Half the interval leaves slack for clock jitter so
        # a skipped write can never let last_seen age past the freshness window.
        now = timezone.now()
        stale_before = now - timezone.timedelta(
            seconds=PRESENCE_TOUCH_INTERVAL_SECONDS / 2
        )
        Profile.objects.filter(id=user_id, last_seen__lt=stale_before).update(
            last_seen=now
        )

    @db_async
    def decrement_presence(self, user_id):
        """Release a socket; return True if the user just went offline.

        The three filters partition the row's possible states, so one of them
        matches unless a concurrent connect/disconnect moved the row in between,
        in which case we retry. The count never goes below zero.
        """
        profiles = Profile.objects.filter(id=user_id)
        for _ in range(3):
            if profiles.filter(ws_connection_count__gt=1).update(
                ws_connection_count=F("ws_connection_count") - 1
            ):
                return False
            if profiles.filter(ws_connection_count__lte=1, is_online=True).update(
                ws_connection_count=0, is_online=False, last_seen=timezone.now()
            ):
                return True
            if profiles.filter(ws_connection_count__lte=1, is_online=False).update(
                ws_connection_count=0
            ):
                return False
        return False

    @db_async
    def load_presence_contact_ids(self, user_id):
        return get_presence_contact_ids(user_id)

    async def get_contact_ids(self):
        """Resolve the user's contacts once per socket and reuse them."""
        if getattr(self, "contact_ids", None) is None:
            self.contact_ids = await self.load_presence_contact_ids(self.user_id)
        return self.contact_ids

    async def broadcast_presence(self, is_online):
        # Contacts loaded at connect are fresh for the online event; re-read on
        # going offline so blocks and conversations made mid-session apply.
        if is_online:
            contact_ids = await self.get_contact_ids()
        else:
            contact_ids = await self.load_presence_contact_ids(self.user_id)
            self.contact_ids = contact_ids
        await send_presence_update(
            self.channel_layer, self.user_id, is_online, contact_ids
        )

    @db_async
    def get_participant_details(self, conversation_id, user_id):
        """Return (username, other_participant_id, own_token_version) if user_id
        is a participant.

        One query covers the membership check, the user's own username and
        token_version and the other participant's id (used for typing
        notifications).
        """
        row = (
            Conversation.objects.filter(id=conversation_id)
            .filter(Q(sender_id=user_id) | Q(receiver_id=user_id))
            .values_list(
                "sender_id",
                "receiver_id",
                "sender__username",
                "receiver__username",
                "sender__token_version",
                "receiver__token_version",
                "sender__email_verified_at",
                "receiver__email_verified_at",
            )
            .first()
        )
        if not row:
            return None
        (
            sender_id,
            receiver_id,
            sender_username,
            receiver_username,
            sender_version,
            receiver_version,
            sender_verified,
            receiver_verified,
        ) = row
        if sender_id == user_id:
            return sender_username, receiver_id, sender_version, sender_verified is not None
        return receiver_username, sender_id, receiver_version, receiver_verified is not None


class ChatConsumer(PresenceTrackingMixin, AsyncWebsocketConsumer):
    socket_kind = "chat"

    async def connect(self):
        self.room_group_name = None
        self.username = None
        self.other_user_id = None
        self.contact_ids = None
        self.init_abuse_limits()
        self.user_id = await self.get_user_id_from_token()

        # Only authenticated participants may join a conversation's group. The
        # room name must be a numeric conversation id so clients can never
        # subscribe to internal groups such as presence_user_<id>.
        try:
            conversation_id = int(self.scope["url_route"]["kwargs"]["room_name"])
        except (KeyError, TypeError, ValueError):
            conversation_id = None
        if self.user_id and conversation_id is not None:
            # Deleted accounts have no conversations, so this rejects them too.
            details = await self.get_participant_details(conversation_id, self.user_id)
            if details:
                username, other_user_id, current_version, self.email_verified = details
                if self.token_version != int(current_version or 0):
                    # Revoked token (password reset, log out everywhere, ...).
                    self.user_id = None
                    await self.reject(SESSION_REVOKED_CLOSE_CODE)
                    return
                self.username, self.other_user_id = username, other_user_id
        if not self.username:
            self.user_id = None
            await self.reject(4403)
            return
        if not await self.reserve_socket_slot(self.user_id):
            # Too many open chat sockets for this user.
            self.user_id = None
            await self.reject(WS_RATE_LIMIT_CLOSE_CODE)
            return

        room_group_name = str(conversation_id)
        if not await safe_group_add(
            self.channel_layer, room_group_name, self.channel_name
        ) or not await self.join_session_group():
            await self.reject_unavailable(room_group_name)
            return
        self.room_group_name = room_group_name
        # Count the socket before accepting: DB calls run on worker threads, so
        # this keeps "client saw the open" after "presence is up to date".
        became_online = await self.increment_presence(self.user_id)
        if became_online:
            await self.broadcast_presence(True)
        await self.accept()

    async def disconnect(self, close_code):
        if not getattr(self, "room_group_name", None):
            return
        if self.user_id:
            await self.release_socket_slot(self.user_id)
        await safe_group_discard(
            self.channel_layer, self.room_group_name, self.channel_name
        )
        if self.user_id:
            await self.leave_session_group(self.user_id)
            try:
                conversation_id = int(self.room_group_name)
            except (TypeError, ValueError):
                conversation_id = None

            if conversation_id is not None:
                await safe_group_send(
                    self.channel_layer,
                    self.room_group_name,
                    {
                        "type": "typing_event",
                        "conversation_id": conversation_id,
                        "event_type": "user_stopped_typing",
                        "sender_id": self.user_id,
                        "sender_channel_name": self.channel_name,
                    },
                )

                if self.other_user_id:
                    await safe_group_send(
                        self.channel_layer,
                        user_presence_group_name(self.other_user_id),
                        {
                            "type": "typing_status_event",
                            "conversation_id": conversation_id,
                            "sender_id": self.user_id,
                            "is_typing": False,
                        },
                    )

        if self.user_id:
            became_offline = await self.decrement_presence(self.user_id)
            if became_offline:
                await self.broadcast_presence(False)

    async def receive(self, text_data=None, bytes_data=None):
        if not self.user_id:
            return
        if not text_data or len(text_data) > WS_MAX_MESSAGE_BYTES:
            await self.record_dropped_frame("empty or oversized")
            return
        if not await self.allow_frame():
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if not isinstance(data, dict):
            return
        message_type = data.get("type")
        # Typing (2/s) and call_invite (5/min) have their own budgets.
        bucket = self._type_bucket(message_type)
        if bucket is not None and not bucket.allow():
            await self.record_dropped_frame(f"{message_type} rate")
            return
        call_event_types = {
            "call_invite",
            "call_accept",
            "call_reject",
            "call_end",
            "webrtc_offer",
            "webrtc_answer",
            "webrtc_ice_candidate",
        }

        if message_type in call_event_types:
            self.email_verified = await self.has_verified_email()
            if not self.email_verified:
                await self.send(text_data=json.dumps({
                    "type": "email_unverified", "code": "email_unverified",
                    "error": "Verify your email to make calls.",
                }))
                return
        elif message_type in {"user_typing", "user_stopped_typing"} and not self.email_verified:
            # The high-frequency typing path stays query-free. Calls always
            # re-check the database even if a Redis invalidation was lost.
            return

        # Messages and deletions are broadcast by the REST views from the
        # database (message_created / message_deleted); client-originated
        # "chat" and "deleteMessage" frames are no longer relayed.
        if message_type in {"user_typing", "user_stopped_typing"}:
            try:
                conversation_id = int(self.room_group_name)
            except (TypeError, ValueError):
                return
            await safe_group_send(
                self.channel_layer,
                self.room_group_name,
                {
                    "type": "typing_event",
                    "conversation_id": conversation_id,
                    "event_type": message_type,
                    "sender_id": self.user_id,
                    "sender_channel_name": self.channel_name,
                },
            )

            if self.other_user_id:
                await safe_group_send(
                    self.channel_layer,
                    user_presence_group_name(self.other_user_id),
                    {
                        "type": "typing_status_event",
                        "conversation_id": conversation_id,
                        "sender_id": self.user_id,
                        "is_typing": message_type == "user_typing",
                    },
                )
            return

        if message_type in call_event_types:
            await safe_group_send(
                self.channel_layer,
                self.room_group_name,
                {
                    "type": "call_event",
                    "event_type": message_type,
                    "sender_channel_name": self.channel_name,
                    "sdp": data.get("sdp"),
                    "candidate": data.get("candidate"),
                    "call_mode": data.get("callMode"),
                    "reason": data.get("reason"),
                    "duration_seconds": data.get("durationSeconds"),
                },
            )
            return

    async def message_created_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_created",
                    "message": event.get("message"),
                }
            )
        )

    async def message_deleted_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_deleted",
                    "messageId": event.get("message_id"),
                }
            )
        )

    async def typing_event(self, event):
        if self.channel_name == event["sender_channel_name"]:
            return

        payload = {"type": event["event_type"]}
        if event.get("sender_id") is not None:
            payload["senderId"] = event.get("sender_id")

        await self.send(text_data=json.dumps(payload))

    async def message_status_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_status",
                    "messageIds": event.get("message_ids", []),
                    "status": event.get("status"),
                    "actorId": event.get("actor_id"),
                }
            )
        )

    async def message_reaction_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_reaction",
                    "message": event.get("message"),
                }
            )
        )

    async def message_edit_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_edited",
                    "message": event.get("message"),
                }
            )
        )

    async def message_pin_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message_pinned",
                    "message": event.get("message"),
                }
            )
        )

    async def call_event(self, event):
        if self.channel_name == event["sender_channel_name"]:
            return

        payload = {"type": event.get("event_type")}
        if event.get("sdp") is not None:
            payload["sdp"] = event.get("sdp")
        if event.get("candidate") is not None:
            payload["candidate"] = event.get("candidate")
        if event.get("call_mode") is not None:
            payload["callMode"] = event.get("call_mode")
        if event.get("reason") is not None:
            payload["reason"] = event.get("reason")
        if event.get("duration_seconds") is not None:
            payload["durationSeconds"] = event.get("duration_seconds")

        await self.send(text_data=json.dumps(payload))


class PresenceConsumer(PresenceTrackingMixin, AsyncWebsocketConsumer):
    socket_kind = "presence"

    async def connect(self):
        self.contact_ids = None
        self.init_abuse_limits()
        self.user_id = await self.get_user_id_from_token()
        if not self.user_id:
            await self.reject(4401)
            return
        if not await self.reserve_socket_slot(self.user_id):
            # Too many open presence sockets for this user.
            self.user_id = None
            await self.reject(WS_RATE_LIMIT_CLOSE_CODE)
            return

        # Only the user's own group: presence changes are delivered here by
        # their contacts' sockets (see send_presence_update).
        presence_group = user_presence_group_name(self.user_id)
        if not await safe_group_add(
            self.channel_layer, presence_group, self.channel_name
        ) or not await self.join_session_group():
            await self.reject_unavailable(presence_group)
            return
        await self.accept()

        became_online, self.contact_ids, online_ids = await self.open_presence(
            self.user_id
        )
        if became_online is None:
            # The account was deleted, or the token was revoked (token_version
            # bumped), while the access token is still unexpired.
            user_id, self.user_id = self.user_id, None
            await self.release_socket_slot(user_id)
            await safe_group_discard(
                self.channel_layer,
                user_presence_group_name(user_id), self.channel_name
            )
            await self.leave_session_group(user_id)
            await self.close(code=SESSION_REVOKED_CLOSE_CODE)
            return
        self.last_touch_monotonic = time.monotonic()
        if became_online:
            await self.broadcast_presence(True)

        await self.send(
            text_data=json.dumps(
                {"type": "initial_online_users", "user_ids": online_ids}
            )
        )

    @db_async
    def open_presence(self, user_id):
        """Connect-time DB work in one thread hop.

        Returns (became_online, contact_ids, online_contact_ids).
        """
        became_online = increment_presence_count(
            user_id, token_version=getattr(self, "token_version", None)
        )
        if became_online is None:
            return None, set(), []
        contact_ids = get_presence_contact_ids(user_id)
        return became_online, contact_ids, get_online_user_ids(contact_ids)

    async def disconnect(self, close_code):
        if not getattr(self, "user_id", None):
            return
        await self.release_socket_slot(self.user_id)
        await safe_group_discard(
            self.channel_layer,
            user_presence_group_name(self.user_id), self.channel_name
        )
        await self.leave_session_group(self.user_id)

        became_offline = await self.decrement_presence(self.user_id)
        if became_offline:
            await self.broadcast_presence(False)

    async def receive(self, text_data=None, bytes_data=None):
        if not getattr(self, "user_id", None):
            return
        if not text_data or len(text_data) > WS_MAX_MESSAGE_BYTES:
            await self.record_dropped_frame("empty or oversized")
            return
        if not await self.allow_frame():
            return
        try:
            payload = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            payload = {}

        if not isinstance(payload, dict):
            return

        if payload.get("type") == "heartbeat":
            # last_seen was written on connect; only refresh it once it is about
            # to age out, so most heartbeats cost no database work at all.
            now = time.monotonic()
            last_touch = getattr(self, "last_touch_monotonic", 0)
            if now - last_touch < PRESENCE_TOUCH_INTERVAL_SECONDS:
                return
            self.last_touch_monotonic = now
            await self.touch_presence(self.user_id)

    async def presence_update_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "presence_update",
                    "user_id": event["user_id"],
                    "is_online": event["is_online"],
                }
            )
        )

    async def typing_status_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "typing_status",
                    "conversation_id": event["conversation_id"],
                    "sender_id": event["sender_id"],
                    "is_typing": event["is_typing"],
                }
            )
        )

    async def conversation_update_event(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "conversation_update",
                    "conversation_id": event.get("conversation_id"),
                    "trigger": event.get("trigger"),
                    "actor_id": event.get("actor_id"),
                }
            )
        )
