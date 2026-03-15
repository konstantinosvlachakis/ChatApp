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
from .models import (
    BlockedUser,
    Conversation,
    Message,
    MessageTranslation,
    MessageReaction,
    PracticeStats,
    UserReport,
)
from .serializers import MessageSerializer
from .serializers import ConversationSerializer
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
from django.db.models import Q
from django.db.models import Count, OuterRef, Subquery
from django.core.files.storage import default_storage
import os
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import urllib.error
import hashlib
import re
import random
from datetime import datetime
from django.core.cache import cache
from django.core.paginator import EmptyPage, Paginator
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone
from django.db import transaction
from .gemini import (
    CoachAIError,
    CoachAIQuotaError,
    generate_coach_reply,
    generate_practice_challenge,
)

ALLOWED_REACTION_EMOJIS = {"👍", "❤️", "😂", "😮", "😢", "🙏"}
PROFILE_LIST_CACHE_VERSION_KEY = "profile_data:version"
PROFILE_LIST_CACHE_TIMEOUT_SECONDS = 30
PROFILE_LIST_DEFAULT_PAGE_SIZE = 24
PROFILE_LIST_MAX_PAGE_SIZE = 100
PROFILE_CACHE_VERSION_KEY_TEMPLATE = "profile:version:user:{user_id}"
PROFILE_CACHE_TIMEOUT_SECONDS = 60 * 5
CONVERSATION_LIST_CACHE_VERSION_KEY_TEMPLATE = (
    "conversation_list:version:user:{user_id}"
)
CONVERSATION_LIST_CACHE_TIMEOUT_SECONDS = 20
PRACTICE_XP_CORRECT = 15
PRACTICE_XP_WRONG = 3
PRACTICE_POINTS_CORRECT = 10
PRACTICE_POINTS_WRONG = 1
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
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@langvoyage.app")

