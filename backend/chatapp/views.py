from django.http import Http404, JsonResponse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import MultipleObjectsReturned, ValidationError
from django.core.validators import validate_email
import logging
from urllib.parse import urlparse
from .models import Profile
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import (
    BlockedUser,
    Conversation,
    ConversationParticipant,
    Follow,
    Message,
    MessageTranslation,
    MessageReaction,
    PracticeStats,
    ProfileView,
    PushDevice,
    UserReport,
)
from .giphy import GiphyUnavailable, GiphyUpstreamError, resolve_gif, search_gifs
from .stickers import parse_sticker_ref, sticker_packs_payload
from .push import (
    PUSH_PLATFORMS,
    is_valid_expo_push_token,
    schedule_follow_push,
    schedule_group_message_push,
    schedule_message_push,
)
from .conversation_members import (
    can_access_message,
    conversation_member_ids,
    create_direct_conversation,
    direct_conversations_q,
    get_membership,
    group_conversations_q,
    group_display_name,
    is_conversation_member,
    visible_messages,
)
from . import people_filters
from .serializers import MessageSerializer
from .serializers import ConversationSerializer
from .serializers import (
    PROFILE_SUMMARY_FIELDS,
    message_broadcast_payload,
    reload_message_for_serializer,
    with_message_relations,
)
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
from django.db import DatabaseError, IntegrityError, OperationalError, connections
from django.db.models import IntegerField, Prefetch, Q, prefetch_related_objects
from django.db.models import Case, Count, Exists, F, OuterRef, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.core.files.storage import default_storage
import os
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import urllib.error
import http.client
import hashlib
import re
import random
from datetime import datetime
from django.core.cache import cache
from django.core.paginator import EmptyPage, Paginator
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from core.cache import cache_degraded
from core.realtime import broadcast
from django.utils import timezone
from django.db import transaction
from .gemini import (
    COACH_MODES,
    CoachAIError,
    CoachAIQuotaError,
    generate_coach_reply,
    generate_practice_challenge,
)
from .throttles import (
    CONVERSATION_CREATE_THROTTLES,
    FOLLOW_THROTTLES,
    UPLOAD_THROTTLES,
    AuthRateThrottle,
    BlockRateThrottle,
    ChatOpenersRateThrottle,
    GifsRateThrottle,
    MessageSendDailyRateThrottle,
    MessageSendRateThrottle,
    PeopleRateThrottle,
    PracticeSubmitRateThrottle,
    PublicProfileRateThrottle,
    PushDeviceRateThrottle,
    ReactionRateThrottle,
    RegisterRateThrottle,
    ReportRateThrottle,
    TranslateDailyRateThrottle,
    TranslateRateThrottle,
    VoiceCompleteRateThrottle,
    VoiceNextRateThrottle,
    check_throttles,
    with_default_throttles,
)
from core.exceptions import error_response
from .tokens import (
    REMEMBER_ME_CLAIM,
    SESSION_ID_CLAIM,
    issue_token_pair,
    revoke_user_tokens,
)
from .email_verification import EMAIL_UNVERIFIED_CODE, RequireVerifiedEmail, send_verification_email
from .practice_library import PRACTICE_LIBRARY
from .practice_progress import (
    challenge_bucket,
    clamp_bucket,
    current_bucket,
    get_language_progress,
    practice_bucket_for_level,  # noqa: F401  (re-exported: prewarm command, tests)
    practice_level_from_xp,
    record_practice_result,
    serialize_language_progress,
)
from .practice_library.voice import (
    VOICE_LIBRARY,
    parse_voice_sentence_id,
    voice_sentence_id,
    voice_word_count,
)

logger = logging.getLogger(__name__)

def is_reaction_emoji(value):
    """Accept one Unicode emoji sequence, including flags, skin tones and ZWJ forms."""
    if not value or len(value) > 16:
        return False
    if value[-1] == "\u20e3":
        return value[0] in "#*0123456789" and value[1:-1] in ("", "\ufe0f")
    bases = 0
    joined = 0
    regional = 0
    for character in value:
        codepoint = ord(character)
        if codepoint == 0x200D:
            joined += 1
        elif 0x1F3FB <= codepoint <= 0x1F3FF or codepoint in (0x20E3, 0xFE0E, 0xFE0F):
            continue
        elif 0x1F1E6 <= codepoint <= 0x1F1FF:
            regional += 1
        elif (0x1F000 <= codepoint <= 0x1FAFF or 0x2100 <= codepoint <= 0x27BF
              or 0x2900 <= codepoint <= 0x2BFF or codepoint in (0x00A9, 0x00AE, 0x3030, 0x303D, 0x3297, 0x3299)):
            bases += 1
        else:
            return False
    return (regional == 2 and bases == joined == 0) or (regional == 0 and bases > 0 and bases == joined + 1)
PROFILE_LIST_CACHE_VERSION_KEY = "profile_data:version"
PROFILE_LIST_CACHE_TIMEOUT_SECONDS = 30
PROFILE_LIST_DEFAULT_PAGE_SIZE = 24
PROFILE_LIST_MAX_PAGE_SIZE = 100
# all: everyone ranked by score; reciprocal: Perfect exchange; teaches_me: native
# speakers of a language I practise; learns_mine: people practising a language I speak.
PROFILE_MATCH_MODES = {"all", "reciprocal", "teaches_me", "learns_mine"}
PRACTICE_LEVELS = {"beginner", "intermediate", "advanced", "fluent"}
PROFILE_CACHE_VERSION_KEY_TEMPLATE = "profile:version:user:{user_id}"
PROFILE_CACHE_TIMEOUT_SECONDS = 60 * 5
CONVERSATION_LIST_CACHE_VERSION_KEY_TEMPLATE = (
    "conversation_list:version:user:{user_id}"
)
CONVERSATION_LIST_CACHE_TIMEOUT_SECONDS = 20
# Bumped for both people on follow/unfollow/block: the People list cache key
# embeds it, so `is_following` / `follows_you` / `following=1` are never stale.
FOLLOW_CACHE_VERSION_KEY_TEMPLATE = "follow:version:user:{user_id}"
# A follow notifies the followed person at most once per pair in this window
# (unfollow + follow again doesn't re-notify). The cache fails open, so during a
# Redis outage a repeat follow can notify again.
FOLLOW_NOTIFY_KEY_TEMPLATE = "follow:notified:v1:{follower_id}:{following_id}"
FOLLOW_NOTIFY_INTERVAL_SECONDS = 60 * 60 * 24
FOLLOWING_LIST_DEFAULT_PAGE_SIZE = 24
PRACTICE_XP_CORRECT = 15
PRACTICE_XP_WRONG = 3
PRACTICE_POINTS_CORRECT = 10
PRACTICE_POINTS_WRONG = 1
# How long a scored challenge id stays "used" for a user (cleared when the challenge
# endpoint serves that id to them again). Matches the other practice keys (36 h).
PRACTICE_SCORED_TTL_SECONDS = 60 * 60 * 36
PRACTICE_GENERATOR_ENABLED = (
    os.environ.get("PRACTICE_GENERATOR_ENABLED", "false").lower() == "true"
)
PRACTICE_GENERATOR_PROVIDER = (
    os.environ.get("PRACTICE_GENERATOR_PROVIDER", "huggingface").strip().lower()
)
PRACTICE_GENERATOR_MODE = (
    os.environ.get("PRACTICE_GENERATOR_MODE", "hybrid").strip().lower()
)
PRACTICE_GENERATOR_TIMEOUT_SECONDS = int(
    os.environ.get("PRACTICE_GENERATOR_TIMEOUT_SECONDS", "12")
)
PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT = int(
    os.environ.get("PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT", "20")
)


def get_profile_by_username_or_404(username):
    try:
        return Profile.objects.get(username__iexact=username)
    except Profile.DoesNotExist:
        raise Http404("No Profile matches the given query.")
    except MultipleObjectsReturned:
        # Fall back to a stable record when legacy case-variant duplicates exist.
        profile = Profile.objects.filter(username__iexact=username).order_by("id").first()
        if profile is None:
            raise Http404("No Profile matches the given query.")
        return profile
PRACTICE_DAILY_LIBRARY_SIZE = int(os.environ.get("PRACTICE_DAILY_LIBRARY_SIZE", "20"))
PRACTICE_DAILY_LIBRARY_MIN_READY = int(
    os.environ.get("PRACTICE_DAILY_LIBRARY_MIN_READY", "8")
)
COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS = int(
    os.environ.get("COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS", "60")
)
COACH_CHAT_RATE_LIMIT_REQUESTS = int(
    os.environ.get("COACH_CHAT_RATE_LIMIT_REQUESTS", "12")
)
COACH_CHAT_DAILY_LIMIT = int(os.environ.get("COACH_CHAT_DAILY_LIMIT", "200"))
# All users together, per UTC day: caps the Gemini bill if many accounts are used.
COACH_GLOBAL_DAILY_LIMIT = int(os.environ.get("COACH_GLOBAL_DAILY_LIMIT", "5000"))
# Practice XP a user can earn per UTC day (answers still count once it is reached).
PRACTICE_DAILY_XP_LIMIT = int(os.environ.get("PRACTICE_DAILY_XP_LIMIT", "500"))
# Voice Repeat: XP/points per passed sentence (once per sentence per UTC day) and
# how many voice awards a user can earn per UTC day (inside PRACTICE_DAILY_XP_LIMIT).
PRACTICE_VOICE_XP = int(os.environ.get("PRACTICE_VOICE_XP", "5"))
PRACTICE_VOICE_POINTS = int(os.environ.get("PRACTICE_VOICE_POINTS", "2"))
PRACTICE_VOICE_DAILY_AWARDS = int(os.environ.get("PRACTICE_VOICE_DAILY_AWARDS", "10"))
COACH_CHAT_MAX_MESSAGE_LENGTH = int(
    os.environ.get("COACH_CHAT_MAX_MESSAGE_LENGTH", "2000")
)
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@langvoyage.app")

# Input size limits (abuse / DoS protection).
MESSAGE_MAX_LENGTH = int(os.environ.get("MESSAGE_MAX_LENGTH", "5000"))
TRANSLATION_MAX_LENGTH = int(os.environ.get("TRANSLATION_MAX_LENGTH", "5000"))
PROFILE_TEXT_MAX_LENGTH = 2000
PROFILE_LANGUAGE_MAX_LENGTH = 50
PROFILE_MAX_PRACTICE_LANGUAGES = 20
USERNAME_PATTERN = re.compile(r"^[\w.@+-]{1,30}$")
MESSAGE_ATTACHMENT_MAX_BYTES = int(
    os.environ.get("MESSAGE_ATTACHMENT_MAX_BYTES", str(25 * 1024 * 1024))
)
PROFILE_IMAGE_MAX_BYTES = int(
    os.environ.get("PROFILE_IMAGE_MAX_BYTES", str(10 * 1024 * 1024))
)
# Uploads are served from our own origin, so only allow inert media types and
# always pick the stored extension ourselves (never e.g. .html or .svg).
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/pjpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
ALLOWED_ATTACHMENT_TYPES = {
    **ALLOWED_IMAGE_TYPES,
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
}


def release_db_connection():
    """Give the request's DB connections back before a slow outside call.

    With the psycopg pool (production) closing returns the connection to the
    pool, so a request waiting on Gemini/Google/Cloudinary no longer holds one
    of the few pooled connections. Django reopens lazily on the next query.
    Connections inside a transaction are left alone (closing would break it).
    """
    for conn in connections.all(initialized_only=True):
        if conn.in_atomic_block:
            continue
        conn.close()


# ISO base media (MP4/MOV/M4A/HEIC) files start with a box: 4-byte size + type.
_ISO_BMFF_LEADING_BOXES = {b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot"}
_HEIF_BRANDS = {
    b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"hevm", b"hevs",
    b"mif1", b"msf1", b"avif",
}


def _is_jpeg(head):
    return head.startswith(b"\xff\xd8\xff")


def _is_png(head):
    return head.startswith(b"\x89PNG\r\n\x1a\n")


def _is_gif(head):
    return head[:6] in (b"GIF87a", b"GIF89a")


def _is_webp(head):
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def _is_heif(head):
    return head[4:8] == b"ftyp" and head[8:12] in _HEIF_BRANDS


def _is_iso_bmff(head):
    return head[4:8] in _ISO_BMFF_LEADING_BOXES


def _is_ebml(head):  # WebM / Matroska
    return head.startswith(b"\x1a\x45\xdf\xa3")


def _is_ogg(head):
    return head.startswith(b"OggS")


def _is_mpeg_audio(head):  # MP3: ID3 tag or an MPEG frame sync
    return head.startswith(b"ID3") or (
        len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0
    )


def _is_wav(head):
    return head[:4] == b"RIFF" and head[8:12] == b"WAVE"


def _is_aac(head):  # ADTS frame sync, ADIF header, or an ID3-tagged stream
    return (
        head.startswith(b"ADIF")
        or head.startswith(b"ID3")
        or (len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xF6) == 0xF0)
    )


# The declared content type must match the file's first bytes, so a script or
# an HTML page can't be stored under an image/audio/video type. (Images are
# never decoded server-side: Pillow isn't installed; Cloudinary processes them.)
UPLOAD_SIGNATURE_CHECKS = {
    "image/jpeg": _is_jpeg,
    "image/jpg": _is_jpeg,
    "image/pjpeg": _is_jpeg,
    "image/png": _is_png,
    "image/gif": _is_gif,
    "image/webp": _is_webp,
    "image/heic": _is_heif,
    "image/heif": _is_heif,
    "video/mp4": _is_iso_bmff,
    "video/quicktime": _is_iso_bmff,
    "video/webm": _is_ebml,
    "audio/webm": _is_ebml,
    "audio/ogg": _is_ogg,
    "audio/mpeg": _is_mpeg_audio,
    "audio/mp3": _is_mpeg_audio,
    "audio/wav": _is_wav,
    "audio/x-wav": _is_wav,
    "audio/wave": _is_wav,
    "audio/mp4": _is_iso_bmff,
    "audio/x-m4a": _is_iso_bmff,
    "audio/aac": _is_aac,
}


def read_upload_head(uploaded_file, size=32):
    try:
        uploaded_file.seek(0)
        head = uploaded_file.read(size) or b""
        uploaded_file.seek(0)
    except Exception:
        return b""
    return head if isinstance(head, bytes) else b""


def validate_uploaded_file(uploaded_file, allowed_types, max_bytes):
    """Return (safe_extension, error_message)."""
    content_type = (getattr(uploaded_file, "content_type", "") or "").split(";")[0]
    content_type = content_type.strip().lower()
    if content_type not in allowed_types:
        return None, "Unsupported file type."
    if uploaded_file.size is None or uploaded_file.size > max_bytes:
        return None, f"File is too large (max {max_bytes // (1024 * 1024)} MB)."
    signature_check = UPLOAD_SIGNATURE_CHECKS.get(content_type)
    if signature_check is None or not signature_check(read_upload_head(uploaded_file)):
        return None, "The file content doesn't match its type."
    return allowed_types[content_type], None


def get_cloudinary_cloud_name():
    """The project's own Cloudinary cloud name (Cloudinary config, else the host
    part of the CLOUDINARY_URL env var); "" when Cloudinary isn't configured."""
    raw_url = os.environ.get("CLOUDINARY_URL", "")
    if not raw_url:
        return ""
    try:
        import cloudinary

        name = cloudinary.config().cloud_name
        if name:
            return str(name)
    except Exception:
        pass
    try:
        return urlparse(raw_url).hostname or ""
    except ValueError:
        return ""


def own_cloudinary_public_id(url):
    """Public id of an image URL in our own Cloudinary cloud, else None.

    https://res.cloudinary.com/<cloud>/image/upload/[<transforms>/][v123/]<id>.<ext>
    """
    cloud_name = get_cloudinary_cloud_name()
    if not cloud_name:
        return None
    try:
        parsed = urlparse(str(url or ""))
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or (parsed.hostname or "") != "res.cloudinary.com":
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 4 or parts[0] != cloud_name or parts[1] != "image" or parts[2] != "upload":
        return None
    rest = parts[3:]
    for index, part in enumerate(rest):
        if re.fullmatch(r"v\d+", part):
            rest = rest[index + 1 :]
            break
    if not rest:
        return None
    return os.path.splitext("/".join(rest))[0] or None


PROFILE_IMAGE_FIELDS = (
    "profile_image_url",
    "complementary_image_1_url",
    "complementary_image_2_url",
)


