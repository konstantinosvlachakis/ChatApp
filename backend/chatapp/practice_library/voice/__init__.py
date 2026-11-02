"""Built-in Voice Repeat sentence library (separate from the drill items).

One JSON file per language (``<language>.json``) shaped
``{"1": [item, ...], "2": [...], "3": [...]}`` where an item is
``{"text": str, "translation_hint"?: str}`` (an optional English gloss).

Buckets match the drill buckets (the per-language ``current_bucket``):
1 = short everyday sentences (4-7 words), 2 = medium with past/future and
common connectors (7-11 words), 3 = longer with richer structure (10-15 words).

Sentence ids are ``voice:{language}:{bucket}:{index}``, so new items must be
APPENDED to a bucket: inserting or removing items shifts the ids of served
sentences. The library is loaded and validated once at import (an invalid file
fails at import, like the drill library).
"""

import json
from pathlib import Path

from .. import LANGUAGE_SCRIPTS, BUCKETS, PracticeLibraryError, _letter_scripts, normalize_sentence

VOICE_LIBRARY_DIR = Path(__file__).resolve().parent
VOICE_ID_PREFIX = "voice"
TEXT_MAX_LENGTH = 160
# Inclusive word-count bounds per bucket (words = whitespace tokens with a letter or digit).
WORD_BOUNDS = {1: (4, 7), 2: (7, 11), 3: (10, 15)}


def voice_word_count(text):
    return sum(
        1 for token in str(text or "").split() if any(char.isalnum() for char in token)
    )


def validate_voice_item(language, bucket, index, item):
    """Return a list of problems with one item (empty when it is valid)."""
    where = f"voice:{language}:{bucket}:{index}"
    if not isinstance(item, dict):
        return [f"{where}: item is not an object"]
    problems = []
    text = item.get("text")
    if not isinstance(text, str) or not text.strip():
        return [f"{where}: missing text"]
    if text != text.strip() or "  " in text:
        problems.append(f"{where}: stray whitespace")
    if len(text) > TEXT_MAX_LENGTH:
        problems.append(f"{where}: text longer than {TEXT_MAX_LENGTH} characters")
    if "___" in text:
        problems.append(f"{where}: voice text must not contain a blank")
    unknown = set(item) - {"text", "translation_hint"}
    if unknown:
        problems.append(f"{where}: unknown keys {sorted(unknown)}")
    hint = item.get("translation_hint")
    if hint is not None and (not isinstance(hint, str) or not hint.strip()):
        problems.append(f"{where}: translation_hint must be a non-empty string")
    low, high = WORD_BOUNDS.get(bucket, (1, 30))
    words = voice_word_count(text)
    if not low <= words <= high:
        problems.append(f"{where}: {words} words, bucket {bucket} needs {low}-{high}")
    expected_script = LANGUAGE_SCRIPTS.get(language)
    if expected_script:
        scripts = _letter_scripts(text)
        if expected_script not in scripts or scripts - {expected_script}:
            problems.append(
                f"{where}: expected {expected_script} letters only, found {sorted(scripts)}"
            )
    return problems


def validate_voice_library(library):
    """Return every problem found in ``{language: {bucket: [items]}}``."""
    problems = []
    for language, buckets in library.items():
        if language not in LANGUAGE_SCRIPTS:
            problems.append(f"voice:{language}: unknown language")
        seen = {}
        for bucket in BUCKETS:
            items = buckets.get(bucket)
            if not items:
                problems.append(f"voice:{language}: bucket {bucket} is empty")
                continue
            for index, item in enumerate(items):
                problems.extend(validate_voice_item(language, bucket, index, item))
                key = normalize_sentence((item or {}).get("text") if isinstance(item, dict) else "")
                where = f"voice:{language}:{bucket}:{index}"
                if key in seen:
                    problems.append(f"{where}: duplicate of {seen[key]}")
                else:
                    seen[key] = where
        extra = set(buckets) - set(BUCKETS)
        if extra:
            problems.append(f"voice:{language}: unknown buckets {sorted(extra)}")
    return problems


def load_voice_language_file(path):
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise PracticeLibraryError(f"voice/{path.name}: top level must be an object")
    try:
        return {int(bucket): list(items) for bucket, items in raw.items()}
    except (TypeError, ValueError) as exc:
        raise PracticeLibraryError(f"voice/{path.name}: bad bucket key") from exc


def load_voice_library(directory=VOICE_LIBRARY_DIR, *, validate=True):
    library = {}
    for path in sorted(Path(directory).glob("*.json")):
        library[path.stem] = load_voice_language_file(path)
    if validate:
        problems = validate_voice_library(library)
        if problems:
            raise PracticeLibraryError(
                "Invalid voice library: " + "; ".join(problems[:10])
            )
    return library


def voice_sentence_id(language, bucket, index):
    return f"{VOICE_ID_PREFIX}:{language}:{bucket}:{index}"


def parse_voice_sentence_id(raw_id, library=None):
    """``voice:{lang}:{bucket}:{index}`` -> ``(language, bucket, index, item)`` or None."""
    library = VOICE_LIBRARY if library is None else library
    if not isinstance(raw_id, str) or len(raw_id) > 80:
        return None
    parts = raw_id.split(":")
    if len(parts) != 4 or parts[0] != VOICE_ID_PREFIX:
        return None
    _, language, bucket_raw, index_raw = parts
    if not (bucket_raw.isdigit() and index_raw.isdigit()):
        return None
    bucket, index = int(bucket_raw), int(index_raw)
    items = (library.get(language) or {}).get(bucket) or []
    if index >= len(items):
        return None
    return language, bucket, index, items[index]


VOICE_LIBRARY = load_voice_library()
