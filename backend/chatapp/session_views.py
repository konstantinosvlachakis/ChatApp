"""Guided exchange session endpoints (rules in ``exchange_sessions``).

GET/POST conversations/<id>/session/ reads or starts (invites) a session;
POST exchange-sessions/<id>/<action>/ accepts, declines, cancels, switches
language, changes topic or ends it. Every change is broadcast to the chat room
as ``exchange_session``; a new invite also reaches the partner's presence
socket as ``exchange_invite`` (so they see it outside the chat).
"""
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.exceptions import error_response
from core.realtime import broadcast

from . import exchange_sessions as rules
from .conversation_members import is_conversation_member
from .email_verification import RequireVerifiedEmail
from .models import Conversation, ExchangeSession
from .serializers import ProfileSerializer
from .throttles import (
    ExchangeSessionActionRateThrottle,
    ExchangeSessionCreateRateThrottle,
    with_default_throttles,
)
from .views import broadcast_chat_room_event, release_db_connection, users_are_blocked

SESSION_RELATED = ("created_by", "partner", "conversation")
ACTIONS = ("accept", "decline", "cancel", "switch", "topic", "end")


def _broadcast_session(session, now):
    broadcast_chat_room_event(
        session.conversation_id,
        "exchange_session_event",
        session=rules.session_payload(session, now),
    )


def _latest_visible_session(conversation, now):
    """The open session, or one that ended within RECENT_ENDED_WINDOW."""
    session = (
        ExchangeSession.objects.filter(conversation=conversation)
        .select_related(*SESSION_RELATED)
        .order_by("-created_at", "-id")
        .first()
    )
    if session is None:
        return None
    if rules.refresh_session(session, now):
        _broadcast_session(session, now)
    if session.status in ExchangeSession.OPEN_STATUSES:
        return session
    if session.status == ExchangeSession.STATUS_ENDED and now - session.ended_at <= rules.RECENT_ENDED_WINDOW:
        return session
    return None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(ExchangeSessionCreateRateThrottle))
def conversation_session_view(request, conversation_id):
    """GET {session|null, languages, durations}. POST {duration_minutes, first_language,
    second_language, topic?} invites the other person (201 {session})."""
    conversation = get_object_or_404(
        Conversation.objects.select_related("sender", "receiver"), id=conversation_id
    )
    if not is_conversation_member(request.user.id, conversation):
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    if conversation.is_group:
        return error_response(
            "Guided exchanges are for one-to-one chats.", "group_not_supported", status.HTTP_400_BAD_REQUEST
        )
    me = request.user
    partner = conversation.receiver if conversation.sender_id == me.id else conversation.sender
    now = timezone.now()

    if request.method == "GET":
        session = _latest_visible_session(conversation, now)
        first, second = rules.default_languages(me, partner)
        return Response(
            {
                "session": rules.session_payload(session, now) if session else None,
                "languages": sorted(set(rules.user_languages(me)) | set(rules.user_languages(partner))),
                "default_languages": [first, second],
                "durations": list(rules.DURATIONS),
            }
        )

    if users_are_blocked(me.id, partner.id):
        return error_response("You can't start an exchange here.", "blocked", status.HTTP_403_FORBIDDEN)
    if partner.id == me.id:
        return error_response("You need a partner for an exchange.", "no_partner", status.HTTP_400_BAD_REQUEST)

    data = request.data
    try:
        duration = int(data.get("duration_minutes") or 20)
    except (TypeError, ValueError):
        duration = 0
    if duration not in rules.DURATIONS:
        return error_response(
            "Choose 10, 20 or 30 minutes.", "invalid_duration", status.HTTP_400_BAD_REQUEST
        )
    default_first, default_second = rules.default_languages(me, partner)
    first = str(data.get("first_language") or default_first).strip().lower()
    second = str(data.get("second_language") or default_second).strip().lower()
    allowed = set(rules.user_languages(me)) | set(rules.user_languages(partner))
    if not first or not second or first == second or first not in allowed or second not in allowed:
        return error_response(
            "Pick two different languages that one of you speaks or learns.",
            "invalid_languages",
            status.HTTP_400_BAD_REQUEST,
        )
    topic_title = str(data.get("topic") or "").strip()

    # Close a stale open session first, so the "one open session" rule only
    # blocks live ones.
    existing = _latest_visible_session(conversation, now)
    if existing is not None and existing.status in ExchangeSession.OPEN_STATUSES:
        return error_response(
            "There's already an exchange in this chat.",
            "session_exists",
            status.HTTP_409_CONFLICT,
            session=rules.session_payload(existing, now),
        )

    session = ExchangeSession(
        conversation=conversation,
        created_by=me,
        partner=partner,
        duration_minutes=duration,
        first_language=first,
        second_language=second,
        expires_at=now + rules.INVITE_TTL,
    )
    if topic_title:
        rules.custom_topic(session, topic_title)
    else:
        # Prepare Lumi's topics now (the inviter waits, not the live session).
        session.topic_queue = rules.ai_topics(session, before_ai=release_db_connection)
    try:
        with transaction.atomic():
            session.save()
    except IntegrityError:
        return error_response(
            "There's already an exchange in this chat.", "session_exists", status.HTTP_409_CONFLICT
        )

    now = timezone.now()
    _broadcast_session(session, now)
    inviter = ProfileSerializer(me, context={"request": request}).data
    broadcast(
        f"presence_user_{partner.id}",
        {
            "type": "exchange_invite_event",
            "conversation_id": conversation.id,
            "session_id": session.id,
            "duration_minutes": duration,
            "first_language": first,
            "second_language": second,
            "invited_by": {
                "username": inviter.get("username"),
                "profile_image_url": inviter.get("profile_image_url"),
            },
        },
    )
    return Response({"session": rules.session_payload(session, now)}, status=status.HTTP_201_CREATED)


