"""Group chat endpoints: create, invite, accept/decline, leave/remove, rename.

Rules live in ``conversation_members`` (size cap, who can be invited, blocks, history
from join time). Every change bumps the affected users' conversation-list cache and is
pushed live: ``group_updated`` to the chat room (removed members' sockets close),
``conversation_update`` (triggers ``group_members`` / ``group_renamed``) to members'
presence sockets, and ``group_invite`` to invitees.
"""
from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.exceptions import error_response
from core.realtime import broadcast

from .conversation_members import (
    ACTIVE,
    GROUP_NAME_MAX_LENGTH,
    MAX_GROUP_MEMBERS,
    MEMBER,
    OWNER,
    PENDING,
    group_display_name,
    group_participant_rows,
    invitable_ids,
)
from .email_verification import RequireVerifiedEmail
from .models import BlockedUser, Conversation, ConversationParticipant, Profile
from .push import schedule_group_invite_push
from .serializers import ConversationSerializer, ProfileSerializer
from .throttles import (
    CONVERSATION_CREATE_THROTTLES,
    GROUP_INVITE_THROTTLES,
    with_default_throttles,
)
from .views import (
    broadcast_chat_room_event,
    broadcast_conversation_update,
    bump_conversation_list_cache_version,
)

MAX_INVITEES = MAX_GROUP_MEMBERS - 1
MAX_NICKNAME_LENGTH = 40


# ---------------------------------------------------------------- helpers

def _participants_prefetch():
    return Prefetch(
        "participants",
        queryset=ConversationParticipant.objects.select_related("user").order_by(
            "joined_at", "created_at", "id"
        ),
        to_attr="group_participants",
    )


def _load_group(conversation_id):
    return get_object_or_404(
        Conversation.objects.select_related("sender").prefetch_related(_participants_prefetch()),
        id=conversation_id,
        kind=Conversation.KIND_GROUP,
    )


def _serialize(request, conversation):
    return ConversationSerializer(
        conversation, context={"request": request, "include_messages": False}
    ).data


def _clean_name(raw):
    name = " ".join(str(raw or "").split())
    if len(name) > GROUP_NAME_MAX_LENGTH:
        return None
    return name


def _resolve_usernames(raw, exclude_user_id):
    """Profiles for a list of usernames (case-insensitive, de-duplicated).

    Returns (profiles, error_response_or_None)."""
    if not isinstance(raw, (list, tuple)):
        return None, error_response("Choose who to invite.", "invalid_members", status.HTTP_400_BAD_REQUEST)
    wanted = []
    for value in raw:
        name = str(value or "").strip()
        if name and name.lower() not in {existing.lower() for existing in wanted}:
            wanted.append(name)
    if not wanted:
        return None, error_response("Choose who to invite.", "invalid_members", status.HTTP_400_BAD_REQUEST)
    if len(wanted) > MAX_INVITEES:
        return None, error_response(
            f"A group can have at most {MAX_GROUP_MEMBERS} people.", "group_full", status.HTTP_400_BAD_REQUEST
        )
    query = Q()
    for name in wanted:
        query |= Q(username__iexact=name)
    by_name = {}
    for profile in Profile.objects.filter(query).order_by("id"):
        by_name.setdefault(profile.username.lower(), profile)  # legacy case duplicates: oldest
    missing = [name for name in wanted if name.lower() not in by_name]
    if missing:
        return None, error_response(
            "Some of these people couldn't be found.", "user_not_found", status.HTTP_400_BAD_REQUEST,
            usernames=missing,
        )
    profiles = [by_name[name.lower()] for name in wanted if by_name[name.lower()].id != exclude_user_id]
    if not profiles:
        return None, error_response("Choose who to invite.", "invalid_members", status.HTTP_400_BAD_REQUEST)
    return profiles, None


def _check_invitees(inviter, invitees, current_ids):
    """Who may be added: people the inviter follows or chats with, with no block
    (either way) against anyone already in the group or invited with them."""
    invitee_ids = [profile.id for profile in invitees]
    allowed = invitable_ids(inviter.id, invitee_ids)
    not_allowed = [profile.username for profile in invitees if profile.id not in allowed]
    if not_allowed:
        return error_response(
            "You can only invite people you follow or already chat with.",
            "not_invitable",
            status.HTTP_400_BAD_REQUEST,
            usernames=not_allowed,
        )
    everyone = set(current_ids) | set(invitee_ids) | {inviter.id}
    blocked = BlockedUser.objects.filter(
        Q(blocker_id__in=invitee_ids, blocked_id__in=everyone)
        | Q(blocked_id__in=invitee_ids, blocker_id__in=everyone)
    ).exists()
    if blocked:
        # Generic on purpose: never reveal who blocked whom.
        return error_response(
            "Some of these people can't be added to this group.", "cannot_add", status.HTTP_400_BAD_REQUEST
        )
    return None


