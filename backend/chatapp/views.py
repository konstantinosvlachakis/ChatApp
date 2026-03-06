from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from .models import Token, Profile
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Conversation, Message, MessageTranslation, MessageReaction
from .serializers import MessageSerializer
from .serializers import ConversationSerializer
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
from django.db.models import Q
from django.core.files.storage import default_storage
import os
import uuid
from urllib.parse import urlencode
from urllib.request import urlopen
import urllib.error
import hashlib
import re
from django.core.cache import cache
from django.core.paginator import EmptyPage, Paginator
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone

ALLOWED_REACTION_EMOJIS = {"👍", "❤️", "😂", "😮", "😢", "🙏"}
PROFILE_LIST_CACHE_VERSION_KEY = "profile_data:version"
PROFILE_LIST_CACHE_TIMEOUT_SECONDS = 30
PROFILE_LIST_DEFAULT_PAGE_SIZE = 24
PROFILE_LIST_MAX_PAGE_SIZE = 100
PROFILE_CACHE_VERSION_KEY_TEMPLATE = "profile:version:user:{user_id}"
PROFILE_CACHE_TIMEOUT_SECONDS = 60 * 5


def get_profile_list_cache_version():
    version = cache.get(PROFILE_LIST_CACHE_VERSION_KEY)
    if version is None:
        version = 1
        cache.set(PROFILE_LIST_CACHE_VERSION_KEY, version, None)
    return int(version)


def bump_profile_list_cache_version():
    try:
        cache.incr(PROFILE_LIST_CACHE_VERSION_KEY)
    except ValueError:
        cache.set(PROFILE_LIST_CACHE_VERSION_KEY, 2, None)
    except Exception:
        # Best-effort invalidation.
        pass


def get_profile_cache_version(user_id):
    key = PROFILE_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
    version = cache.get(key)
    if version is None:
        version = 1
        cache.set(key, version, None)
    return int(version)


def bump_profile_cache_version(user_id):
    key = PROFILE_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 2, None)
    except Exception:
        # Best-effort invalidation.
        pass


def build_media_url(request, path):
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

    media_url = request.build_absolute_uri(f"{settings.MEDIA_URL}{normalized}")
    if request.get_host().endswith(
        ("herokuapp.com", "langvoyage.com", "www.langvoyage.com")
    ):
        media_url = media_url.replace("http://", "https://", 1)
    return media_url


def broadcast_message_status_update(conversation_id, message_ids, status_value, actor_id):
    if not message_ids:
        return
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    async_to_sync(channel_layer.group_send)(
        str(conversation_id),
        {
            "type": "message_status_event",
            "message_ids": message_ids,
            "status": status_value,
            "actor_id": actor_id,
        },
    )


def broadcast_conversation_update(user_ids, conversation_id, trigger, actor_id=None):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    normalized_user_ids = {int(user_id) for user_id in (user_ids or []) if user_id}
    if not normalized_user_ids:
        return

    payload = {
        "type": "conversation_update_event",
        "conversation_id": conversation_id,
        "trigger": trigger,
        "actor_id": actor_id,
    }
    for user_id in normalized_user_ids:
        async_to_sync(channel_layer.group_send)(f"presence_user_{user_id}", payload)


