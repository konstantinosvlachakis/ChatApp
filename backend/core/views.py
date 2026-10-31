import logging
import time
from pathlib import Path

from django.conf import settings
from django.db import connection, transaction
from django.http import HttpResponseNotAllowed, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views import defaults as django_defaults
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny

from .cache import cache_breaker, probe_cache
from .exceptions import GENERIC_SERVER_ERROR, json_error
from .realtime import channel_layer_breaker, probe_channel_layer

logger = logging.getLogger(__name__)

FRONTEND_BUILD_DIR = Path(settings.TEMPLATES[0]["DIRS"][0])


APP_SHELL_TEMPLATE = "app-shell.html"


def resolve_frontend_template(request_path):
    """Which build file answers an SPA path.

    Prerendered public routes (frontend/src/routes/prerenderedRoutes.js) have their
    own build/<path>/index.html ("/" is build/index.html). Every other path gets
    build/app-shell.html, an empty neutral shell, so app pages and reset links
    don't flash the prerendered landing page first; index.html is the fallback
    for builds without a shell.
    """
    normalized = request_path.strip("/")
    if not normalized:
        return "index.html"

    build_dir = FRONTEND_BUILD_DIR.resolve()
    candidate = (FRONTEND_BUILD_DIR / normalized / "index.html").resolve()
    # Reject path traversal (e.g. /..%2F..%2F) outside the frontend build dir.
    if candidate.is_relative_to(build_dir) and candidate.is_file():
        return f"{normalized}/index.html"

    if (FRONTEND_BUILD_DIR / APP_SHELL_TEMPLATE).is_file():
        return APP_SHELL_TEMPLATE
    return "index.html"


# csrf_exempt: these views never change state, so an unsafe request gets a clean
# 404/405 instead of Django's HTML CSRF-failure page.
@csrf_exempt
def front(request, checkout_session_id=None, weblid=None, errorType=None):
    # The SPA fallback only answers page loads; a POST/PUT/... to an unknown
    # non-API path is an error, not a 200 with index.html.
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])
    context = {}
    return render(request, resolve_frontend_template(request.path), context)


@csrf_exempt
def api_not_found(request, *args, **kwargs):
    """Unknown /api/... paths: JSON 404 instead of the SPA's index.html."""
    return json_error("Not found.", "not_found", 404)


def server_error(request, *args, **kwargs):
    """handler500: JSON envelope for API paths, Django's default page otherwise."""
    if request.path.startswith("/api/"):
        return json_error(GENERIC_SERVER_ERROR, "server_error", 500)
    return django_defaults.server_error(request, *args, **kwargs)


HEALTH_DB_TIMEOUT_MS = 2000


def _check_database():
    with transaction.atomic():
        with connection.cursor() as cursor:
            if connection.vendor == "postgresql":
                cursor.execute("SET LOCAL statement_timeout = %s", [HEALTH_DB_TIMEOUT_MS])
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
    if not row or row[0] != 1:
        raise RuntimeError("unexpected database response")


def _check_cache():
    # Bypasses the cache circuit breaker (core/cache.py): one real round trip
    # with the cache's short socket timeouts; a success closes the breaker.
    probe_cache()
    return {"breaker": "open" if cache_breaker().is_open else "closed"}


def _check_channel_layer():
    # A no-op group_discard round trip, bounded by CHANNEL_LAYER_TIMEOUT_SECONDS.
    probe_channel_layer()
    return {"breaker": "open" if channel_layer_breaker().is_open else "closed"}


# (name, check, critical). A failing critical check (the database) makes the
# probe 503 "error"; a failing non-critical one (Redis: the app fails open
# without it) reports 200 "degraded" so uptime monitors see it but load
# balancers keep routing traffic.
HEALTH_CHECKS = (
    ("database", _check_database, True),
    ("cache", _check_cache, False),
    ("channel_layer", _check_channel_layer, False),
)


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    """Liveness/readiness probe. Reports only ok/error per check (plus the
    breaker state for Redis-backed checks), never hosts or exception text
    (the exception class goes to the log).

    200 {"status": "ok"|"degraded", "checks": {...}}; 503 "error" only when the
    database is down."""
    checks = {}
    critical_failed = False
    degraded = False
    for name, check, critical in HEALTH_CHECKS:
        started = time.monotonic()
        try:
            extra = check() or {}
            checks[name] = {"status": "ok", **extra}
        except Exception as exc:  # noqa: BLE001 - any failure marks the check as failing
            logger.warning("Health check '%s' failed (%s)", name, type(exc).__name__)
            checks[name] = {"status": "error"}
            if name == "cache":
                checks[name]["breaker"] = "open" if cache_breaker().is_open else "closed"
            elif name == "channel_layer":
                checks[name]["breaker"] = (
                    "open" if channel_layer_breaker().is_open else "closed"
                )
            if critical:
                critical_failed = True
            else:
                degraded = True
        checks[name]["latency_ms"] = round((time.monotonic() - started) * 1000, 1)

    if critical_failed:
        response = JsonResponse(
            {
                "status": "error",
                "checks": checks,
                "error": "Service unavailable.",
                "code": "unhealthy",
            },
            status=503,
        )
    else:
        response = JsonResponse(
            {"status": "degraded" if degraded else "ok", "checks": checks}
        )
    response["Cache-Control"] = "no-store"
    return response


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})
