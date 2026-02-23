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
from .models import Conversation, Message, MessageTranslation
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


def build_media_url(request, path):
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

    return request.build_absolute_uri(f"{settings.MEDIA_URL}{normalized}")


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
    profile_data = {
        "user_id": user.id,
        "username": user.username,
        "age": user.age,
        "native_language": user.native_language,  # Include the native language
        "base_translate_language": user.base_translate_language,
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
    return JsonResponse(profile_data, status=200)


@api_view(["GET"])
def profile_data_view(request):
    current_user_username = request.user.username  # Get the current user's username

    # Exclude the current user's profile
    profiles = Profile.objects.exclude(username=current_user_username)

    profile_data = [
        {
            "username": profile.username,
            "native_language": profile.native_language,
            "profile_image_url": (
                profile.profile_image_url if profile.profile_image_url else None
            ),
        }
        for profile in profiles
    ]

    return JsonResponse({"profiles": profile_data}, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def public_profile_view(request, username):
    profile = get_object_or_404(Profile, username=username)

    profile_data = {
        "user_id": profile.id,
        "username": profile.username,
        "age": profile.age,
        "native_language": profile.native_language,
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
        if profile_image_url:
            user.profile_image_url = profile_image_url  # Update profile image URL

        # Save the updated user object
        user.save()

        # Return the updated user data
        return JsonResponse(
            {
                "message": "Profile updated successfully",
                "updated_profile": {
                    "username": user.username,
                    "native_language": user.native_language,
                    "base_translate_language": user.base_translate_language,
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


class MessageListView(APIView):
    def get(self, request, conversation_id):
        # Fetch conversation where the user is either the sender or receiver
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            sender=request.user,  # Update this condition if receiver is also valid
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

        # Validate: at least text or attachment should be provided
        if not text and not attachment:
            return Response(
                {"error": "Message content or attachment is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create a new message
        message = Message.objects.create(
            conversation=conversation,
            text=text,
            sender=request.user,
            attachment=attachment,  # Save the file if provided
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
