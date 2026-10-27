"""Push notifications for new chat messages via the Expo push service.

Flow: ``MessageListView.post`` calls ``schedule_message_push`` after the message
is saved. That builds the notification text from data the view already has (no
queries) and, once the transaction commits, hands delivery to a small thread
pool, so the request never waits on Expo. The worker re-checks blocking, loads
the recipient's active tokens, releases its DB connection, POSTs batches of at
most 100 messages (5 s timeout) and deactivates tokens whose ticket says
``DeviceNotRegistered``.

Payloads carry only the sender's username, a short preview and
``{type: "message", conversation_id}`` (no emails or other profile data).
"""

import json
import logging
import re
import http.client
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import connections, transaction
from django.db.models import Q

from .models import BlockedUser, PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_BATCH_SIZE = 100
EXPO_PUSH_TIMEOUT_SECONDS = 5
PUSH_BODY_MAX_LENGTH = 120
PUSH_CHANNEL_ID = "messages"
PUSH_PLATFORMS = {PushDevice.PLATFORM_IOS, PushDevice.PLATFORM_ANDROID}

# ExponentPushToken[...] (classic) or ExpoPushToken[...]; the inner id is opaque.
EXPO_PUSH_TOKEN_RE = re.compile(r"^(?:ExponentPushToken|ExpoPushToken)\[[^\[\]\s]{1,200}\]$")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="expo-push")


def push_enabled():
    return bool(getattr(settings, "PUSH_NOTIFICATIONS_ENABLED", False))


def is_valid_expo_push_token(token):
    return isinstance(token, str) and bool(EXPO_PUSH_TOKEN_RE.match(token))


def build_message_push_body(text, attachment_content_type=None):
    text = " ".join(str(text or "").split())
    if text:
        if len(text) > PUSH_BODY_MAX_LENGTH:
            return text[: PUSH_BODY_MAX_LENGTH - 1].rstrip() + "…"
        return text
    content_type = str(attachment_content_type or "").lower()
    if content_type.startswith("image/"):
        return "📷 Photo"
    if content_type.startswith("audio/"):
        return "🎤 Voice message"
    return "📎 File"


def build_expo_message(token, *, title, body, conversation_id):
    return {
        "to": token,
        "title": title,
        "body": body,
        "data": {"type": "message", "conversation_id": conversation_id},
        "sound": "default",
        "channelId": PUSH_CHANNEL_ID,
        # iOS groups a conversation's notifications without replacing them.
        "threadId": f"conversation-{conversation_id}",
        "priority": "high",
    }


def send_expo_push_batch(messages):
    """POST up to 100 messages; return the ticket list ([] on any failure)."""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    access_token = getattr(settings, "EXPO_ACCESS_TOKEN", "")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    request = Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=EXPO_PUSH_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, http.client.HTTPException) as error:
        # OSError covers URLError/HTTPError and timeouts. Never log tokens.
        logger.warning("Expo push request failed: %s", type(error).__name__)
        return []
    tickets = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(tickets, dict):  # a single message can come back unwrapped
        tickets = [tickets]
    return tickets if isinstance(tickets, list) else []


def _release_connections():
    for conn in connections.all(initialized_only=True):
        if conn.in_atomic_block:
            continue
        conn.close()


def _pair_is_blocked(user_a_id, user_b_id):
    return BlockedUser.objects.filter(
        Q(blocker_id=user_a_id, blocked_id=user_b_id)
        | Q(blocker_id=user_b_id, blocked_id=user_a_id)
    ).exists()


def deliver_message_push(*, conversation_id, sender_id, recipient_id, title, body):
    """Send one message notification to the recipient's active devices."""
    try:
        if not recipient_id or recipient_id == sender_id:
            return
        if _pair_is_blocked(sender_id, recipient_id):
            return
        tokens = list(
            PushDevice.objects.filter(user_id=recipient_id, is_active=True)
            .order_by("id")
            .values_list("token", flat=True)
        )
        if not tokens:
            return
        # Don't hold a (pooled) connection while waiting on Expo.
        _release_connections()

        unregistered = []
        for start in range(0, len(tokens), EXPO_PUSH_BATCH_SIZE):
            batch_tokens = tokens[start : start + EXPO_PUSH_BATCH_SIZE]
            messages = [
                build_expo_message(
                    token, title=title, body=body, conversation_id=conversation_id
                )
                for token in batch_tokens
            ]
            tickets = send_expo_push_batch(messages)
            # Tickets come back in request order.
            for token, ticket in zip(batch_tokens, tickets):
                if not isinstance(ticket, dict) or ticket.get("status") != "error":
                    continue
                details = ticket.get("details") or {}
                if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
                    unregistered.append(token)
                else:
                    logger.warning(
                        "Expo push ticket error: %s",
                        details.get("error") if isinstance(details, dict) else "unknown",
                    )
        if unregistered:
            PushDevice.objects.filter(token__in=unregistered).update(is_active=False)
    except Exception:
        logger.exception("Message push delivery failed")
    finally:
        _release_connections()


def _submit(func, **kwargs):
    """Run off the request thread (tests patch this to run inline)."""
    _executor.submit(func, **kwargs)


def schedule_message_push(
    *, conversation_id, sender_id, sender_username, recipient_id, text, attachment_content_type=None
):
    """Queue a notification for a newly saved message. Never raises, no queries."""
    if not push_enabled() or not recipient_id or recipient_id == sender_id:
        return
    try:
        kwargs = {
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "recipient_id": recipient_id,
            "title": str(sender_username or "New message"),
            "body": build_message_push_body(text, attachment_content_type),
        }
        transaction.on_commit(lambda: _submit(deliver_message_push, **kwargs))
    except Exception:
        logger.exception("Could not schedule message push")
