"""Message translation providers, tried in order (used by ``translate_message_view``).

1. DeepL, when ``DEEPL_API_KEY`` is set (free keys end in ``:fx`` and use api-free.deepl.com).
   The key only ever lives on the server.
2. Google's public ``translate_a/single?client=gtx`` endpoint (no key). It is unofficial and
   rate-limits shared cloud IPs (HTTP 429 from Heroku), so after a 429 it is skipped for
   ``FREE_ENDPOINT_COOLDOWN_SECONDS`` instead of being hammered.

``translate`` returns ``(translated_text, source_language)`` (source as a lowercase code, e.g.
"es") or raises ``TranslationServiceError`` when every provider failed.
"""

import http.client
import json
import logging
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10
FREE_ENDPOINT_COOLDOWN_SECONDS = 10 * 60
FREE_ENDPOINT_COOLDOWN_KEY = "translate:v1:gtx:cooldown"

# DeepL wants a regional variant for a few targets.
DEEPL_TARGETS = {"en": "EN-US", "pt": "PT-BR", "zh": "ZH-HANS"}

# What a provider failure looks like: network errors and timeouts (OSError covers URLError,
# HTTPError and TimeoutError), bad HTTP, malformed or unexpected JSON.
PROVIDER_ERRORS = (OSError, ValueError, TypeError, KeyError, IndexError, http.client.HTTPException)


class TranslationServiceError(Exception):
    """Every translation provider failed, timed out or sent an unusable reply."""


def _read_json(request):
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def deepl_configured():
    return bool(getattr(settings, "DEEPL_API_KEY", ""))


def translate_with_deepl(text, target_language):
    key = settings.DEEPL_API_KEY
    host = "api-free.deepl.com" if key.endswith(":fx") else "api.deepl.com"
    body = json.dumps(
        {
            "text": [text],
            "target_lang": DEEPL_TARGETS.get(target_language, target_language.upper()),
        }
    ).encode("utf-8")
    request = Request(
        f"https://{host}/v2/translate",
        data=body,
        headers={
            "Authorization": f"DeepL-Auth-Key {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    translation = _read_json(request)["translations"][0]
    translated_text = str(translation["text"]).strip()
    source_language = str(translation.get("detected_source_language") or "auto").lower()
    return translated_text, source_language


def translate_with_free_endpoint(text, target_language):
    query = urlencode({"client": "gtx", "sl": "auto", "tl": target_language, "dt": "t", "q": text})
    payload = _read_json(f"https://translate.googleapis.com/translate_a/single?{query}")
    chunks = payload[0] if isinstance(payload, list) and payload else []
    translated_text = "".join(
        chunk[0] for chunk in chunks if isinstance(chunk, list) and chunk and chunk[0]
    ).strip()
    source_language = payload[2] if isinstance(payload, list) and len(payload) > 2 else "auto"
    return translated_text, source_language or "auto"


def _free_endpoint_cooling_down():
    try:
        return bool(cache.get(FREE_ENDPOINT_COOLDOWN_KEY))
    except Exception:
        return False


def _start_free_endpoint_cooldown():
    try:
        cache.set(FREE_ENDPOINT_COOLDOWN_KEY, True, timeout=FREE_ENDPOINT_COOLDOWN_SECONDS)
    except Exception:
        pass


def translate(text, target_language):
    """Translate ``text`` into ``target_language`` with the first provider that answers."""
    if deepl_configured():
        try:
            translated_text, source_language = translate_with_deepl(text, target_language)
            if translated_text:
                return translated_text, source_language
            logger.warning("DeepL returned an empty translation")
        except PROVIDER_ERRORS as error:
            # No traceback: the message (e.g. "HTTP Error 456: Quota Exceeded") is enough and
            # never includes the key.
            logger.warning("DeepL translation failed: %s", error)

    if _free_endpoint_cooling_down():
        raise TranslationServiceError("free endpoint cooling down after a 429")
    try:
        return translate_with_free_endpoint(text, target_language)
    except PROVIDER_ERRORS as error:
        if isinstance(error, HTTPError) and error.code == 429:
            _start_free_endpoint_cooldown()
        logger.warning("Free translation endpoint failed: %s", error)
        raise TranslationServiceError(str(error)) from error
