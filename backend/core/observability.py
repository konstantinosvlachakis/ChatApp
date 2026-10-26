"""Request ids, log correlation and (optional) Sentry error reporting.

- ``RequestIdMiddleware`` gives every HTTP request an id (a valid incoming
  ``X-Request-ID`` or a fresh uuid4 hex), stores it on ``request.request_id`` and
  in a context variable, and echoes it in the ``X-Request-ID`` response header.
- ``RequestIdLogFilter`` adds ``record.request_id`` to every log record so the
  ``LOGGING`` format in settings can print it ("-" outside a request).
- ``init_sentry()`` initialises sentry-sdk only when ``SENTRY_DSN`` is set; the
  ``scrub_sentry_event`` hook strips cookies, auth headers, bodies and emails.
"""

import contextvars
import logging
import os
import re
import uuid

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_META_KEY = "HTTP_X_REQUEST_ID"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")

_request_id_var = contextvars.ContextVar("request_id", default=None)


def get_request_id():
    """The id of the request (or websocket connection) being handled, if any."""
    return _request_id_var.get()


def set_request_id(value):
    """Bind an id to the current context; returns a token for ``reset_request_id``."""
    return _request_id_var.set(value)


def reset_request_id(token):
    _request_id_var.reset(token)


def new_request_id():
    return uuid.uuid4().hex


def clean_request_id(raw_value):
    """Return the incoming id if it is safe to log and echo, else None."""
    if not raw_value:
        return None
    value = str(raw_value).strip()
    return value if _VALID_REQUEST_ID.match(value) else None


class RequestIdMiddleware:
    """Assign/propagate a request id. Must be the first middleware so every
    response (redirects and errors included) carries the header."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = clean_request_id(request.META.get(_REQUEST_ID_META_KEY)) or new_request_id()
        request.request_id = request_id
        token = set_request_id(request_id)
        try:
            response = self.get_response(request)
        finally:
            reset_request_id(token)
        response[REQUEST_ID_HEADER] = request_id
        return response


class RequestIdLogFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, "request_id"):
            # django.request logs after the middleware returned; it passes the
            # request in ``extra``, which still carries the id.
            request = getattr(record, "request", None)
            record.request_id = (
                get_request_id() or getattr(request, "request_id", None) or "-"
            )
        return True


# --- Sentry -----------------------------------------------------------------

_SCRUBBED = "[Filtered]"
_EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-csrftoken",
    "x-csrf-token",
    "proxy-authorization",
}


def _scrub_text(value):
    if isinstance(value, str):
        return _EMAIL_PATTERN.sub(_SCRUBBED, value)
    return value


def _scrub_headers(headers):
    if not isinstance(headers, dict):
        return headers
    return {
        key: (_SCRUBBED if str(key).lower() in _SENSITIVE_HEADERS else value)
        for key, value in headers.items()
    }


def scrub_sentry_event(event, _hint=None):
    """``before_send`` hook: drop anything that could identify a user or carry
    message content, and tag the event with the current request id."""
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("cookies", None)
        request.pop("data", None)  # request bodies may contain chat text / passwords
        if "headers" in request:
            request["headers"] = _scrub_headers(request["headers"])
        if isinstance(request.get("query_string"), str):
            request["query_string"] = _scrub_text(request["query_string"])

    user = event.get("user")
    if isinstance(user, dict):
        # Keep only the opaque numeric id.
        event["user"] = {"id": user["id"]} if "id" in user else {}

    if "message" in event:
        event["message"] = _scrub_text(event["message"])
    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        for key in ("message", "formatted"):
            if key in logentry:
                logentry[key] = _scrub_text(logentry[key])
        if "params" in logentry:
            logentry["params"] = [_SCRUBBED for _ in logentry.get("params") or []]

    for exception in (event.get("exception") or {}).get("values") or []:
        if isinstance(exception, dict) and "value" in exception:
            exception["value"] = _scrub_text(exception["value"])

    breadcrumbs = event.get("breadcrumbs")
    crumb_list = breadcrumbs.get("values") if isinstance(breadcrumbs, dict) else breadcrumbs
    for crumb in crumb_list or []:
        if isinstance(crumb, dict):
            if "message" in crumb:
                crumb["message"] = _scrub_text(crumb["message"])
            crumb.pop("data", None)

    request_id = get_request_id()
    if request_id:
        event.setdefault("tags", {})
        if isinstance(event["tags"], dict):
            event["tags"]["request_id"] = request_id
    return event


def _float_env(name, default):
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return min(max(value, 0.0), 1.0)


def init_sentry(environment=None):
    """Initialise Sentry when SENTRY_DSN is set. Returns True if initialised."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
    except ImportError:  # pragma: no cover - package missing in this environment
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed.")
        return False

    release = os.environ.get("HEROKU_SLUG_COMMIT") or os.environ.get("SOURCE_VERSION") or None
    sentry_sdk.init(
        dsn=dsn,
        integrations=[DjangoIntegration()],
        send_default_pii=False,
        traces_sample_rate=_float_env("SENTRY_TRACES_SAMPLE_RATE", 0.0),
        environment=environment or os.environ.get("DJANGO_ENV") or "production",
        release=release,
        before_send=scrub_sentry_event,
        before_send_transaction=scrub_sentry_event,
        max_request_body_size="never",
    )
    return True
