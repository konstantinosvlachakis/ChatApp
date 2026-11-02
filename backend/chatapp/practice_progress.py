"""Per-language practice difficulty (mastery based).

XP / points / level (``PracticeStats``) are the motivational score only. The
drill and Voice Repeat difficulty comes from ``PracticeLanguageProgress``:
one row per (user, language) with a bucket 1-3 that moves on accuracy.

Rules (all thresholds env-configurable):
- Seed (first practice in a language): the profile's self-reported level for
  that language (``Profile.practice_language_levels``: beginner -> 1,
  intermediate -> 2, advanced/fluent -> 3; unknown/missing -> 1). Users who
  practised before this existed keep their old XP-derived bucket for the
  language they last practised (``PracticeStats.preferred_language``):
  seed = max(profile seed, legacy bucket), so nobody drops a level.
- Each first-time-scored drill answer appends to a window of the last
  ``PRACTICE_WINDOW`` results in the current bucket. Answers past the daily XP
  cap still count (they are real answers); replays (``already_scored``) don't.
- Promotion: attempts_in_bucket >= PRACTICE_PROMOTE_MIN_ATTEMPTS and window
  accuracy >= PRACTICE_PROMOTE_ACCURACY and bucket < 3 -> bucket + 1.
- Demotion: attempts_in_bucket >= PRACTICE_DEMOTE_MIN_ATTEMPTS and window
  accuracy < PRACTICE_DEMOTE_ACCURACY and bucket > 1 -> bucket - 1.
- A change resets attempts and the window.
- Voice Repeat reads the bucket but never changes it (its score is
  client-reported).
"""

import os

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import PracticeLanguageProgress, PracticeStats

MIN_BUCKET = 1
MAX_BUCKET = 3


def _env_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _env_ratio(name, default):
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        value = default
    if value != value:  # NaN
        value = default
    return max(0.0, min(1.0, value))


# The window is stored as a "1"/"0" string (model max_length 50).
PRACTICE_WINDOW = _env_int("PRACTICE_WINDOW", 20, 1, 50)
PRACTICE_PROMOTE_MIN_ATTEMPTS = _env_int("PRACTICE_PROMOTE_MIN_ATTEMPTS", 15, 1, 10_000)
PRACTICE_PROMOTE_ACCURACY = _env_ratio("PRACTICE_PROMOTE_ACCURACY", 0.8)
PRACTICE_DEMOTE_MIN_ATTEMPTS = _env_int("PRACTICE_DEMOTE_MIN_ATTEMPTS", 10, 1, 10_000)
PRACTICE_DEMOTE_ACCURACY = _env_ratio("PRACTICE_DEMOTE_ACCURACY", 0.5)

BUCKET_LABELS = {1: "Basics", 2: "Everyday grammar", 3: "Advanced grammar"}
BUCKET_CEFR = {1: "A1", 2: "A2–B1", 3: "B1–B2"}

# Profile.practice_language_levels values (profile_edit_view accepts exactly
# beginner / intermediate / advanced / fluent). The extra keys only matter if
# the accepted set grows; anything unknown seeds bucket 1.
PROFILE_LEVEL_BUCKETS = {
    "beginner": 1,
    "elementary": 1,
    "pre-intermediate": 1,
    "intermediate": 2,
    "upper-intermediate": 3,
    "advanced": 3,
    "fluent": 3,
    "native": 3,
}