def delete_replaced_profile_image(old_value):
    """Best effort: remove a replaced profile image that no profile uses any more.

    Only files we stored are touched: uploads in our own Cloudinary cloud, or
    ``profile_images/`` in the default storage. Never the default avatar, never
    a file another slot or account still references. Call it after the new
    image is saved.
    """
    old_value = str(old_value or "").strip()
    default_avatar = Profile._meta.get_field("profile_image_url").default
    if not old_value or old_value == default_avatar:
        return False
    still_used = Q()
    for field in PROFILE_IMAGE_FIELDS:
        still_used |= Q(**{field: old_value})
    if Profile.objects.filter(still_used).exists():
        return False
    try:
        public_id = own_cloudinary_public_id(old_value)
        if public_id:
            from cloudinary.uploader import destroy as cloudinary_destroy

            cloudinary_destroy(public_id, invalidate=True, resource_type="image")
            return True
        if urlparse(old_value).scheme:
            # Some other absolute URL (legacy data): not ours to delete.
            return False
        name = old_value
        media_prefix = str(settings.MEDIA_URL or "/media/")
        if name.startswith(media_prefix):
            name = name[len(media_prefix) :]
        name = name.lstrip("/")
        if not name.startswith("profile_images/") or ".." in name or name == default_avatar:
            return False
        default_storage.delete(name)
        return True
    except Exception:
        logger.warning("Could not delete a replaced profile image")
        return False


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


def get_follow_cache_version(user_id):
    key = FOLLOW_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
    version = cache.get(key)
    if version is None:
        version = 1
        cache.set(key, version, None)
    return int(version)


def bump_follow_cache_version(*user_ids):
    for user_id in user_ids:
        key = FOLLOW_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 2, None)
        except Exception:
            # Best-effort invalidation.
            pass


def build_recent_profile_viewers(request, user, limit=12):
    recent_views = (
        ProfileView.objects.filter(viewed_profile=user)
        .select_related("viewer")
        .order_by("-updated_at")[:limit]
    )

    return [
        {
            "user_id": view.viewer.id,
            "username": view.viewer.username,
            "native_language": view.viewer.native_language,
            "profile_image_url": build_media_url(request, view.viewer.profile_image_url),
            "viewed_at": view.updated_at,
        }
        for view in recent_views
    ]


def record_profile_view(viewer, viewed_profile):
    if not viewer or not viewed_profile or viewer.id == viewed_profile.id:
        return

    try:
        # The viewed user's cached profile lists recent viewers, so it only
        # needs invalidating when this view changes who is on top. Repeat
        # views by the current top viewer must not bump the version (that
        # also defeated the public_profile cache, which shares it).
        latest_viewer_id = (
            ProfileView.objects.filter(viewed_profile=viewed_profile)
            .order_by("-updated_at")
            .values_list("viewer_id", flat=True)
            .first()
        )
        # Update-then-create so repeat views refresh updated_at and the viewer
        # moves back to the top of "recent viewers".
        now = timezone.now()
        updated = ProfileView.objects.filter(
            viewer=viewer, viewed_profile=viewed_profile
        ).update(updated_at=now)
        if not updated:
            try:
                with transaction.atomic():
                    ProfileView.objects.create(
                        viewer=viewer, viewed_profile=viewed_profile
                    )
            except IntegrityError:
                # A concurrent request created the row first.
                ProfileView.objects.filter(
                    viewer=viewer, viewed_profile=viewed_profile
                ).update(updated_at=now)
    except (OperationalError, DatabaseError):
        # SQLite can temporarily lock under concurrent dev traffic. Recording a
        # profile view is best-effort and should never break opening a profile.
        return

    if latest_viewer_id != viewer.id:
        bump_profile_cache_version(viewed_profile.id)


def get_conversation_list_cache_version(user_id):
    key = CONVERSATION_LIST_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
    version = cache.get(key)
    if version is None:
        version = 1
        cache.set(key, version, None)
    return int(version)


def bump_conversation_list_cache_version(user_id):
    key = CONVERSATION_LIST_CACHE_VERSION_KEY_TEMPLATE.format(user_id=user_id)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 2, None)
    except Exception:
        # Best-effort invalidation.
        pass


def uses_cloudinary_media_storage():
    storages = getattr(settings, "STORAGES", None) or {}
    backend = (storages.get("default") or {}).get("BACKEND", "")
    return "cloudinary" in str(backend).lower()


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


def get_blocked_user_ids(user_id):
    blocked_pairs = BlockedUser.objects.filter(
        Q(blocker_id=user_id) | Q(blocked_id=user_id)
    ).values_list("blocker_id", "blocked_id")
    blocked_ids = set()
    for blocker_id, blocked_id in blocked_pairs:
        if blocker_id == user_id:
            blocked_ids.add(blocked_id)
        else:
            blocked_ids.add(blocker_id)
    return blocked_ids


# Practice levels at which a practised language counts as one the user "speaks"
# (alongside their native language) for partner matching.
SPOKEN_PRACTICE_LEVELS = {"advanced", "fluent"}
# Language values used inside match queries (JSON text match on the quoted value).
MATCH_LANGUAGE_PATTERN = re.compile(r"[a-z][a-z \-]{0,49}")


def _normalized_language(value):
    return str(value).strip().lower() if isinstance(value, str) else ""


def partner_language_sets(user):
    """Return (spoken, learning, spoken_levels) for partner matching.

    spoken: the native language, then every practised language at Advanced or
    Fluent (``Profile.practice_language_levels``, keys matched case-insensitively).
    learning: every practised language at any level (an Advanced/Fluent learner
    still wants native speakers); falls back to ``base_translate_language``.
    spoken_levels: {language: "native" | "advanced" | "fluent"} for ``spoken``.
    All values are lowercase, de-duplicated and in profile order.
    """
    levels = {}
    raw_levels = getattr(user, "practice_language_levels", None) or {}
    if isinstance(raw_levels, dict):
        for key, value in raw_levels.items():
            language = _normalized_language(key)
            if language and language not in levels:
                levels[language] = str(value or "").strip().lower()

    learning = []
    for language in getattr(user, "languages_practicing", None) or []:
        normalized = _normalized_language(language)
        if normalized and normalized not in learning:
            learning.append(normalized)
    if not learning:
        fallback_language = _normalized_language(user.base_translate_language or "")
        if fallback_language:
            learning = [fallback_language]

    spoken_levels = {}
    native_language = _normalized_language(user.native_language or "")
    if native_language:
        spoken_levels[native_language] = "native"
    for language in learning:
        if language not in spoken_levels and levels.get(language) in SPOKEN_PRACTICE_LEVELS:
            spoken_levels[language] = levels[language]
    return list(spoken_levels), learning, spoken_levels


def build_partner_match_filters(user):
    """Return (teaches_me_q, learns_mine_q, native_language) for partner matching.

    teaches_me: the other person is native in a language the user practises
    (any level).
    learns_mine: the other person practises (any level) a language the user
    speaks: their native language or one they practise at Advanced/Fluent.
    """
    spoken, learning, _ = partner_language_sets(user)

    teaches_me_q = Q(pk__in=[])
    for language in learning:
        teaches_me_q |= Q(native_language__iexact=language)

    learns_mine_q = Q(pk__in=[])
    for language in spoken:
        if MATCH_LANGUAGE_PATTERN.fullmatch(language):
            # JSON text match on the quoted value so "english" doesn't match
            # "old english". icontains is case-insensitive on both backends
            # (SQLite LIKE for ASCII, UPPER() on Postgres' jsonb::text); the
            # pattern keeps values ASCII so JSON escaping can't differ.
            learns_mine_q |= Q(languages_practicing__icontains=f'"{language}"')

    native_language = _normalized_language(user.native_language or "")
    if not MATCH_LANGUAGE_PATTERN.fullmatch(native_language):
        native_language = ""

    return teaches_me_q, learns_mine_q, native_language


def describe_partner_match(profile, spoken, learning, spoken_levels):
    """Which language each side brings, for the People card's explanation.

    they_teach: their native language when it is one the viewer practises.
    they_learn: the first language they practise that the viewer speaks.
    you_speak: how the viewer speaks ``they_learn`` (native/advanced/fluent).
    """
    native = (profile.native_language or "").strip()
    they_teach = native if native and native.lower() in learning else None
    spoken_set = set(spoken)
    they_learn = None
    for language in profile.languages_practicing or []:
        if isinstance(language, str) and language.strip().lower() in spoken_set:
            they_learn = language.strip()
            break
    return {
        "they_teach": they_teach,
        "they_learn": they_learn,
        "you_speak": spoken_levels.get(they_learn.lower()) if they_learn else None,
    }


