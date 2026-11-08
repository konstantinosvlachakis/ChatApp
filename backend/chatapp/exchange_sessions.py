"""Guided exchange sessions: rules, lazy timers, topics and the end summary.

A session splits ``duration_minutes`` between two languages: ``first_language``
until the halfway point (or an earlier "switch"), then ``second_language``.
Timers are never driven by a worker: ``refresh_session`` applies invite expiry
and the end of the timer whenever a session is read or acted on, and clients
count down locally from ``ends_at`` / ``halfway_at`` (with ``server_time`` to
correct clock skew).

Topics come from Lumi (Gemini, one batch per session, within the openers'
daily limits) when available, otherwise from ``TOPIC_LIBRARY``, pitched at the
lower of the two learners' levels.
"""
import logging
import re
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import serializers

from .models import ExchangeSession, Message, MessageCorrection

logger = logging.getLogger(__name__)

DURATIONS = (10, 20, 30)
INVITE_TTL = timedelta(minutes=10)
# An ended session stays visible (end card) this long after it ends.
RECENT_ENDED_WINDOW = timedelta(hours=1)
TOPIC_TITLE_MAX_LENGTH = 120
TOPIC_PROMPT_MAX_LENGTH = 160
AI_TOPIC_COUNT = 5
SUMMARY_CORRECTIONS_LIMIT = 20

LEVEL_TIERS = {"beginner": 1, "intermediate": 2, "advanced": 3, "fluent": 3}

# Language-neutral prompts (shown in English), by learner level tier.
TOPIC_LIBRARY = {
    1: [
        ("t1-food", "Food you love", ["What do you usually eat for breakfast?", "What is a typical dish from your city?", "Do you like cooking?"]),
        ("t1-day", "Your day", ["What time do you get up?", "What do you do in the evening?", "What is your favourite day of the week?"]),
        ("t1-family", "Family and friends", ["Do you have brothers or sisters?", "Who do you see most often?", "Describe a friend in three words."]),
        ("t1-home", "Your home town", ["Where do you live?", "What can you see from your window?", "What is the weather like today?"]),
        ("t1-hobbies", "Hobbies", ["What do you do at the weekend?", "Do you play a sport or an instrument?", "What would you like to learn?"]),
        ("t1-shopping", "Shopping", ["Where do you buy food?", "What did you buy last?", "Do you prefer shops or markets?"]),
        ("t1-animals", "Animals", ["Do you have a pet?", "What is your favourite animal?", "Which animal is common where you live?"]),
        ("t1-holidays", "Holidays", ["Where did you go on your last holiday?", "Beach or mountains?", "What do you pack first?"]),
    ],
    2: [
        ("t2-travel", "A memorable trip", ["Tell me about a trip that surprised you.", "What went wrong, and how did you solve it?", "Where would you go next?"]),
        ("t2-work", "Work and study", ["What does a normal week look like for you?", "What do you enjoy most about it?", "What would you change?"]),
        ("t2-festivals", "Festivals and traditions", ["Which celebration matters most where you live?", "What do people eat or wear?", "How has it changed since you were a child?"]),
        ("t2-media", "Films, series and music", ["What have you watched recently?", "Would you recommend it? Why?", "Which song reminds you of a place?"]),
        ("t2-city", "Living in a city", ["What is good and bad about where you live?", "How do you get around?", "What would you show a visitor?"]),
        ("t2-childhood", "Childhood memories", ["What games did you play as a child?", "Describe your first school.", "What did you want to be?"]),
        ("t2-language", "Learning languages", ["Why are you learning this language?", "What is the hardest part so far?", "Share a word you love."]),
        ("t2-weekend", "Plan a weekend together", ["Plan a weekend in my city using both languages.", "Where would we eat?", "What would we skip?"]),
    ],
    3: [
        ("t3-tech", "Technology and daily life", ["Has technology made life simpler or busier?", "Which app could you not live without?", "What should stay offline?"]),
        ("t3-culture", "Culture shock", ["What would surprise a visitor to your country?", "Which habit from abroad would you adopt?", "Is politeness universal?"]),
        ("t3-work-future", "The future of work", ["Will remote work last?", "What skills will matter in ten years?", "Would you accept a four-day week for less pay?"]),
        ("t3-environment", "Cities and the environment", ["What is your city doing well?", "Which change would you make tomorrow?", "Who should pay for it?"]),
        ("t3-humour", "Humour", ["What makes people laugh where you live?", "Can jokes be translated?", "Tell a joke in your language and explain it."]),
        ("t3-identity", "Language and identity", ["Do you feel different in another language?", "Which expressions can't be translated?", "Should dialects be protected?"]),
        ("t3-news", "Something in the news", ["Pick a recent story you care about.", "How is it covered where you live?", "What would you ask an expert?"]),
        ("t3-debate", "Friendly debate", ["Is it better to travel slowly or see a lot?", "Argue the side you disagree with.", "Who convinced whom?"]),
    ],
}
TOPIC_BY_ID = {
    topic_id: {"id": topic_id, "title": title, "prompts": prompts}
    for tier in TOPIC_LIBRARY.values()
    for topic_id, title, prompts in tier
}


