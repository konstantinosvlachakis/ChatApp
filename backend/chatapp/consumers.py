import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Conversation, Profile


PRESENCE_GROUP_NAME = "presence_global"


def user_presence_group_name(user_id):
    return f"presence_user_{user_id}"


class PresenceTrackingMixin:
    async def get_user_id_from_token(self):
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

    @database_sync_to_async
    def increment_presence(self, user_id):
        with transaction.atomic():
            profile = Profile.objects.select_for_update().filter(id=user_id).first()
            if not profile:
                return False

            became_online = not profile.is_online
            profile.ws_connection_count = (profile.ws_connection_count or 0) + 1
            profile.is_online = True
            profile.save(update_fields=["ws_connection_count", "is_online"])
            return became_online

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
            Profile.objects.filter(id__in=contact_ids, is_online=True).values_list(
                "id", flat=True
            )
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
        conversation_id = None
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
                    "sender_channel_name": self.channel_name,
                },
            )

        if self.user_id and conversation_id is not None:
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

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
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

        await self.send(text_data=json.dumps({"type": event["event_type"]}))


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
        # Kept for heartbeat extension; no-op right now.
        return

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
