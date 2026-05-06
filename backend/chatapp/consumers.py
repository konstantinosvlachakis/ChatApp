import json
import os
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Conversation, Profile


PRESENCE_GROUP_NAME = "presence_global"
ONLINE_FRESHNESS_SECONDS = int(os.environ.get("ONLINE_FRESHNESS_SECONDS", "90"))


def user_presence_group_name(user_id):
    return f"presence_user_{user_id}"


class PresenceTrackingMixin:
    async def get_user_id_from_token(self):
        token = self._get_token_from_authorization_header()
        if not token:
            token = self._get_token_from_cookies()
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
        with transaction.atomic():
            profile = Profile.objects.select_for_update().filter(id=user_id).first()
            if not profile:
                return False

            became_online = not profile.is_online
            profile.ws_connection_count = (profile.ws_connection_count or 0) + 1
            profile.is_online = True
            profile.last_seen = timezone.now()
            profile.save(update_fields=["ws_connection_count", "is_online", "last_seen"])
            return became_online

    @database_sync_to_async
    def touch_presence(self, user_id):
        now = timezone.now()
        Profile.objects.filter(id=user_id).update(last_seen=now)

    @database_sync_to_async
    def decrement_presence(self, user_id):
        with transaction.atomic():
            profile = Profile.objects.select_for_update().filter(id=user_id).first()
            if not profile:
                return False

            if profile.ws_connection_count > 0:
                profile.ws_connection_count -= 1

            update_fields = ["ws_connection_count"]
            became_offline = False

            if profile.ws_connection_count == 0:
                if profile.is_online:
                    became_offline = True
                profile.is_online = False
                profile.last_seen = timezone.now()
                update_fields.extend(["is_online", "last_seen"])
            elif not profile.is_online:
                profile.is_online = True
                update_fields.append("is_online")

            profile.save(update_fields=update_fields)
            return became_offline

    @database_sync_to_async
    def get_online_contact_ids(self, user_id):
        threshold = timezone.now() - timezone.timedelta(seconds=ONLINE_FRESHNESS_SECONDS)
        rows = (
            Conversation.objects.filter(Q(sender_id=user_id) | Q(receiver_id=user_id))
            .values_list("sender_id", "receiver_id")
            .distinct()
        )
        contact_ids = set()
        for sender_id, receiver_id in rows:
            other_id = receiver_id if sender_id == user_id else sender_id
            if other_id and other_id != user_id:
                contact_ids.add(other_id)

        if not contact_ids:
            return []

        return list(
            Profile.objects.filter(
                id__in=contact_ids,
                is_online=True,
                last_seen__gte=threshold,
            ).values_list("id", flat=True)
        )

    @database_sync_to_async
    def get_other_participant_id(self, conversation_id, current_user_id):
        conversation = Conversation.objects.filter(id=conversation_id).first()
        if not conversation:
            return None

        if conversation.sender_id == current_user_id:
            return conversation.receiver_id
        if conversation.receiver_id == current_user_id:
            return conversation.sender_id
        return None


class ChatConsumer(PresenceTrackingMixin, AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.user_id = await self.get_user_id_from_token()
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.user_id:
            became_online = await self.increment_presence(self.user_id)
            if became_online:
                await self.channel_layer.group_send(
                    PRESENCE_GROUP_NAME,
                    {
                        "type": "presence_update_event",
                        "user_id": self.user_id,
                        "is_online": True,
                    },
                )

    async def disconnect(self, close_code):
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

                recipient_id = await self.get_other_participant_id(
                    conversation_id, self.user_id
                )
                if recipient_id:
                    await self.channel_layer.group_send(
                        user_presence_group_name(recipient_id),
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
                await self.channel_layer.group_send(
                    PRESENCE_GROUP_NAME,
                    {
                        "type": "presence_update_event",
                        "user_id": self.user_id,
                        "is_online": False,
                    },
                )

    async def receive(self, text_data):
        data = json.loads(text_data)
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
            if message is None:
                return
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "id": data.get("id"),
                    "message": message,
                    "sender": data.get("sender"),
                    "sender_id": data.get("senderId"),
                    "attachment_url": data.get("attachmentUrl"),
                    "reply_to": data.get("replyTo"),
                    "sender_channel_name": self.channel_name,
                },
            )
            return

        if message_type == "deleteMessage":
            message_id = data.get("messageId")
            if message_id is None:
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

            if self.user_id:
                recipient_id = await self.get_other_participant_id(
                    conversation_id, self.user_id
                )
                if recipient_id:
                    await self.channel_layer.group_send(
                        user_presence_group_name(recipient_id),
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
        self.user_id = await self.get_user_id_from_token()
        if not self.user_id:
            await self.close(code=4401)
            return

        await self.channel_layer.group_add(PRESENCE_GROUP_NAME, self.channel_name)
        await self.channel_layer.group_add(
            user_presence_group_name(self.user_id), self.channel_name
        )
        await self.accept()

        became_online = await self.increment_presence(self.user_id)
        if became_online:
            await self.channel_layer.group_send(
                PRESENCE_GROUP_NAME,
                {
                    "type": "presence_update_event",
                    "user_id": self.user_id,
                    "is_online": True,
                },
            )

        online_ids = await self.get_online_contact_ids(self.user_id)
        await self.send(
            text_data=json.dumps(
                {"type": "initial_online_users", "user_ids": online_ids}
            )
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(PRESENCE_GROUP_NAME, self.channel_name)
        if not getattr(self, "user_id", None):
            return
        await self.channel_layer.group_discard(
            user_presence_group_name(self.user_id), self.channel_name
        )

        became_offline = await self.decrement_presence(self.user_id)
        if became_offline:
            await self.channel_layer.group_send(
                PRESENCE_GROUP_NAME,
                {
                    "type": "presence_update_event",
                    "user_id": self.user_id,
                    "is_online": False,
                },
            )

    async def receive(self, text_data):
        if not getattr(self, "user_id", None):
            return
        try:
            payload = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            payload = {}

        if payload.get("type") == "heartbeat":
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