def practice_level_from_xp(xp_value):
    xp = max(int(xp_value or 0), 0)
    return (xp // 100) + 1


def practice_bucket_for_level(level):
    """Legacy XP-level -> bucket mapping. Only used to seed existing users and
    by the ``prewarm_daily_practice`` command's ``--levels``."""
    if level <= 2:
        return 1
    if level <= 4:
        return 2
    return 3


def practice_bucket_for_xp(xp_value):
    return practice_bucket_for_level(practice_level_from_xp(xp_value))


def clamp_bucket(bucket):
    try:
        bucket = int(bucket)
    except (TypeError, ValueError):
        return MIN_BUCKET
    return max(MIN_BUCKET, min(MAX_BUCKET, bucket))


def profile_seed_bucket(user, language):
    """Bucket from the user's self-reported level for ``language`` (keys are
    matched case-insensitively; values like "Intermediate" or "upper intermediate"
    are normalized)."""
    levels = getattr(user, "practice_language_levels", None) or {}
    if not isinstance(levels, dict):
        return MIN_BUCKET
    wanted = (language or "").strip().lower()
    for key, value in levels.items():
        if str(key).strip().lower() != wanted:
            continue
        normalized = "-".join(str(value or "").strip().lower().replace("_", " ").split())
        return PROFILE_LEVEL_BUCKETS.get(normalized, MIN_BUCKET)
    return MIN_BUCKET


def seed_bucket(user, language, stats=None):
    """max(profile seed, legacy XP bucket if ``language`` is the language the
    user last practised). ``stats`` avoids a query when the caller has it."""
    seed = profile_seed_bucket(user, language)
    if stats is None:
        row = (
            PracticeStats.objects.filter(user=user)
            .values_list("xp", "preferred_language")
            .first()
        )
        xp, preferred = row if row else (0, "")
    else:
        xp, preferred = stats.xp, stats.preferred_language
    if xp and (preferred or "").strip().lower() == (language or "").strip().lower():
        seed = max(seed, practice_bucket_for_xp(xp))
    return clamp_bucket(seed)


def get_language_progress(user, language, stats=None, for_update=False):
    """The user's progress row for ``language``, created (seeded) on first use.

    ``for_update`` locks the row (call inside ``transaction.atomic``)."""
    language = (language or "").strip().lower()
    manager = PracticeLanguageProgress.objects
    queryset = manager.select_for_update() if for_update else manager
    progress = queryset.filter(user=user, language=language).first()
    if progress is not None:
        return progress
    try:
        with transaction.atomic():
            return manager.create(
                user=user,
                language=language,
                bucket=seed_bucket(user, language, stats),
            )
    except IntegrityError:
        # A concurrent request created it first.
        return queryset.get(user=user, language=language)


def current_bucket(user, language, stats=None):
    """Difficulty bucket (1-3) the drill and Voice Repeat serve for ``language``."""
    return clamp_bucket(get_language_progress(user, language, stats).bucket)


def window_accuracy(progress):
    results = progress.recent_results or ""
    if not results:
        return None
    return results.count("1") / len(results)


def apply_practice_result(progress, is_correct):
    """Record one answer on ``progress`` (not saved); returns
    ``"promoted"``, ``"demoted"`` or ``None``."""
    progress.bucket = clamp_bucket(progress.bucket)
    progress.attempts_in_bucket = (progress.attempts_in_bucket or 0) + 1
    progress.recent_results = (
        (progress.recent_results or "") + ("1" if is_correct else "0")
    )[-PRACTICE_WINDOW:]
    accuracy = window_accuracy(progress) or 0.0
    attempts = progress.attempts_in_bucket

    change = None
    if (
        progress.bucket < MAX_BUCKET
        and attempts >= PRACTICE_PROMOTE_MIN_ATTEMPTS
        and accuracy >= PRACTICE_PROMOTE_ACCURACY
    ):
        progress.bucket += 1
        progress.promoted_at = timezone.now()
        change = "promoted"
    elif (
        progress.bucket > MIN_BUCKET
        and attempts >= PRACTICE_DEMOTE_MIN_ATTEMPTS
        and accuracy < PRACTICE_DEMOTE_ACCURACY
    ):
        progress.bucket -= 1
        progress.demoted_at = timezone.now()
        change = "demoted"
    if change:
        progress.attempts_in_bucket = 0
        progress.recent_results = ""
    return change


def challenge_bucket(challenge_id):
    """Bucket encoded in a drill id (``lang:bucket:idx`` or
    ``dailygen:day:lang:bucket:idx``); None for ``gen:`` ids."""
    parts = str(challenge_id or "").split(":")
    raw = None
    if len(parts) == 3:
        raw = parts[1]
    elif len(parts) == 5 and parts[0] == "dailygen":
        raw = parts[3]
    try:
        return int(raw) if raw is not None else None
    except ValueError:
        return None


def record_practice_result(user, language, is_correct, stats=None, item_bucket=None):
    """Lock, update and save the language's progress; returns
    ``(progress, change)``. An answer to an item from another bucket (served
    before a level change) is not counted."""
    with transaction.atomic():
        progress = get_language_progress(user, language, stats, for_update=True)
        if item_bucket is not None and item_bucket != progress.bucket:
            return progress, None
        change = apply_practice_result(progress, is_correct)
        progress.save(
            update_fields=[
                "bucket",
                "attempts_in_bucket",
                "recent_results",
                "promoted_at",
                "demoted_at",
                "updated_at",
            ]
        )
    return progress, change


def serialize_language_progress(progress, change=None):
    bucket = clamp_bucket(progress.bucket)
    attempts = progress.attempts_in_bucket or 0
    accuracy = window_accuracy(progress)
    can_promote = bucket < MAX_BUCKET
    needed = None
    if can_promote:
        needed = {
            "attempts_remaining": max(0, PRACTICE_PROMOTE_MIN_ATTEMPTS - attempts),
            "min_attempts": PRACTICE_PROMOTE_MIN_ATTEMPTS,
            "accuracy_target": PRACTICE_PROMOTE_ACCURACY,
        }
    return {
        "language": progress.language,
        "bucket": bucket,
        "max_bucket": MAX_BUCKET,
        "bucket_label": BUCKET_LABELS[bucket],
        "cefr": BUCKET_CEFR[bucket],
        "attempts_in_bucket": attempts,
        "window_size": len(progress.recent_results or ""),
        "window_accuracy": round(accuracy, 3) if accuracy is not None else None,
        "needed_for_promotion": needed,
        "can_promote": can_promote,
        "change": change,
    }
