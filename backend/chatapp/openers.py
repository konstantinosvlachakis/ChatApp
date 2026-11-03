"""Opening lines for an empty chat: three AI suggestions, cached per chat and viewer, with
rule-based lines (the web's ``buildConversationStarters``) whenever AI isn't available."""
import logging
import os
import re

from django.core.cache import cache
from django.utils import timezone

from .demo_profiles import DEMO_BIO_PREFIX
from .gemini import CoachAIError, generate_conversation_openers

logger = logging.getLogger(__name__)

OPENER_COUNT = 3
OPENER_MAX_LENGTH = 160
FIELD_MAX_LENGTH = 200
# AI lines are cached per (chat, viewer): reopening the chat costs nothing.
CACHE_SECONDS = 7 * 24 * 60 * 60
DAILY_LIMIT_PER_USER = int(os.environ.get("CHAT_OPENERS_DAILY_LIMIT", "20"))
GLOBAL_DAILY_LIMIT = int(os.environ.get("CHAT_OPENERS_GLOBAL_DAILY_LIMIT", "2000"))
SPOKEN_LEVELS = {"advanced", "fluent"}


def cache_key(conversation_id, viewer_id):
    return f"chat_openers:v1:conv:{conversation_id}:user:{viewer_id}"


def _label(value):
    value = str(value or "").strip()
    return value[:1].upper() + value[1:] if value else ""


def _trim(value, limit=FIELD_MAX_LENGTH):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _city(location):
    return _trim(str(location or "").split(",")[0], 60)


def _levels(user):
    return {str(k).lower(): str(v).lower() for k, v in (user.practice_language_levels or {}).items()}


def spoken_languages(user):
    """Native + practised languages at Advanced/Fluent (the People matching rule)."""
    levels = _levels(user)
    spoken = [str(user.native_language or "").lower()] if user.native_language else []
    spoken += [lang.lower() for lang in (user.languages_practicing or []) if levels.get(lang.lower()) in SPOKEN_LEVELS]
    return list(dict.fromkeys(language for language in spoken if language))


def profile_context(user, include_about=True):
    """What the model sees about a person: languages and, for the partner, goal and interests."""
    levels = _levels(user)
    context = {
        "name": _trim(user.username, 40),
        "native_language": _label(user.native_language),
        "learning": [
            f"{_label(lang)} ({levels.get(lang.lower(), 'level unknown')})"
            for lang in (user.languages_practicing or [])[:4]
        ],
    }
    if include_about:
        bio = str(user.bio or "")
        if bio.startswith(DEMO_BIO_PREFIX):
            bio = bio[len(DEMO_BIO_PREFIX):]
        context.update({"goal": _trim(user.learning_goal), "about": _trim(bio), "city": _city(user.location)})
    return {key: value for key, value in context.items() if value}


def template_openers(viewer, partner):
    """Rule-based lines, matching the web's ``buildConversationStarters``."""
    lines = []
    goal = _trim(partner.learning_goal, 80)
    if goal:
        lines.append(f"I saw your goal: “{goal}”. How can I help?")
    practising = [lang.lower() for lang in (partner.languages_practicing or [])]
    viewer_native = str(viewer.native_language or "").lower()
    viewer_levels = _levels(viewer)
    shared = next((lang for lang in practising if lang in spoken_languages(viewer)), "")
    if shared and shared == viewer_native:
        lines.append(f"I'm a native {_label(shared)} speaker. Want to practice together?")
    elif shared and viewer_levels.get(shared) == "fluent":
        lines.append(f"I speak fluent {_label(shared)}. Want to practice together?")
    elif shared:
        lines.append(f"I speak {_label(shared)} well. Want to practice together?")
    elif practising:
        lines.append(f"How long have you been learning {_label(practising[0])}?")
    if partner.native_language:
        native = _label(partner.native_language)
        lines.append(f"What's {'an' if native[0] in 'AEIOU' else 'a'} {native} phrase you use every day?")
    lines.append("What got you into language exchange?")
    return list(dict.fromkeys(lines))[:OPENER_COUNT]


def clean_openers(raw):
    """Keep short, single-line, link-free suggestions; None unless all three survive."""
    cleaned = []
    for item in raw:
        text = re.sub(r"\s+", " ", str(item)).strip().strip('"“”').strip()
        if not text or len(text) > OPENER_MAX_LENGTH or re.search(r"https?://|www\.", text, re.I):
            continue
        if text.lower() not in {line.lower() for line in cleaned}:
            cleaned.append(text)
    return cleaned[:OPENER_COUNT] if len(cleaned) >= OPENER_COUNT else None


def _within_limits(viewer_id):
    # Imported lazily: views imports this module.
    from .views import consume_cache_counter

    day = f"{timezone.now():%Y%m%d}"
    return consume_cache_counter(
        f"chat_openers:daily:user:{viewer_id}:date:{day}", DAILY_LIMIT_PER_USER, 60 * 60 * 25
    ) and consume_cache_counter(f"chat_openers:global_daily:date:{day}", GLOBAL_DAILY_LIMIT, 60 * 60 * 25)


def conversation_openers(conversation_id, viewer, partner, allow_ai=True, before_ai=None):
    """(lines, source): cached AI lines, fresh AI lines, or templates ("template")."""
    key = cache_key(conversation_id, viewer.id)
    try:
        cached = cache.get(key)
    except Exception:  # noqa: BLE001 - the cache fails open; treat as a miss
        cached = None
    if cached:
        return cached, "ai"
    fallback = template_openers(viewer, partner)
    if not allow_ai or not _within_limits(viewer.id):
        return fallback, "template"
    viewer_context = profile_context(viewer, include_about=False)
    partner_context = profile_context(partner)
    if before_ai:
        before_ai()
    try:
        lines = clean_openers(generate_conversation_openers(viewer_context, partner_context))
    except CoachAIError as error:
        logger.info("Chat openers fell back to templates: %s", error)
        lines = None
    if not lines:
        return fallback, "template"
    try:
        cache.set(key, lines, CACHE_SECONDS)
    except Exception:  # noqa: BLE001
        pass
    return lines, "ai"
