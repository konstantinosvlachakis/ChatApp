from rest_framework import serializers
from .models import Conversation, Message, Profile, MessageTranslation, MessageReaction
from django.conf import settings
from django.db.models import Prefetch
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


# Number of most recent messages embedded in the conversation detail response.
# Older history is available through GET /conversations/<id>/messages/?page=N.
CONVERSATION_DETAIL_MESSAGE_LIMIT = 200

# Profile columns ProfileSerializer reads; used with only() on related lookups.
PROFILE_SUMMARY_FIELDS = (
    "id",
    "username",
    "native_language",
    "profile_image_url",
    "is_online",
    "last_seen",
)


def get_request_user(context):
    request = (context or {}).get("request")
    user = getattr(request, "user", None) if request else None
    if not user or not user.is_authenticated:
        return None
    return user


def with_message_relations(queryset, user=None):
    """
    Load everything MessageSerializer needs in a constant number of queries:
    sender / pinned_by / reply_to (+ its sender) via JOINs, reactions (+ user)
    and the given user's translations for their base translate language via
    prefetch. Without this, serializing N messages costs ~6 queries each.
    """
    queryset = queryset.select_related(
        "sender", "pinned_by", "reply_to__sender"
    ).prefetch_related(
        Prefetch(
            "reactions",
            queryset=MessageReaction.objects.select_related("user").order_by(
                "created_at"
            ),
        )
    )
    if user is not None and getattr(user, "is_authenticated", False):
        target_language = resolve_language_code(
            getattr(user, "base_translate_language", "english")
        )
        queryset = queryset.prefetch_related(
            Prefetch(
                "translations",
                queryset=MessageTranslation.objects.filter(
                    user=user, target_language=target_language
                ).order_by("-updated_at"),
                to_attr="my_translations",
            )
        )
    return queryset


def reload_message_for_serializer(message, user=None):
    """Re-fetch one message with everything MessageSerializer needs."""
    return with_message_relations(Message.objects.filter(pk=message.pk), user).get()


class ProfileSerializer(serializers.ModelSerializer):
    profile_image_url = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

    # Used for *other* users (message senders, conversation participants), so it
    # must not expose private fields such as email or date_of_birth.
    class Meta:
        model = Profile
        fields = [
            "id",
            "username",
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
    pinned_by = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()

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
            "is_pinned",
            "pinned_at",
            "pinned_by",
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
        user = get_request_user(self.context)
        if user is None:
            return None

        # translated_text, translated_source_language and can_translate all
        # read the same row, so resolve it once per message (and user).
        cached = getattr(obj, "_user_translation_cache", None)
        if cached is not None and cached[0] == user.id:
            return cached[1]

        if hasattr(obj, "my_translations"):
            # Prefetched by with_message_relations() (newest first).
            translation = obj.my_translations[0] if obj.my_translations else None
        else:
            target_language = resolve_language_code(
                getattr(user, "base_translate_language", "english")
            )
            try:
                translation = (
                    MessageTranslation.objects.filter(
                        message=obj,
                        user=user,
                        target_language=target_language,
                    )
                    .order_by("-updated_at")
                    .first()
                )
            except (OperationalError, ProgrammingError):
                # Graceful fallback while migrations are being applied.
                return None

        obj._user_translation_cache = (user.id, translation)
        return translation

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
        user = get_request_user(self.context)
        if user is None:
            return False

        if obj.sender_id == user.id:
            return False

        if not (obj.text or "").strip():
            return False

        return self._get_user_translation(obj) is None

    @staticmethod
    def _reactions_prefetched(obj):
        return "reactions" in getattr(obj, "_prefetched_objects_cache", {})

    def get_reactions(self, obj):
        if self._reactions_prefetched(obj):
            reactions = obj.reactions.all()
        else:
            reactions = obj.reactions.select_related("user").all().order_by(
                "created_at"
            )
        return [
            {
                "id": reaction.id,
                "user_id": reaction.user_id,
                "username": getattr(reaction.user, "username", ""),
                "emoji": reaction.emoji,
            }
            for reaction in reactions
        ]

    def get_current_user_reaction(self, obj):
        user = get_request_user(self.context)
        if user is None:
            return None

        if self._reactions_prefetched(obj):
            reaction = next(
                (item for item in obj.reactions.all() if item.user_id == user.id),
                None,
            )
        else:
            reaction = obj.reactions.filter(user=user).first()
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

    def get_pinned_by(self, obj):
        pinned_by = getattr(obj, "pinned_by", None)
        if not pinned_by:
            return None

        return {
            "id": pinned_by.id,
            "username": pinned_by.username,
        }

    def get_is_pinned(self, obj):
        return bool(getattr(obj, "pinned_at", None))


class ConversationSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    receiver = ProfileSerializer(read_only=True)
    messages = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    pinned_messages = serializers.SerializerMethodField()

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
            "pinned_messages",
            "messages",
        ]

    def get_messages(self, obj):
        include_messages = bool(self.context.get("include_messages"))
        if not include_messages:
            return []
        # Only the latest CONVERSATION_DETAIL_MESSAGE_LIMIT messages are embedded
        # (oldest -> newest). Older history: /conversations/<id>/messages/?page=N.
        return MessageSerializer(
            self._get_latest_messages(obj)[::-1],
            many=True,
            context=self.context,
        ).data

    def _get_latest_messages(self, obj):
        """Newest-first latest messages, loaded once per conversation."""
        if not hasattr(self, "_latest_messages_cache"):
            self._latest_messages_cache = {}
        cache = self._latest_messages_cache
        if obj.pk not in cache:
            cache[obj.pk] = list(
                with_message_relations(
                    obj.messages.order_by("-timestamp", "-id"),
                    get_request_user(self.context),
                )[:CONVERSATION_DETAIL_MESSAGE_LIMIT]
            )
        return cache[obj.pk]

    def get_last_message(self, obj):
        last_message_map = self.context.get("last_message_map")
        if last_message_map is not None:
            # The list view resolves every last message up front; a missing
            # entry means the conversation has no messages yet.
            mapped_last_message = last_message_map.get(obj.id)
            if mapped_last_message is None:
                return None
            return MessageSerializer(mapped_last_message, context=self.context).data

        if self.context.get("include_messages"):
            # Detail view: reuse the embedded messages instead of re-querying.
            latest_messages = self._get_latest_messages(obj)
            last_message = latest_messages[0] if latest_messages else None
        else:
            # Retrieve the last message in the conversation
            last_message = with_message_relations(
                obj.messages.order_by("-timestamp", "-id"),
                get_request_user(self.context),
            ).first()
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

    def get_pinned_messages(self, obj):
        include_messages = bool(self.context.get("include_messages"))
        include_pinned_messages = bool(self.context.get("include_pinned_messages"))
        if not include_messages and not include_pinned_messages:
            return []

        pinned_messages = with_message_relations(
            obj.messages.filter(pinned_at__isnull=False).order_by("-pinned_at", "-id"),
            get_request_user(self.context),
        )
        return MessageSerializer(
            pinned_messages,
            many=True,
            context=self.context,
        ).data