def broadcast_group_updated(conversation_id, trigger, actor_id, user_ids=(), removed_user_ids=()):
    """Tell open chat sockets the group changed (they refresh members; a removed
    member's sockets close)."""
    broadcast_chat_room_event(
        conversation_id,
        "group_updated_event",
        conversation_id=conversation_id,
        trigger=trigger,
        actor_id=actor_id,
        user_ids=list(user_ids),
        removed_user_ids=list(removed_user_ids),
    )


def _notify_members(conversation, trigger, actor_id, extra_user_ids=()):
    """Bump list caches and send ``conversation_update`` to members (+ extras)."""
    user_ids = set(
        ConversationParticipant.objects.filter(conversation=conversation).values_list("user_id", flat=True)
    ) | set(extra_user_ids)
    for user_id in user_ids:
        bump_conversation_list_cache_version(user_id)
    broadcast_conversation_update(user_ids, conversation.id, trigger, actor_id=actor_id)


def _send_invites(request, conversation, invitees):
    name = group_display_name(conversation)
    inviter = request.user
    invited_by = ProfileSerializer(inviter, context={"request": request}).data
    for profile in invitees:
        bump_conversation_list_cache_version(profile.id)
        broadcast(
            f"presence_user_{profile.id}",
            {
                "type": "group_invite_event",
                "conversation_id": conversation.id,
                "display_name": name,
                "invited_by": {
                    "username": invited_by.get("username"),
                    "profile_image_url": invited_by.get("profile_image_url"),
                },
            },
        )
    schedule_group_invite_push(
        conversation_id=conversation.id,
        inviter_id=inviter.id,
        inviter_username=inviter.username,
        group_name=name,
        recipient_ids=[profile.id for profile in invitees],
    )


def _current_ids(conversation, statuses=(ACTIVE, PENDING)):
    return [row.user_id for row in group_participant_rows(conversation, statuses=statuses)]


# ---------------------------------------------------------------- endpoints

@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(*CONVERSATION_CREATE_THROTTLES, *GROUP_INVITE_THROTTLES))
def create_group_view(request):
    """POST {members: [username], name?} → 201 conversation (you are the owner; the
    others are invited and join when they accept)."""
    name = _clean_name(request.data.get("name"))
    if name is None:
        return error_response(
            f"Group names can be at most {GROUP_NAME_MAX_LENGTH} characters.", "invalid_name",
            status.HTTP_400_BAD_REQUEST,
        )
    invitees, error = _resolve_usernames(request.data.get("members"), request.user.id)
    if error:
        return error
    error = _check_invitees(request.user, invitees, [])
    if error:
        return error

    now = timezone.now()
    with transaction.atomic():
        conversation = Conversation.objects.create(
            kind=Conversation.KIND_GROUP, name=name, sender=request.user
        )
        ConversationParticipant.objects.bulk_create(
            [
                ConversationParticipant(
                    conversation=conversation, user=request.user, role=OWNER, status=ACTIVE,
                    joined_at=now, last_read_at=now,
                )
            ]
            + [
                ConversationParticipant(
                    conversation=conversation, user=profile, role=MEMBER, status=PENDING,
                    invited_by=request.user,
                )
                for profile in invitees
            ]
        )
    conversation = _load_group(conversation.id)
    bump_conversation_list_cache_version(request.user.id)
    broadcast_conversation_update([request.user.id], conversation.id, "group_members", actor_id=request.user.id)
    _send_invites(request, conversation, invitees)
    return Response(_serialize(request, conversation), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(*GROUP_INVITE_THROTTLES))
