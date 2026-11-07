"""Phrasebook spaced review: a small SM-2 style scheduler.

Each review grades recall as again / hard / good / easy:
- again: forgotten. Back in 10 minutes, ease -20 (min 130), streak reset, lapse +1.
- hard: remembered with effort. Interval x1.2 (at least 1 day), ease -15.
- good: interval 1 day, then 3 days, then interval x ease.
- easy: like good, x1.3 and ease +15.
Intervals are capped at MAX_INTERVAL_DAYS.
"""
from datetime import timedelta

from django.utils import timezone

REVIEW_RESULTS = ("again", "hard", "good", "easy")
MIN_EASE = 130
MAX_EASE = 300
MAX_INTERVAL_DAYS = 365
AGAIN_DELAY = timedelta(minutes=10)

# Limits enforced by the views.
PHRASE_TEXT_MAX_LENGTH = 500
PHRASE_NOTE_MAX_LENGTH = 1000
PHRASE_LANGUAGE_MAX_LENGTH = 50
PHRASEBOOK_MAX_ENTRIES = 2000
REVIEW_BATCH_SIZE = 20


def schedule_review(entry, result, now=None):
    """Apply one review result to ``entry`` (unsaved). Returns the fields changed."""
    if result not in REVIEW_RESULTS:
        raise ValueError(f"Unknown review result: {result}")
    now = now or timezone.now()
    ease = entry.ease or 250
    interval = entry.interval_days or 0

    if result == "again":
        entry.repetitions = 0
        entry.lapses = (entry.lapses or 0) + 1
        entry.ease = max(MIN_EASE, ease - 20)
        entry.interval_days = 0
        entry.due_at = now + AGAIN_DELAY
    else:
        if result == "hard":
            new_interval = max(1, round(interval * 1.2))
            entry.ease = max(MIN_EASE, ease - 15)
        else:
            repetitions = entry.repetitions or 0
            if repetitions == 0:
                new_interval = 1
            elif repetitions == 1:
                new_interval = 3
            else:
                new_interval = max(interval + 1, round(interval * ease / 100))
            if result == "easy":
                new_interval = max(new_interval + 1, round(new_interval * 1.3))
                entry.ease = min(MAX_EASE, ease + 15)
        entry.repetitions = (entry.repetitions or 0) + 1
        entry.interval_days = min(MAX_INTERVAL_DAYS, new_interval)
        entry.due_at = now + timedelta(days=entry.interval_days)

    entry.review_count = (entry.review_count or 0) + 1
    entry.last_reviewed_at = now
    return [
        "repetitions",
        "lapses",
        "ease",
        "interval_days",
        "due_at",
        "review_count",
        "last_reviewed_at",
        "updated_at",
    ]


def clean_text(value, max_length):
    return str(value or "").strip()[:max_length]


def clean_language(value):
    return clean_text(value, PHRASE_LANGUAGE_MAX_LENGTH).lower()


def guess_language(learner, author):
    """The language a saved sentence is probably in: the author's native
    language when the learner practises it, else the learner's first one."""
    practicing = [
        str(language).strip().lower()
        for language in (getattr(learner, "languages_practicing", None) or [])
        if str(language).strip()
    ]
    author_native = (getattr(author, "native_language", "") or "").strip().lower()
    if author_native and author_native in practicing:
        return author_native[:PHRASE_LANGUAGE_MAX_LENGTH]
    return practicing[0][:PHRASE_LANGUAGE_MAX_LENGTH] if practicing else ""


def entry_payload(entry):
    return {
        "id": entry.id,
        "text": entry.text,
        "meaning": entry.meaning or "",
        "note": entry.note or "",
        "context": entry.context or "",
        "language": entry.language or "",
        "source": entry.source,
        "source_message_id": entry.source_message_id,
        "source_conversation_id": entry.source_conversation_id,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "due_at": entry.due_at,
        "interval_days": entry.interval_days,
        "repetitions": entry.repetitions,
        "lapses": entry.lapses,
        "review_count": entry.review_count,
        "last_reviewed_at": entry.last_reviewed_at,
    }