def iso(value):
    return serializers.DateTimeField().to_representation(value) if value else None


def user_languages(user):
    """Lowercase native + practising languages."""
    languages = [str(user.native_language or "").strip().lower()]
    languages += [str(language).strip().lower() for language in (user.languages_practicing or [])]
    return [language for language in dict.fromkeys(languages) if language]


def default_languages(starter, partner):
    """(first, second): the partner's native language first, then the starter's."""
    first = str(partner.native_language or "").strip().lower()
    second = str(starter.native_language or "").strip().lower()
    return first, second


def level_tier(starter, partner, languages):
    """The lower learner level among people practising one of the session languages."""
    tiers = []
    for user in (starter, partner):
        levels = {str(k).lower(): str(v).lower() for k, v in (user.practice_language_levels or {}).items()}
        practising = {str(language).lower() for language in (user.languages_practicing or [])}
        for language in languages:
            if language in practising:
                tiers.append(LEVEL_TIERS.get(levels.get(language), 1))
    return min(tiers) if tiers else 2


def ends_at(session):
    if not session.started_at:
        return None
    return session.started_at + timedelta(minutes=session.duration_minutes)


def halfway_at(session):
    if not session.started_at:
        return None
    return session.started_at + timedelta(minutes=session.duration_minutes) / 2


def switch_point(session):
    """When the second language started (early switch or halfway), if it has."""
    halfway = halfway_at(session)
    if halfway is None:
        return None
    if session.switched_at and session.switched_at < halfway:
        return session.switched_at
    return halfway


def current_language(session, now):
    if session.status != ExchangeSession.STATUS_ACTIVE:
        return None
    point = switch_point(session)
    return session.second_language if point and now >= point else session.first_language


def refresh_session(session, now=None):
    """Apply invite expiry / timer end. Saves and returns True if the status changed."""
    now = now or timezone.now()
    if session.status == ExchangeSession.STATUS_PENDING and now >= session.expires_at:
        session.status = ExchangeSession.STATUS_EXPIRED
        session.save(update_fields=["status"])
        return True
    if session.status == ExchangeSession.STATUS_ACTIVE and now >= ends_at(session):
        finish_session(session, ended_at=ends_at(session), ended_by=None)
        return True
    return False


def finish_session(session, ended_at, ended_by):
    session.status = ExchangeSession.STATUS_ENDED
    session.ended_at = ended_at
    session.ended_by = ended_by
    session.summary = build_summary(session)
    session.save(update_fields=["status", "ended_at", "ended_by", "summary"])


def build_summary(session):
    """Minutes and messages per language, and corrections made during the session."""
    start, end = session.started_at, session.ended_at
    point = min(switch_point(session), end)
    windows = [
        (session.first_language, start, point),
        (session.second_language, point, end),
    ]
    languages = []
    for index, (language, window_start, window_end) in enumerate(windows):
        seconds = max(0.0, (window_end - window_start).total_seconds())
        # The last window includes its end: a message in the same clock tick as
        # "end" (coarse clocks) still counts.
        end_filter = {"timestamp__lte" if index == len(windows) - 1 else "timestamp__lt": window_end}
        counts = dict(
            Message.objects.filter(
                conversation_id=session.conversation_id,
                timestamp__gte=window_start,
                **end_filter,
            )
            .values_list("sender_id")
            .annotate(count=Count("id"))
            .values_list("sender_id", "count")
        )
        languages.append(
            {
                "language": language,
                "minutes": round(seconds / 60, 1),
                "messages": {str(user_id): count for user_id, count in counts.items()},
                "message_count": sum(counts.values()),
            }
        )
    corrections = list(
        MessageCorrection.objects.filter(
            message__conversation_id=session.conversation_id,
            created_at__gte=start,
            created_at__lte=end,
        )
        .order_by("created_at", "id")
        .values("id", "message_id", "corrector_id")[: SUMMARY_CORRECTIONS_LIMIT + 1]
    )
    return {
        "languages": languages,
        "total_minutes": round(max(0.0, (end - start).total_seconds()) / 60, 1),
        "corrections": corrections[:SUMMARY_CORRECTIONS_LIMIT],
        "correction_count": len(corrections),
        "corrections_truncated": len(corrections) > SUMMARY_CORRECTIONS_LIMIT,
    }