def invite_members_view(request, conversation_id):
    """POST {usernames: [...]} → invite people (any member). People already in the
    group or invited are skipped."""
    conversation = get_object_or_404(
        Conversation.objects.prefetch_related(_participants_prefetch()), id=conversation_id
    )
    if not conversation.is_group:
        return error_response("Only group chats have members to invite.", "not_a_group", status.HTTP_400_BAD_REQUEST)
    if request.user.id not in _current_ids(conversation, statuses=(ACTIVE,)):
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    profiles, error = _resolve_usernames(request.data.get("usernames"), request.user.id)
    if error:
        return error
    current_ids = _current_ids(conversation)
    invitees = [profile for profile in profiles if profile.id not in current_ids]
    if not invitees:
        return error_response(
            "They're already in this group or invited.", "already_member", status.HTTP_400_BAD_REQUEST
        )
    if len(current_ids) + len(invitees) > MAX_GROUP_MEMBERS:
        return error_response(
            f"A group can have at most {MAX_GROUP_MEMBERS} people (invites included).", "group_full",
            status.HTTP_400_BAD_REQUEST,
        )
    error = _check_invitees(request.user, invitees, current_ids)
    if error:
        return error

    ConversationParticipant.objects.bulk_create(
        [
            ConversationParticipant(
                conversation=conversation, user=profile, role=MEMBER, status=PENDING,
                invited_by=request.user,
            )
            for profile in invitees
        ],
        ignore_conflicts=True,  # a concurrent invite of the same person
    )
    conversation = _load_group(conversation.id)
    _notify_members(conversation, "group_members", request.user.id)
    broadcast_group_updated(
        conversation.id, "invited", request.user.id, user_ids=[profile.id for profile in invitees]
    )
    _send_invites(request, conversation, invitees)
    return Response(_serialize(request, conversation), status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def group_invites_view(request):
    """GET → my pending group invites, newest first."""
    rows = (
        ConversationParticipant.objects.filter(
            user=request.user, status=PENDING, conversation__kind=Conversation.KIND_GROUP
        )
        .select_related("conversation", "invited_by")
        .prefetch_related(
            Prefetch(
                "conversation__participants",
                queryset=ConversationParticipant.objects.select_related("user").order_by(
                    "joined_at", "created_at", "id"
                ),
                to_attr="group_participants",
            )
        )
        .order_by("-created_at", "-id")
    )
    context = {"request": request}
    invites = []
    for row in rows:
        conversation = row.conversation
        members = [
            participant.user
            for participant in group_participant_rows(conversation, statuses=(ACTIVE,))
        ]
        invites.append({
            "conversation_id": conversation.id,
            "name": conversation.name,
            "display_name": group_display_name(conversation),
            "invited_by": ProfileSerializer(row.invited_by, context=context).data if row.invited_by else None,
            "members": ProfileSerializer(members, many=True, context=context).data,
            "member_count": len(members),
            "invited_at": row.created_at,
        })
    return Response({"invites": invites})


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
def respond_to_invite_view(request, conversation_id):
    """POST {action: "accept"|"decline"}."""
    action = str(request.data.get("action") or "").strip().lower()
    if action not in {"accept", "decline"}:
        return error_response("Choose accept or decline.", "invalid_action", status.HTTP_400_BAD_REQUEST)
    invite = (
        ConversationParticipant.objects.select_related("conversation")
        .filter(conversation_id=conversation_id, user=request.user, status=PENDING)
        .first()
    )
    if not invite:
        return error_response("This invite is no longer available.", "invite_not_found", status.HTTP_404_NOT_FOUND)
    conversation = invite.conversation

    if action == "decline":
        invite.delete()
        _notify_members(conversation, "group_members", request.user.id, extra_user_ids=[request.user.id])
        broadcast_group_updated(conversation.id, "declined", request.user.id, user_ids=[request.user.id])
        return Response({"declined": True})

    member_ids = list(
        ConversationParticipant.objects.filter(conversation=conversation, status=ACTIVE).values_list(
            "user_id", flat=True
        )
    )
    blocked = BlockedUser.objects.filter(
        Q(blocker_id=request.user.id, blocked_id__in=member_ids)
        | Q(blocked_id=request.user.id, blocker_id__in=member_ids)
    ).exists()
    if blocked or not member_ids:
        # A block made since the invite (or the group emptied): the invite lapses.
        invite.delete()
        bump_conversation_list_cache_version(request.user.id)
        return error_response("You can't join this group.", "cannot_join", status.HTTP_409_CONFLICT)

    now = timezone.now()
    ConversationParticipant.objects.filter(pk=invite.pk, status=PENDING).update(
        status=ACTIVE, joined_at=now, last_read_at=now
    )
    conversation = _load_group(conversation.id)
    _notify_members(conversation, "group_members", request.user.id)
    broadcast_group_updated(conversation.id, "joined", request.user.id, user_ids=[request.user.id])
    return Response(_serialize(request, conversation), status=status.HTTP_200_OK)


def leave_or_remove(request, conversation, target):
    """Remove ``target`` from a group. Yourself: leave (or drop your invite). Someone
    else: owner only. A leaving owner hands over to the longest-standing member; the
    group is deleted when no active member is left."""
    rows = list(conversation.participants.order_by("joined_at", "created_at", "id"))
    me = next((row for row in rows if row.user_id == request.user.id), None)
    target_row = next((row for row in rows if row.user_id == target.id), None)
    leaving = target.id == request.user.id
    if not me or (not leaving and me.status != ACTIVE):
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    if not target_row:
        return error_response("They aren't in this group.", "not_a_member", status.HTTP_404_NOT_FOUND)
    if not leaving and me.role != OWNER:
        return error_response("Only the group owner can remove people.", "not_owner", status.HTTP_403_FORBIDDEN)

    conversation_id = conversation.id  # delete() clears the instance's pk
    with transaction.atomic():
        target_row.delete()
        remaining = [row for row in rows if row.pk != target_row.pk and row.status == ACTIVE]
        deleted = False
        if not remaining:
            conversation.delete()
            deleted = True
        elif target_row.role == OWNER:
            successor = remaining[0]
            ConversationParticipant.objects.filter(pk=successor.pk).update(role=OWNER)

    affected = {row.user_id for row in rows}
    for user_id in affected:
        bump_conversation_list_cache_version(user_id)
    broadcast_conversation_update(affected, conversation_id, "group_members", actor_id=request.user.id)
    if not deleted:
        broadcast_group_updated(
            conversation_id, "left" if leaving else "removed", request.user.id,
            user_ids=[target.id], removed_user_ids=[target.id],
        )
    else:
        broadcast_group_updated(
            conversation_id, "deleted", request.user.id, removed_user_ids=sorted(affected)
        )
    if leaving:
        return Response({"left": True, "group_deleted": deleted})
    return Response({"removed": target.username})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def remove_member_view(request, conversation_id, username):
    """DELETE …/members/<username>/ → leave (yourself) or remove someone (owner)."""
    conversation = get_object_or_404(Conversation, id=conversation_id, kind=Conversation.KIND_GROUP)
    target = Profile.objects.filter(username__iexact=username).order_by("id").first()
    if not target:
        return error_response("They aren't in this group.", "not_a_member", status.HTTP_404_NOT_FOUND)
    return leave_or_remove(request, conversation, target)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def set_member_nickname_view(request, conversation_id, username):
    """Set or clear a group-visible nickname for an active member."""
    conversation = _load_group(conversation_id)
    members = group_participant_rows(conversation, statuses=(ACTIVE,))
    if not any(row.user_id == request.user.id for row in members):
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    target = next((row for row in members if row.user.username.lower() == username.lower()), None)
    if target is None:
        return error_response("They aren't in this group.", "not_a_member", status.HTTP_404_NOT_FOUND)
    raw = request.data.get("nickname")
    if not isinstance(raw, str) or any(ord(character) < 32 for character in raw):
        return error_response("Send a valid nickname.", "invalid_nickname", status.HTTP_400_BAD_REQUEST)
    nickname = " ".join(raw.split())
    if len(nickname) > MAX_NICKNAME_LENGTH:
        return error_response(
            f"Nicknames can be at most {MAX_NICKNAME_LENGTH} characters.",
            "invalid_nickname", status.HTTP_400_BAD_REQUEST,
        )
    if target.nickname != nickname:
        ConversationParticipant.objects.filter(pk=target.pk).update(nickname=nickname)
        _notify_members(conversation, "group_members", request.user.id)
        broadcast_group_updated(conversation.id, "nickname", request.user.id)
    return Response({"username": target.user.username, "nickname": nickname})


def rename_group(request, conversation_id):
    """PATCH {name} on a group (owner only). An empty name restores the default."""
    conversation = _load_group(conversation_id)
    membership = next(
        (row for row in group_participant_rows(conversation) if row.user_id == request.user.id), None
    )
    if not membership:
        return error_response(
            "You are not a participant in this conversation.", "not_participant", status.HTTP_403_FORBIDDEN
        )
    if membership.role != OWNER:
        return error_response("Only the group owner can rename it.", "not_owner", status.HTTP_403_FORBIDDEN)
    if "name" not in request.data:
        return error_response("Send the new name.", "invalid_name", status.HTTP_400_BAD_REQUEST)
    name = _clean_name(request.data.get("name"))
    if name is None:
        return error_response(
            f"Group names can be at most {GROUP_NAME_MAX_LENGTH} characters.", "invalid_name",
            status.HTTP_400_BAD_REQUEST,
        )
    Conversation.objects.filter(pk=conversation.pk).update(name=name)
    conversation.name = name
    _notify_members(conversation, "group_renamed", request.user.id)
    broadcast_group_updated(conversation.id, "renamed", request.user.id)
    return Response(
        {"name": name, "display_name": group_display_name(conversation, request.user.id)},
        status=status.HTTP_200_OK,
    )