def partner_language_cache_token(spoken_levels, learning, native_language):
    """Short digest of the viewer's language profile for the People list cache key,
    so editing languages or levels is reflected at once for that viewer."""
    raw = json.dumps(
        [sorted(spoken_levels.items()), learning, native_language], sort_keys=True
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def users_are_blocked(user_a_id, user_b_id):
    if not user_a_id or not user_b_id:
        return False
    return BlockedUser.objects.filter(
        Q(blocker_id=user_a_id, blocked_id=user_b_id)
        | Q(blocker_id=user_b_id, blocked_id=user_a_id)
    ).exists()


def get_block_state(viewer_id, profile_id):
    if not viewer_id or not profile_id or viewer_id == profile_id:
        return False, False
    blocker_ids = set(
        BlockedUser.objects.filter(
            Q(blocker_id=viewer_id, blocked_id=profile_id)
            | Q(blocker_id=profile_id, blocked_id=viewer_id)
        ).values_list("blocker_id", flat=True)
    )
    return viewer_id in blocker_ids, profile_id in blocker_ids


def get_follow_state(viewer_id, profile_id):
    """(is_following, follows_you) for the viewer and a profile, in one query."""
    if not viewer_id or not profile_id or viewer_id == profile_id:
        return False, False
    follower_ids = set(
        Follow.objects.filter(
            Q(follower_id=viewer_id, following_id=profile_id)
            | Q(follower_id=profile_id, following_id=viewer_id)
        ).values_list("follower_id", flat=True)
    )
    return viewer_id in follower_ids, profile_id in follower_ids


def partner_match_flags(profile, spoken, learning):
    """(teaches_me, learns_mine) in Python, mirroring ``build_partner_match_filters``
    for lists that aren't annotated (People you follow)."""
    native = _normalized_language(profile.native_language or "")
    teaches_me = bool(native) and native in learning
    spoken_set = set(spoken)
    learns_mine = any(
        _normalized_language(language) in spoken_set
        for language in profile.languages_practicing or []
    )
    return teaches_me, learns_mine


# Profile columns a People card reads (``.only()`` on the list querysets).
PEOPLE_CARD_FIELDS = (
    "username",
    "native_language",
    "languages_practicing",
    "practice_language_levels",
    "learning_goal",
    "profile_image_url",
    "location",
    "is_online",
    "last_seen",
    "date_joined",
)


def build_people_card(
    request, profile, now, viewer_languages, teaches_me, learns_mine,
    is_following, follows_you,
):
    """The PeopleCard payload (People feed and People you follow)."""
    spoken, learning, spoken_levels = viewer_languages
    return {
        "username": profile.username,
        "native_language": profile.native_language,
        "languages_practicing": profile.languages_practicing or [],
        "practice_language_levels": profile.practice_language_levels or {},
        "learning_goal": profile.learning_goal or "",
        "profile_image_url": build_media_url(request, profile.profile_image_url),
        # City only (never the country or coordinates); coarse activity only.
        "city": people_filters.city_of(profile.location),
        "active_label": people_filters.active_label(profile, now),
        "is_new": people_filters.is_new_member(profile, now),
        # Private to the viewer: there are no public follower counts.
        "is_following": bool(is_following),
        "follows_you": bool(follows_you),
        "match": {
            "teaches_me": bool(teaches_me),
            "learns_mine": bool(learns_mine),
            "reciprocal": bool(teaches_me and learns_mine),
            "score": int(bool(teaches_me)) + int(bool(learns_mine)),
            **describe_partner_match(profile, spoken, learning, spoken_levels),
        },
    }


def build_page_payload(paginator, page_obj, page, page_size):
    """The hand-rolled ``pagination`` dict (an out-of-range page is empty, not 404)."""
    if page_obj is not None:
        return {
            "page": page_obj.number,
            "page_size": page_size,
            "total_pages": paginator.num_pages,
            "total_count": paginator.count,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
        }
    return {
        "page": page if paginator.num_pages else 1,
        "page_size": page_size,
        "total_pages": paginator.num_pages,
        "total_count": paginator.count,
        "has_next": False,
        "has_previous": page > 1 and paginator.num_pages > 0,
    }


def paginate(queryset, page, page_size):
    paginator = Paginator(queryset, page_size)
    page_obj = None
    if paginator.num_pages and page <= paginator.num_pages:
        try:
            page_obj = paginator.page(page)
        except EmptyPage:
            page_obj = paginator.page(1)
    return paginator, page_obj


def parse_page_params(params, default_size):
    try:
        page = max(int(params.get("page", "1")), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(params.get("page_size", str(default_size)))
    except (TypeError, ValueError):
        page_size = default_size
    return page, max(1, min(page_size, PROFILE_LIST_MAX_PAGE_SIZE))


def broadcast_message_status_update(
    conversation_id, message_ids, status_value, actor_id
):
    if not message_ids:
        return
    # Best effort: a channel-layer outage is logged, never raised (core/realtime).
    broadcast(
        str(conversation_id),
        {
            "type": "message_status_event",
            "message_ids": message_ids,
            "status": status_value,
            "actor_id": actor_id,
        },
    )


def broadcast_chat_room_event(room_conversation_id, event_type, /, **fields):
    """Send a server-originated event to every socket in the conversation's room.

    ``fields`` may include ``conversation_id`` itself (group events carry it).
    Best effort: if the channel layer is down the request still succeeds."""
    broadcast(str(room_conversation_id), {"type": event_type, **fields})


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
        broadcast(f"presence_user_{user_id}", payload, channel_layer=channel_layer)


def broadcast_presence_update(user_id, is_online):
    """Tell the user's contacts (shared conversation, not blocked) only."""
    from .consumers import get_presence_contact_ids, send_presence_update

    channel_layer = get_channel_layer()
    if not channel_layer or not user_id:
        return

    async_to_sync(send_presence_update)(
        channel_layer, user_id, is_online, get_presence_contact_ids(int(user_id))
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PushDeviceRateThrottle))
def push_devices_view(request):
    """Register (POST, upsert) or remove (DELETE, on logout) an Expo push token."""
    token = request.data.get("token") if hasattr(request.data, "get") else None
    token = str(token or "").strip()
    if not is_valid_expo_push_token(token):
        return error_response(
            "A valid Expo push token is required.", "invalid_push_token", 400
        )

    if request.method == "DELETE":
        # Only the caller's own registration; someone else's token stays put.
        PushDevice.objects.filter(token=token, user=request.user).delete()
        return Response({"ok": True})

    platform = str(request.data.get("platform") or "").strip().lower()
    if platform not in PUSH_PLATFORMS:
        return error_response(
            "platform must be one of: android, ios.", "invalid_platform", 400
        )
    fields = {
        "user": request.user,
        "platform": platform,
        "is_active": True,
        "last_seen_at": timezone.now(),
    }
    try:
        # A token is one app install: if it moved to another account, it now
        # belongs to whoever registered it last (a phone that switches accounts
        # without logging out). The old owner stops getting pushes on it at once,
        # and the new owner only gets future pushes for their own messages: there
        # is no history to replay. Expo tokens are only known to the device and
        # Expo (no endpoint returns them), and registration is throttled.
        _device, created = PushDevice.objects.update_or_create(
            token=token, defaults=fields
        )
    except IntegrityError:
        # Concurrent first registration of the same token: the row exists now.
        PushDevice.objects.filter(token=token).update(**fields)
        created = False
    return Response(
        {"ok": True, "created": created},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_presence_offline_view(request):
    user = request.user
    # One filtered UPDATE: it only matches (and only reports a change) when the
    # user was actually online or still had sockets counted.
    was_online = (
        Profile.objects.filter(id=user.id)
        .filter(Q(is_online=True) | Q(ws_connection_count__gt=0))
        .update(ws_connection_count=0, is_online=False, last_seen=timezone.now())
    )

    if was_online:
        broadcast_presence_update(user.id, False)

    return Response({"ok": True})


def get_coach_chat_rate_limit_key(user_id):
    return f"coach_chat:rate_limit:user:{user_id}"


def consume_cache_counter(cache_key, limit, timeout):
    """Count one use in a fixed window; True while the count is within limit.

    cache.add + cache.incr are atomic (Redis, and LocMem within a process), so
    concurrent requests can't all read the same old value and slip through.
    """
    if limit <= 0:
        return True
    cache.add(cache_key, 0, timeout=timeout)
    try:
        next_value = cache.incr(cache_key)
    except ValueError:
        # Expired between add and incr: this request opens a new window.
        cache.set(cache_key, 1, timeout=timeout)
        return True
    return int(next_value) <= limit


def consume_coach_chat_rate_limit(user_id):
    return consume_cache_counter(
        get_coach_chat_rate_limit_key(user_id),
        COACH_CHAT_RATE_LIMIT_REQUESTS,
        COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS,
    )


def consume_coach_chat_daily_limit(user_id):
    return consume_cache_counter(
        f"coach_chat:daily_limit:user:{user_id}:date:{timezone.now():%Y%m%d}",
        COACH_CHAT_DAILY_LIMIT,
        60 * 60 * 25,
    )


def consume_coach_global_daily_budget():
    return consume_cache_counter(
        f"coach_chat:global_daily:date:{timezone.now():%Y%m%d}",
        COACH_GLOBAL_DAILY_LIMIT,
        60 * 60 * 25,
    )


def sanitize_language_name(value, fallback="english"):
    # Language names are interpolated into the model's system prompt, so only
    # accept short plain names (letters, spaces, hyphens).
    normalized = str(value or "").strip()
    if (
        not normalized
        or len(normalized) > 40
        or not re.fullmatch(r"[^\W\d_]+(?:[ \-][^\W\d_]+)*", normalized)
    ):
        return fallback
    return normalized


def coach_error(message, code, status_code, retry_after=None):
    """Coach errors use the API envelope plus the legacy ``detail`` key that
    clients built before the envelope read (drop after one release)."""
    extra = {"detail": message}
    if retry_after:
        extra["retry_after"] = int(retry_after)
    response = error_response(message, code, status_code, **extra)
    if retry_after:
        response["Retry-After"] = str(int(retry_after))
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
def coach_chat_view(request):
    message = str(request.data.get("message") or "").strip()
    if not message:
        return coach_error("Message is required.", "invalid", status.HTTP_400_BAD_REQUEST)
    if len(message) > COACH_CHAT_MAX_MESSAGE_LENGTH:
        return coach_error(
            f"Message is too long (max {COACH_CHAT_MAX_MESSAGE_LENGTH} characters).",
            "message_too_long",
            status.HTTP_400_BAD_REQUEST,
        )

    if not consume_coach_chat_rate_limit(request.user.id):
        return coach_error(
            "You are sending messages too quickly. Please wait a moment before asking the coach again.",
            "coach_rate_limited",
            status.HTTP_429_TOO_MANY_REQUESTS,
            retry_after=COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS,
        )
    if not consume_coach_chat_daily_limit(request.user.id):
        return coach_error(
            "You have reached today's coach message limit. Please come back tomorrow.",
            "coach_daily_limit",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if not consume_coach_global_daily_budget():
        return coach_error(
            "Lumi is taking a break after a busy day. Please try again tomorrow.",
            "coach_global_limit",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )

    native_language = sanitize_language_name(
        getattr(request.user, "native_language", None)
    )
    target_language = sanitize_language_name(
        str(request.data.get("target_language") or "").strip()
        or getattr(request.user, "base_translate_language", None)
        or getattr(request.user, "native_language", None),
    )
    mode = str(request.data.get("mode") or "casual_chat").strip()
    if mode not in COACH_MODES:
        mode = "casual_chat"

    # Everything below is the Gemini call; don't hold a pooled connection for it.
    release_db_connection()
    try:
        reply = generate_coach_reply(
            message=message,
            target_language=target_language,
            native_language=native_language,
            mode=mode,
        )
    except CoachAIQuotaError as error:
        return coach_error(str(error), "coach_quota", status.HTTP_429_TOO_MANY_REQUESTS)
    except CoachAIError as error:
        return coach_error(str(error), "coach_unavailable", status.HTTP_503_SERVICE_UNAVAILABLE)

    return Response(
        {
            "reply": reply,
            "target_language": str(target_language).strip() or "english",
            "native_language": str(native_language).strip() or "english",
            "mode": mode,
        },
        status=status.HTTP_200_OK,
    )


REGISTRATION_FAILED_MESSAGE = (
    "We couldn't create that account. If you already have one, "
    "log in or reset your password."
)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle, RegisterRateThrottle])
def register_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            # Extract data from request
            username = str(data.get("username") or "").strip()
            password = data.get("password")
            native_language = str(data.get("nativeLanguage") or "").strip()
            email = str(data.get("email") or "").strip().lower()
            date_of_birth = data.get("dateOfBirth")

            # Validate required fields
            if not username or not password or not native_language or not email:
                return JsonResponse(
                    {
                        "error": "Username, password, native language, and email are required"
                    },
                    status=400,
                )

            if not USERNAME_PATTERN.fullmatch(username):
                return JsonResponse(
                    {
                        "error": "Username must be at most 30 characters and contain only letters, numbers, and . @ + - _"
                    },
                    status=400,
                )
            if len(native_language) > PROFILE_LANGUAGE_MAX_LENGTH:
                return JsonResponse({"error": "Invalid native language"}, status=400)
            try:
                validate_email(email)
            except ValidationError:
                return JsonResponse({"error": "Invalid email address"}, status=400)

            parsed_date_of_birth = None
            if date_of_birth:
                try:
                    parsed_date_of_birth = datetime.strptime(
                        str(date_of_birth).strip(), "%Y-%m-%d"
                    ).date()
                except ValueError:
                    return JsonResponse(
                        {"error": "dateOfBirth must be in YYYY-MM-DD format"},
                        status=400,
                    )

            # Check if the username already exists
            if Profile.objects.filter(username__iexact=username).exists():
                return JsonResponse({"error": "Username already exists", "code": "username_taken"}, status=400)

            # Enforce settings.AUTH_PASSWORD_VALIDATORS.
            try:
                validate_password(
                    str(password),
                    user=Profile(username=username, email=email),
                )
            except ValidationError as error:
                return JsonResponse({"error": " ".join(error.messages)}, status=400)

            # An existing email gets a generic answer (no "email already exists"),
            # after the same password hashing a real signup does, so neither the
            # message nor the timing says the address has an account. Usernames
            # are public, so "username taken" above stays specific.
            if Profile.objects.filter(email__iexact=email).exists():
                make_password(str(password))
                return JsonResponse(
                    {"error": REGISTRATION_FAILED_MESSAGE, "code": "registration_failed"},
                    status=400,
                )

            # Create the new user
            user = Profile.objects.create_user(
                username=username,
                password=str(password),
                native_language=native_language,
                email=email,
                date_of_birth=parsed_date_of_birth,
                date_joined=timezone.now(),
            )
            # No community-list bump: new users appear within its 30 s TTL.

            sent = send_verification_email(user)
            return JsonResponse({"message": "User registered successfully", "email_verified": False,
                                 "verification_email_sent": sent}, status=201)

        except (json.JSONDecodeError, AttributeError):
            return JsonResponse({"error": "Invalid JSON format", "code": "invalid_json"}, status=400)
        except Exception:
            logger.exception("Registration failed")
            return JsonResponse({"error": "Registration failed. Please try again."}, status=500)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user
    if request.method == "GET":
        cache_version = get_profile_cache_version(user.id)
        cache_key = (
            f"profile:v{cache_version}:user:{user.id}:" f"host:{request.get_host()}"
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
        "practice_language_levels": user.practice_language_levels or {},
        "profile_image_url": build_media_url(request, user.profile_image_url),
        "complementary_image_1_url": build_media_url(
            request, user.complementary_image_1_url
        ),
        "complementary_image_2_url": build_media_url(
            request, user.complementary_image_2_url
        ),
        "avatar_ring_color": user.avatar_ring_color or "#1b7f79",
        "date_of_birth": user.date_of_birth,  # Include the date of birth
        "email": user.email,  # Include the email
        "email_verified": user.email_verified,
        "bio": user.bio or "",
        "learning_goal": user.learning_goal or "",
        "recent_profile_viewers": build_recent_profile_viewers(request, user),
        "support_email": SUPPORT_EMAIL,
    }
    if request.method == "GET":
        cache.set(cache_key, profile_data, PROFILE_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(profile_data, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PeopleRateThrottle))
def profile_data_view(request):
    """People list. ``match`` (+ legacy ``match_only``) still works for older
    clients; ``section`` supersedes it. Other params: see ``people_filters``."""
    params = request.query_params
    page, page_size = parse_page_params(params, PROFILE_LIST_DEFAULT_PAGE_SIZE)
    match_only = people_filters.parse_flag(params.get("match_only", "0"))
    # "match_only" predates the "match" param and maps to "teaches_me".
    match_mode = str(params.get("match", "")).strip().lower()
    if match_mode not in PROFILE_MATCH_MODES:
        match_mode = "teaches_me" if match_only else "all"
    level_filter = people_filters.parse_choice(
        params.get("level"), people_filters.PEOPLE_LEVEL_FILTERS
    )
    section = people_filters.parse_choice(params.get("section"), people_filters.PEOPLE_SECTIONS)
    include = people_filters.parse_include(params.get("include")) if section == "others" else None
    sort = people_filters.parse_choice(params.get("sort"), people_filters.PEOPLE_SORTS, "best")
    near = people_filters.parse_flag(params.get("near"))
    active_only = people_filters.parse_flag(params.get("active"))
    new_only = people_filters.parse_flag(params.get("new"))
    my_level_only = people_filters.parse_flag(params.get("my_level"))
    with_counts = people_filters.parse_flag(params.get("counts"))
    following_only = people_filters.parse_flag(params.get("following"))

    my_spoken, my_learning, my_spoken_levels = partner_language_sets(request.user)
    teaches_me_q, learns_mine_q, my_native_language = build_partner_match_filters(
        request.user
    )
    they_speak = people_filters.parse_language_subset(params.get("they_speak"), my_learning)
    they_learn = people_filters.parse_language_subset(params.get("they_learn"), my_spoken)
    my_levels = people_filters.viewer_levels(request.user)
    my_city, my_country = people_filters.split_location(request.user.location)

    cache_version = get_profile_list_cache_version()
    # `lang:` = the viewer's spoken/learning sets: editing their own languages or
    # levels takes effect at once without bumping everyone's list version.
    language_token = partner_language_cache_token(
        my_spoken_levels, my_learning, my_native_language
    )
    # `sel:` = everything else the result depends on: language subsets, include
    # groups, and the viewer's location and levels (near / my_level).
    selection_token = hashlib.sha256(
        json.dumps(
            [they_speak, they_learn, include, my_city.lower(), my_country.lower(),
             sorted(my_levels.items())],
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:12]
    quick_flags = "".join(
        "1" if flag else "0"
        for flag in (near, active_only, new_only, my_level_only, with_counts, following_only)
    )
    # `fv:` = the viewer's follow version (bumped when they follow/unfollow or
    # someone follows them), so is_following / follows_you / following=1 are fresh.
    follow_version = get_follow_cache_version(request.user.id)
    cache_key = (
        f"profile_data:v{cache_version}:user:{request.user.id}:lang:{language_token}:"
        f"page:{page}:size:{page_size}:match:{match_mode}:level:{level_filter or '-'}:"
        f"sec:{section or '-'}:sort:{sort}:qf:{quick_flags}:sel:{selection_token}:"
        f"fv:{follow_version}"
    )
    cached_payload = cache.get(cache_key)
    if cached_payload:
        return JsonResponse(cached_payload, status=200)

    now = timezone.now()
    blocked_user_ids = get_blocked_user_ids(request.user.id)
    profiles_qs = Profile.objects.exclude(id=request.user.id)
    if blocked_user_ids:
        profiles_qs = profiles_qs.exclude(id__in=blocked_user_ids)

    # Near you: same city, else (nobody else lives there) same country.
    near_q = None
    near_scope = None
    if near and my_city:
        near_q = people_filters.same_city_q(my_city)
        near_scope = "city"
        if not profiles_qs.filter(near_q).exists():
            near_q = people_filters.same_country_q(my_country)
            near_scope = "country"

    profiles_qs = profiles_qs.annotate(
        teaches_me=Case(When(teaches_me_q, then=Value(1)), default=Value(0)),
        learns_mine=Case(When(learns_mine_q, then=Value(1)), default=Value(0)),
        is_following=Exists(
            Follow.objects.filter(follower_id=request.user.id, following_id=OuterRef("pk"))
        ),
        follows_you=Exists(
            Follow.objects.filter(follower_id=OuterRef("pk"), following_id=request.user.id)
        ),
    ).annotate(match_score=F("teaches_me") + F("learns_mine"))

    # Filters shared by both sections (and by the counts).
    spoken_for_levels = they_learn or my_spoken
    if they_speak is not None:
        speak_q = Q(pk__in=[])
        for language in they_speak:
            speak_q |= Q(native_language__iexact=language)
        profiles_qs = profiles_qs.filter(Q(teaches_me=0) | speak_q)
    if they_learn is not None:
        learn_q = Q(pk__in=[])
        for language in they_learn:
            if MATCH_LANGUAGE_PATTERN.fullmatch(language):
                learn_q |= Q(languages_practicing__icontains=f'"{language}"')
        profiles_qs = profiles_qs.filter(Q(learns_mine=0) | learn_q)
    if level_filter:
        profiles_qs = profiles_qs.filter(
            people_filters.their_level_q(
                spoken_for_levels,
                people_filters.level_filter_levels(level_filter),
                MATCH_LANGUAGE_PATTERN,
            )
        )
    if near_q is not None:
        profiles_qs = profiles_qs.filter(near_q)
    if active_only:
        profiles_qs = profiles_qs.filter(
            Q(is_online=True) | Q(last_seen__gte=now - people_filters.ACTIVE_TODAY_WINDOW)
        )
    if new_only:
        profiles_qs = profiles_qs.filter(
            date_joined__gte=now - people_filters.NEW_MEMBER_WINDOW
        )
    level_q = people_filters.my_level_q(
        my_learning, my_levels, spoken_for_levels, MATCH_LANGUAGE_PATTERN
    )
    if my_level_only and level_q is not None:
        profiles_qs = profiles_qs.filter(level_q)
    if following_only:
        # Both sections (and the counts) narrow to people the viewer follows.
        profiles_qs = profiles_qs.filter(is_following=True)

    counts = None
    if with_counts:
        counts = profiles_qs.aggregate(
            perfect=Count("id", filter=people_filters.section_q("perfect", None)),
            others=Count("id", filter=people_filters.section_q("others", include)),
        )

    if section:
        profiles_qs = profiles_qs.filter(people_filters.section_q(section, include))
    elif match_mode == "teaches_me":
        profiles_qs = profiles_qs.filter(teaches_me=1)
    elif match_mode == "reciprocal":
        profiles_qs = profiles_qs.filter(teaches_me=1, learns_mine=1)
    elif match_mode == "learns_mine":
        profiles_qs = profiles_qs.filter(learns_mine=1)

    if sort == "active":
        ordering = (F("last_seen").desc(nulls_last=True), "-match_score", "-teaches_me", "username")
    elif sort == "newest":
        ordering = (F("date_joined").desc(nulls_last=True), "-match_score", "-teaches_me", "username")
    else:
        ordering = ("-match_score", "-teaches_me", "username")
    profiles_qs = profiles_qs.order_by(*ordering).only(*PEOPLE_CARD_FIELDS)
    paginator, page_obj = paginate(profiles_qs, page, page_size)

    viewer_languages = (my_spoken, my_learning, my_spoken_levels)
    profile_data = [
        build_people_card(
            request, profile, now, viewer_languages,
            profile.teaches_me, profile.learns_mine,
            profile.is_following, profile.follows_you,
        )
        for profile in (page_obj or [])
    ]
    pagination = build_page_payload(paginator, page_obj, page, page_size)
    payload = {
        "profiles": profile_data,
        "pagination": pagination,
        "total": paginator.count,
        "filters": {
            # Chip options for the filter panel (the viewer's own languages).
            "they_speak_options": my_learning,
            "they_learn_options": my_spoken,
            "near_available": bool(my_city),
            "near_city": my_city or None,
            "near_scope": near_scope,
            "my_level_available": level_q is not None,
        },
    }
    if counts is not None:
        payload["counts"] = {"perfect": counts["perfect"], "others": counts["others"]}
    cache.set(cache_key, payload, PROFILE_LIST_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(payload, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PublicProfileRateThrottle))
def public_profile_view(request, username):
    profile = get_profile_by_username_or_404(username)
    is_blocked_by_me, has_blocked_me = get_block_state(request.user.id, profile.id)
    if is_blocked_by_me or has_blocked_me:
        return JsonResponse({"error": "This user is unavailable.", "code": "blocked"}, status=403)
    record_profile_view(request.user, profile)
    cache_version = get_profile_cache_version(profile.id)
    cache_key = (
        f"public_profile:v{cache_version}:user:{profile.id}:viewer:{request.user.id}:"
        f"host:{request.get_host()}:fv:{get_follow_cache_version(request.user.id)}"
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
        "practice_language_levels": profile.practice_language_levels or {},
        "profile_image_url": build_media_url(request, profile.profile_image_url),
        "complementary_image_1_url": build_media_url(
            request, profile.complementary_image_1_url
        ),
        "complementary_image_2_url": build_media_url(
            request, profile.complementary_image_2_url
        ),
        "bio": profile.bio or "",
        "learning_goal": profile.learning_goal or "",
        "reviews": [],
        "is_blocked_by_me": is_blocked_by_me,
        "has_blocked_me": has_blocked_me,
    }
    profile_data["is_following"], profile_data["follows_you"] = get_follow_state(
        request.user.id, profile.id
    )
    cache.set(cache_key, profile_data, PROFILE_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(profile_data, status=200)


def verify_current_password(user, password):
    """Re-authentication for sensitive changes (email change, account deletion).

    Returns None when ``password`` is the user's password, else an envelope
    response: 400 ``password_required``, 403 ``invalid_password`` or 429
    ``throttled``. Wrong passwords count toward the per-account login lockout
    (same counter as /api/token/), so this can't be used to brute-force it.
    """
    from .auth_views import (
        LOGIN_FAILURE_WINDOW_SECONDS,
        LOGIN_LOCKED_MESSAGE,
        clear_login_failures,
        login_is_locked,
        record_login_failure,
    )

    if not isinstance(password, str) or not password:
        return error_response(
            "Enter your current password to confirm this change.",
            "password_required",
            400,
        )
    lockout_key = str(user.email or "").strip().lower() or f"user-id:{user.pk}"
    if login_is_locked(lockout_key):
        response = error_response(
            LOGIN_LOCKED_MESSAGE,
            "throttled",
            429,
            retry_after=LOGIN_FAILURE_WINDOW_SECONDS,
        )
        response["Retry-After"] = str(LOGIN_FAILURE_WINDOW_SECONDS)
        return response
    if not user.check_password(password):
        record_login_failure(lockout_key)
        return error_response("Your current password is incorrect.", "invalid_password", 403)
    clear_login_failures(lockout_key)
    return None


def _uses_bearer_auth(request):
    return str(request.META.get("HTTP_AUTHORIZATION", "")).lower().startswith(
        ("bearer ", "jwt ")
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        user = request.user

        # Update fields if they are present in the request body
        username = data.get("username")
        native_language = data.get("native_language")
        base_translate_language = data.get("base_translate_language")
        languages_practicing = data.get("languages_practicing")
        practice_language_levels = data.get("practice_language_levels")
        email = data.get("email")
        date_of_birth = data.get("date_of_birth")
        location = data.get("location")
        bio = data.get("bio")
        learning_goal = data.get("learning_goal")
        avatar_ring_color = data.get("avatar_ring_color")
        profile_image_url = data.get("profile_image_url")
        email_changed = False

        # Update only if data is provided
        if username:
            username = str(username).strip()
            if not USERNAME_PATTERN.fullmatch(username):
                return JsonResponse(
                    {
                        "error": "Username must be at most 30 characters and contain only letters, numbers, and . @ + - _"
                    },
                    status=400,
                )
            if (
                Profile.objects.exclude(id=user.id)
                .filter(username__iexact=username)
                .exists()
            ):
                return JsonResponse({"error": "Username already exists", "code": "username_taken"}, status=400)
            user.username = username
        for language_value in (native_language, base_translate_language):
            if language_value and (
                not isinstance(language_value, str)
                or len(language_value.strip()) > PROFILE_LANGUAGE_MAX_LENGTH
            ):
                return JsonResponse({"error": "Invalid language value"}, status=400)
        if native_language:
            user.native_language = native_language.strip()
        if base_translate_language:
            user.base_translate_language = base_translate_language.strip()
        if languages_practicing is not None:
            if (
                not isinstance(languages_practicing, list)
                or len(languages_practicing) > PROFILE_MAX_PRACTICE_LANGUAGES
            ):
                return JsonResponse(
                    {"error": "languages_practicing must be a list of strings"},
                    status=400,
                )

            cleaned_languages = []
            for language in languages_practicing:
                if isinstance(language, str):
                    value = language.strip()[:PROFILE_LANGUAGE_MAX_LENGTH]
                    if value:
                        cleaned_languages.append(value)
            user.languages_practicing = cleaned_languages
        if practice_language_levels is not None:
            if not isinstance(practice_language_levels, dict):
                return JsonResponse(
                    {"error": "practice_language_levels must be an object"},
                    status=400,
                )

            allowed_languages = {
                str(language).strip()
                for language in (languages_practicing if languages_practicing is not None else user.languages_practicing or [])
                if isinstance(language, str) and str(language).strip()
            }
            cleaned_levels = {}
            for language, level in practice_language_levels.items():
                if not isinstance(language, str):
                    continue
                normalized_language = language.strip()
                normalized_level = str(level).strip().lower()
                if not normalized_language or normalized_language not in allowed_languages:
                    continue
                if normalized_level not in {"beginner", "intermediate", "advanced", "fluent"}:
                    return JsonResponse(
                        {
                            "error": "practice language levels must be beginner, intermediate, advanced, or fluent"
                        },
                        status=400,
                    )
                cleaned_levels[normalized_language] = normalized_level
            user.practice_language_levels = cleaned_levels
        if email is not None:
            normalized_email = str(email).strip().lower()
            if not normalized_email:
                return JsonResponse({"error": "Email cannot be empty"}, status=400)
            try:
                validate_email(normalized_email)
            except ValidationError:
                return JsonResponse({"error": "Invalid email address"}, status=400)
            if normalized_email != str(user.email or "").strip().lower():
                # The email is the login: changing it needs the current
                # password (checked before the uniqueness lookup, so a stolen
                # session can't probe which addresses have accounts).
                password_error = verify_current_password(
                    user, data.get("current_password")
                )
                if password_error is not None:
                    return password_error
                email_changed = True
            if (
                Profile.objects.exclude(id=user.id)
                .filter(email__iexact=normalized_email)
                .exists()
            ):
                return JsonResponse({"error": "Email already exists", "code": "email_taken"}, status=400)
            user.email = normalized_email
        if date_of_birth is not None:
            date_raw = str(date_of_birth).strip()
            if date_raw:
                try:
                    user.date_of_birth = datetime.strptime(date_raw, "%Y-%m-%d").date()
                except ValueError:
                    return JsonResponse(
                        {"error": "date_of_birth must be in YYYY-MM-DD format"},
                        status=400,
                    )
            else:
                user.date_of_birth = None
        if location is not None:
            user.location = str(location).strip()[:255]
            if user.location:
                user.location_updated_at = timezone.now()
        if bio is not None:
            user.bio = str(bio).strip()[:PROFILE_TEXT_MAX_LENGTH]
        if learning_goal is not None:
            user.learning_goal = str(learning_goal).strip()[:PROFILE_TEXT_MAX_LENGTH]
        if avatar_ring_color is not None:
            normalized_ring_color = str(avatar_ring_color).strip().lower()
            if not re.fullmatch(r"#[0-9a-f]{6}", normalized_ring_color):
                return JsonResponse(
                    {"error": "Invalid avatar ring color"},
                    status=400,
                )
            user.avatar_ring_color = normalized_ring_color
        if profile_image_url:
            # Images only change through the upload endpoint (neither client sends
            # a URL here): a client-chosen URL could point at a tracking pixel,
            # another Cloudinary account or someone else's upload.
            return JsonResponse(
                {
                    "error": "Profile photos can only be changed by uploading an image.",
                    "code": "invalid_profile_image",
                },
                status=400,
            )

        # Save the address and its unverified state together. Never retain a
        # verification timestamp belonging to the previous address.
        if email_changed:
            user.email_verified_at = None
        # Save the updated user object
        user.save()
        # The community list is not re-versioned for profile edits (a global
        # bump would empty every viewer's list cache); its 30 s TTL is the bound.
        bump_profile_cache_version(user.id)

        session_tokens = None
        if email_changed:
            # Sign out every other device (all tokens die with the version
            # bump) but keep this session: fresh tokens with the same session
            # id, so this device's sockets stay open too.
            claims = request.auth or {}
            session_id = claims.get(SESSION_ID_CLAIM)
            revoke_user_tokens(user, keep_session_id=session_id)
            session_tokens = issue_token_pair(
                user,
                remember_me=bool(claims.get(REMEMBER_ME_CLAIM)),
                session_id=session_id,
            )
            logger.info("Email changed; other sessions revoked for user_id=%s", user.id)
            send_verification_email(user)

        # Return the updated user data
        response = JsonResponse(
            {
                "message": "Profile updated successfully",
                "updated_profile": {
                    "username": user.username,
                    "native_language": user.native_language,
                    "base_translate_language": user.base_translate_language,
                    "languages_practicing": user.languages_practicing or [],
                    "practice_language_levels": user.practice_language_levels or {},
                    "email": user.email,
                    "email_verified": user.email_verified,
                    "date_of_birth": user.date_of_birth,
                    "location": user.location or "",
                    "location_updated_at": user.location_updated_at,
                    "bio": user.bio or "",
                    "learning_goal": user.learning_goal or "",
                    "profile_image_url": (user.profile_image_url or None),
                    "avatar_ring_color": user.avatar_ring_color or "#1b7f79",
                },
                # Only after an email change, and only for Bearer clients
                # (mobile stores the pair); web gets the cookies instead.
                **(
                    {"tokens": session_tokens}
                    if session_tokens and _uses_bearer_auth(request)
                    else {}
                ),
            },
            status=200,
        )
        if session_tokens and not _uses_bearer_auth(request):
            from .auth_views import _set_auth_cookies

            _set_auth_cookies(
                response,
                session_tokens["access"],
                session_tokens["refresh"],
                remember_me=bool((request.auth or {}).get(REMEMBER_ME_CLAIM)),
            )
        return response

    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({"error": "Invalid JSON format", "code": "invalid_json"}, status=400)
    except Exception:
        logger.exception("Profile update failed for user %s", request.user.id)
        return JsonResponse({"error": "Profile update failed. Please try again."}, status=500)


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


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_account_view(request):
    user = request.user
    data = request.data if isinstance(request.data, dict) else {}
    password_error = verify_current_password(user, data.get("current_password"))
    if password_error is not None:
        return password_error
    user_id = user.id
    username = user.username
    # Blacklist refresh tokens and close the user's sockets before the row goes.
    revoke_user_tokens(user)
    user.delete()
    # Privacy: deleted users and blocks must leave community lists at once, so
    # these (and block_user_view) are the only community-list bumps.
    bump_profile_list_cache_version()
    bump_profile_cache_version(user_id)
    bump_conversation_list_cache_version(user_id)
    return Response(
        {"message": f"Account for {username} deleted successfully."},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def following_list_view(request):
    page, page_size = parse_page_params(request.query_params, FOLLOWING_LIST_DEFAULT_PAGE_SIZE)
    blocked_ids = get_blocked_user_ids(request.user.id)
    links = Follow.objects.filter(follower_id=request.user.id).exclude(
        following_id__in=blocked_ids
    ).select_related("following").annotate(follows_you=Exists(
        Follow.objects.filter(follower_id=OuterRef("following_id"), following_id=request.user.id)
    )).order_by("-created_at", "-id")
    paginator, page_obj = paginate(links, page, page_size)
    viewer_languages = partner_language_sets(request.user)
    now = timezone.now()
    profiles = []
    for link in page_obj or []:
        profile = link.following
        teaches_me, learns_mine = partner_match_flags(
            profile, viewer_languages[0], viewer_languages[1]
        )
        profiles.append(build_people_card(
            request, profile, now, viewer_languages, teaches_me, learns_mine,
            True, bool(getattr(link, "follows_you", False)),
        ))
    return Response({"profiles": profiles, "pagination": build_page_payload(
        paginator, page_obj, page, page_size
    )})


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(*FOLLOW_THROTTLES))
def follow_user_view(request, username):
    target = get_profile_by_username_or_404(username)
    if target.id == request.user.id:
        return error_response("You cannot follow yourself.", "cannot_follow_self", status_code=400)
    if users_are_blocked(request.user.id, target.id):
        return error_response("This user is unavailable.", "blocked", status_code=403)
    if request.method == "POST" and not RequireVerifiedEmail().has_permission(request, None):
        return error_response("Verify your email to follow people.", EMAIL_UNVERIFIED_CODE, status_code=403)

    if request.method == "DELETE":
        deleted, _ = Follow.objects.filter(follower=request.user, following=target).delete()
        if deleted:
            bump_follow_cache_version(request.user.id, target.id)
        return Response({"is_following": False})

    _, created = Follow.objects.get_or_create(follower=request.user, following=target)
    if created:
        bump_follow_cache_version(request.user.id, target.id)
        notify_key = FOLLOW_NOTIFY_KEY_TEMPLATE.format(
            follower_id=request.user.id, following_id=target.id
        )
        try:
            should_notify = cache.add(notify_key, 1, FOLLOW_NOTIFY_INTERVAL_SECONDS)
        except Exception:
            # A cache outage must not undo a successful follow.
            should_notify = True
        if should_notify:
            follows_back = Follow.objects.filter(
                follower=target, following=request.user
            ).exists()
            broadcast(f"presence_user_{target.id}", {
                "type": "user_followed_event",
                "username": request.user.username,
                "profile_image_url": build_media_url(request, request.user.profile_image_url),
                "is_following": follows_back,
            })
            schedule_follow_push(
                follower_id=request.user.id,
                follower_username=request.user.username,
                recipient_id=target.id,
            )
    return Response({"is_following": True})


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(BlockRateThrottle))
def block_user_view(request, username):
    target = get_profile_by_username_or_404(username)

    if target.id == request.user.id:
        return Response(
            {"error": "You cannot block yourself."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "POST":
        BlockedUser.objects.get_or_create(blocker=request.user, blocked=target)
        Follow.objects.filter(
            Q(follower=request.user, following=target)
            | Q(follower=target, following=request.user)
        ).delete()
        bump_follow_cache_version(request.user.id, target.id)
        Conversation.objects.filter(
            Q(sender=request.user, receiver=target)
            | Q(sender=target, receiver=request.user)
        ).delete()
        bump_conversation_list_cache_version(request.user.id)
        bump_conversation_list_cache_version(target.id)
        bump_profile_list_cache_version()
        bump_profile_cache_version(target.id)
        return Response(
            {"message": f"You blocked {target.username}.", "is_blocked_by_me": True},
            status=status.HTTP_200_OK,
        )

    BlockedUser.objects.filter(blocker=request.user, blocked=target).delete()
    bump_conversation_list_cache_version(request.user.id)
    bump_conversation_list_cache_version(target.id)
    bump_profile_list_cache_version()
    bump_profile_cache_version(target.id)
    return Response(
        {"message": f"You unblocked {target.username}.", "is_blocked_by_me": False},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def moderation_summary_view(request):
    blocked_pairs = (
        BlockedUser.objects.filter(blocker=request.user)
        .select_related("blocked")
        .order_by("-created_at")
    )
    reports = (
        UserReport.objects.filter(reporter=request.user)
        .select_related("reported_user")
        .order_by("-created_at")
    )

    return Response(
        {
            "blocked_profiles": [
                {
                    "username": pair.blocked.username,
                    "profile_image_url": pair.blocked.profile_image_url or None,
                    "created_at": pair.created_at,
                }
                for pair in blocked_pairs
            ],
            "reported_profiles": [
                {
                    "username": report.reported_user.username,
                    "profile_image_url": report.reported_user.profile_image_url or None,
                    "reason": report.reason,
                    "details": report.details,
                    "created_at": report.created_at,
                }
                for report in reports
            ],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(ReportRateThrottle))
def report_user_view(request, username):
    target = get_profile_by_username_or_404(username)

    if target.id == request.user.id:
        return Response(
            {"error": "You cannot report yourself."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reason = str(request.data.get("reason", "")).strip().lower()
    details = str(request.data.get("details", "")).strip()
    allowed_reasons = {
        "spam",
        "harassment",
        "inappropriate_content",
        "impersonation",
        "scam",
        "other",
    }
    if not reason:
        return Response(
            {"error": "A report reason is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if reason not in allowed_reasons:
        return Response(
            {"error": "Invalid report reason."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if reason == "other" and not details:
        return Response(
            {"error": "Please provide details for the 'other' reason."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    UserReport.objects.create(
        reporter=request.user,
        reported_user=target,
        reason=reason[:64],
        details=details[:2000],
    )
    return Response(
        {"message": f"Report submitted for {target.username}."},
        status=status.HTTP_201_CREATED,
    )


def mark_messages_delivered(messages_qs, user):
    """
    Mark the user's incoming "sent" messages in messages_qs as delivered,
    broadcast the status change per conversation and invalidate both
    participants' conversation list caches so ticks are not stale.
    """
    # Direct chats only: groups track reads per member (ConversationParticipant.last_read_at).
    messages_to_deliver = messages_qs.filter(
        status="sent", conversation__kind=Conversation.KIND_DIRECT
    ).exclude(sender=user)
    rows = list(
        messages_to_deliver.values_list(
            "id",
            "conversation_id",
            "conversation__sender_id",
            "conversation__receiver_id",
        )
    )
    if not rows:
        return

    messages_to_deliver.update(status="delivered")
    ids_by_conversation = {}
    participant_ids = set()
    for message_id, conv_id, sender_id, receiver_id in rows:
        ids_by_conversation.setdefault(conv_id, []).append(message_id)
        participant_ids.update((sender_id, receiver_id))
    for user_id in participant_ids:
        bump_conversation_list_cache_version(user_id)
    for conv_id, message_ids in ids_by_conversation.items():
        broadcast_message_status_update(conv_id, message_ids, "delivered", user.id)


class MessageListView(APIView):
    permission_classes = [IsAuthenticated, RequireVerifiedEmail]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
        )
        if not is_conversation_member(request.user.id, conversation):
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        mark_messages_delivered(
            Message.objects.filter(conversation=conversation), request.user
        )

        page_param = request.query_params.get("page", "1")
        page_size_param = request.query_params.get("page_size", "30")
        try:
            page = max(int(page_param), 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(page_size_param)
        except (TypeError, ValueError):
            page_size = 30
        page_size = max(1, min(page_size, 100))

        messages_qs = with_message_relations(
            visible_messages(
                conversation.messages.all().order_by("-timestamp", "-id"), request.user.id, conversation
            ),
            request.user,
        )
        paginator = Paginator(messages_qs, page_size)
        if paginator.num_pages == 0 or page > paginator.num_pages:
            payload = {
                "messages": [],
                "pagination": {
                    "page": page if paginator.num_pages else 1,
                    "page_size": page_size,
                    "total_pages": paginator.num_pages,
                    "total_count": paginator.count,
                    "has_next": False,
                    "has_previous": page > 1 and paginator.num_pages > 0,
                },
            }
            return Response(payload, status=status.HTTP_200_OK)

        try:
            page_obj = paginator.page(page)
        except EmptyPage:
            page_obj = paginator.page(1)

        # Page query is newest-first for paging semantics.
        # Reverse in response so UI receives messages in chronological order.
        messages = list(page_obj.object_list)[::-1]
        serializer = MessageSerializer(
            messages, many=True, context={"request": request}
        )
        payload = {
            "messages": serializer.data,
            "pinned_messages": MessageSerializer(
                with_message_relations(
                    visible_messages(
                        conversation.messages.filter(pinned_at__isnull=False).order_by(
                            "-pinned_at", "-id"
                        ),
                        request.user.id,
                        conversation,
                    ),
                    request.user,
                ),
                many=True,
                context={"request": request},
            ).data,
            "pagination": {
                "page": page_obj.number,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
                "total_count": paginator.count,
                "has_next": page_obj.has_next(),
                "has_previous": page_obj.has_previous(),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)

    parser_classes = (MultiPartParser, FormParser)  # Allow handling of file uploads
    # POST only (GET history is not counted); attachments also count as uploads.
    throttle_classes = with_default_throttles(
        MessageSendRateThrottle, MessageSendDailyRateThrottle
    )

    def post(self, request, conversation_id):
        # Fetch conversation where the user is the sender
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
        )
        if not is_conversation_member(request.user.id, conversation):
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Groups don't stop on a block between two members (invites check blocks).
        if not conversation.is_group and users_are_blocked(conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "You cannot message a blocked user.", "code": "blocked"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Extract text and file from the request
        text = str(request.data.get("text", "") or "").strip()
        attachment = request.FILES.get("attachment")
        reply_to_id = request.data.get("reply_to")
        reply_to_message = None

        kind = str(request.data.get("kind") or Message.KIND_TEXT).strip().lower()
        if kind not in (Message.KIND_TEXT, Message.KIND_STICKER, Message.KIND_GIF):
            return Response(
                {"error": "Unknown message kind.", "code": "invalid_kind"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        media = None
        if kind != Message.KIND_TEXT:
            if text or attachment:
                return Response(
                    {
                        "error": "Stickers and GIFs are sent on their own, without text or a file.",
                        "code": "invalid_media_message",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if kind == Message.KIND_STICKER:
                sticker_ref = parse_sticker_ref(request.data.get("sticker"))
                if sticker_ref is None:
                    return Response(
                        {"error": "Unknown sticker.", "code": "invalid_sticker"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                media = {"pack": sticker_ref[0], "id": sticker_ref[1]}
        # Validate: at least text or attachment should be provided
        elif not text and not attachment:
            return Response(
                {"error": "Message content or attachment is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text) > MESSAGE_MAX_LENGTH:
            return Response(
                {"error": f"Message is too long (max {MESSAGE_MAX_LENGTH} characters)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if attachment:
            safe_extension, attachment_error = validate_uploaded_file(
                attachment, ALLOWED_ATTACHMENT_TYPES, MESSAGE_ATTACHMENT_MAX_BYTES
            )
            if attachment_error:
                return Response(
                    {"error": attachment_error},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            check_throttles(request, self, UPLOAD_THROTTLES)
            # Never trust the client filename: it controls the served content type.
            attachment.name = f"{uuid.uuid4().hex}{safe_extension}"

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

        if kind == Message.KIND_GIF:
            # Usually a cache hit (the picker just listed this GIF); a miss asks
            # GIPHY, so the DB connection is released first.
            release_db_connection()
            gif_error = None
            try:
                media = resolve_gif(request.data.get("gif_id"))
            except GiphyUnavailable:
                gif_error = (GIFS_UNAVAILABLE, status.HTTP_503_SERVICE_UNAVAILABLE)
            except GiphyUpstreamError:
                gif_error = (GIFS_UPSTREAM_ERROR, status.HTTP_502_BAD_GATEWAY)
            if gif_error is None and media is None:
                gif_error = (
                    {"error": "That GIF isn't available.", "code": "invalid_gif"},
                    status.HTTP_400_BAD_REQUEST,
                )
            if gif_error is not None:
                return Response(gif_error[0], status=gif_error[1])

        stored_attachment_name = None
        if attachment:
            # Upload before the INSERT (Cloudinary can take seconds) with the DB
            # connection released, then store just the saved name.
            release_db_connection()
            attachment_field = Message._meta.get_field("attachment")
            stored_attachment_name = attachment_field.storage.save(
                attachment_field.generate_filename(None, attachment.name),
                attachment,
                max_length=attachment_field.max_length,
            )

        # Create a new message
        try:
            message = Message.objects.create(
                conversation=conversation,
                text=text,
                sender=request.user,
                reply_to=reply_to_message,
                attachment=stored_attachment_name,
                kind=kind,
                media=media,
            )
        except Exception:
            if stored_attachment_name:
                try:
                    attachment_field.storage.delete(stored_attachment_name)
                except Exception:
                    logger.warning("Could not remove orphaned attachment upload")
            raise
        member_ids = conversation_member_ids(conversation)
        for member_id in member_ids:
            bump_conversation_list_cache_version(member_id)
        broadcast_conversation_update(
            member_ids,
            conversation.id,
            "message_created",
            actor_id=request.user.id,
        )

        # Push to the other participant's devices after commit, off the request
        # thread (chatapp/push.py); no queries here.
        if conversation.is_group:
            schedule_group_message_push(
                conversation_id=conversation.id,
                group_name=group_display_name(conversation),
                sender_id=request.user.id,
                sender_username=request.user.username,
                recipient_ids=[
                    member_id for member_id in member_ids if member_id != request.user.id
                ],
                text=text,
                attachment_content_type=getattr(attachment, "content_type", None),
                message_kind=kind,
            )
        else:
            schedule_message_push(
                conversation_id=conversation.id,
                sender_id=request.user.id,
                sender_username=request.user.username,
                recipient_id=(
                    conversation.receiver_id
                    if conversation.sender_id == request.user.id
                    else conversation.sender_id
                ),
                text=text,
                attachment_content_type=getattr(attachment, "content_type", None),
                message_kind=kind,
            )

        # Serialize and return the new message
        message = reload_message_for_serializer(message, request.user)
        serializer = MessageSerializer(message, context={"request": request})
        # Open chats (including the sender's other tabs/devices) render the
        # saved message from this event; clients dedupe by id.
        broadcast_chat_room_event(
            conversation.id,
            "message_created_event",
            message=message_broadcast_payload(serializer.data),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessageDeleteView(APIView):
    def delete(self, request, message_id):
        message = get_object_or_404(
            Message.objects.select_related("conversation"), id=message_id, sender=request.user
        )
        conversation = message.conversation
        if not is_conversation_member(request.user.id, conversation):
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        deleted_message_id = message.id
        message.delete()
        for member_id in conversation_member_ids(conversation):
            bump_conversation_list_cache_version(member_id)
        broadcast_chat_room_event(
            conversation.id, "message_deleted_event", message_id=deleted_message_id
        )
        broadcast_conversation_update(
            conversation_member_ids(conversation),
            conversation.id,
            "message_deleted",
            actor_id=request.user.id,
        )
        return Response(
            {"message": "Message deleted successfully"}, status=status.HTTP_200_OK
        )


class MessageEditView(APIView):
    permission_classes = [IsAuthenticated, RequireVerifiedEmail]

    def patch(self, request, message_id):
        message = get_object_or_404(
            Message.objects.select_related("conversation"),
            id=message_id,
            sender=request.user,
        )
        if not is_conversation_member(request.user.id, message.conversation):
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if message.kind != Message.KIND_TEXT:
            return Response(
                {"error": "Stickers and GIFs can't be edited.", "code": "not_editable"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated_text = str(request.data.get("text", "")).strip()

        if not updated_text and not message.attachment:
            return Response(
                {"error": "Message content is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(updated_text) > MESSAGE_MAX_LENGTH:
            return Response(
                {"error": f"Message is too long (max {MESSAGE_MAX_LENGTH} characters)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if message.text == updated_text:
            message = reload_message_for_serializer(message, request.user)
            serializer = MessageSerializer(message, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        message.text = updated_text
        message.edited_at = timezone.now()
        message.save(update_fields=["text", "edited_at"])

        conversation = message.conversation
        for member_id in conversation_member_ids(conversation):
            bump_conversation_list_cache_version(member_id)
        broadcast_conversation_update(
            conversation_member_ids(conversation),
            conversation.id,
            "message_updated",
            actor_id=request.user.id,
        )

        message = reload_message_for_serializer(message, request.user)
        serializer = MessageSerializer(message, context={"request": request})
        serialized_message = serializer.data

        broadcast_chat_room_event(
            message.conversation_id,
            "message_edit_event",
            message=message_broadcast_payload(serialized_message),
        )

        return Response(serialized_message, status=status.HTTP_200_OK)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]  # Ensure only authenticated users can access

    def get(self, request, conversation_id):
        """
        Retrieve a specific conversation by ID.
        """
        conversation = get_object_or_404(
            Conversation.objects.select_related("sender", "receiver"),
            id=conversation_id,
        )
        if conversation.is_group:
            # One query for members + invitees (direct chats skip it entirely).
            prefetch_related_objects(
                [conversation],
                Prefetch(
                    "participants",
                    queryset=ConversationParticipant.objects.select_related("user").order_by(
                        "joined_at", "created_at", "id"
                    ),
                    to_attr="group_participants",
                ),
            )
        if not is_conversation_member(request.user.id, conversation):
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        mark_messages_delivered(
            Message.objects.filter(conversation=conversation), request.user
        )

        # `messages` embeds only the latest CONVERSATION_DETAIL_MESSAGE_LIMIT
        # messages (see ConversationSerializer.get_messages).
        serializer = ConversationSerializer(
            conversation,
            context={"request": request, "include_messages": True},
        )
        return Response(serializer.data)

    def patch(self, request, conversation_id):
        """Rename a group (owner only)."""
        from .group_views import rename_group

        return rename_group(request, conversation_id)

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.is_group:
            # "Delete chat" on a group means leaving it; others keep the group.
            from .group_views import leave_or_remove

            return leave_or_remove(request, conversation, request.user)
        participant_ids = conversation_member_ids(conversation)
        if request.user.id not in participant_ids:
            return Response(
                {"error": "You are not a participant in this conversation.", "code": "not_participant"},
                status=status.HTTP_403_FORBIDDEN,
            )
        conversation.delete()
        for user_id in participant_ids:
            bump_conversation_list_cache_version(user_id)
        return Response(
            {"message": "Conversation deleted successfully"}, status=status.HTTP_200_OK
        )


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated, RequireVerifiedEmail]

    def get(self, request):
        user = request.user
        # Runs on every request (before the cache check), so keep it a plain
        # filter on the user's conversations rather than the annotated list.
        mark_messages_delivered(
            Message.objects.filter(direct_conversations_q(user, prefix="conversation__")),
            user,
        )
        # Groups are opt-in so app builds that only know direct chats (they read
        # sender/receiver) never receive one: ?include=groups.
        include_groups = "groups" in {
            part.strip() for part in str(request.query_params.get("include", "")).split(",")
        }

        cache_version = get_conversation_list_cache_version(request.user.id)
        cache_key = (
            f"conversation_list:v{cache_version}:user:{request.user.id}:"
            f"host:{request.get_host()}:groups:{int(include_groups)}"
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        last_message_id_subquery = Subquery(
            Message.objects.filter(conversation_id=OuterRef("pk"))
            .order_by("-timestamp", "-id")
            .values("id")[:1]
        )
        # Correlated per-conversation count instead of a LEFT JOIN over every
        # message plus a GROUP BY on all selected columns.
        unread_count_subquery = Subquery(
            Message.objects.filter(conversation_id=OuterRef("pk"))
            .exclude(sender=user)
            .exclude(status="read")
            .order_by()
            .values("conversation_id")
            .annotate(total=Count("id"))
            .values("total")[:1],
            output_field=IntegerField(),
        )
        conversations_qs = (
            Conversation.objects.filter(
                direct_conversations_q(user)
                | (group_conversations_q(user) if include_groups else Q(pk__in=[]))
            )
            .select_related("sender", "receiver")
            .only(
                "id",
                "kind",
                "name",
                "created_at",
                "updated_at",
                "sender",
                "receiver",
                *(f"sender__{field}" for field in PROFILE_SUMMARY_FIELDS),
                *(f"receiver__{field}" for field in PROFILE_SUMMARY_FIELDS),
            )
        )
        if include_groups:
            # Groups: unread = others' messages after my read position (or join
            # time); the last message must be one I'm allowed to see.
            my_row = ConversationParticipant.objects.filter(
                conversation_id=OuterRef("pk"), user=user
            )
            conversations_qs = conversations_qs.annotate(
                my_joined_at=Subquery(my_row.values("joined_at")[:1]),
                my_read_from=Coalesce(
                    Subquery(my_row.values("last_read_at")[:1]),
                    Subquery(my_row.values("joined_at")[:1]),
                ),
            )
            group_unread_subquery = Subquery(
                Message.objects.filter(
                    conversation_id=OuterRef("pk"), timestamp__gt=OuterRef("my_read_from")
                )
                .exclude(sender=user)
                .order_by()
                .values("conversation_id")
                .annotate(total=Count("id"))
                .values("total")[:1],
                output_field=IntegerField(),
            )
            group_last_message_subquery = Subquery(
                Message.objects.filter(
                    conversation_id=OuterRef("pk"), timestamp__gte=OuterRef("my_joined_at")
                )
                .order_by("-timestamp", "-id")
                .values("id")[:1]
            )
            is_group = Q(kind=Conversation.KIND_GROUP)
            unread_expression = Case(
                When(is_group, then=Coalesce(group_unread_subquery, Value(0))),
                default=Coalesce(unread_count_subquery, Value(0)),
                output_field=IntegerField(),
            )
            last_message_expression = Case(
                When(is_group, then=group_last_message_subquery),
                default=last_message_id_subquery,
            )
            conversations_qs = conversations_qs.prefetch_related(
                Prefetch(
                    "participants",
                    queryset=ConversationParticipant.objects.filter(
                        conversation__kind=Conversation.KIND_GROUP,
                        status__in=[ConversationParticipant.STATUS_ACTIVE, ConversationParticipant.STATUS_PENDING],
                    )
                    .select_related("user")
                    .only(
                        "id", "conversation_id", "user_id", "role", "status",
                        "joined_at", "last_read_at", "created_at",
                        *(f"user__{field}" for field in PROFILE_SUMMARY_FIELDS),
                    )
                    .order_by("joined_at", "created_at", "id"),
                    to_attr="group_participants",
                )
            )
        else:
            unread_expression = Coalesce(unread_count_subquery, Value(0))
            last_message_expression = last_message_id_subquery
        conversations = list(
            conversations_qs.annotate(
                unread_count_for_request=unread_expression,
                last_message_id=last_message_expression,
            ).order_by("-updated_at", "-id")
        )

        last_message_ids = [
            conversation.last_message_id
            for conversation in conversations
            if getattr(conversation, "last_message_id", None)
        ]
        last_messages = with_message_relations(
            Message.objects.filter(id__in=last_message_ids), user
        )
        last_message_map = {
            message.conversation_id: message for message in last_messages
        }

        serializer = ConversationSerializer(
            conversations,
            many=True,
            context={
                "request": request,
                "include_messages": False,
                "last_message_map": last_message_map,
            },
        )
        payload = serializer.data
        cache.set(cache_key, payload, CONVERSATION_LIST_CACHE_TIMEOUT_SECONDS)
        return Response(payload)

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
            participant = get_profile_by_username_or_404(participant_username)
        except Http404:
            return Response({"error": "User not found"}, status=404)
        if participant.id == user.id:
            return Response({"error": "You cannot message yourself."}, status=400)
        if users_are_blocked(user.id, participant.id):
            return Response(
                {"error": "You cannot start a conversation with this user.", "code": "blocked"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get-or-create for the unordered pair. Locking the lower-id profile row
        # serialises concurrent creates for the same pair (Postgres), so two
        # requests can't both miss the lookup and insert duplicates. If legacy
        # duplicates exist, the oldest conversation always wins.
        created = False
        with transaction.atomic():
            list(
                Profile.objects.select_for_update()
                .filter(id=min(user.id, participant.id))
                .values_list("id", flat=True)
            )
            conversation = (
                Conversation.objects.filter(
                    Q(sender=user, receiver=participant)
                    | Q(sender=participant, receiver=user)
                )
                .order_by("id")
                .first()
            )
            if not conversation:
                # Opening an existing chat is free; only new conversations count
                # (raises Throttled -> 429, the transaction rolls back).
                check_throttles(request, self, CONVERSATION_CREATE_THROTTLES)
                conversation = create_direct_conversation(user, participant)
                created = True

        if created:
            bump_conversation_list_cache_version(user.id)
            bump_conversation_list_cache_version(participant.id)

        return Response({"id": conversation.id})


GIFS_UNAVAILABLE = {"error": "GIFs aren't available right now.", "code": "gifs_unavailable"}
GIFS_UPSTREAM_ERROR = {
    "error": "Couldn't reach the GIF service. Try again.",
    "code": "gifs_upstream_error",
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sticker_packs_view(request):
    """Built-in sticker packs (chatapp/sticker_packs.json). No queries."""
    response = Response({"packs": sticker_packs_payload(request)})
    # Short: sticker URLs carry the static file hash, which changes when the art does.
    response["Cache-Control"] = "private, max-age=300"
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(GifsRateThrottle))
def gifs_view(request):
    """GIF picker: trending without ``q``, search with it. ``offset`` pages,
    ``lang`` (2-letter) localises search. Proxied to GIPHY (chatapp/giphy.py)."""
    try:
        offset = int(request.query_params.get("offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    release_db_connection()
    try:
        result = search_gifs(
            query=request.query_params.get("q", ""),
            offset=offset,
            lang=str(request.query_params.get("lang") or "").strip(),
        )
    except GiphyUnavailable:
        return Response(GIFS_UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except GiphyUpstreamError:
        return Response(GIFS_UPSTREAM_ERROR, status=status.HTTP_502_BAD_GATEWAY)
    return Response({**result, "attribution": "giphy"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatOpenersRateThrottle])
def conversation_openers_view(request, conversation_id):
    """Three opening lines for an empty chat: {"openers": [str], "source": "ai"|"template"}.

    AI lines are cached per chat and viewer and capped per user and globally; unverified
    accounts and AI failures get the rule-based lines (no 403, so the chat doesn't prompt).
    """
    from .openers import conversation_openers

    conversation = get_object_or_404(
        Conversation.objects.select_related("sender", "receiver"), id=conversation_id
    )
    if not is_conversation_member(request.user.id, conversation):
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    if conversation.is_group:
        # Openers are written for one partner; group chats don't offer them.
        return Response({"openers": [], "source": "template"})
    partner = conversation.receiver if conversation.sender_id == request.user.id else conversation.sender
    blocked_by_me, blocked_me = get_block_state(request.user.id, partner.id)
    lines, source = conversation_openers(
        conversation.id,
        request.user,
        partner,
        allow_ai=bool(request.user.email_verified) and not (blocked_by_me or blocked_me),
        # The Gemini call can take seconds; don't hold a pooled connection for it.
        before_ai=release_db_connection,
    )
    return Response({"openers": lines, "source": source})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def mark_conversation_read_view(request, conversation_id):
    conversation = get_object_or_404(
        Conversation,
        id=conversation_id,
    )

    if not is_conversation_member(request.user.id, conversation):
        return Response(
            {"error": "You are not a participant in this conversation.", "code": "not_participant"},
            status=status.HTTP_403_FORBIDDEN,
        )

    if conversation.is_group:
        # Groups keep one read position per member ("Seen by"); Message.status
        # stays "sent" because it can't say who has read it.
        now = timezone.now()
        updated = ConversationParticipant.objects.filter(
            conversation=conversation,
            user=request.user,
            status=ConversationParticipant.STATUS_ACTIVE,
        ).update(last_read_at=now)
        bump_conversation_list_cache_version(request.user.id)
        broadcast_chat_room_event(
            conversation.id,
            "group_read_event",
            conversation_id=conversation.id,
            user_id=request.user.id,
            last_read_at=now.isoformat(),
        )
        broadcast_conversation_update(
            [request.user.id], conversation.id, "messages_read", actor_id=request.user.id
        )
        return Response({"updated": updated, "last_read_at": now}, status=status.HTTP_200_OK)

    messages_to_mark = (
        Message.objects.filter(conversation=conversation)
        .exclude(sender=request.user)
        .exclude(status="read")
    )
    read_ids = list(messages_to_mark.values_list("id", flat=True))
    updated = 0
    if read_ids:
        updated = messages_to_mark.update(status="read")
        for member_id in conversation_member_ids(conversation):
            bump_conversation_list_cache_version(member_id)
        broadcast_message_status_update(
            conversation.id, read_ids, "read", request.user.id
        )
        broadcast_conversation_update(
            conversation_member_ids(conversation),
            conversation.id,
            "messages_read",
            actor_id=request.user.id,
        )

    return Response({"updated": updated}, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(*UPLOAD_THROTTLES))
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
        if slot not in {"profile", "complementary_1", "complementary_2"}:
            slot = "profile"

        safe_extension, image_error = validate_uploaded_file(
            image_file, ALLOWED_IMAGE_TYPES, PROFILE_IMAGE_MAX_BYTES
        )
        if image_error:
            return Response(
                {"error": image_error}, status=status.HTTP_400_BAD_REQUEST
            )

        # The upload can take seconds; reopen the connection only for the save.
        release_db_connection()
        stored_url = ""
        if uses_cloudinary_media_storage():
            try:
                from cloudinary.uploader import upload as cloudinary_upload

                upload_result = cloudinary_upload(
                    image_file,
                    folder="profile_images",
                    resource_type="image",
                    use_filename=True,
                    unique_filename=True,
                    overwrite=False,
                )
                stored_url = (
                    upload_result.get("secure_url") or upload_result.get("url") or ""
                )
            except Exception:
                stored_url = ""

        if not stored_url:
            filename = f"{uuid.uuid4().hex}{safe_extension}"
            path = default_storage.save(f"profile_images/{filename}", image_file)
            try:
                stored_url = default_storage.url(path)
            except Exception:
                stored_url = path

        slot_field = {
            "complementary_1": "complementary_image_1_url",
            "complementary_2": "complementary_image_2_url",
        }.get(slot, "profile_image_url")
        previous_url = getattr(profile, slot_field)
        setattr(profile, slot_field, stored_url)

        profile.save()
        bump_profile_cache_version(profile.id)
        if previous_url and previous_url != stored_url:
            delete_replaced_profile_image(previous_url)
        return Response(
            {
                "message": "Profile image updated successfully.",
                "slot": slot,
                "profile_image_url": build_media_url(
                    request, profile.profile_image_url
                ),
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


class TranslationServiceError(Exception):
    """The translation provider failed, timed out or sent an unusable reply."""


def fetch_google_translation(text, target_language):
    """Return (translated_text, source_language) from Google's public endpoint.

    Network errors and timeouts (OSError, which covers URLError and
    TimeoutError) and malformed payloads raise TranslationServiceError.
    """
    query = urlencode(
        {
            "client": "gtx",
            "sl": "auto",
            "tl": target_language,
            "dt": "t",
            "q": text,
        }
    )
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    try:
        with urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))

        translated_chunks = payload[0] if isinstance(payload, list) and payload else []
        translated_text = "".join(
            chunk[0] for chunk in translated_chunks if isinstance(chunk, list) and chunk
        ).strip()
        source_language = (
            payload[2] if isinstance(payload, list) and len(payload) > 2 else "auto"
        )
    except (OSError, ValueError, TypeError, http.client.HTTPException) as error:
        raise TranslationServiceError() from error
    return translated_text, source_language


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(
    with_default_throttles(TranslateRateThrottle, TranslateDailyRateThrottle)
)
def translate_message_view(request):
    message_id = request.data.get("message_id")
    text = str(request.data.get("text") or "").strip()
    target_language = resolve_language_code(request.data.get("target_language"))
    message = None

    if message_id:
        message = get_object_or_404(
            Message.objects.select_related("conversation"), id=message_id
        )
        if not can_access_message(request.user.id, message):
            return Response(
                {"error": "You do not have access to this message.", "code": "not_participant"},
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
                    "error": "Message already translated for this language.", "code": "already_translated",
                    "already_translated": True,
                    "translated_text": existing_translation.translated_text,
                    "source_language": existing_translation.source_language,
                    "target_language": target_language,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if not text:
        return Response(
            {"error": "Text is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    if len(text) > TRANSLATION_MAX_LENGTH:
        return Response(
            {"error": f"Text is too long (max {TRANSLATION_MAX_LENGTH} characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
                            "source_language": cached_result.get(
                                "source_language", "auto"
                            ),
                            "translated_text": normalized_text,
                        },
                    )
                return Response(
                    {
                        "error": "Message is already in the selected base language.", "code": "same_language",
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

    # All reads are done; don't hold a pooled connection during the HTTP call.
    release_db_connection()
    try:
        translated_text, source_language = fetch_google_translation(
            normalized_text, target_language
        )
    except TranslationServiceError:
        logger.warning("Translation service call failed", exc_info=True)
        return Response(
            {"error": "Translation service is currently unavailable.", "code": "translation_unavailable"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if not translated_text:
        return Response(
            {"error": "Translation service returned an empty response.", "code": "translation_unavailable"},
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
                "error": "Message is already in the selected base language.", "code": "same_language",
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


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(ReactionRateThrottle))
def react_to_message_view(request, message_id):
    message = get_object_or_404(
        Message.objects.select_related("conversation"), id=message_id
    )
    if not can_access_message(request.user.id, message):
        return Response(
            {"error": "You do not have access to this message.", "code": "not_participant"},
            status=status.HTTP_403_FORBIDDEN,
        )

    emoji = (request.data.get("emoji") or "").strip()

    if not emoji:
        MessageReaction.objects.filter(message=message, user=request.user).delete()
    else:
        if not is_reaction_emoji(emoji):
            return Response(
                {"error": "Unsupported reaction."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reaction, created = MessageReaction.objects.get_or_create(
            message=message, user=request.user, emoji=emoji
        )
        if not created:
            reaction.delete()

    message = reload_message_for_serializer(message, request.user)
    serializer = MessageSerializer(message, context={"request": request})
    serialized_message = serializer.data

    broadcast_chat_room_event(
        message.conversation_id,
        "message_reaction_event",
        message=message_broadcast_payload(serialized_message),
    )

    return Response(serialized_message, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def pin_message_view(request, message_id):
    message = get_object_or_404(
        Message.objects.select_related("conversation"), id=message_id
    )
    conversation = message.conversation
    if not can_access_message(request.user.id, message):
        return Response(
            {"error": "You do not have access to this message.", "code": "not_participant"},
            status=status.HTTP_403_FORBIDDEN,
        )

    raw_is_pinned = request.data.get("is_pinned")
    if isinstance(raw_is_pinned, str):
        should_pin = raw_is_pinned.strip().lower() in {"1", "true", "yes", "on"}
    else:
        should_pin = bool(raw_is_pinned)
    update_fields = ["pinned_at", "pinned_by"]

    if should_pin:
        message.pinned_at = timezone.now()
        message.pinned_by = request.user
        trigger = "message_pinned"
    else:
        message.pinned_at = None
        message.pinned_by = None
        trigger = "message_unpinned"

    message.save(update_fields=update_fields)

    for member_id in conversation_member_ids(conversation):
        bump_conversation_list_cache_version(member_id)
    broadcast_conversation_update(
        conversation_member_ids(conversation),
        conversation.id,
        trigger,
        actor_id=request.user.id,
    )

    message = reload_message_for_serializer(message, request.user)
    serializer = MessageSerializer(message, context={"request": request})
    serialized_message = serializer.data

    broadcast_chat_room_event(
        message.conversation_id,
        "message_pin_event",
        message=message_broadcast_payload(serialized_message),
    )

    return Response(serialized_message, status=status.HTTP_200_OK)


def resolve_practice_language(user, requested_language=None):
    requested = (requested_language or "").strip().lower()
    practicing = [
        str(language).strip().lower()
        for language in (getattr(user, "languages_practicing", None) or [])
        if str(language).strip()
    ]
    base_language = (getattr(user, "base_translate_language", "") or "").strip().lower()
    native_language = (getattr(user, "native_language", "") or "").strip().lower()

    candidates = []
    if requested:
        candidates.append(requested)
    candidates.extend(practicing)
    if base_language:
        candidates.append(base_language)
    if native_language:
        candidates.append(native_language)
    candidates.append("english")

    for candidate in candidates:
        if candidate in PRACTICE_LIBRARY:
            return candidate
    return "english"


# Generator prompts still take an internal level (-> CEFR via
# cefr_level_for_level): one representative level per difficulty bucket.
PRACTICE_GENERATOR_LEVEL_FOR_BUCKET = {1: 1, 2: 3, 3: 5}


def split_sentence_parts(sentence):
    if "___" not in sentence:
        return [sentence, None, ""]
    left, right = sentence.split("___", 1)
    return [left, None, right]


def cefr_level_for_level(level):
    if level <= 2:
        return "A1"
    if level <= 4:
        return "A2"
    if level <= 6:
        return "B1"
    return "B2"


def normalize_option_value(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_generator_json_payload(raw_text):
    if not raw_text:
        return None

    candidate_text = str(raw_text).strip()
    fenced_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```", candidate_text, re.DOTALL
    )
    if fenced_match:
        candidate_text = fenced_match.group(1).strip()
    else:
        first = candidate_text.find("{")
        last = candidate_text.rfind("}")
        if first == -1 or last == -1 or last <= first:
            return None
        candidate_text = candidate_text[first : last + 1]

    try:
        payload = json.loads(candidate_text)
    except json.JSONDecodeError:
        return None

    sentence = normalize_option_value(payload.get("sentence"))
    answer = normalize_option_value(payload.get("answer"))
    hint = normalize_option_value(payload.get("hint"))
    options = payload.get("options") or []

    if (
        not sentence
        or "___" not in sentence
        or not answer
        or not isinstance(options, list)
    ):
        return None

    normalized_options = []
    for option in options:
        normalized = normalize_option_value(option)
        if normalized and normalized not in normalized_options:
            normalized_options.append(normalized)

    if answer not in normalized_options:
        normalized_options.append(answer)

    if len(normalized_options) < 4:
        return None

    return {
        "sentence": sentence,
        "answer": answer,
        "hint": hint or "Generated challenge",
        "options": (
            normalized_options[:4]
            if len(normalized_options) > 4
            else normalized_options
        ),
    }


def fetch_generated_challenge_from_huggingface(language, level, bucket):
    token = (os.environ.get("HUGGINGFACE_API_TOKEN") or "").strip()
    if not token:
        return None

    model = (os.environ.get("HUGGINGFACE_MODEL") or "google/flan-t5-large").strip()
    endpoint = f"https://api-inference.huggingface.co/models/{model}"
    cefr = cefr_level_for_level(level)
    prompt = (
        "Generate one language-learning fill-in-the-blank challenge as strict JSON. "
        "Return only JSON with keys sentence, answer, options, hint. "
        f"Language: {language}. Difficulty: CEFR {cefr}. "
        "The sentence must contain exactly one blank token '___'. "
        "Options must be 4 short options and include the answer exactly once."
    )

    request_payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 220,
            "temperature": 0.9,
            "return_full_text": False,
        },
    }
    request_data = json.dumps(request_payload).encode("utf-8")
    request = Request(
        endpoint,
        data=request_data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=PRACTICE_GENERATOR_TIMEOUT_SECONDS) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    generated_text = ""
    if isinstance(parsed, list) and parsed:
        first_item = parsed[0]
        if isinstance(first_item, dict):
            generated_text = first_item.get("generated_text", "") or ""
        elif isinstance(first_item, str):
            generated_text = first_item
    elif isinstance(parsed, dict):
        generated_text = parsed.get("generated_text", "") or ""

    challenge_payload = parse_generator_json_payload(generated_text)
    if not challenge_payload:
        return None

    options = list(challenge_payload["options"])
    if len(options) > 4:
        answer = challenge_payload["answer"]
        distractors = [option for option in options if option != answer]
        random.shuffle(distractors)
        options = distractors[:3] + [answer]
    random.shuffle(options)

    return {
        "sentence": challenge_payload["sentence"],
        "answer": challenge_payload["answer"],
        "hint": challenge_payload["hint"],
        "options": options,
        "difficulty_bucket": bucket,
        "language": language,
    }


def fetch_generated_challenge_from_gemini(language, level, bucket):
    try:
        generated_text = generate_practice_challenge(
            language=language,
            cefr_level=cefr_level_for_level(level),
        )
    except CoachAIError:
        return None

    challenge_payload = parse_generator_json_payload(generated_text)
    if not challenge_payload:
        return None

    options = list(challenge_payload["options"])
    if len(options) > 4:
        answer = challenge_payload["answer"]
        distractors = [option for option in options if option != answer]
        random.shuffle(distractors)
        options = distractors[:3] + [answer]
    random.shuffle(options)

    return {
        "sentence": challenge_payload["sentence"],
        "answer": challenge_payload["answer"],
        "hint": challenge_payload["hint"],
        "options": options,
        "difficulty_bucket": bucket,
        "language": language,
    }


def fetch_generated_challenge(language, level, bucket):
    if not PRACTICE_GENERATOR_ENABLED:
        return None
    if not consume_practice_generator_budget():
        return None
    # Provider calls take seconds; don't hold a pooled DB connection meanwhile.
    release_db_connection()
    if PRACTICE_GENERATOR_PROVIDER == "huggingface":
        return fetch_generated_challenge_from_huggingface(language, level, bucket)
    if PRACTICE_GENERATOR_PROVIDER == "gemini":
        return fetch_generated_challenge_from_gemini(language, level, bucket)
    return None


def store_generated_answer(user_id, challenge_id, answer, language):
    if not challenge_id:
        return
    cache_key = f"practice:generated_answer:user:{user_id}:id:{challenge_id}"
    payload = {
        "answer": normalize_option_value(answer),
        "language": (language or "").strip().lower(),
    }
    cache.set(cache_key, payload, timeout=60 * 10)


def get_generated_answer(user_id, challenge_id):
    cache_key = f"practice:generated_answer:user:{user_id}:id:{challenge_id}"
    cached = cache.get(cache_key)
    if not cached:
        return None, None
    return (
        normalize_option_value(cached.get("answer")),
        (cached.get("language") or "").strip().lower(),
    )


def daily_library_date_key():
    return timezone.now().strftime("%Y%m%d")


def practice_generator_daily_budget_cache_key():
    return f"practice:generator_budget:v1:date:{daily_library_date_key()}"


def get_remaining_practice_generator_budget():
    if PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT <= 0:
        return 0

    used = cache.get(practice_generator_daily_budget_cache_key())
    try:
        used_count = int(used or 0)
    except (TypeError, ValueError):
        used_count = 0
    return max(0, PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT - used_count)


def consume_practice_generator_budget():
    if PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT <= 0:
        return False

    cache_key = practice_generator_daily_budget_cache_key()
    current_value = cache.get(cache_key)
    if cache_degraded():
        # Redis is down, so this paid budget can't be counted: fail closed
        # (callers fall back to the pool / static library) instead of open.
        return False
    if current_value is None:
        cache.set(cache_key, 1, timeout=60 * 60 * 36)
        return True

    try:
        next_value = cache.incr(cache_key)
    except ValueError:
        cache.set(cache_key, 1, timeout=60 * 60 * 36)
        return True

    return int(next_value) <= PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT


def daily_library_cache_key(language, bucket):
    return f"practice:daily_library:v1:date:{daily_library_date_key()}:lang:{language}:bucket:{bucket}"


def daily_library_seen_cache_key(user_id, language, bucket):
    return (
        f"practice:daily_library_seen:v1:date:{daily_library_date_key()}:"
        f"user:{user_id}:lang:{language}:bucket:{bucket}"
    )


def recent_practice_signatures_cache_key(user_id, language, bucket):
    return (
        f"practice:recent_signatures:v1:user:{user_id}:lang:{language}:bucket:{bucket}"
    )


def get_seen_daily_indexes(user_id, language, bucket):
    cached = cache.get(daily_library_seen_cache_key(user_id, language, bucket))
    if not isinstance(cached, list):
        return set()
    seen = set()
    for item in cached:
        try:
            seen.add(int(item))
        except (TypeError, ValueError):
            continue
    return seen


def store_seen_daily_indexes(user_id, language, bucket, seen_indexes):
    normalized = sorted(
        {
            int(index)
            for index in (seen_indexes or set())
            if isinstance(index, int) or str(index).isdigit()
        }
    )
    cache.set(
        daily_library_seen_cache_key(user_id, language, bucket),
        normalized,
        timeout=60 * 60 * 36,
    )


def get_recent_practice_signatures(user_id, language, bucket):
    cached = cache.get(recent_practice_signatures_cache_key(user_id, language, bucket))
    if not isinstance(cached, list):
        return []
    return [
        normalize_option_value(item) for item in cached if normalize_option_value(item)
    ]


def store_recent_practice_signature(
    user_id, language, bucket, signature, *, limit=6, timeout=60 * 60 * 36
):
    normalized_signature = normalize_option_value(signature)
    if not normalized_signature:
        return

    recent = [
        item
        for item in get_recent_practice_signatures(user_id, language, bucket)
        if item != normalized_signature
    ]
    recent.append(normalized_signature)
    cache.set(
        recent_practice_signatures_cache_key(user_id, language, bucket),
        recent[-max(1, int(limit)) :],
        timeout=timeout,
    )


def daily_library_refill_lock_key(language, bucket):
    return f"practice:daily_library_refill_lock:v1:date:{daily_library_date_key()}:lang:{language}:bucket:{bucket}"


def daily_library_item(generated, language, bucket):
    return {
        "sentence": generated.get("sentence", ""),
        "answer": generated.get("answer", ""),
        "hint": generated.get("hint", ""),
        "options": list(generated.get("options") or []),
        "difficulty_bucket": bucket,
        "language": language,
        "source": "generator_daily",
    }


def get_or_build_daily_library(
    language, level, bucket, target_size=None, min_ready=None
):
    """Bulk-fill the shared daily pool (used by `prewarm_daily_practice`).

    Requests use top_up_daily_library instead, which makes at most one call.
    """
    cache_key = daily_library_cache_key(language, bucket)
    cached = cache.get(cache_key)
    pool = cached if isinstance(cached, list) else []

    unique_sentences = {
        normalize_option_value(item.get("sentence"))
        for item in pool
        if isinstance(item, dict) and item.get("sentence")
    }
    desired_target_size = max(
        int(target_size or PRACTICE_DAILY_LIBRARY_SIZE),
        int(min_ready or PRACTICE_DAILY_LIBRARY_MIN_READY),
    )
    desired_min_ready = int(min_ready or PRACTICE_DAILY_LIBRARY_MIN_READY)
    needs_refill = len(pool) < desired_min_ready

    if needs_refill:
        remaining_budget = get_remaining_practice_generator_budget()
        if remaining_budget <= 0:
            return pool

        missing = max(0, desired_target_size - len(pool))
        max_attempts = min(max(6, missing * 4), remaining_budget)
        attempts = 0
        while len(pool) < desired_target_size and attempts < max_attempts:
            attempts += 1
            generated = fetch_generated_challenge(language, level, bucket)
            if not generated:
                continue

            sentence_key = normalize_option_value(generated.get("sentence"))
            if not sentence_key or sentence_key in unique_sentences:
                continue

            unique_sentences.add(sentence_key)
            pool.append(daily_library_item(generated, language, bucket))

        if pool:
            # Keep for ~36h so it survives day boundaries and cache jitter.
            cache.set(cache_key, pool, timeout=60 * 60 * 36)

    return pool


def top_up_daily_library(language, level, bucket):
    """Return the shared daily pool, adding at most one generated item.

    Request path only. While the pool is below PRACTICE_DAILY_LIBRARY_MIN_READY,
    one request per language/bucket/day (a cache.add lock) makes a single
    generator call; concurrent requests serve what exists (or the static
    library). Returns (pool, made_generator_call). Bulk refill is left to the
    `prewarm_daily_practice` command.
    """
    cache_key = daily_library_cache_key(language, bucket)
    cached = cache.get(cache_key)
    pool = cached if isinstance(cached, list) else []
    if len(pool) >= PRACTICE_DAILY_LIBRARY_MIN_READY:
        return pool, False
    if get_remaining_practice_generator_budget() <= 0:
        return pool, False

    lock_key = daily_library_refill_lock_key(language, bucket)
    # Deleted below; the expiry only covers a worker dying mid-call.
    if not cache.add(lock_key, 1, timeout=60):
        return pool, False
    try:
        generated = fetch_generated_challenge(language, level, bucket)
        if not generated:
            return pool, True
        # Re-read: the prewarm command may have written while we waited.
        cached = cache.get(cache_key)
        pool = cached if isinstance(cached, list) else pool
        sentence_key = normalize_option_value(generated.get("sentence"))
        existing = {
            normalize_option_value(item.get("sentence"))
            for item in pool
            if isinstance(item, dict) and item.get("sentence")
        }
        if sentence_key and sentence_key not in existing:
            pool = [*pool, daily_library_item(generated, language, bucket)]
            # Keep for ~36h so it survives day boundaries and cache jitter.
            cache.set(cache_key, pool, timeout=60 * 60 * 36)
        return pool, True
    finally:
        cache.delete(lock_key)


PRACTICE_LIBRARY_ROUND_TTL_SECONDS = 60 * 60 * 24 * 30


def library_round_cache_key(user_id, language, bucket, namespace="library_round"):
    """``namespace`` separates libraries sharing the round mechanism: the drill
    (``library_round``) and Voice Repeat (``voice_round``)."""
    return f"practice:{namespace}:v1:user:{user_id}:lang:{language}:bucket:{bucket}"


def library_bucket_signature(challenges, text_key="sentence"):
    """Changes whenever items are added, removed or edited in a bucket."""
    joined = "\n".join(
        normalize_option_value((challenge or {}).get(text_key))
        for challenge in challenges
    )
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]
    return f"{len(challenges)}:{digest}"


def _fresh_library_order(
    size, recent_signatures, challenges, avoid_index=None, text_key="sentence"
):
    order = list(range(size))
    random.shuffle(order)
    if size > 1:
        # Don't open a round with the item just served or one seen recently.
        for position, index in enumerate(order):
            sentence = normalize_option_value(challenges[index].get(text_key))
            if index != avoid_index and sentence not in recent_signatures:
                order[0], order[position] = order[position], order[0]
                break
    return order


def next_library_index(
    user_id,
    language,
    bucket,
    challenges,
    recent_signatures,
    *,
    namespace="library_round",
    text_key="sentence",
):
    """Pick the next built-in item for a user: no repeats until the bucket is exhausted.

    Shared by the drill library (``namespace="library_round"``, items keyed by
    ``sentence``) and the Voice Repeat library (``"voice_round"``, ``text``).

    Per user and (language, bucket) the cache holds a shuffled order of the
    bucket's indexes plus a cursor (30 days). When the cursor reaches the end a
    new shuffled round starts (not with the last-served item) and
    ``round_complete`` is True for that first item. A library change (signature
    mismatch) keeps what was already served this round and shuffles the rest.
    Without the cache (Redis down / evicted) every request starts a fresh
    order, i.e. a random pick that avoids recent sentences. Returns
    ``(index, round_complete)``.
    """
    size = len(challenges)
    signature = library_bucket_signature(challenges, text_key)
    cache_key = library_round_cache_key(user_id, language, bucket, namespace)
    try:
        state = cache.get(cache_key)
    except Exception:
        state = None

    round_complete = False
    order = None
    cursor = 0
    last_index = None
    if isinstance(state, dict):
        raw_order = state.get("order")
        raw_cursor = state.get("cursor")
        last_index = state.get("last")
        if isinstance(raw_order, list) and isinstance(raw_cursor, int):
            valid = [i for i in raw_order if isinstance(i, int) and 0 <= i < size]
            if state.get("signature") == signature and sorted(valid) == list(range(size)):
                order, cursor = valid, max(0, raw_cursor)
            else:
                served = []
                for i in valid[: max(0, raw_cursor)]:
                    if i not in served:
                        served.append(i)
                remaining = [i for i in range(size) if i not in served]
                random.shuffle(remaining)
                order, cursor = served + remaining, len(served)

    if order is None:
        order = _fresh_library_order(
            size, recent_signatures, challenges, text_key=text_key
        )
        cursor = 0
    elif cursor >= len(order):
        order = _fresh_library_order(
            size, set(), challenges, avoid_index=last_index, text_key=text_key
        )
        cursor = 0
        round_complete = True

    index = order[cursor]
    try:
        cache.set(
            cache_key,
            {"signature": signature, "order": order, "cursor": cursor + 1, "last": index},
            timeout=PRACTICE_LIBRARY_ROUND_TTL_SECONDS,
        )
    except Exception:
        pass
    return index, round_complete


def build_challenge(language, bucket, user_id):
    """Next drill item for ``language`` at difficulty ``bucket`` (1-3, from the
    user's PracticeLanguageProgress via ``current_bucket``)."""
    bucket = clamp_bucket(bucket)
    level = PRACTICE_GENERATOR_LEVEL_FOR_BUCKET[bucket]
    recent_signatures = set(get_recent_practice_signatures(user_id, language, bucket))
    # A request makes at most one (slow) generator call in total.
    made_generator_call = False
    if PRACTICE_GENERATOR_ENABLED and PRACTICE_GENERATOR_MODE in {"daily", "hybrid"}:
        daily_pool, made_generator_call = top_up_daily_library(
            language, level, bucket
        )
        if daily_pool:
            seen_indexes = get_seen_daily_indexes(user_id, language, bucket)
            available_indexes = [
                index for index in range(len(daily_pool)) if index not in seen_indexes
            ]
            daily_round_complete = False
            if not available_indexes:
                # Every pooled item was served today: start a fresh round.
                daily_round_complete = bool(seen_indexes)
                seen_indexes = set()
                available_indexes = list(range(len(daily_pool)))

            preferred_indexes = [
                index
                for index in available_indexes
                if normalize_option_value((daily_pool[index] or {}).get("sentence"))
                not in recent_signatures
            ]
            candidate_indexes = preferred_indexes or available_indexes

            index = random.choice(candidate_indexes)
            seen_indexes.add(index)
            store_seen_daily_indexes(user_id, language, bucket, seen_indexes)
            template = daily_pool[index]
            options = list(template.get("options") or [])
            random.shuffle(options)
            challenge_id = (
                f"dailygen:{daily_library_date_key()}:{language}:{bucket}:{index}"
            )
            store_generated_answer(
                user_id,
                challenge_id,
                template.get("answer", ""),
                language,
            )
            store_recent_practice_signature(
                user_id,
                language,
                bucket,
                template.get("sentence", ""),
            )
            return {
                "id": challenge_id,
                "sentence_parts": split_sentence_parts(template.get("sentence", "")),
                "options": options,
                "hint": template.get("hint", ""),
                "difficulty_bucket": template.get("difficulty_bucket", bucket),
                "language": language,
                "source": "generator_daily",
                "round_complete": daily_round_complete,
            }

    if (
        PRACTICE_GENERATOR_ENABLED
        and PRACTICE_GENERATOR_MODE in {"realtime", "hybrid"}
        and not made_generator_call
    ):
        generated = fetch_generated_challenge(language, level, bucket)
        if generated:
            challenge_id = f"gen:{uuid.uuid4().hex[:16]}"
            store_generated_answer(user_id, challenge_id, generated["answer"], language)
            store_recent_practice_signature(
                user_id,
                language,
                bucket,
                generated.get("sentence", ""),
            )
            return {
                "id": challenge_id,
                "sentence_parts": split_sentence_parts(generated["sentence"]),
                "options": generated["options"],
                "hint": generated.get("hint", ""),
                "difficulty_bucket": generated.get("difficulty_bucket", bucket),
                "language": language,
                "source": "generator",
                "round_complete": False,
            }

    challenges = PRACTICE_LIBRARY.get(language, PRACTICE_LIBRARY["english"]).get(
        bucket, []
    )
    if not challenges:
        return None

    index, round_complete = next_library_index(
        user_id, language, bucket, challenges, recent_signatures
    )
    template = challenges[index]
    options = list(template["options"])
    random.shuffle(options)
    store_recent_practice_signature(
        user_id,
        language,
        bucket,
        template.get("sentence", ""),
    )

    return {
        "id": f"{language}:{bucket}:{index}",
        "sentence_parts": split_sentence_parts(template["sentence"]),
        "options": options,
        "hint": template.get("hint", ""),
        "difficulty_bucket": bucket,
        "language": language,
        "source": "library",
        "round_complete": round_complete,
    }


def get_challenge_answer(challenge_id, user_id):
    challenge_key = str(challenge_id or "")
    if challenge_key.startswith("gen:") or challenge_key.startswith("dailygen:"):
        cached_answer = get_generated_answer(user_id, challenge_key)
        if cached_answer[0]:
            return cached_answer
        if challenge_key.startswith("dailygen:"):
            try:
                _, day_key, language_key, bucket_raw, index_raw = challenge_key.split(
                    ":"
                )
                bucket = int(bucket_raw)
                index = int(index_raw)
            except (ValueError, AttributeError):
                return None, None

            cache_key = f"practice:daily_library:v1:date:{day_key}:lang:{language_key}:bucket:{bucket}"
            pool = cache.get(cache_key) or []
            if 0 <= index < len(pool):
                entry = pool[index] or {}
                answer = normalize_option_value(entry.get("answer"))
                if answer:
                    return answer, (language_key or "").strip().lower()

    try:
        language, bucket_raw, index_raw = challenge_key.split(":")
        bucket = int(bucket_raw)
        index = int(index_raw)
    except (ValueError, AttributeError):
        return None, None

    language_key = (language or "").strip().lower()
    buckets = PRACTICE_LIBRARY.get(language_key) or PRACTICE_LIBRARY["english"]
    challenge_list = buckets.get(bucket) or []
    if index < 0 or index >= len(challenge_list):
        return None, None
    return challenge_list[index]["answer"], language_key


def practice_scored_cache_key(user_id, challenge_id):
    # challenge_id is client-supplied: hash it so the cache key stays short and safe.
    digest = hashlib.sha256(str(challenge_id).encode("utf-8")).hexdigest()[:32]
    return f"practice:scored:v1:user:{user_id}:id:{digest}"


def serialize_practice_stats(stats):
    accuracy = 0
    if stats.total_answers:
        accuracy = round((stats.correct_answers / stats.total_answers) * 100, 1)
    return {
        "points": stats.points,
        "xp": stats.xp,
        "level": stats.level,
        "correct_answers": stats.correct_answers,
        "total_answers": stats.total_answers,
        "accuracy": accuracy,
        "preferred_language": stats.preferred_language,
    }


def get_leaderboard(
    language, current_user_id, current_stats=None, limit=10, request=None
):
    qs = PracticeStats.objects.select_related("user")
    ordering = ("-points", "-xp", "updated_at")
    filtered_qs = qs.filter(preferred_language__iexact=language)
    top_entries = list(filtered_qs.order_by(*ordering)[:limit])
    if not top_entries:
        # Nobody practises this language yet: fall back to the global board.
        filtered_qs = qs
        top_entries = list(filtered_qs.order_by(*ordering)[:limit])

    leaderboard = []
    for idx, entry in enumerate(top_entries, start=1):
        leaderboard.append(
            {
                "rank": idx,
                "username": entry.user.username,
                "points": entry.points,
                "level": entry.level,
                "xp": entry.xp,
                "is_current_user": entry.user_id == current_user_id,
                # Same URL logic as People/profile payloads; the user row is
                # already joined (select_related), so no extra query.
                "profile_image_url": (
                    build_media_url(request, entry.user.profile_image_url)
                    if request is not None
                    else (entry.user.profile_image_url or None)
                ),
            }
        )

    if current_stats is None:
        current_stats = PracticeStats.objects.filter(user_id=current_user_id).first()
    current_rank = None
    if current_stats:
        current_rank = filtered_qs.filter(points__gt=current_stats.points).count() + 1

    return leaderboard, current_rank


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def practice_state_view(request):
    language = resolve_practice_language(
        request.user,
        request.query_params.get("language"),
    )
    stats, _ = PracticeStats.objects.get_or_create(
        user=request.user,
        defaults={"preferred_language": language},
    )
    if not stats.preferred_language:
        stats.preferred_language = language
        stats.save(update_fields=["preferred_language", "updated_at"])
    progress = get_language_progress(request.user, language, stats)

    leaderboard, current_rank = get_leaderboard(
        language, request.user.id, current_stats=stats, request=request
    )
    return Response(
        {
            "language": language,
            "stats": serialize_practice_stats(stats),
            "progress": serialize_language_progress(progress),
            "leaderboard": leaderboard,
            "current_rank": current_rank,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def practice_challenge_view(request):
    language = resolve_practice_language(
        request.user,
        request.query_params.get("language"),
    )
    stats, _ = PracticeStats.objects.get_or_create(
        user=request.user,
        defaults={"preferred_language": language},
    )
    if stats.level != practice_level_from_xp(stats.xp):
        stats.level = practice_level_from_xp(stats.xp)
        stats.save(update_fields=["level", "updated_at"])

    # Difficulty is per language and mastery based (practice_progress), not XP.
    challenge = build_challenge(
        language, current_bucket(request.user, language, stats), request.user.id
    )
    if not challenge:
        return Response(
            {"error": "No challenge templates available."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    # Library ids repeat (lang:bucket:idx): serving one again makes it scorable again.
    cache.delete(practice_scored_cache_key(request.user.id, challenge.get("id")))

    return Response(
        {
            "language": language,
            "challenge": challenge,
            "stats": serialize_practice_stats(stats),
        },
        status=status.HTTP_200_OK,
    )


def practice_daily_xp_cache_key(user_id):
    return f"practice:daily_xp:v1:user:{user_id}:date:{timezone.now():%Y%m%d}"


def consume_practice_daily_xp(user_id, xp):
    """Reserve up to ``xp`` of today's XP allowance; returns the XP granted."""
    if xp <= 0 or PRACTICE_DAILY_XP_LIMIT <= 0:
        return xp
    cache_key = practice_daily_xp_cache_key(user_id)
    cache.add(cache_key, 0, timeout=60 * 60 * 25)
    try:
        total = int(cache.incr(cache_key, xp))
    except ValueError:
        cache.set(cache_key, xp, timeout=60 * 60 * 25)
        total = xp
    over = total - PRACTICE_DAILY_XP_LIMIT
    return xp if over <= 0 else max(0, xp - over)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PracticeSubmitRateThrottle))
def practice_submit_view(request):
    challenge_id = request.data.get("challenge_id")
    selected_word = (request.data.get("selected_word") or "").strip()
    requested_language = request.data.get("language")

    if not challenge_id:
        return Response(
            {"error": "challenge_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    answer, language_from_challenge = get_challenge_answer(
        challenge_id, request.user.id
    )
    if not answer:
        return Response(
            {"error": "Invalid challenge_id."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    language = (
        resolve_practice_language(request.user, requested_language)
        or language_from_challenge
    )
    is_correct = normalize_option_value(selected_word) == normalize_option_value(answer)

    stats, _ = PracticeStats.objects.get_or_create(
        user=request.user,
        defaults={"preferred_language": language},
    )
    awarded_xp = PRACTICE_XP_CORRECT if is_correct else PRACTICE_XP_WRONG
    awarded_points = PRACTICE_POINTS_CORRECT if is_correct else PRACTICE_POINTS_WRONG

    # Idempotency: a challenge is scored once per serving (double clicks, retries and
    # replays of the same id award nothing). cache.add is atomic, so of two concurrent
    # submits only one wins. A repeat gets the same response shape with 0 awarded and
    # the first attempt's result.
    scored_key = practice_scored_cache_key(request.user.id, challenge_id)
    already_scored = not cache.add(
        scored_key, {"correct": is_correct}, timeout=PRACTICE_SCORED_TTL_SECONDS
    )
    daily_xp_limit_reached = False
    if already_scored:
        previous = cache.get(scored_key) or {}
        is_correct = bool(previous.get("correct", is_correct))
        awarded_xp = 0
        awarded_points = 0
    else:
        # Daily XP cap (stops scripted farming of the leaderboard): past it the
        # answer still counts, but no XP or points are awarded.
        granted_xp = consume_practice_daily_xp(request.user.id, awarded_xp)
        if granted_xp < awarded_xp:
            daily_xp_limit_reached = True
            if granted_xp == 0:
                awarded_points = 0
            awarded_xp = granted_xp
        try:
            # Atomic increments so concurrent submits don't lose updates. The level
            # mirrors practice_level_from_xp(): (xp // 100) + 1 on the new xp value.
            PracticeStats.objects.filter(pk=stats.pk).update(
                preferred_language=language,
                total_answers=F("total_answers") + 1,
                correct_answers=F("correct_answers") + (1 if is_correct else 0),
                points=F("points") + awarded_points,
                xp=F("xp") + awarded_xp,
                level=(F("xp") + awarded_xp) / 100 + 1,
                updated_at=timezone.now(),
            )
        except Exception:
            # Nothing was scored: let the user submit again.
            cache.delete(scored_key)
            raise
        stats.refresh_from_db()

    # Per-language difficulty: every first-time-scored answer counts (also past
    # the daily XP cap); replays of a scored id (already_scored) do not.
    progress_change = None
    if already_scored:
        progress = get_language_progress(request.user, language, stats)
    else:
        progress, progress_change = record_practice_result(
            request.user,
            language,
            is_correct,
            stats,
            item_bucket=challenge_bucket(challenge_id),
        )

    leaderboard, current_rank = get_leaderboard(
        language, request.user.id, current_stats=stats, request=request
    )
    return Response(
        {
            "correct": is_correct,
            "correct_answer": answer,
            "awarded_xp": awarded_xp,
            "awarded_points": awarded_points,
            "already_scored": already_scored,
            "daily_xp_limit_reached": daily_xp_limit_reached,
            "language": language,
            "stats": serialize_practice_stats(stats),
            "progress": serialize_language_progress(progress, progress_change),
            "leaderboard": leaderboard,
            "current_rank": current_rank,
        },
        status=status.HTTP_200_OK,
    )


# ---------- Voice Repeat (server-side sentence library + capped XP) ----------

# A served sentence id can be claimed for XP for this long.
PRACTICE_VOICE_SERVED_TTL_SECONDS = 60 * 60 * 24
# Per-day keys outlive the UTC day a little (like practice:daily_xp).
PRACTICE_VOICE_DAY_TTL_SECONDS = 60 * 60 * 25
PRACTICE_VOICE_ROUND_NAMESPACE = "voice_round"


def voice_pass_threshold(text):
    """Minimum speech-match score (0-1) that counts as a pass.

    Mirrors the clients' ``requiredSpeechMatchThreshold`` (web practiceUtils.js,
    mobile features/practiceVoice.ts): <=4 words 0.62, <=7 words 0.68, else 0.72.
    """
    words = voice_word_count(text)
    if words <= 4:
        return 0.62
    if words <= 7:
        return 0.68
    return 0.72


def practice_voice_day_key():
    return f"{timezone.now():%Y%m%d}"


def practice_voice_served_cache_key(user_id, sentence_id):
    return f"practice:voice_served:v1:user:{user_id}:id:{sentence_id}"


def practice_voice_awarded_cache_key(user_id, sentence_id):
    return (
        f"practice:voice_awarded:v1:user:{user_id}:date:{practice_voice_day_key()}"
        f":id:{sentence_id}"
    )


def practice_voice_awards_cache_key(user_id):
    return f"practice:voice_awards:v1:user:{user_id}:date:{practice_voice_day_key()}"


def _safe_cache_delete(key):
    try:
        cache.delete(key)
    except Exception:
        pass


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(VoiceNextRateThrottle))
def practice_voice_next_view(request):
    """Next Voice Repeat sentence at the user's difficulty for the language,
    no repeats per round."""
    language = resolve_practice_language(
        request.user,
        request.query_params.get("language"),
    )
    if language not in VOICE_LIBRARY:
        language = "english"
    # Same per-language bucket as the drill; voice passes never change it
    # (their score is client-reported).
    bucket = current_bucket(request.user, language)
    items = VOICE_LIBRARY[language].get(bucket) or []
    if not items:
        return error_response(
            "No voice sentences available.",
            "voice_library_empty",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    index, round_complete = next_library_index(
        request.user.id,
        language,
        bucket,
        items,
        set(),
        namespace=PRACTICE_VOICE_ROUND_NAMESPACE,
        text_key="text",
    )
    item = items[index]
    sentence_id = voice_sentence_id(language, bucket, index)
    try:
        # Only served ids can earn XP (see practice_voice_complete_view).
        cache.set(
            practice_voice_served_cache_key(request.user.id, sentence_id),
            1,
            timeout=PRACTICE_VOICE_SERVED_TTL_SECONDS,
        )
    except Exception:
        pass
    payload = {
        "id": sentence_id,
        "text": item["text"],
        "language": language,
        "bucket": bucket,
        "round_complete": round_complete,
        "pass_threshold": voice_pass_threshold(item["text"]),
    }
    if item.get("translation_hint"):
        payload["translation_hint"] = item["translation_hint"]
    return Response(payload, status=status.HTTP_200_OK)


def _parse_voice_score(raw_score):
    if isinstance(raw_score, bool) or raw_score is None:
        return None
    try:
        score = float(raw_score)
    except (TypeError, ValueError):
        return None
    if score != score or not 0.0 <= score <= 1.0:  # NaN or out of range
        return None
    return score


def _claim_voice_award(user_id, sentence_id):
    """Run the award checks; returns ``(reason, awarded_xp)``.

    ``reason`` is ``awarded`` or why nothing was awarded: ``not_served``,
    ``already_scored``, ``daily_voice_limit``, ``daily_xp_limit`` or
    ``unavailable`` (cache down: fail closed, the served-id check can't run).
    """
    if cache_degraded():
        return "unavailable", 0
    try:
        served = cache.get(practice_voice_served_cache_key(user_id, sentence_id))
    except Exception:
        return "unavailable", 0
    if not served:
        return ("unavailable" if cache_degraded() else "not_served"), 0

    awarded_key = practice_voice_awarded_cache_key(user_id, sentence_id)
    try:
        # Atomic: of two concurrent claims for the same sentence only one wins.
        added = cache.add(awarded_key, 1, timeout=PRACTICE_VOICE_DAY_TTL_SECONDS)
    except Exception:
        return "unavailable", 0
    if not added:
        return "already_scored", 0
    if cache_degraded():
        # ResilientRedisCache.add reports True when Redis failed.
        return "unavailable", 0

    counter_key = practice_voice_awards_cache_key(user_id)
    try:
        cache.add(counter_key, 0, timeout=PRACTICE_VOICE_DAY_TTL_SECONDS)
        awards_today = int(cache.incr(counter_key))
    except Exception:
        _safe_cache_delete(awarded_key)
        return "unavailable", 0
    if PRACTICE_VOICE_DAILY_AWARDS > 0 and awards_today > PRACTICE_VOICE_DAILY_AWARDS:
        _safe_cache_delete(awarded_key)
        return "daily_voice_limit", 0

    granted_xp = consume_practice_daily_xp(user_id, PRACTICE_VOICE_XP)
    if granted_xp <= 0 and PRACTICE_VOICE_XP > 0:
        _safe_cache_delete(awarded_key)
        return "daily_xp_limit", 0
    return "awarded", granted_xp


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(VoiceCompleteRateThrottle))
def practice_voice_complete_view(request):
    """Claim XP for a passed Voice Repeat sentence.

    Speech is scored on the device, so the claim is capped instead of trusted:
    the id must have been served to this user (24 h), ``score`` must reach
    ``voice_pass_threshold``, each sentence pays once per UTC day, at most
    ``PRACTICE_VOICE_DAILY_AWARDS`` awards per day, inside ``PRACTICE_DAILY_XP_LIMIT``.
    Without the cache it fails closed (200, nothing awarded, ``awards_unavailable``).
    """
    sentence_id = request.data.get("id")
    parsed = parse_voice_sentence_id(sentence_id)
    if parsed is None:
        return error_response(
            "Unknown voice sentence id.", "invalid_voice_id", status.HTTP_400_BAD_REQUEST
        )
    score = _parse_voice_score(request.data.get("score"))
    if score is None:
        return error_response(
            "score must be a number between 0 and 1.",
            "invalid_score",
            status.HTTP_400_BAD_REQUEST,
        )
    language, _bucket, _index, item = parsed
    threshold = voice_pass_threshold(item["text"])
    passed = score >= threshold

    stats, _ = PracticeStats.objects.get_or_create(
        user=request.user,
        defaults={"preferred_language": language},
    )
    if passed:
        reason, awarded_xp = _claim_voice_award(request.user.id, sentence_id)
    else:
        reason, awarded_xp = "below_threshold", 0
    awarded_points = PRACTICE_VOICE_POINTS if reason == "awarded" else 0

    if awarded_xp or awarded_points:
        try:
            # Same atomic update as the drill submit (no answer counters: voice
            # attempts are not drill answers). Level = (xp // 100) + 1.
            PracticeStats.objects.filter(pk=stats.pk).update(
                points=F("points") + awarded_points,
                xp=F("xp") + awarded_xp,
                level=(F("xp") + awarded_xp) / 100 + 1,
                updated_at=timezone.now(),
            )
        except Exception:
            # Nothing was awarded: let the user claim again.
            _safe_cache_delete(
                practice_voice_awarded_cache_key(request.user.id, sentence_id)
            )
            raise
        stats.refresh_from_db()

    leaderboard, current_rank = get_leaderboard(
        language, request.user.id, current_stats=stats, request=request
    )
    daily_voice_limit_reached = reason == "daily_voice_limit"
    daily_xp_limit_reached = reason == "daily_xp_limit" or (
        reason == "awarded" and awarded_xp < PRACTICE_VOICE_XP
    )
    return Response(
        {
            "id": sentence_id,
            "language": language,
            "passed": passed,
            "pass_threshold": threshold,
            "awarded_xp": awarded_xp,
            "awarded_points": awarded_points,
            "already_scored": reason == "already_scored",
            "daily_limit_reached": daily_voice_limit_reached or daily_xp_limit_reached,
            "daily_voice_limit_reached": daily_voice_limit_reached,
            "daily_xp_limit_reached": daily_xp_limit_reached,
            "awards_unavailable": reason == "unavailable",
            "reason": reason,
            "stats": serialize_practice_stats(stats),
            "leaderboard": leaderboard,
            "current_rank": current_rank,
        },
        status=status.HTTP_200_OK,
    )