PRACTICE_LIBRARY = {
    "english": {
        1: [
            {
                "sentence": "I ___ to school every day.",
                "answer": "go",
                "options": ["go", "goes", "went", "going"],
                "hint": "Present simple, first person.",
            },
            {
                "sentence": "She ___ coffee in the morning.",
                "answer": "drinks",
                "options": ["drink", "drinks", "drank", "drinking"],
                "hint": "Present simple, third person.",
            },
            {
                "sentence": "We ___ in Athens.",
                "answer": "live",
                "options": ["live", "lives", "lived", "living"],
                "hint": "Current fact.",
            },
            {
                "sentence": "They ___ football on Sunday.",
                "answer": "play",
                "options": ["play", "plays", "played", "playing"],
                "hint": "Habit action.",
            },
        ],
        2: [
            {
                "sentence": "Yesterday, he ___ to the market.",
                "answer": "went",
                "options": ["go", "goes", "went", "gone"],
                "hint": "Past tense of go.",
            },
            {
                "sentence": "I am ___ dinner right now.",
                "answer": "cooking",
                "options": ["cook", "cooked", "cooking", "cooks"],
                "hint": "Present continuous form.",
            },
            {
                "sentence": "They have ___ their homework.",
                "answer": "finished",
                "options": ["finish", "finished", "finishing", "finishes"],
                "hint": "Present perfect with 'have'.",
            },
            {
                "sentence": "She was ___ when I called.",
                "answer": "sleeping",
                "options": ["sleep", "sleeping", "slept", "sleeps"],
                "hint": "Past continuous action.",
            },
        ],
        3: [
            {
                "sentence": "If I had more time, I would ___ Spanish.",
                "answer": "practice",
                "options": ["practice", "practiced", "practicing", "practices"],
                "hint": "Conditional base verb.",
            },
            {
                "sentence": "By next year, we will have ___ the course.",
                "answer": "completed",
                "options": ["complete", "completed", "completing", "completes"],
                "hint": "Future perfect.",
            },
            {
                "sentence": "He suggested that she ___ earlier.",
                "answer": "arrive",
                "options": ["arrive", "arrived", "arrives", "arriving"],
                "hint": "Subjunctive after 'suggested that'.",
            },
            {
                "sentence": "The project ___ before the deadline.",
                "answer": "was finished",
                "options": ["was finished", "is finishing", "finished", "has finish"],
                "hint": "Past passive voice.",
            },
        ],
    },
    "spanish": {
        1: [
            {
                "sentence": "Yo ___ al trabajo cada día.",
                "answer": "voy",
                "options": ["voy", "vas", "fui", "ir"],
                "hint": "Presente, primera persona.",
            },
            {
                "sentence": "Ella ___ café por la mañana.",
                "answer": "bebe",
                "options": ["bebo", "bebe", "bebió", "beber"],
                "hint": "Presente, tercera persona.",
            },
            {
                "sentence": "Nosotros ___ en Grecia.",
                "answer": "vivimos",
                "options": ["vivo", "viven", "vivimos", "viví"],
                "hint": "Presente, nosotros.",
            },
            {
                "sentence": "Ellos ___ fútbol el domingo.",
                "answer": "juegan",
                "options": ["juegan", "juega", "jugaron", "jugar"],
                "hint": "Presente plural.",
            },
        ],
        2: [
            {
                "sentence": "Ayer, él ___ al mercado.",
                "answer": "fue",
                "options": ["va", "fue", "ir", "iba"],
                "hint": "Pretérito de ir.",
            },
            {
                "sentence": "Estoy ___ la cena ahora.",
                "answer": "cocinando",
                "options": ["cocino", "cocinando", "cociné", "cocinar"],
                "hint": "Gerundio.",
            },
            {
                "sentence": "Hemos ___ la tarea.",
                "answer": "terminado",
                "options": ["terminar", "terminado", "terminamos", "termina"],
                "hint": "Participio en pretérito perfecto.",
            },
            {
                "sentence": "Cuando llamé, ella estaba ___.",
                "answer": "durmiendo",
                "options": ["duerme", "durmió", "durmiendo", "dormir"],
                "hint": "Imperfecto progresivo.",
            },
        ],
        3: [
            {
                "sentence": "Si tuviera más tiempo, ___ más francés.",
                "answer": "practicaría",
                "options": ["practico", "practicaría", "practiqué", "practicar"],
                "hint": "Condicional.",
            },
            {
                "sentence": "Para el próximo año, habremos ___ el curso.",
                "answer": "completado",
                "options": ["completar", "completado", "completamos", "completará"],
                "hint": "Futuro perfecto.",
            },
            {
                "sentence": "Él sugirió que ella ___ temprano.",
                "answer": "llegara",
                "options": ["llega", "llegó", "llegara", "llegar"],
                "hint": "Subjuntivo pasado.",
            },
            {
                "sentence": "El informe ___ antes del plazo.",
                "answer": "fue enviado",
                "options": ["fue enviado", "envía", "enviando", "ha enviar"],
                "hint": "Voz pasiva.",
            },
        ],
    },
    "french": {
        1: [
            {
                "sentence": "Je ___ au travail chaque jour.",
                "answer": "vais",
                "options": ["vais", "va", "allé", "aller"],
                "hint": "Présent, première personne.",
            },
            {
                "sentence": "Elle ___ du café le matin.",
                "answer": "boit",
                "options": ["bois", "boit", "bu", "boire"],
                "hint": "Présent, troisième personne.",
            },
            {
                "sentence": "Nous ___ à Paris.",
                "answer": "habitons",
                "options": ["habite", "habitent", "habitons", "habité"],
                "hint": "Présent, nous.",
            },
            {
                "sentence": "Ils ___ au football le dimanche.",
                "answer": "jouent",
                "options": ["joue", "jouent", "joué", "jouer"],
                "hint": "Présent pluriel.",
            },
        ],
        2: [
            {
                "sentence": "Hier, il ___ au marché.",
                "answer": "est allé",
                "options": ["va", "allait", "est allé", "aller"],
                "hint": "Passé composé.",
            },
            {
                "sentence": "Je suis en train de ___ le dîner.",
                "answer": "préparer",
                "options": ["prépare", "préparer", "préparé", "préparant"],
                "hint": "Infinitif après expression.",
            },
            {
                "sentence": "Nous avons ___ nos devoirs.",
                "answer": "fini",
                "options": ["fini", "finissons", "finir", "finissait"],
                "hint": "Participe passé.",
            },
            {
                "sentence": "Quand tu as appelé, elle était en train de ___.",
                "answer": "dormir",
                "options": ["dort", "dormi", "dormir", "dormait"],
                "hint": "Action en cours.",
            },
        ],
        3: [
            {
                "sentence": "Si j'avais plus de temps, je ___ plus l'espagnol.",
                "answer": "pratiquerais",
                "options": ["pratique", "pratiquerais", "pratiqué", "pratiquer"],
                "hint": "Conditionnel présent.",
            },
            {
                "sentence": "D'ici l'an prochain, nous aurons ___ le cours.",
                "answer": "terminé",
                "options": ["terminer", "terminé", "terminons", "terminera"],
                "hint": "Futur antérieur.",
            },
            {
                "sentence": "Il faut que tu ___ tôt.",
                "answer": "arrives",
                "options": ["arrives", "arrivé", "arriver", "arrivait"],
                "hint": "Subjonctif présent.",
            },
            {
                "sentence": "Le dossier ___ avant la date limite.",
                "answer": "a été envoyé",
                "options": ["a été envoyé", "est envoyant", "envoie", "a envoyer"],
                "hint": "Voix passive composée.",
            },
        ],
    },
    "greek": {
        1: [
            {
                "sentence": "Εγώ ___ στο σχολείο κάθε μέρα.",
                "answer": "πηγαίνω",
                "options": ["πηγαίνω", "πηγαίνει", "πήγα", "πηγαίνεις"],
                "hint": "Ενεστώτας, πρώτο πρόσωπο.",
            },
            {
                "sentence": "Αυτή ___ καφέ το πρωί.",
                "answer": "πίνει",
                "options": ["πίνω", "πίνει", "ήπιε", "πίνουν"],
                "hint": "Ενεστώτας, τρίτο πρόσωπο.",
            },
            {
                "sentence": "Εμείς ___ στην Αθήνα.",
                "answer": "μένουμε",
                "options": ["μένω", "μένει", "μένουμε", "έμεινα"],
                "hint": "Ενεστώτας, πρώτο πληθυντικό.",
            },
            {
                "sentence": "Αυτοί ___ ποδόσφαιρο την Κυριακή.",
                "answer": "παίζουν",
                "options": ["παίζω", "παίζει", "παίζουν", "έπαιξαν"],
                "hint": "Ενεστώτας, τρίτο πληθυντικό.",
            },
        ],
        2: [
            {
                "sentence": "Χθες, αυτός ___ στην αγορά.",
                "answer": "πήγε",
                "options": ["πηγαίνει", "πήγε", "πάει", "πηγαίνω"],
                "hint": "Αόριστος του 'πηγαίνω'.",
            },
            {
                "sentence": "Τώρα ___ το βραδινό.",
                "answer": "μαγειρεύω",
                "options": ["μαγειρεύω", "μαγείρεψα", "μαγειρεύει", "μαγειρεύοντας"],
                "hint": "Ενεστώτας, τρέχουσα δράση.",
            },
            {
                "sentence": "Έχουμε ___ τις ασκήσεις.",
                "answer": "τελειώσει",
                "options": ["τελειώνουμε", "τελείωσα", "τελειώσει", "τελειώνει"],
                "hint": "Παρακείμενος.",
            },
            {
                "sentence": "Όταν τηλεφώνησες, αυτή ___ .",
                "answer": "κοιμόταν",
                "options": ["κοιμάται", "κοιμήθηκε", "κοιμόταν", "κοιμηθεί"],
                "hint": "Παρατατικός.",
            },
        ],
        3: [
            {
                "sentence": "Αν είχα περισσότερο χρόνο, θα ___ περισσότερα ισπανικά.",
                "answer": "εξασκούσα",
                "options": ["εξασκώ", "εξασκούσα", "εξάσκησα", "εξασκείται"],
                "hint": "Υποθετικός λόγος.",
            },
            {
                "sentence": "Μέχρι του χρόνου, θα έχουμε ___ το μάθημα.",
                "answer": "ολοκληρώσει",
                "options": ["ολοκληρώνω", "ολοκλήρωσα", "ολοκληρώσει", "ολοκληρώνει"],
                "hint": "Συντελεσμένος μέλλοντας.",
            },
            {
                "sentence": "Πρότεινε να ___ νωρίτερα.",
                "answer": "έρθει",
                "options": ["έρχεται", "ήρθε", "έρθει", "ερχόταν"],
                "hint": "Υποτακτική.",
            },
            {
                "sentence": "Η αναφορά ___ πριν την προθεσμία.",
                "answer": "στάλθηκε",
                "options": ["στέλνεται", "έστειλε", "στάλθηκε", "στείλει"],
                "hint": "Παθητική φωνή, αόριστος.",
            },
        ],
    },
    "russian": {
        1: [
            {
                "sentence": "Я ___ в школу каждый день.",
                "answer": "хожу",
                "options": ["хожу", "ходит", "пошёл", "идти"],
                "hint": "Настоящее время, 1-е лицо.",
            },
            {
                "sentence": "Она ___ кофе утром.",
                "answer": "пьёт",
                "options": ["пью", "пьёт", "пила", "пить"],
                "hint": "Настоящее время, 3-е лицо.",
            },
            {
                "sentence": "Мы ___ в Афинах.",
                "answer": "живём",
                "options": ["живу", "живёт", "живём", "жил"],
                "hint": "Настоящее время, множественное число.",
            },
            {
                "sentence": "Они ___ футбол в воскресенье.",
                "answer": "играют",
                "options": ["играю", "играет", "играют", "играл"],
                "hint": "Настоящее время, 3-е лицо мн.ч.",
            },
        ],
        2: [
            {
                "sentence": "Вчера он ___ на рынок.",
                "answer": "пошёл",
                "options": ["идёт", "пошёл", "идти", "ходил"],
                "hint": "Прошедшее время.",
            },
            {
                "sentence": "Сейчас я ___ ужин.",
                "answer": "готовлю",
                "options": ["готовлю", "готовил", "готовит", "готовить"],
                "hint": "Действие сейчас.",
            },
            {
                "sentence": "Мы уже ___ домашнее задание.",
                "answer": "сделали",
                "options": ["делаем", "сделали", "сделать", "делал"],
                "hint": "Завершённое действие.",
            },
            {
                "sentence": "Когда ты позвонил, она ___ .",
                "answer": "спала",
                "options": ["спит", "спала", "спать", "уснёт"],
                "hint": "Длительное действие в прошлом.",
            },
        ],
        3: [
            {
                "sentence": "Если бы у меня было больше времени, я бы ___ русский.",
                "answer": "практиковал",
                "options": [
                    "практикую",
                    "практиковал",
                    "практиковать",
                    "практиковал бы",
                ],
                "hint": "Условная конструкция.",
            },
            {
                "sentence": "К следующему году мы ___ курс.",
                "answer": "закончим",
                "options": ["заканчиваем", "закончим", "закончили", "закончить"],
                "hint": "Будущее действие.",
            },
            {
                "sentence": "Учитель попросил, чтобы он ___ раньше.",
                "answer": "пришёл",
                "options": ["приходит", "пришёл", "прийти", "приходил"],
                "hint": "Прошедшая форма в придаточном.",
            },
            {
                "sentence": "Отчёт ___ до дедлайна.",
                "answer": "был отправлен",
                "options": ["был отправлен", "отправляет", "отправил", "отправить"],
                "hint": "Страдательный залог.",
            },
        ],
    },
}


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
    is_blocked_by_me = BlockedUser.objects.filter(
        blocker_id=viewer_id, blocked_id=profile_id
    ).exists()
    has_blocked_me = BlockedUser.objects.filter(
        blocker_id=profile_id, blocked_id=viewer_id
    ).exists()
    return is_blocked_by_me, has_blocked_me