def _action_error(message, code, http_status=status.HTTP_409_CONFLICT):
    return error_response(message, code, http_status)


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(ExchangeSessionActionRateThrottle))
def exchange_session_action_view(request, session_id, action):
    """accept / decline (partner, pending), cancel (starter, pending), switch /
    topic {title?} / end (either, active). Returns {session}."""
    if action not in ACTIONS:
        return error_response("Unknown action.", "not_found", status.HTTP_404_NOT_FOUND)
    me = request.user
    session = get_object_or_404(
        ExchangeSession.objects.select_related(*SESSION_RELATED), id=session_id
    )
    if me.id not in (session.created_by_id, session.partner_id) or not is_conversation_member(
        me.id, session.conversation
    ):
        return error_response(
            "You are not part of this exchange.", "not_participant", status.HTTP_403_FORBIDDEN
        )

    # Lumi topics are fetched before taking the row lock (the call can take seconds).
    prefetched_topics = None
    custom_title = str(request.data.get("title") or "").strip() if action == "topic" else ""
    if (
        action == "topic"
        and not custom_title
        and session.status == ExchangeSession.STATUS_ACTIVE
        and not session.topic_queue
        and session.topic_source == "ai"
        and not users_are_blocked(session.created_by_id, session.partner_id)
    ):
        prefetched_topics = rules.ai_topics(session, before_ai=release_db_connection)

    with transaction.atomic():
        session = (
            ExchangeSession.objects.select_for_update()
            .select_related(*SESSION_RELATED)
            .get(id=session.id)
        )
        now = timezone.now()
        changed = rules.refresh_session(session, now)
        is_pending = session.status == ExchangeSession.STATUS_PENDING
        is_active = session.status == ExchangeSession.STATUS_ACTIVE
        error = None

        if action in ("accept", "decline"):
            if me.id != session.partner_id:
                error = _action_error("Only the invited person can answer.", "not_invitee", status.HTTP_403_FORBIDDEN)
            elif not is_pending:
                error = _action_error("This invite is no longer open.", "session_not_pending")
            elif action == "accept" and users_are_blocked(session.created_by_id, session.partner_id):
                error = _action_error("You can't start an exchange here.", "blocked", status.HTTP_403_FORBIDDEN)
            elif action == "accept":
                session.status = ExchangeSession.STATUS_ACTIVE
                session.started_at = now
                fields = ["status", "started_at"]
                if not session.topic:
                    fields += rules.next_topic(session, allow_ai=False)
                session.save(update_fields=fields)
                changed = True
            else:
                session.status = ExchangeSession.STATUS_DECLINED
                session.ended_at = now
                session.save(update_fields=["status", "ended_at"])
                changed = True
        elif action == "cancel":
            if me.id != session.created_by_id:
                error = _action_error("Only the person who invited can cancel.", "not_starter", status.HTTP_403_FORBIDDEN)
            elif not is_pending:
                error = _action_error("This invite is no longer open.", "session_not_pending")
            else:
                session.status = ExchangeSession.STATUS_CANCELLED
                session.ended_at = now
                session.save(update_fields=["status", "ended_at"])
                changed = True
        elif not is_active:
            error = _action_error("This exchange isn't running.", "session_not_active")
        elif action == "switch":
            if rules.switch_point(session) <= now:
                error = _action_error("You've already switched language.", "already_switched")
            else:
                session.switched_at = now
                session.save(update_fields=["switched_at"])
                changed = True
        elif action == "topic":
            if custom_title:
                fields = rules.custom_topic(session, custom_title)
            else:
                if prefetched_topics:
                    session.topic_queue = prefetched_topics
                fields = rules.next_topic(session, allow_ai=False)
            session.save(update_fields=fields)
            changed = True
        elif action == "end":
            rules.finish_session(session, ended_at=now, ended_by=me)
            changed = True

    if changed:
        _broadcast_session(session, now)
    if error is not None:
        return error
    return Response({"session": rules.session_payload(session, now)})
