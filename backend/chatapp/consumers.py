import json
import os
import time
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlparse

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.db.models import Exists, F, OuterRef, Q
from django.http.request import validate_host
from django.utils import timezone

from .models import BlockedUser, Conversation, Profile


ONLINE_FRESHNESS_SECONDS = int(os.environ.get("ONLINE_FRESHNESS_SECONDS", "90"))
# Heartbeats arrive every ~20s; last_seen only needs refreshing often enough to
# stay inside the freshness window, so most heartbeats skip the database.
PRESENCE_TOUCH_INTERVAL_SECONDS = int(
    os.environ.get("PRESENCE_TOUCH_INTERVAL_SECONDS", "60")
)
# Generous enough for WebRTC SDP payloads, small enough to stop memory abuse.
WS_MAX_MESSAGE_BYTES = int(os.environ.get("WS_MAX_MESSAGE_BYTES", str(64 * 1024)))
WS_CHAT_TEXT_MAX_LENGTH = int(os.environ.get("MESSAGE_MAX_LENGTH", "5000"))


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
        await channel_layer.group_send(user_presence_group_name(contact_id), event)


class PresenceTrackingMixin:
    async def get_user_id_from_token(self):
        token = self._get_token_from_authorization_header()
        if not token:
            token = self._get_token_from_cookies()
            # Browsers attach cookies to cross-site WebSocket handshakes, so a
            # cookie-authenticated socket must come from one of our origins
            # (prevents cross-site WebSocket hijacking).
            if token and not self._origin_is_allowed():
                return None
        if not token:
            query_string = self.scope.get("query_string", b"").decode()
            token = parse_qs(query_string).get("token", [None])[0]
        if not token:
            return None

        try:
            from rest_framework_simplejwt.tokens import AccessToken
            payload = AccessToken(token)
            user_id = payload.get("user_id")
            if not user_id:
                return None
            return int(user_id)
        except Exception:
            return None

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

    @database_sync_to_async
    def increment_presence(self, user_id):
        """Count a new socket; return True if the user just came online.

        Atomic UPDATEs only (no row lock). A user still flagged online but with
        a stale last_seen (e.g. counts left behind by a crash) counts as coming
        online, so contacts get told.
        """
        now = timezone.now()
        threshold = now - timezone.timedelta(seconds=ONLINE_FRESHNESS_SECONDS)
        if Profile.objects.filter(
            id=user_id, is_online=True, last_seen__gte=threshold
        ).update(ws_connection_count=F("ws_connection_count") + 1, last_seen=now):
            return False
        return bool(
            Profile.objects.filter(id=user_id).update(
                ws_connection_count=F("ws_connection_count") + 1,
                is_online=True,
                last_seen=now,
            )
        )

    @database_sync_to_async
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

    @database_sync_to_async
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

    @database_sync_to_async
    def load_presence_contact_ids(self, user_id):
        return get_presence_contact_ids(user_id)

    async def get_contact_ids(self):
        """Resolve the user's contacts once per socket and reuse them."""
        if getattr(self, "contact_ids", None) is None:
            self.contact_ids = await self.load_presence_contact_ids(self.user_id)
        return self.contact_ids

    async def broadcast_presence(self, is_online):
        contact_ids = await self.get_contact_ids()
        await send_presence_update(
            self.channel_layer, self.user_id, is_online, contact_ids
        )

    @database_sync_to_async
    def get_online_contact_ids(self, contact_ids):
        if not contact_ids:
            return []
        threshold = timezone.now() - timezone.timedelta(seconds=ONLINE_FRESHNESS_SECONDS)
        return list(
            Profile.objects.filter(
                id__in=contact_ids,
                is_online=True,
                last_seen__gte=threshold,
            ).values_list("id", flat=True)
        )

    @database_sync_to_async
    def get_participant_details(self, conversation_id, user_id):
        """Return (username, other_participant_id) if user_id is a participant.

        One query covers the membership check, the user's own username and the
        other participant's id (used for typing notifications).
        """
        row = (
            Conversation.objects.filter(id=conversation_id)
            .filter(Q(sender_id=user_id) | Q(receiver_id=user_id))
            .values_list(
                "sender_id", "receiver_id", "sender__username", "receiver__username"
            )
            .first()
        )
        if not row:
            return None
        sender_id, receiver_id, sender_username, receiver_username = row
        if sender_id == user_id:
            return sender_username, receiver_id
        return receiver_username, sender_id


