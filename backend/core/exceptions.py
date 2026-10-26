"""One error envelope for every API error.

Shape: ``{"error": "<human-readable message>", "code": "<machine_code>"}`` plus
optional keys:
- ``details``: field errors for validation failures (DRF ``ValidationError``);
- ``retry_after``: seconds, for 429 responses (also sent as ``Retry-After``);
- ``request_id``: on 500s, so users can quote it to support;
- ``detail``: legacy copy of ``error`` on DRF-generated errors, kept for one
  release for clients that still read it (older mobile builds, coach).

``api_exception_handler`` is DRF's EXCEPTION_HANDLER. ``ApiErrorEnvelopeMiddleware``
fills in ``error``/``code`` on hand-written ``/api/`` error responses that do not
set them yet, so every API error carries both keys.
"""

import json
import logging
import math
import sys

from django.core.serializers.json import DjangoJSONEncoder
from django.http import JsonResponse
from rest_framework import exceptions as drf_exceptions
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

from .observability import get_request_id

logger = logging.getLogger("core.api")

GENERIC_SERVER_ERROR = "Something went wrong on our side. Please try again."

DEFAULT_CODES = {
    400: "invalid",
    401: "not_authenticated",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    406: "not_acceptable",
    409: "conflict",
    413: "too_large",
    415: "unsupported_media_type",
    429: "throttled",
    500: "server_error",
    502: "upstream_error",
    503: "service_unavailable",
    504: "upstream_timeout",
}

DEFAULT_MESSAGES = {
    400: "The request was invalid.",
    401: "Authentication credentials were not provided or have expired.",
    403: "You do not have permission to perform this action.",
    404: "Not found.",
    405: "Method not allowed.",
    429: "Too many requests. Please try again shortly.",
    500: GENERIC_SERVER_ERROR,
    502: "An upstream service failed. Please try again.",
    503: "The service is temporarily unavailable. Please try again.",
    504: "An upstream service timed out. Please try again.",
}


def default_code_for_status(status_code):
    if status_code in DEFAULT_CODES:
        return DEFAULT_CODES[status_code]
    return "server_error" if status_code >= 500 else "error"


def default_message_for_status(status_code):
    if status_code in DEFAULT_MESSAGES:
        return DEFAULT_MESSAGES[status_code]
    return GENERIC_SERVER_ERROR if status_code >= 500 else "The request could not be completed."


def error_payload(message, code, status_code=None, details=None, **extra):
    """Build an envelope dict. ``request_id`` is added for 5xx responses."""
    payload = {"error": str(message), "code": str(code)}
    if details is not None:
        payload["details"] = details
    payload.update(extra)
    if status_code is not None and status_code >= 500:
        request_id = get_request_id()
        if request_id:
            payload.setdefault("request_id", request_id)
    return payload


def error_response(message, code, status_code, details=None, **extra):
    """A DRF ``Response`` carrying the envelope (use from DRF views)."""
    return Response(error_payload(message, code, status_code, details, **extra), status=status_code)


def json_error(message, code, status_code, details=None, **extra):
    """A plain ``JsonResponse`` carrying the envelope (use outside DRF)."""
    return JsonResponse(error_payload(message, code, status_code, details, **extra), status=status_code)


def _first_validation_message(detail, prefix=""):
    if isinstance(detail, dict):
        for key, value in detail.items():
            label = "" if key in ("non_field_errors", "__all__", "detail") else f"{key}: "
            message = _first_validation_message(value, label)
            if message:
                return message
        return None
    if isinstance(detail, (list, tuple)):
        for item in detail:
            message = _first_validation_message(item, prefix)
            if message:
                return message
        return None
    if detail is None:
        return None
    return f"{prefix}{detail}"


def _message_and_code(exc, data, status_code):
    """Pick a human message and machine code for a handled DRF exception."""
    code = getattr(exc, "default_code", None) or default_code_for_status(status_code)
    detail = getattr(exc, "detail", None)
    message = None
    if isinstance(detail, dict):
        # e.g. simplejwt's InvalidToken: {"detail": ..., "code": ..., "messages": [...]}
        message = detail.get("detail")
        if detail.get("code"):
            code = str(detail["code"])
    elif isinstance(detail, (list, tuple)):
        message = _first_validation_message(detail)
    elif detail is not None:
        message = str(detail)
        detail_code = getattr(detail, "code", None)
        if detail_code and detail_code not in ("invalid", "error"):
            code = str(detail_code)
    if isinstance(exc, drf_exceptions.PermissionDenied) and str(message or "").startswith("CSRF Failed"):
        code = "csrf_failed"
    return str(message or default_message_for_status(status_code)), code


def api_exception_handler(exc, context):
    """DRF EXCEPTION_HANDLER that renders every error as the envelope."""
    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled exception: log it with the traceback, never leak details.
        logger.error(
            "Unhandled API exception in %s",
            _view_name(context),
            exc_info=(type(exc), exc, exc.__traceback__) if exc.__traceback__ else sys.exc_info(),
        )
        set_rollback()
        return Response(
            error_payload(GENERIC_SERVER_ERROR, "server_error", 500),
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    status_code = response.status_code
    if isinstance(exc, drf_exceptions.ValidationError):
        message = _first_validation_message(response.data) or default_message_for_status(400)
        response.data = error_payload(message, "invalid", status_code, details=response.data)
        return response

    message, code = _message_and_code(exc, response.data, status_code)
    extra = {"detail": message}  # legacy key (one release)
    if isinstance(exc, drf_exceptions.Throttled):
        code = "throttled"
        wait = getattr(exc, "wait", None)
        if wait is not None:
            retry_after = max(1, int(math.ceil(wait)))
            extra["retry_after"] = retry_after
            response["Retry-After"] = str(retry_after)
    response.data = error_payload(message, code, status_code, **extra)
    return response


def _view_name(context):
    view = (context or {}).get("view")
    return view.__class__.__name__ if view is not None else "unknown view"


class ApiErrorEnvelopeMiddleware:
    """Make sure every ``/api/`` JSON error response has ``error`` and ``code``.

    Hand-written views mostly return ``{"error": ...}`` already; this adds a
    default ``code`` from the status (and ``error`` from a legacy ``detail`` or
    ``message`` key) without touching responses that are already enveloped.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code < 400 or not request.path.startswith("/api/"):
            return response
        if getattr(response, "streaming", False):
            return response
        if "application/json" not in response.get("Content-Type", ""):
            return response
        try:
            payload = json.loads(response.content or b"null")
        except (ValueError, UnicodeDecodeError):
            return response
        if not isinstance(payload, dict):
            return response

        changed = False
        if not isinstance(payload.get("error"), str):
            legacy = payload.get("detail") if isinstance(payload.get("detail"), str) else payload.get("message")
            payload["error"] = str(legacy) if isinstance(legacy, str) and legacy else default_message_for_status(response.status_code)
            changed = True
        if not payload.get("code"):
            payload["code"] = default_code_for_status(response.status_code)
            changed = True
        if response.status_code >= 500 and "request_id" not in payload:
            request_id = getattr(request, "request_id", None) or get_request_id()
            if request_id:
                payload["request_id"] = request_id
                changed = True
        if changed:
            response.content = json.dumps(payload, cls=DjangoJSONEncoder).encode("utf-8")
            if response.has_header("Content-Length"):
                response["Content-Length"] = str(len(response.content))
        return response

