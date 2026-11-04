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

New follows (``follow_user_view``) use the same path via ``schedule_follow_push``:
"<username> followed you" with ``{type: "follow", username}``.
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


def _deliver_to_user(*, sender_id, recipient_id, build_message, label):
    """Send to the recipient's active devices; ``build_message(token)`` makes one
    Expo message. Skips self and blocked pairs (either direction)."""
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
            messages = [build_message(token) for token in batch_tokens]
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
        logger.exception("%s push delivery failed", label)
    finally:
        _release_connections()


def deliver_message_push(*, conversation_id, sender_id, recipient_id, title, body):
    """Send one message notification to the recipient's active devices."""
    _deliver_to_user(
        sender_id=sender_id,
        recipient_id=recipient_id,
        build_message=lambda token: build_expo_message(
            token, title=title, body=body, conversation_id=conversation_id
        ),
        label="Message",
    )


def build_expo_follow_message(token, *, follower_username):
    return {
        "to": token,
        "title": "New follower",
        "body": f"{follower_username} followed you",
        "data": {"type": "follow", "username": follower_username},
        "sound": "default",
        "channelId": PUSH_CHANNEL_ID,
        "threadId": "followers",
        "priority": "high",
    }


def deliver_follow_push(*, follower_id, follower_username, recipient_id):
    """Tell the followed person on their active devices."""
    _deliver_to_user(
        sender_id=follower_id,
        recipient_id=recipient_id,
        build_message=lambda token: build_expo_follow_message(
            token, follower_username=follower_username
        ),
        label="Follow",
    )


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


def schedule_follow_push(*, follower_id, follower_username, recipient_id):
    """Queue a "<username> followed you" notification. Never raises, no queries."""
    if not push_enabled() or not recipient_id or recipient_id == follower_id:
        return
    try:
        kwargs = {
            "follower_id": follower_id,
            "follower_username": str(follower_username or "Someone"),
            "recipient_id": recipient_id,
        }
        transaction.on_commit(lambda: _submit(deliver_follow_push, **kwargs))
    except Exception:
        logger.exception("Could not schedule follow push")


def schedule_group_message_push(
    *, conversation_id, group_name, sender_id, sender_username, recipient_ids, text,
    attachment_content_type=None,
):
    """Queue a notification per other group member: title = group name, body =
    "<sender>: <text>". Each delivery re-checks blocks (a member who blocked the
    sender gets nothing). Never raises, no queries."""
    if not push_enabled():
        return
    recipients = [rid for rid in dict.fromkeys(recipient_ids or []) if rid and rid != sender_id]
    if not recipients:
        return
    try:
        title = str(group_name or "Group chat")
        body = f"{sender_username or 'Someone'}: {build_message_push_body(text, attachment_content_type)}"
        for recipient_id in recipients:
            kwargs = {
                "conversation_id": conversation_id,
                "sender_id": sender_id,
                "recipient_id": recipient_id,
                "title": title,
                "body": body,
            }
            transaction.on_commit(lambda kwargs=kwargs: _submit(deliver_message_push, **kwargs))
    except Exception:
        logger.exception("Could not schedule group message push")


def build_expo_group_invite_message(token, *, conversation_id, inviter_username, group_name):
    return {
        "to": token,
        "title": "Group chat invite",
        "body": f"{inviter_username} invited you to {group_name}",
        "data": {"type": "group_invite", "conversation_id": conversation_id},
        "sound": "default",
        "channelId": PUSH_CHANNEL_ID,
        "threadId": "group-invites",
        "priority": "high",
    }


def deliver_group_invite_push(*, conversation_id, inviter_id, inviter_username, group_name, recipient_id):
    _deliver_to_user(
        sender_id=inviter_id,
        recipient_id=recipient_id,
        build_message=lambda token: build_expo_group_invite_message(
            token,
            conversation_id=conversation_id,
            inviter_username=inviter_username,
            group_name=group_name,
        ),
        label="Group invite",
    )


def schedule_group_invite_push(*, conversation_id, inviter_id, inviter_username, group_name, recipient_ids):
    """Queue "<inviter> invited you to <group>" per invitee. Never raises, no queries."""
    if not push_enabled():
        return
    try:
        for recipient_id in dict.fromkeys(recipient_ids or []):
            if not recipient_id or recipient_id == inviter_id:
                continue
            kwargs = {
                "conversation_id": conversation_id,
                "inviter_id": inviter_id,
                "inviter_username": str(inviter_username or "Someone"),
                "group_name": str(group_name or "a group chat"),
                "recipient_id": recipient_id,
            }
            transaction.on_commit(lambda kwargs=kwargs: _submit(deliver_group_invite_push, **kwargs))
    except Exception:
        logger.exception("Could not schedule group invite push")