def session_payload(session, now=None):
    now = now or timezone.now()

    def person(user):
        return {"id": user.id, "username": user.username}

    return {
        "id": session.id,
        "conversation_id": session.conversation_id,
        "status": session.status,
        "created_by": person(session.created_by),
        "partner": person(session.partner),
        "duration_minutes": session.duration_minutes,
        "first_language": session.first_language,
        "second_language": session.second_language,
        "current_language": current_language(session, now),
        "topic": session.topic,
        "topic_source": session.topic_source or None,
        "created_at": iso(session.created_at),
        "expires_at": iso(session.expires_at),
        "started_at": iso(session.started_at),
        "halfway_at": iso(halfway_at(session)),
        "switched_at": iso(session.switched_at),
        "ends_at": iso(ends_at(session)),
        "ended_at": iso(session.ended_at),
        "ended_by_id": session.ended_by_id,
        "summary": session.summary,
        "server_time": iso(now),
    }


# ------------------------------------------------------------------ topics


def clean_ai_topics(raw):
    cleaned = []
    for index, item in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()[:TOPIC_TITLE_MAX_LENGTH]
        prompts = [
            re.sub(r"\s+", " ", str(prompt)).strip()[:TOPIC_PROMPT_MAX_LENGTH]
            for prompt in (item.get("prompts") or [])[:3]
            if isinstance(prompt, (str, int, float))
        ]
        prompts = [prompt for prompt in prompts if prompt and not re.search(r"https?://|www\.", prompt, re.I)]
        if title and prompts and not re.search(r"https?://|www\.", title, re.I):
            cleaned.append({"id": f"ai-{index}", "title": title, "prompts": prompts})
    return cleaned[:AI_TOPIC_COUNT]


def ai_topics(session, before_ai=None):
    """A batch of Lumi topics, or [] (no key, limits reached, or a bad reply)."""
    from .gemini import CoachAIError, generate_session_topics
    from .openers import _within_limits, profile_context

    if not _within_limits(session.created_by_id):
        return []
    context = {
        "languages": [session.first_language, session.second_language],
        "level_tier": level_tier(session.created_by, session.partner, [session.first_language, session.second_language]),
        "people": [profile_context(session.created_by), profile_context(session.partner)],
    }
    if before_ai:
        before_ai()
    try:
        return clean_ai_topics(generate_session_topics(context))
    except CoachAIError as error:
        logger.info("Session topics fell back to the library: %s", error)
        return []


def library_topic(session):
    tier = level_tier(session.created_by, session.partner, [session.first_language, session.second_language])
    used = set(session.used_topics or [])
    candidates = [topic_id for topic_id, _, _ in TOPIC_LIBRARY[tier] if topic_id not in used]
    if not candidates:
        # Every topic of this level was shown: start the round again.
        session.used_topics = []
        candidates = [topic_id for topic_id, _, _ in TOPIC_LIBRARY[tier]]
    # Rotate deterministically per session so both people see the same order.
    topic_id = candidates[session.id % len(candidates)]
    session.used_topics = [*(session.used_topics or []), topic_id]
    return dict(TOPIC_BY_ID[topic_id])


def next_topic(session, allow_ai=True, before_ai=None):
    """Set session.topic to the next suggestion (unsaved). Returns the fields changed."""
    if not session.topic_queue and allow_ai and session.topic_source != "library":
        session.topic_queue = ai_topics(session, before_ai=before_ai)
    if session.topic_queue:
        session.topic = session.topic_queue[0]
        session.topic_queue = session.topic_queue[1:]
        session.topic_source = "ai"
    else:
        session.topic = library_topic(session)
        session.topic_source = "library"
    return ["topic", "topic_queue", "topic_source", "used_topics"]


def custom_topic(session, title):
    session.topic = {"id": "custom", "title": title[:TOPIC_TITLE_MAX_LENGTH], "prompts": []}
    session.topic_source = "custom"
    return ["topic", "topic_source"]
