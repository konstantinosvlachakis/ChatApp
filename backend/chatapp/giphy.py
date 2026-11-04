"""GIPHY search proxy.

Only the backend talks to the GIPHY API, so ``GIPHY_API_KEY`` never reaches a
client. The key is sent as a query parameter (GIPHY's API has no header auth),
so request URLs are never logged. Results are normalised to a small shape whose
media URLs must be https on GIPHY's media hosts, and cached per GIF id so that
sending a GIF the user just picked needs no upstream call.

Clients send only a GIF id; ``resolve_gif`` turns it into the stored media, so
a message can't carry an arbitrary URL.
"""

import hashlib
import http.client
import json
import logging
import re
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

GIPHY_API_BASE = "https://api.giphy.com/v1/gifs"
GIPHY_TIMEOUT_SECONDS = 4
GIPHY_PAGE_SIZE = 24
GIPHY_MAX_OFFSET = 499  # GIPHY's search offset limit
GIPHY_QUERY_MAX_LENGTH = 50
GIPHY_RESULTS_CACHE_SECONDS = 15 * 60
GIPHY_GIF_CACHE_SECONDS = 7 * 24 * 60 * 60
GIF_ID_RE = re.compile(r"^[A-Za-z0-9]{1,64}$")
LANG_RE = re.compile(r"^[a-z]{2}(-[A-Za-z]{2,4})?$")
GIPHY_MEDIA_HOST_RE = re.compile(r"^(media\d*|i)\.giphy\.com$")
GIF_TITLE_MAX_LENGTH = 120
GIF_MAX_DIMENSION = 2000


class GiphyUnavailable(Exception):
    """No API key configured: the feature is off."""


class GiphyUpstreamError(Exception):
    """GIPHY failed, timed out or returned something unusable."""


def gifs_enabled():
    return bool(getattr(settings, "GIPHY_API_KEY", ""))


def _gif_cache_key(gif_id):
    return f"giphy:gif:v1:{gif_id}"


def _results_cache_key(kind, query, offset, lang):
    digest = hashlib.sha256(f"{query}\n{lang}".encode("utf-8")).hexdigest()[:32]
    rating = getattr(settings, "GIPHY_RATING", "pg")
    return f"giphy:results:v1:{kind}:{rating}:{digest}:{offset}"


def _fetch_json(path, params):
    """GET ``GIPHY_API_BASE + path``. Raises GiphyUpstreamError; never logs the URL."""
    query = urlencode({"api_key": settings.GIPHY_API_KEY, **params})
    request = Request(
        f"{GIPHY_API_BASE}{path}?{query}",
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=GIPHY_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, http.client.HTTPException) as error:
        status = getattr(error, "code", None)
        if status == 404:
            return None
        logger.warning("GIPHY request failed: %s %s", type(error).__name__, status or "")
        raise GiphyUpstreamError() from None


def _safe_media_url(value):
    if not isinstance(value, str) or len(value) > 500:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or not GIPHY_MEDIA_HOST_RE.match(parsed.hostname or ""):
        return None
    return value


def _dimension(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if 0 < number <= GIF_MAX_DIMENSION else None


def normalize_gif(item):
    """GIPHY object -> stored/served shape, or None if it lacks safe media."""
    if not isinstance(item, dict):
        return None
    gif_id = item.get("id")
    if not isinstance(gif_id, str) or not GIF_ID_RE.match(gif_id):
        return None
    images = item.get("images") if isinstance(item.get("images"), dict) else {}
    main = images.get("fixed_width") if isinstance(images.get("fixed_width"), dict) else {}
    url = _safe_media_url(main.get("webp")) or _safe_media_url(main.get("url"))
    width = _dimension(main.get("width"))
    height = _dimension(main.get("height"))
    if not url or not width or not height:
        return None
    small = images.get("fixed_width_downsampled") or {}
    still = images.get("fixed_width_still") or {}
    title = " ".join(str(item.get("title") or "").split())[:GIF_TITLE_MAX_LENGTH]
    return {
        "provider": "giphy",
        "id": gif_id,
        "title": title,
        "url": url,
        "preview_url": (
            _safe_media_url(small.get("webp")) or _safe_media_url(small.get("url")) or url
        ),
        "still_url": _safe_media_url(still.get("url")),
        "width": width,
        "height": height,
    }


def _cache_gifs(gifs):
    try:
        cache.set_many(
            {_gif_cache_key(gif["id"]): gif for gif in gifs}, GIPHY_GIF_CACHE_SECONDS
        )
    except Exception:
        logger.warning("Could not cache GIF results")


def search_gifs(query="", offset=0, lang=""):
    """Trending (empty query) or search results: ``{"results": [...], "next_offset"}``.

    Raises GiphyUnavailable / GiphyUpstreamError.
    """
    if not gifs_enabled():
        raise GiphyUnavailable()
    query = " ".join(str(query or "").split())[:GIPHY_QUERY_MAX_LENGTH]
    offset = max(0, min(int(offset or 0), GIPHY_MAX_OFFSET))
    lang = lang if lang and LANG_RE.match(lang) else ""
    kind = "search" if query else "trending"
    cache_key = _results_cache_key(kind, query.lower(), offset, lang)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    params = {
        "limit": GIPHY_PAGE_SIZE,
        "offset": offset,
        "rating": getattr(settings, "GIPHY_RATING", "pg"),
    }
    if query:
        params["q"] = query
        if lang:
            params["lang"] = lang
    payload = _fetch_json(f"/{kind}", params)
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise GiphyUpstreamError()
    gifs = [gif for gif in (normalize_gif(item) for item in data) if gif]
    next_offset = offset + len(data)
    pagination = payload.get("pagination") if isinstance(payload.get("pagination"), dict) else {}
    total = pagination.get("total_count")
    has_more = (
        len(data) == GIPHY_PAGE_SIZE
        and next_offset <= GIPHY_MAX_OFFSET
        and (not isinstance(total, int) or next_offset < total)
    )
    result = {"results": gifs, "next_offset": next_offset if has_more else None}
    _cache_gifs(gifs)
    try:
        cache.set(cache_key, result, GIPHY_RESULTS_CACHE_SECONDS)
    except Exception:
        logger.warning("Could not cache GIF results")
    return result


def resolve_gif(gif_id):
    """The media to store for a GIF id, or None if it doesn't exist.

    Normally a cache hit (the picker just listed it). Raises GiphyUnavailable /
    GiphyUpstreamError.
    """
    gif_id = str(gif_id or "").strip()
    if not GIF_ID_RE.match(gif_id):
        return None
    if not gifs_enabled():
        raise GiphyUnavailable()
    cached = cache.get(_gif_cache_key(gif_id))
    if cached is not None:
        return cached
    payload = _fetch_json(f"/{gif_id}", {})
    if payload is None:
        return None
    gif = normalize_gif(payload.get("data") if isinstance(payload, dict) else None)
    if gif is None or gif["id"] != gif_id:
        return None
    _cache_gifs([gif])
    return gif


GIF_MEDIA_KEYS = ("provider", "id", "title", "url", "preview_url", "still_url", "width", "height")


def gif_media_payload(media):
    return {key: media.get(key) for key in GIF_MEDIA_KEYS}