def broadcast_message_status_update(
    conversation_id, message_ids, status_value, actor_id
):
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


def broadcast_presence_update(user_id, is_online):
    channel_layer = get_channel_layer()
    if not channel_layer or not user_id:
        return

    async_to_sync(channel_layer.group_send)(
        "presence_global",
        {
            "type": "presence_update_event",
            "user_id": int(user_id),
            "is_online": bool(is_online),
        },
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_presence_offline_view(request):
    user = request.user
    with transaction.atomic():
        profile = Profile.objects.select_for_update().filter(id=user.id).first()
        if not profile:
            return Response(
                {"detail": "Profile not found."}, status=status.HTTP_404_NOT_FOUND
            )

        was_online = bool(profile.is_online or profile.ws_connection_count)
        profile.ws_connection_count = 0
        profile.is_online = False
        profile.last_seen = timezone.now()
        profile.save(update_fields=["ws_connection_count", "is_online", "last_seen"])

    if was_online:
        broadcast_presence_update(user.id, False)

    return Response({"ok": True})


def get_coach_chat_rate_limit_key(user_id):
    return f"coach_chat:rate_limit:user:{user_id}"


def consume_coach_chat_rate_limit(user_id):
    cache_key = get_coach_chat_rate_limit_key(user_id)
    current_value = cache.get(cache_key)
    if current_value is None:
        cache.set(cache_key, 1, timeout=COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS)
        return True

    try:
        next_value = cache.incr(cache_key)
    except ValueError:
        cache.set(cache_key, 1, timeout=COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS)
        return True

    return int(next_value) <= COACH_CHAT_RATE_LIMIT_REQUESTS


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def coach_chat_view(request):
    message = str(request.data.get("message") or "").strip()
    if not message:
        return Response(
            {"detail": "Message is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    if not consume_coach_chat_rate_limit(request.user.id):
        return Response(
            {
                "detail": "You are sending messages too quickly. Please wait a moment before asking the coach again."
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    target_language = (
        str(request.data.get("target_language") or "").strip()
        or getattr(request.user, "base_translate_language", None)
        or getattr(request.user, "native_language", None)
        or "english"
    )
    native_language = getattr(request.user, "native_language", None) or "english"
    mode = str(request.data.get("mode") or "casual_chat").strip() or "casual_chat"

    try:
        reply = generate_coach_reply(
            message=message,
            target_language=target_language,
            native_language=native_language,
            mode=mode,
        )
    except CoachAIQuotaError as error:
        return Response(
            {"detail": str(error)},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    except CoachAIError as error:
        return Response(
            {"detail": str(error)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(
        {
            "reply": reply,
            "target_language": str(target_language).strip() or "english",
            "native_language": str(native_language).strip() or "english",
            "mode": mode,
        },
        status=status.HTTP_200_OK,
    )


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
        "support_email": SUPPORT_EMAIL,
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

    blocked_user_ids = get_blocked_user_ids(request.user.id)
    profiles_qs = Profile.objects.exclude(id=request.user.id)
    if blocked_user_ids:
        profiles_qs = profiles_qs.exclude(id__in=blocked_user_ids)
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
    is_blocked_by_me, has_blocked_me = get_block_state(request.user.id, profile.id)
    if is_blocked_by_me or has_blocked_me:
        return JsonResponse({"error": "This user is unavailable."}, status=403)
    cache_version = get_profile_cache_version(profile.id)
    cache_key = (
        f"public_profile:v{cache_version}:user:{profile.id}:viewer:{request.user.id}:"
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
        "is_blocked_by_me": is_blocked_by_me,
        "has_blocked_me": has_blocked_me,
    }
    cache.set(cache_key, profile_data, PROFILE_CACHE_TIMEOUT_SECONDS)
    return JsonResponse(profile_data, status=200)


@api_view(["PATCH"])
# @permission_classes([IsAuthenticated])
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        user = request.user
        should_bump_profile_list = False

        # Update fields if they are present in the request body
        username = data.get("username")
        native_language = data.get("native_language")
        base_translate_language = data.get("base_translate_language")
        languages_practicing = data.get("languages_practicing")
        email = data.get("email")
        date_of_birth = data.get("date_of_birth")
        location = data.get("location")
        avatar_ring_color = data.get("avatar_ring_color")
        profile_image_url = data.get(
            "profile_image_url"
        )  # Include profile image URL if necessary

        # Update only if data is provided
        if username:
            if Profile.objects.exclude(id=user.id).filter(username=username).exists():
                return JsonResponse({"error": "Username already exists"}, status=400)
            user.username = username
            should_bump_profile_list = True
        if native_language:
            user.native_language = native_language
            should_bump_profile_list = True
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
            should_bump_profile_list = True
        if email is not None:
            normalized_email = str(email).strip().lower()
            if not normalized_email:
                return JsonResponse({"error": "Email cannot be empty"}, status=400)
            if (
                Profile.objects.exclude(id=user.id)
                .filter(email=normalized_email)
                .exists()
            ):
                return JsonResponse({"error": "Email already exists"}, status=400)
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
        if avatar_ring_color is not None:
            normalized_ring_color = str(avatar_ring_color).strip().lower()
            if not re.fullmatch(r"#[0-9a-f]{6}", normalized_ring_color):
                return JsonResponse(
                    {"error": "Invalid avatar ring color"},
                    status=400,
                )
            user.avatar_ring_color = normalized_ring_color
        if profile_image_url:
            user.profile_image_url = profile_image_url  # Update profile image URL

        # Save the updated user object
        user.save()
        if should_bump_profile_list:
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
                    "email": user.email,
                    "date_of_birth": user.date_of_birth,
                    "location": user.location or "",
                    "location_updated_at": user.location_updated_at,
                    "profile_image_url": (user.profile_image_url or None),
                    "avatar_ring_color": user.avatar_ring_color or "#1b7f79",
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


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_account_view(request):
    user = request.user
    user_id = user.id
    username = user.username
    user.delete()
    bump_profile_list_cache_version()
    bump_profile_cache_version(user_id)
    bump_conversation_list_cache_version(user_id)
    return Response(
        {"message": f"Account for {username} deleted successfully."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def block_user_view(request, username):
    target = get_object_or_404(Profile, username=username)

    if target.id == request.user.id:
        return Response(
            {"error": "You cannot block yourself."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "POST":
        BlockedUser.objects.get_or_create(blocker=request.user, blocked=target)
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
def report_user_view(request, username):
    target = get_object_or_404(Profile, username=username)

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
        if users_are_blocked(conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "This conversation is unavailable."},
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

        messages_qs = conversation.messages.all().order_by("-timestamp", "-id")
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

    def post(self, request, conversation_id):
        # Fetch conversation where the user is the sender
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
        )
        if request.user.id not in (conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "You are not a participant in this conversation."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if users_are_blocked(conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "You cannot message a blocked user."},
                status=status.HTTP_403_FORBIDDEN,
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
        bump_conversation_list_cache_version(conversation.sender_id)
        bump_conversation_list_cache_version(conversation.receiver_id)
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
        conversation = message.conversation
        message.delete()
        bump_conversation_list_cache_version(conversation.sender_id)
        bump_conversation_list_cache_version(conversation.receiver_id)
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
        if users_are_blocked(conversation.sender_id, conversation.receiver_id):
            return Response(
                {"error": "This conversation is unavailable."},
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

        serializer = ConversationSerializer(
            conversation,
            context={"request": request, "include_messages": True},
        )
        return Response(serializer.data)

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        participant_ids = [conversation.sender_id, conversation.receiver_id]
        conversation.delete()
        for user_id in participant_ids:
            bump_conversation_list_cache_version(user_id)
        return Response(
            {"message": "Conversation deleted successfully"}, status=status.HTTP_200_OK
        )


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        last_message_id_subquery = Subquery(
            Message.objects.filter(conversation_id=OuterRef("pk"))
            .order_by("-timestamp", "-id")
            .values("id")[:1]
        )
        conversations = (
            Conversation.objects.filter(
                Q(sender=request.user) | Q(receiver=request.user)
            )
            .select_related("sender", "receiver")
            .annotate(
                unread_count_for_request=Count(
                    "messages",
                    filter=~Q(messages__sender=request.user)
                    & ~Q(messages__status="read"),
                ),
                last_message_id=last_message_id_subquery,
            )
            .order_by("-updated_at", "-id")
        )
        blocked_user_ids = get_blocked_user_ids(request.user.id)
        if blocked_user_ids:
            conversations = conversations.exclude(sender_id__in=blocked_user_ids).exclude(
                receiver_id__in=blocked_user_ids
            )
        messages_to_deliver = (
            Message.objects.filter(conversation__in=conversations)
            .exclude(sender=request.user)
            .filter(status="sent")
        )
        updates_by_conversation = {}
        for message_id, conv_id in messages_to_deliver.values_list(
            "id", "conversation_id"
        ):
            updates_by_conversation.setdefault(conv_id, []).append(message_id)

        if updates_by_conversation:
            messages_to_deliver.update(status="delivered")
            for conv_id, message_ids in updates_by_conversation.items():
                broadcast_message_status_update(
                    conv_id, message_ids, "delivered", request.user.id
                )

        cache_version = get_conversation_list_cache_version(request.user.id)
        cache_key = (
            f"conversation_list:v{cache_version}:user:{request.user.id}:"
            f"host:{request.get_host()}"
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        last_message_ids = [
            conversation.last_message_id
            for conversation in conversations
            if getattr(conversation, "last_message_id", None)
        ]
        last_messages = Message.objects.filter(id__in=last_message_ids).select_related(
            "sender"
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
            participant = Profile.objects.get(username=participant_username)
        except Profile.DoesNotExist:
            return Response({"error": "User not found"}, status=404)
        if participant.id == user.id:
            return Response({"error": "You cannot message yourself."}, status=400)
        if users_are_blocked(user.id, participant.id):
            return Response(
                {"error": "You cannot start a conversation with this user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if a conversation already exists between the two users
        conversation = Conversation.objects.filter(
            Q(sender=user, receiver=participant) | Q(sender=participant, receiver=user)
        ).first()

        if not conversation:
            # Create a new conversation
            conversation = Conversation.objects.create(
                sender=user, receiver=participant
            )
            bump_conversation_list_cache_version(user.id)
            bump_conversation_list_cache_version(participant.id)

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
        bump_conversation_list_cache_version(conversation.sender_id)
        bump_conversation_list_cache_version(conversation.receiver_id)
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

        stored_url = ""
        using_cloudinary_storage = (
            getattr(settings, "DEFAULT_FILE_STORAGE", "")
            == "cloudinary_storage.storage.MediaCloudinaryStorage"
        )

        if using_cloudinary_storage:
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
            ext = os.path.splitext(image_file.name)[1] or ".jpg"
            filename = f"{uuid.uuid4().hex}{ext}"
            path = default_storage.save(f"profile_images/{filename}", image_file)
            try:
                stored_url = default_storage.url(path)
            except Exception:
                stored_url = path

        if slot == "complementary_1":
            profile.complementary_image_1_url = stored_url
        elif slot == "complementary_2":
            profile.complementary_image_2_url = stored_url
        else:
            profile.profile_image_url = stored_url

        profile.save()
        bump_profile_list_cache_version()
        bump_profile_cache_version(profile.id)
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def translate_message_view(request):
    message_id = request.data.get("message_id")
    text = (request.data.get("text") or "").strip()
    target_language = resolve_language_code(request.data.get("target_language"))
    message = None

    if message_id:
        message = get_object_or_404(Message, id=message_id)
        participants = {
            message.conversation.sender_id,
            message.conversation.receiver_id,
        }
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
        return Response(
            {"error": "Text is required."}, status=status.HTTP_400_BAD_REQUEST
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
        source_language = (
            payload[2] if isinstance(payload, list) and len(payload) > 2 else "auto"
        )

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


def practice_level_from_xp(xp_value):
    xp = max(int(xp_value or 0), 0)
    return (xp // 100) + 1


def practice_bucket_for_level(level):
    if level <= 2:
        return 1
    if level <= 4:
        return 2
    return 3


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


def get_or_build_daily_library(
    language, level, bucket, target_size=None, min_ready=None
):
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
            pool.append(
                {
                    "sentence": generated.get("sentence", ""),
                    "answer": generated.get("answer", ""),
                    "hint": generated.get("hint", ""),
                    "options": list(generated.get("options") or []),
                    "difficulty_bucket": bucket,
                    "language": language,
                    "source": "generator_daily",
                }
            )

        if pool:
            # Keep for ~36h so it survives day boundaries and cache jitter.
            cache.set(cache_key, pool, timeout=60 * 60 * 36)

    return pool


def build_challenge(language, level, user_id):
    bucket = practice_bucket_for_level(level)
    recent_signatures = set(get_recent_practice_signatures(user_id, language, bucket))
    if PRACTICE_GENERATOR_ENABLED and PRACTICE_GENERATOR_MODE in {"daily", "hybrid"}:
        daily_pool = get_or_build_daily_library(language, level, bucket)
        if daily_pool:
            seen_indexes = get_seen_daily_indexes(user_id, language, bucket)
            available_indexes = [
                index for index in range(len(daily_pool)) if index not in seen_indexes
            ]
            if not available_indexes:
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
            }

    if PRACTICE_GENERATOR_ENABLED and PRACTICE_GENERATOR_MODE in {"realtime", "hybrid"}:
        generated = None
        for _ in range(4):
            candidate = fetch_generated_challenge(language, level, bucket)
            if not candidate:
                continue
            sentence_signature = normalize_option_value(candidate.get("sentence"))
            if sentence_signature and sentence_signature in recent_signatures:
                generated = candidate
                continue
            generated = candidate
            break
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
            }

    challenges = PRACTICE_LIBRARY.get(language, PRACTICE_LIBRARY["english"]).get(
        bucket, []
    )
    if not challenges:
        return None

    available_indexes = list(range(len(challenges)))
    preferred_indexes = [
        index
        for index, challenge in enumerate(challenges)
        if normalize_option_value(challenge.get("sentence")) not in recent_signatures
    ]
    candidate_indexes = preferred_indexes or available_indexes

    index = random.choice(candidate_indexes)
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


def get_leaderboard(language, current_user_id, limit=10):
    qs = PracticeStats.objects.select_related("user")
    filtered_qs = qs.filter(preferred_language__iexact=language)
    if not filtered_qs.exists():
        filtered_qs = qs

    top_entries = list(filtered_qs.order_by("-points", "-xp", "updated_at")[:limit])
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
            }
        )

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

    leaderboard, current_rank = get_leaderboard(language, request.user.id)
    return Response(
        {
            "language": language,
            "stats": serialize_practice_stats(stats),
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

    challenge = build_challenge(language, stats.level, request.user.id)
    if not challenge:
        return Response(
            {"error": "No challenge templates available."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "language": language,
            "challenge": challenge,
            "stats": serialize_practice_stats(stats),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
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
    stats.preferred_language = language
    stats.total_answers += 1

    if is_correct:
        stats.correct_answers += 1
        stats.points += PRACTICE_POINTS_CORRECT
        stats.xp += PRACTICE_XP_CORRECT
    else:
        stats.points += PRACTICE_POINTS_WRONG
        stats.xp += PRACTICE_XP_WRONG

    stats.level = practice_level_from_xp(stats.xp)
    stats.save()

    leaderboard, current_rank = get_leaderboard(language, request.user.id)
    return Response(
        {
            "correct": is_correct,
            "correct_answer": answer,
            "awarded_xp": PRACTICE_XP_CORRECT if is_correct else PRACTICE_XP_WRONG,
            "awarded_points": (
                PRACTICE_POINTS_CORRECT if is_correct else PRACTICE_POINTS_WRONG
            ),
            "language": language,
            "stats": serialize_practice_stats(stats),
            "leaderboard": leaderboard,
            "current_rank": current_rank,
        },
        status=status.HTTP_200_OK,
    )
