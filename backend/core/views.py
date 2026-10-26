import logging
import time
import uuid
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
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

from .exceptions import GENERIC_SERVER_ERROR, json_error

logger = logging.getLogger(__name__)

FRONTEND_BUILD_DIR = Path(settings.TEMPLATES[0]["DIRS"][0])


def resolve_frontend_template(request_path):
    normalized = request_path.strip("/")
    if not normalized:
        return "index.html"

    candidate = (FRONTEND_BUILD_DIR / normalized / "index.html").resolve()
    # Reject path traversal (e.g. /..%2F..%2F) outside the frontend build dir.
    if not candidate.is_relative_to(FRONTEND_BUILD_DIR.resolve()):
        return "index.html"
    if candidate.is_file():
        return f"{normalized}/index.html"

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
    # The Redis cache client uses 2 s socket timeouts (settings.CACHES).
    key = f"health:check:{uuid.uuid4().hex}"
    cache.set(key, "1", timeout=10)
    try:
        if cache.get(key) != "1":
            raise RuntimeError("cache round-trip mismatch")
    finally:
        cache.delete(key)


HEALTH_CHECKS = (("database", _check_database), ("cache", _check_cache))


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    """Liveness/readiness probe. Reports only ok/error per check, never hosts or
    exception text (those go to the log)."""
    checks = {}
    healthy = True
    for name, check in HEALTH_CHECKS:
        started = time.monotonic()
        try:
            check()
            checks[name] = {"status": "ok"}
        except Exception:  # noqa: BLE001 - any failure marks the check as failing
            logger.warning("Health check '%s' failed", name, exc_info=True)
            checks[name] = {"status": "error"}
            healthy = False
        checks[name]["latency_ms"] = round((time.monotonic() - started) * 1000, 1)

    if healthy:
        response = JsonResponse({"status": "ok", "checks": checks})
    else:
        response = JsonResponse(
            {
                "status": "error",
                "checks": checks,
                "error": "Service unavailable.",
                "code": "unhealthy",
            },
            status=503,
        )
    response["Cache-Control"] = "no-store"
    return response


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})