class ChatConsumer(PresenceTrackingMixin, AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = None
        self.username = None
        self.other_user_id = None
        self.contact_ids = None
        self.user_id = await self.get_user_id_from_token()

        # Only authenticated participants may join a conversation's group. The
        # room name must be a numeric conversation id so clients can never
        # subscribe to internal groups such as presence_user_<id>.
        try:
            conversation_id = int(self.scope["url_route"]["kwargs"]["room_name"])
        except (KeyError, TypeError, ValueError):
            conversation_id = None
        if self.user_id and conversation_id is not None:
            details = await self.get_participant_details(conversation_id, self.user_id)
            if details:
                self.username, self.other_user_id = details
        if not self.username:
            self.user_id = None
            await self.close(code=4403)
            return

        self.room_group_name = str(conversation_id)
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.user_id:
            became_online = await self.increment_presence(self.user_id)
            if became_online:
                await self.broadcast_presence(True)

    async def disconnect(self, close_code):
        if not getattr(self, "room_group_name", None):
            return
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        if self.user_id:
            try:
                conversation_id = int(self.room_group_name)
            except (TypeError, ValueError):
                conversation_id = None

            if conversation_id is not None:
                await self.channel_layer.group_send(
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
                    await self.channel_layer.group_send(
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
        if not self.user_id or not text_data or len(text_data) > WS_MAX_MESSAGE_BYTES:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if not isinstance(data, dict):
            return
        message_type = data.get("type", "chat")
        call_event_types = {
            "call_invite",
            "call_accept",
            "call_reject",
            "call_end",
            "webrtc_offer",
            "webrtc_answer",
            "webrtc_ice_candidate",
        }

        if message_type == "chat":
            message = data.get("message")
            if not isinstance(message, str) or len(message) > WS_CHAT_TEXT_MAX_LENGTH:
                return
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "id": data.get("id"),
                    "message": message,
                    # Sender identity comes from the authenticated socket, never
                    # from the client payload (prevents impersonation).
                    "sender": self.username,
                    "sender_id": self.user_id,
                    "attachment_url": data.get("attachmentUrl"),
                    "reply_to": data.get("replyTo"),
                    "sender_channel_name": self.channel_name,
                },
            )
            return

        if message_type == "deleteMessage":
            message_id = data.get("messageId")
            if not isinstance(message_id, int):
                return
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "delete_message",
                    "messageId": message_id,
                    "sender_channel_name": self.channel_name,
                },
            )
            return

        if message_type in {"user_typing", "user_stopped_typing"}:
            try:
                conversation_id = int(self.room_group_name)
            except (TypeError, ValueError):
                return
            await self.channel_layer.group_send(
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
                await self.channel_layer.group_send(
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
            await self.channel_layer.group_send(
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

    async def chat_message(self, event):
        if self.channel_name == event["sender_channel_name"]:
            return

        await self.send(
            text_data=json.dumps(
                {
                    "type": "chat",
                    "id": event.get("id"),
                    "message": event["message"],
                    "sender": event.get("sender"),
                    "senderId": event.get("sender_id"),
                    "attachmentUrl": event.get("attachment_url"),
                    "replyTo": event.get("reply_to"),
                }
            )
        )

    async def delete_message(self, event):
        if self.channel_name == event["sender_channel_name"]:
            return

        await self.send(
            text_data=json.dumps(
                {"type": "deleteMessage", "messageId": event["messageId"]}
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
    async def connect(self):
        self.contact_ids = None
        self.user_id = await self.get_user_id_from_token()
        if not self.user_id:
            await self.close(code=4401)
            return

        # Only the user's own group: presence changes are delivered here by
        # their contacts' sockets (see send_presence_update).
        await self.channel_layer.group_add(
            user_presence_group_name(self.user_id), self.channel_name
        )
        await self.accept()

        became_online = await self.increment_presence(self.user_id)
        self.last_touch_monotonic = time.monotonic()
        contact_ids = await self.get_contact_ids()
        if became_online:
            await self.broadcast_presence(True)

        online_ids = await self.get_online_contact_ids(contact_ids)
        await self.send(
            text_data=json.dumps(
                {"type": "initial_online_users", "user_ids": online_ids}
            )
        )

    async def disconnect(self, close_code):
        if not getattr(self, "user_id", None):
            return
        await self.channel_layer.group_discard(
            user_presence_group_name(self.user_id), self.channel_name
        )

        became_offline = await self.decrement_presence(self.user_id)
        if became_offline:
            await self.broadcast_presence(False)

    async def receive(self, text_data=None, bytes_data=None):
        if not getattr(self, "user_id", None):
            return
        if not text_data or len(text_data) > WS_MAX_MESSAGE_BYTES:
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
