"""Built-in practice drill library.

One JSON file per language (``<language>.json``) shaped
``{"1": [item, ...], "2": [...], "3": [...]}`` where an item is
``{"sentence": "... ___ ...", "answer": str, "options": [4 x str], "hint": str}``.

Challenge ids are ``{language}:{bucket}:{index}`` (index into the bucket list),
so new items must be APPENDED to a bucket: inserting or removing items shifts
the ids of served challenges. The library is loaded and validated once at import.
"""

import json
import re
import unicodedata
from pathlib import Path

LIBRARY_DIR = Path(__file__).resolve().parent
BLANK_MARKER = "___"
BUCKETS = (1, 2, 3)
OPTIONS_PER_ITEM = 4
SENTENCE_MIN_LENGTH = 10
SENTENCE_MAX_LENGTH = 140

# Script each language's sentences must be written in (letters only).
LANGUAGE_SCRIPTS = {
    "english": "LATIN",
    "spanish": "LATIN",
    "french": "LATIN",
    "greek": "GREEK",
    "russian": "CYRILLIC",
}


class PracticeLibraryError(ValueError):
    pass


def normalize_sentence(sentence):
    return re.sub(r"\s+", " ", str(sentence or "")).strip().casefold()


def _letter_scripts(text):
    scripts = set()
    for char in str(text or ""):
        if char.isalpha():
            name = unicodedata.name(char, "")
            scripts.add(name.split(" ", 1)[0] if name else "UNKNOWN")
    return scripts


def validate_item(language, bucket, index, item):
    """Return a list of problems with one item (empty when it is valid)."""
    where = f"{language}:{bucket}:{index}"
    if not isinstance(item, dict):
        return [f"{where}: item is not an object"]
    problems = []
    sentence = item.get("sentence")
    answer = item.get("answer")
    options = item.get("options")
    hint = item.get("hint", "")
    if not isinstance(sentence, str) or not sentence.strip():
        return [f"{where}: missing sentence"]
    if sentence.count(BLANK_MARKER) != 1 or "____" in sentence:
        problems.append(f"{where}: sentence needs exactly one {BLANK_MARKER!r} blank")
    if not SENTENCE_MIN_LENGTH <= len(sentence) <= SENTENCE_MAX_LENGTH:
        problems.append(f"{where}: sentence length {len(sentence)} out of bounds")
    if not isinstance(answer, str) or not answer.strip():
        problems.append(f"{where}: missing answer")
    if not isinstance(options, list) or len(options) != OPTIONS_PER_ITEM:
        problems.append(f"{where}: needs exactly {OPTIONS_PER_ITEM} options")
        options = options if isinstance(options, list) else []
    if any(not isinstance(option, str) or not option.strip() for option in options):
        problems.append(f"{where}: empty option")
    elif len({option.strip().casefold() for option in options}) != len(options):
        problems.append(f"{where}: options are not unique")
    if isinstance(answer, str) and answer not in options:
        problems.append(f"{where}: answer is not one of the options")
    if not isinstance(hint, str):
        problems.append(f"{where}: hint must be a string")
    expected_script = LANGUAGE_SCRIPTS.get(language)
    if expected_script:
        text = " ".join([sentence, *[str(option) for option in options]])
        scripts = _letter_scripts(text)
        if expected_script not in scripts or scripts - {expected_script}:
            problems.append(
                f"{where}: expected {expected_script} letters only, found {sorted(scripts)}"
            )
    return problems


def validate_library(library):
    """Return every problem found in ``{language: {bucket: [items]}}``."""
    problems = []
    for language, buckets in library.items():
        seen = {}
        for bucket in BUCKETS:
            items = buckets.get(bucket)
            if not items:
                problems.append(f"{language}: bucket {bucket} is empty")
                continue
            for index, item in enumerate(items):
                problems.extend(validate_item(language, bucket, index, item))
                key = normalize_sentence((item or {}).get("sentence"))
                if key in seen:
                    problems.append(
                        f"{language}:{bucket}:{index}: duplicate of {seen[key]}"
                    )
                else:
                    seen[key] = f"{language}:{bucket}:{index}"
    return problems


def load_language_file(path):
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise PracticeLibraryError(f"{path.name}: top level must be an object")
    return {int(bucket): list(items) for bucket, items in raw.items()}


def load_practice_library(directory=LIBRARY_DIR, *, validate=True):
    library = {}
    for path in sorted(Path(directory).glob("*.json")):
        library[path.stem] = load_language_file(path)
    if validate:
        problems = validate_library(library)
        if problems:
            raise PracticeLibraryError(
                "Invalid practice library: " + "; ".join(problems[:10])
            )
    return library


PRACTICE_LIBRARY = load_practice_library()
