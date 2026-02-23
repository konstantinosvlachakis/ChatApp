from rest_framework import serializers
from .models import Conversation, Message, Profile, MessageTranslation
from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError

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
            return request.build_absolute_uri(media_path)
        return media_path


class MessageSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    translated_text = serializers.SerializerMethodField()
    translated_source_language = serializers.SerializerMethodField()
    can_translate = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "text",
            "sender",
            "attachment",
            "attachment_url",
            "timestamp",
            "translated_text",
            "translated_source_language",
            "can_translate",
        ]

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.attachment.url)
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


class ConversationSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    receiver = ProfileSerializer(read_only=True)
    messages = MessageSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "sender",
            "receiver",
            "created_at",
            "updated_at",
            "last_message",
            "messages",
        ]

    def get_last_message(self, obj):
        # Retrieve the last message in the conversation
        last_message = obj.messages.order_by("-timestamp").first()
        if last_message:
            # Pass the context to the serializer to include the `request` object
            return MessageSerializer(last_message, context=self.context).data
        return None