@csrf_exempt
def login_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            email = data.get("email")
            password = data.get("password")

            if not email or not password:
                return JsonResponse(
                    {"error": "Email and password required"}, status=400
                )

            # Retrieve the user from the Profile model
            user = Profile.objects.filter(email=email).first()

            # Check if the user exists and if the password is correct
            if user and user.check_password(password):
                # Create or retrieve the token
                token, _ = Token.objects.get_or_create(user=user)
                return JsonResponse({"token": token.key}, status=200)
            else:
                return JsonResponse({"error": "Invalid credentials"}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@csrf_exempt
def register_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            # Extract data from request
            username = data.get("username")
            password = data.get("password")
            native_language = data.get("nativeLanguage")
            email = data.get("email")
            date_of_birth = data.get("dateOfBirth")

            # Validate required fields
            if not username or not password or not native_language or not email:
                return JsonResponse(
                    {
                        "error": "Username, password, native language, and email are required"
                    },
                    status=400,
                )

            # Check if the username already exists
            if Profile.objects.filter(username=username).exists():
                return JsonResponse({"error": "Username already exists"}, status=400)

            # Check if the email already exists
            if Profile.objects.filter(email=email).exists():
                return JsonResponse({"error": "Email already exists"}, status=400)

            # Create the new user
            user = Profile.objects.create_user(
                username=username,
                password=password,
                native_language=native_language,
                email=email,
                date_of_birth=date_of_birth,
            )
            bump_profile_list_cache_version()

            return JsonResponse({"message": "User registered successfully"}, status=201)

        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user
    if request.method == "GET":
        cache_version = get_profile_cache_version(user.id)
        cache_key = (
            f"profile:v{cache_version}:user:{user.id}:"
            f"host:{request.get_host()}"
        )
        cached_payload = cache.get(cache_key)
        if cached_payload:
            return JsonResponse(cached_payload, status=200)

    profile_data = {
        "user_id": user.id,
        "username": user.username,
        "age": user.age,
        "location": user.location or "",
        "location_updated_at": user.location_updated_at,
        "native_language": user.native_language,  # Include the native language
        "base_translate_language": user.base_translate_language,
        "languages_practicing": user.languages_practicing or [],
        "profile_image_url": build_media_url(request, user.profile_image_url),
        "complementary_image_1_url": build_media_url(
            request, user.complementary_image_1_url
        ),
        "complementary_image_2_url": build_media_url(
            request, user.complementary_image_2_url
        ),
        "date_of_birth": user.date_of_birth,  # Include the date of birth
        "email": user.email,  # Include the email
    }
    if request.method == "GET":
        cache.set(cache_key, profile_data, PROFILE_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(profile_data, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def profile_data_view(request):
    page_param = request.query_params.get("page", "1")
    page_size_param = request.query_params.get(
        "page_size", str(PROFILE_LIST_DEFAULT_PAGE_SIZE)
    )
    match_only_param = request.query_params.get("match_only", "0")
    match_only = str(match_only_param).lower() in {"1", "true", "yes"}

    try:
        page = max(int(page_param), 1)
    except (TypeError, ValueError):
        page = 1

    try:
        page_size = int(page_size_param)
    except (TypeError, ValueError):
        page_size = PROFILE_LIST_DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, PROFILE_LIST_MAX_PAGE_SIZE))

    cache_version = get_profile_list_cache_version()
    cache_key = (
        f"profile_data:v{cache_version}:user:{request.user.id}:"
        f"page:{page}:size:{page_size}:match_only:{int(match_only)}"
    )
    cached_payload = cache.get(cache_key)
    if cached_payload:
        return JsonResponse(cached_payload, status=200)

    profiles_qs = Profile.objects.exclude(id=request.user.id)
    if match_only:
        practicing_languages = getattr(request.user, "languages_practicing", []) or []
        normalized_languages = [
            str(language).strip()
            for language in practicing_languages
            if isinstance(language, str) and str(language).strip()
        ]
        if not normalized_languages:
            fallback_language = (request.user.base_translate_language or "").strip()
            if fallback_language:
                normalized_languages = [fallback_language]

        language_filter = Q()
        for language in normalized_languages:
            language_filter |= Q(native_language__iexact=language)
        profiles_qs = profiles_qs.filter(language_filter)

    profiles_qs = profiles_qs.order_by("username").only(
        "username", "native_language", "languages_practicing", "profile_image_url"
    )
    paginator = Paginator(profiles_qs, page_size)

    if paginator.num_pages == 0 or page > paginator.num_pages:
        payload = {
            "profiles": [],
            "pagination": {
                "page": page if paginator.num_pages else 1,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
                "total_count": paginator.count,
                "has_next": False,
                "has_previous": page > 1 and paginator.num_pages > 0,
            },
        }
        cache.set(cache_key, payload, PROFILE_LIST_CACHE_TIMEOUT_SECONDS)
        return JsonResponse(payload, status=200)

    try:
        page_obj = paginator.page(page)
    except EmptyPage:
        page_obj = paginator.page(1)

    profile_data = [
        {
            "username": profile.username,
            "native_language": profile.native_language,
            "languages_practicing": profile.languages_practicing or [],
            "profile_image_url": build_media_url(request, profile.profile_image_url),
        }
        for profile in page_obj
    ]

    current_page = page_obj.number
    payload = {
        "profiles": profile_data,
        "pagination": {
            "page": current_page,
            "page_size": page_size,
            "total_pages": paginator.num_pages,
            "total_count": paginator.count,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
        },
    }
    cache.set(cache_key, payload, PROFILE_LIST_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(payload, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def public_profile_view(request, username):
    profile = get_object_or_404(Profile, username=username)
    cache_version = get_profile_cache_version(profile.id)
    cache_key = (
        f"public_profile:v{cache_version}:user:{profile.id}:"
        f"host:{request.get_host()}"
    )
    cached_payload = cache.get(cache_key)
    if cached_payload:
        return JsonResponse(cached_payload, status=200)

    profile_data = {
        "user_id": profile.id,
        "username": profile.username,
        "age": profile.age,
        "native_language": profile.native_language,
        "languages_practicing": profile.languages_practicing or [],
        "profile_image_url": build_media_url(request, profile.profile_image_url),
        "complementary_image_1_url": build_media_url(
            request, profile.complementary_image_1_url
        ),
        "complementary_image_2_url": build_media_url(
            request, profile.complementary_image_2_url
        ),
        "bio": "Passionate about language exchange and cultural learning.",
        "learning_goal": "Improve fluency through daily conversations.",
        "reviews": [],
    }
    cache.set(cache_key, profile_data, PROFILE_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(profile_data, status=200)


@api_view(["PATCH"])
# @permission_classes([IsAuthenticated])
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        user = request.user

        # Update fields if they are present in the request body
        username = data.get("username")
        native_language = data.get("native_language")
        base_translate_language = data.get("base_translate_language")
        languages_practicing = data.get("languages_practicing")
        profile_image_url = data.get(
            "profile_image_url"
        )  # Include profile image URL if necessary

        # Update only if data is provided
        if username:
            user.username = username
        if native_language:
            user.native_language = native_language
        if base_translate_language:
            user.base_translate_language = base_translate_language
        if languages_practicing is not None:
            if not isinstance(languages_practicing, list):
                return JsonResponse(
                    {"error": "languages_practicing must be a list of strings"},
                    status=400,
                )

            cleaned_languages = []
            for language in languages_practicing:
                if isinstance(language, str):
                    value = language.strip()
                    if value:
                        cleaned_languages.append(value)
            user.languages_practicing = cleaned_languages
        if profile_image_url:
            user.profile_image_url = profile_image_url  # Update profile image URL

        # Save the updated user object
        user.save()
        bump_profile_list_cache_version()
        bump_profile_cache_version(user.id)

        # Return the updated user data
        return JsonResponse(
            {
                "message": "Profile updated successfully",
                "updated_profile": {
                    "username": user.username,
                    "native_language": user.native_language,
                    "base_translate_language": user.base_translate_language,
                    "languages_practicing": user.languages_practicing or [],
                    "profile_image_url": (
                        user.profile_image_url or None
                    ),
                },
            },
            status=200,
        )

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON format"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def profile_location_update_view(request):
    user = request.user
    city = str(request.data.get("city", "")).strip()
    country = str(request.data.get("country", "")).strip()
    explicit_location = str(request.data.get("location", "")).strip()

    if explicit_location:
        location_value = explicit_location
    elif city and country:
        location_value = f"{city}, {country}"
    elif city:
        location_value = city
    elif country:
        location_value = country
    else:
        return JsonResponse(
            {"error": "At least one of location, city, or country is required."},
            status=400,
        )

    update_fields = ["location", "location_updated_at"]
    user.location = location_value[:255]
    user.location_updated_at = timezone.now()

    user.save(update_fields=update_fields)
    bump_profile_cache_version(user.id)

    return JsonResponse(
        {
            "location": user.location,
            "location_updated_at": user.location_updated_at,
        },
        status=200,
    )


class MessageListView(APIView):
    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
        )
        if request.user.id not in (conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "You are not a participant in this conversation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        messages_to_deliver = (
            Message.objects.filter(conversation=conversation)
            .exclude(sender=request.user)
            .filter(status="sent")
        )
        delivered_ids = list(messages_to_deliver.values_list("id", flat=True))
        if delivered_ids:
            messages_to_deliver.update(status="delivered")
            broadcast_message_status_update(
                conversation.id, delivered_ids, "delivered", request.user.id
            )

        # Fetch all messages in the conversation
        messages = conversation.messages.all()
        serializer = MessageSerializer(messages, many=True, context={"request": request})
        return Response(serializer.data)

    parser_classes = (MultiPartParser, FormParser)  # Allow handling of file uploads

    def post(self, request, conversation_id):
        # Fetch conversation where the user is the sender
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
        )
        # Extract text and file from the request
        text = request.data.get("text", "").strip()
        attachment = request.FILES.get("attachment")
        reply_to_id = request.data.get("reply_to")
        reply_to_message = None

        # Validate: at least text or attachment should be provided
        if not text and not attachment:
            return Response(
                {"error": "Message content or attachment is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if reply_to_id not in (None, ""):
            try:
                parsed_reply_to_id = int(reply_to_id)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Invalid reply_to message id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            reply_to_message = Message.objects.filter(
                id=parsed_reply_to_id, conversation=conversation
            ).first()
            if not reply_to_message:
                return Response(
                    {"error": "Reply target message not found in this conversation"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Create a new message
        message = Message.objects.create(
            conversation=conversation,
            text=text,
            sender=request.user,
            reply_to=reply_to_message,
            attachment=attachment,  # Save the file if provided
        )
        broadcast_conversation_update(
            [conversation.sender_id, conversation.receiver_id],
            conversation.id,
            "message_created",
            actor_id=request.user.id,
        )

        # Serialize and return the new message
        serializer = MessageSerializer(message, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessageDeleteView(APIView):
    def delete(self, request, message_id):
        message = get_object_or_404(Message, id=message_id, sender=request.user)
        message.delete()
        return Response(
            {"message": "Message deleted successfully"}, status=status.HTTP_200_OK
        )


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]  # Ensure only authenticated users can access

    def get(self, request, conversation_id):
        """
        Retrieve a specific conversation by ID.
        """
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if request.user.id not in (conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "You are not a participant in this conversation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        messages_to_deliver = (
            Message.objects.filter(conversation=conversation)
            .exclude(sender=request.user)
            .filter(status="sent")
        )
        delivered_ids = list(messages_to_deliver.values_list("id", flat=True))
        if delivered_ids:
            messages_to_deliver.update(status="delivered")
            broadcast_message_status_update(
                conversation.id, delivered_ids, "delivered", request.user.id
            )

        serializer = ConversationSerializer(conversation, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        conversation.delete()
        return Response(
            {"message": "Conversation deleted successfully"}, status=status.HTTP_200_OK
        )


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(
            Q(sender=request.user) | Q(receiver=request.user)
        )
        messages_to_deliver = (
            Message.objects.filter(conversation__in=conversations)
            .exclude(sender=request.user)
            .filter(status="sent")
        )
        updates_by_conversation = {}
        for message_id, conv_id in messages_to_deliver.values_list("id", "conversation_id"):
            updates_by_conversation.setdefault(conv_id, []).append(message_id)

        if updates_by_conversation:
            messages_to_deliver.update(status="delivered")
            for conv_id, message_ids in updates_by_conversation.items():
                broadcast_message_status_update(
                    conv_id, message_ids, "delivered", request.user.id
                )

        serializer = ConversationSerializer(
            conversations, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request):
        """
        Handle creating a new conversation or retrieving an existing one.
        """
        user = request.user  # Get authenticated user
        participant_username = request.data.get(
            "participant"
        )  # Get username from request

        if not participant_username:
            return Response({"error": "Missing participant username"}, status=400)

        try:
            participant = Profile.objects.get(username=participant_username)
        except Profile.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # Check if a conversation already exists between the two users
        conversation = Conversation.objects.filter(
            Q(sender=user, receiver=participant) | Q(sender=participant, receiver=user)
        ).first()

        if not conversation:
            # Create a new conversation
            conversation = Conversation.objects.create(
                sender=user, receiver=participant
            )

        return Response({"id": conversation.id})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def mark_conversation_read_view(request, conversation_id):
    conversation = get_object_or_404(
        Conversation,
        id=conversation_id,
    )

    if request.user.id not in (conversation.sender_id, conversation.receiver_id):
        return Response(
            {"error": "You are not a participant in this conversation."},
            status=status.HTTP_403_FORBIDDEN,
        )

    messages_to_mark = (
        Message.objects.filter(conversation=conversation)
        .exclude(sender=request.user)
        .exclude(status="read")
    )
    read_ids = list(messages_to_mark.values_list("id", flat=True))
    updated = 0
    if read_ids:
        updated = messages_to_mark.update(status="read")
        broadcast_message_status_update(
            conversation.id, read_ids, "read", request.user.id
        )
        broadcast_conversation_update(
            [conversation.sender_id, conversation.receiver_id],
            conversation.id,
            "messages_read",
            actor_id=request.user.id,
        )

    return Response({"updated": updated}, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_profile_image(request, user_id):
    if request.user.id != int(user_id):
        return Response(
            {"error": "You can only update your own profile image."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        profile = Profile.objects.get(id=user_id)
    except Profile.DoesNotExist:
        return Response(
            {"error": "Profile not found."}, status=status.HTTP_404_NOT_FOUND
        )
    if "profile_image" in request.FILES:
        image_file = request.FILES["profile_image"]
        slot = request.data.get("slot", "profile")

        ext = os.path.splitext(image_file.name)[1] or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        path = default_storage.save(f"profile_images/{filename}", image_file)

        if slot == "complementary_1":
            profile.complementary_image_1_url = path
        elif slot == "complementary_2":
            profile.complementary_image_2_url = path
        else:
            profile.profile_image_url = path

        profile.save()
        bump_profile_list_cache_version()
        bump_profile_cache_version(profile.id)
        return Response(
            {
                "message": "Profile image updated successfully.",
                "slot": slot,
                "profile_image_url": build_media_url(request, profile.profile_image_url),
                "complementary_image_1_url": build_media_url(
                    request, profile.complementary_image_1_url
                ),
                "complementary_image_2_url": build_media_url(
                    request, profile.complementary_image_2_url
                ),
            },
            status=status.HTTP_200_OK,
        )

    return Response(
        {"error": "No image file found."}, status=status.HTTP_400_BAD_REQUEST
    )


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


def normalize_translation_text(text):
    return re.sub(r"\s+", " ", text).strip()


def build_translation_cache_key(text, target_language):
    normalized_text = normalize_translation_text(text)
    content_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
    return f"translate:v1:google:auto->{target_language}:{content_hash}"


def languages_match(source_language, target_language):
    src = (source_language or "").strip().lower()
    tgt = (target_language or "").strip().lower()
    if not src or not tgt:
        return False

    return src == tgt or src.split("-")[0] == tgt.split("-")[0]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def translate_message_view(request):
    message_id = request.data.get("message_id")
    text = (request.data.get("text") or "").strip()
    target_language = resolve_language_code(request.data.get("target_language"))
    message = None

    if message_id:
        message = get_object_or_404(Message, id=message_id)
        participants = {message.conversation.sender_id, message.conversation.receiver_id}
        if request.user.id not in participants:
            return Response(
                {"error": "You do not have access to this message."},
                status=status.HTTP_403_FORBIDDEN,
            )
        text = (message.text or "").strip()

        existing_translation = MessageTranslation.objects.filter(
            message=message,
            user=request.user,
            target_language=target_language,
        ).first()
        if existing_translation:
            return Response(
                {
                    "error": "Message already translated for this language.",
                    "already_translated": True,
                    "translated_text": existing_translation.translated_text,
                    "source_language": existing_translation.source_language,
                    "target_language": target_language,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if not text:
        return Response({"error": "Text is required."}, status=status.HTTP_400_BAD_REQUEST)

    normalized_text = normalize_translation_text(text)
    cache_key = build_translation_cache_key(normalized_text, target_language)

    try:
        cached_result = cache.get(cache_key)
        if cached_result:
            if languages_match(cached_result.get("source_language"), target_language):
                if message:
                    MessageTranslation.objects.update_or_create(
                        message=message,
                        user=request.user,
                        target_language=target_language,
                        defaults={
                            "source_language": cached_result.get("source_language", "auto"),
                            "translated_text": normalized_text,
                        },
                    )
                return Response(
                    {
                        "error": "Message is already in the selected base language.",
                        "same_language": True,
                        "source_language": cached_result.get("source_language"),
                        "target_language": target_language,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if message:
                MessageTranslation.objects.update_or_create(
                    message=message,
                    user=request.user,
                    target_language=target_language,
                    defaults={
                        "source_language": cached_result.get("source_language", "auto"),
                        "translated_text": cached_result.get("translated_text", ""),
                    },
                )

            return Response(
                {
                    **cached_result,
                    "cached": True,
                },
                status=status.HTTP_200_OK,
            )
    except Exception:
        # Cache should be best-effort and never block translation.
        cached_result = None

    try:
        query = urlencode(
            {
                "client": "gtx",
                "sl": "auto",
                "tl": target_language,
                "dt": "t",
                "q": normalized_text,
            }
        )
        url = f"https://translate.googleapis.com/translate_a/single?{query}"
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))

        translated_chunks = payload[0] if isinstance(payload, list) and payload else []
        translated_text = "".join(
            chunk[0] for chunk in translated_chunks if isinstance(chunk, list) and chunk
        ).strip()
        source_language = payload[2] if isinstance(payload, list) and len(payload) > 2 else "auto"

        if not translated_text:
            return Response(
                {"error": "Translation service returned an empty response."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if languages_match(source_language, target_language):
            if message:
                MessageTranslation.objects.update_or_create(
                    message=message,
                    user=request.user,
                    target_language=target_language,
                    defaults={
                        "source_language": source_language,
                        "translated_text": normalized_text,
                    },
                )
            return Response(
                {
                    "error": "Message is already in the selected base language.",
                    "same_language": True,
                    "source_language": source_language,
                    "target_language": target_language,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = {
            "translated_text": translated_text,
            "source_language": source_language,
            "target_language": target_language,
        }
        try:
            cache.set(cache_key, result, timeout=60 * 60 * 24 * 30)  # 30 days
        except Exception:
            pass

        if message:
            MessageTranslation.objects.update_or_create(
                message=message,
                user=request.user,
                target_language=target_language,
                defaults={
                    "source_language": source_language,
                    "translated_text": translated_text,
                },
            )

        return Response(
            {
                **result,
                "cached": False,
            },
            status=status.HTTP_200_OK,
        )
    except urllib.error.URLError:
        return Response(
            {"error": "Translation service is currently unavailable."},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def react_to_message_view(request, message_id):
    message = get_object_or_404(Message, id=message_id)
    participants = {message.conversation.sender_id, message.conversation.receiver_id}
    if request.user.id not in participants:
        return Response(
            {"error": "You do not have access to this message."},
            status=status.HTTP_403_FORBIDDEN,
        )

    emoji = (request.data.get("emoji") or "").strip()

    if not emoji:
        MessageReaction.objects.filter(message=message, user=request.user).delete()
    else:
        if emoji not in ALLOWED_REACTION_EMOJIS:
            return Response(
                {"error": "Unsupported reaction."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        MessageReaction.objects.update_or_create(
            message=message,
            user=request.user,
            defaults={"emoji": emoji},
        )

    serializer = MessageSerializer(message, context={"request": request})
    serialized_message = serializer.data

    channel_layer = get_channel_layer()
    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            str(message.conversation_id),
            {
                "type": "message_reaction_event",
                "message": serialized_message,
            },
        )

    return Response(serialized_message, status=status.HTTP_200_OK)
