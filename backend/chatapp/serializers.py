from rest_framework import serializers
from .models import Conversation, Message, Profile, MessageTranslation, MessageReaction
from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone
import os

LANGUAGE_CODE_MAP = {
    "english": "en",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "portuguese": "pt",
    "greek": "el",
    "japanese": "ja",
    "korean": "ko",
    "chinese": "zh",
    "arabic": "ar",
    "russian": "ru",
    "turkish": "tr",
    "hindi": "hi",
}


def resolve_language_code(language):
    if not language:
        return "en"

    normalized = str(language).strip().lower()
    if len(normalized) in (2, 3):
        return normalized
    return LANGUAGE_CODE_MAP.get(normalized, "en")


class ProfileSerializer(serializers.ModelSerializer):
    profile_image_url = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
            "email",
            "date_of_birth",
            "native_language",
            "profile_image_url",
            "is_online",
            "last_seen",
        ]

    def get_profile_image_url(self, obj):
        path = getattr(obj, "profile_image_url", "")
        if not path:
            return None

        normalized = str(path).strip()
        if normalized.startswith("http://") or normalized.startswith("https://"):
            if "herokuapp.com" in normalized or "langvoyage.com" in normalized:
                return normalized.replace("http://", "https://", 1)
            return normalized

        if normalized.startswith("/media/"):
            normalized = normalized[len("/media/") :]
        elif normalized.startswith("media/"):
            normalized = normalized[len("media/") :]
        else:
            normalized = normalized.lstrip("/")

        request = self.context.get("request")
        media_path = f"{settings.MEDIA_URL}{normalized}"
        if request:
            absolute = request.build_absolute_uri(media_path)
            if request.get_host().endswith(
                ("herokuapp.com", "langvoyage.com", "www.langvoyage.com")
            ):
                return absolute.replace("http://", "https://", 1)
            return absolute
        return media_path

    def get_is_online(self, obj):
        if not getattr(obj, "is_online", False):
            return False

        last_seen = getattr(obj, "last_seen", None)
        if not last_seen:
            return False

        freshness_seconds = int(os.environ.get("ONLINE_FRESHNESS_SECONDS", "90"))
        threshold = timezone.now() - timezone.timedelta(seconds=freshness_seconds)
        return last_seen >= threshold


class MessageSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    translated_text = serializers.SerializerMethodField()
    translated_source_language = serializers.SerializerMethodField()
    can_translate = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    current_user_reaction = serializers.SerializerMethodField()
    reply_to = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "text",
            "sender",
            "status",
            "attachment",
            "attachment_url",
            "timestamp",
            "edited_at",
            "reply_to",
            "translated_text",
            "translated_source_language",
            "can_translate",
            "reactions",
            "current_user_reaction",
        ]

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get("request")
            if request:
                absolute = request.build_absolute_uri(obj.attachment.url)
                if request.get_host().endswith(
                    ("herokuapp.com", "langvoyage.com", "www.langvoyage.com")
                ):
                    return absolute.replace("http://", "https://", 1)
                return absolute
            return obj.attachment.url
        return None

    def _get_user_translation(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return None

        target_language = resolve_language_code(
            getattr(request.user, "base_translate_language", "english")
        )
        try:
            return (
                MessageTranslation.objects.filter(
                    message=obj,
                    user=request.user,
                    target_language=target_language,
                )
                .order_by("-updated_at")
                .first()
            )
        except (OperationalError, ProgrammingError):
            # Graceful fallback while migrations are being applied.
            return None

    def get_translated_text(self, obj):
        translation = self._get_user_translation(obj)
        if translation and translation.source_language and translation.target_language:
            src = translation.source_language.split("-")[0].lower()
            tgt = translation.target_language.split("-")[0].lower()
            if src == tgt:
                return None
        return translation.translated_text if translation else None

    def get_translated_source_language(self, obj):
        translation = self._get_user_translation(obj)
        return translation.source_language if translation else None

    def get_can_translate(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return False

        if obj.sender_id == request.user.id:
            return False

        if not (obj.text or "").strip():
            return False

        target_language = resolve_language_code(
            getattr(request.user, "base_translate_language", "english")
        )
        try:
            existing = MessageTranslation.objects.filter(
                message=obj,
                user=request.user,
                target_language=target_language,
            ).exists()
        except (OperationalError, ProgrammingError):
            return True
        return not existing

    def get_reactions(self, obj):
        return [
            {
                "id": reaction.id,
                "user_id": reaction.user_id,
                "username": getattr(reaction.user, "username", ""),
                "emoji": reaction.emoji,
            }
            for reaction in obj.reactions.select_related("user").all().order_by("created_at")
        ]

    def get_current_user_reaction(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return None

        reaction = obj.reactions.filter(user=request.user).first()
        return reaction.emoji if reaction else None

    def get_reply_to(self, obj):
        reply = getattr(obj, "reply_to", None)
        if not reply:
            return None

        sender = getattr(reply, "sender", None)
        return {
            "id": reply.id,
            "text": reply.text,
            "timestamp": reply.timestamp,
            "sender": {
                "id": sender.id if sender else None,
                "username": sender.username if sender else "",
            },
        }


class ConversationSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    receiver = ProfileSerializer(read_only=True)
    messages = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "sender",
            "receiver",
            "created_at",
            "updated_at",
            "last_message",
            "unread_count",
            "messages",
        ]

    def get_messages(self, obj):
        include_messages = bool(self.context.get("include_messages"))
        if not include_messages:
            return []
        return MessageSerializer(
            obj.messages.all(),
            many=True,
            context=self.context,
        ).data

    def get_last_message(self, obj):
        last_message_map = self.context.get("last_message_map") or {}
        mapped_last_message = last_message_map.get(obj.id)
        if mapped_last_message is not None:
            return MessageSerializer(mapped_last_message, context=self.context).data

        # Retrieve the last message in the conversation
        last_message = obj.messages.order_by("-timestamp").first()
        if last_message:
            # Pass the context to the serializer to include the `request` object
            return MessageSerializer(last_message, context=self.context).data
        return None

    def get_unread_count(self, obj):
        if hasattr(obj, "unread_count_for_request"):
            try:
                return int(obj.unread_count_for_request or 0)
            except (TypeError, ValueError):
                return 0

        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return 0

        return obj.messages.exclude(sender=request.user).exclude(status="read").count()
