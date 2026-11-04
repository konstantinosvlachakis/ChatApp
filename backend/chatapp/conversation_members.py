"""Who is in a conversation, and who may join one, in one place.

Direct chats answer from ``Conversation.sender_id``/``receiver_id`` (already loaded, so
no extra query; the participant rows mirror them). Groups read the active
``ConversationParticipant`` rows (one query, or none when ``group_participants`` was
prefetched). Every membership check and fan-out list goes through here.

Group rules (feat/group-chats-api):
- At most ``MAX_GROUP_MEMBERS`` people, counting pending invites.
- Any active member can invite someone they follow or already have a direct chat with.
- Nobody is invited if they and any current member (active or pending) have a block
  in either direction. A block made later doesn't remove anyone.
- Invitees see nothing until they accept; members see messages from ``joined_at`` on.
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import BlockedUser, Conversation, ConversationParticipant, Follow

MAX_GROUP_MEMBERS = 8
GROUP_NAME_MAX_LENGTH = 60

ACTIVE = ConversationParticipant.STATUS_ACTIVE
PENDING = ConversationParticipant.STATUS_PENDING
OWNER = ConversationParticipant.ROLE_OWNER
MEMBER = ConversationParticipant.ROLE_MEMBER


def direct_conversations_q(user, prefix=""):
    """Q for the user's direct chats (never groups, whose ``sender`` is the creator)."""
    return Q(**{f"{prefix}kind": Conversation.KIND_DIRECT}) & (
        Q(**{f"{prefix}sender": user}) | Q(**{f"{prefix}receiver": user})
    )


def group_conversations_q(user, prefix=""):
    """Q for the groups the user is an active member of."""
    member_of = ConversationParticipant.objects.filter(user=user, status=ACTIVE).values(
        "conversation_id"
    )
    return Q(**{f"{prefix}kind": Conversation.KIND_GROUP}) & Q(**{f"{prefix}id__in": member_of})


def create_direct_conversation(sender, receiver):
    """Create a direct chat and its two participant rows (call inside the caller's
    get-or-create lock)."""
    with transaction.atomic():
        conversation = Conversation.objects.create(
            kind=Conversation.KIND_DIRECT, sender=sender, receiver=receiver
        )
        now = timezone.now()
        ConversationParticipant.objects.bulk_create([
            ConversationParticipant(
                conversation=conversation,
                user_id=user_id,
                role=MEMBER,
                status=ACTIVE,
                joined_at=now,
            )
            for user_id in (sender.pk, receiver.pk)
        ])
    return conversation


def _prefetched(conversation):
    return getattr(conversation, "group_participants", None)


def group_participant_rows(conversation, statuses=(ACTIVE,)):
    """Participant rows (with ``user``) ordered by join time; uses the prefetch."""
    prefetched = _prefetched(conversation)
    if prefetched is not None:
        return [row for row in prefetched if row.status in statuses]
    return list(
        conversation.participants.filter(status__in=statuses)
        .select_related("user")
        .order_by("joined_at", "created_at", "id")
    )


def conversation_member_ids(conversation):
    """Ids of the conversation's active members (direct: the pair, sender first)."""
    if not conversation.is_group:
        return [conversation.sender_id, conversation.receiver_id]
    prefetched = _prefetched(conversation)
    if prefetched is not None:
        return [row.user_id for row in prefetched if row.status == ACTIVE]
    return list(
        conversation.participants.filter(status=ACTIVE)
        .order_by("joined_at", "id")
        .values_list("user_id", flat=True)
    )


def get_membership(user_id, conversation):
    """The user's active participant row in a group (None if not a member)."""
    prefetched = _prefetched(conversation)
    if prefetched is not None:
        return next(
            (row for row in prefetched if row.user_id == user_id and row.status == ACTIVE), None
        )
    return conversation.participants.filter(user_id=user_id, status=ACTIVE).first()


def is_conversation_member(user_id, conversation):
    """True when ``user_id`` may read and write in ``conversation``."""
    if not conversation.is_group:
        return user_id in (conversation.sender_id, conversation.receiver_id)
    return get_membership(user_id, conversation) is not None


def other_member_ids(conversation, user_id):
    """Everyone in the conversation except ``user_id``."""
    return [member_id for member_id in conversation_member_ids(conversation) if member_id != user_id]


def history_start(user_id, conversation):
    """Earliest message time the user may see (None = everything). Groups: join time."""
    if not conversation.is_group:
        return None
    membership = get_membership(user_id, conversation)
    return membership.joined_at if membership else None


def visible_messages(queryset, user_id, conversation):
    """Restrict a conversation's message queryset to what ``user_id`` may see."""
    start = history_start(user_id, conversation)
    return queryset.filter(timestamp__gte=start) if start else queryset


def can_access_message(user_id, message):
    """Member of the message's conversation, and (groups) it was sent after they joined."""
    conversation = message.conversation
    if not conversation.is_group:
        return user_id in (conversation.sender_id, conversation.receiver_id)
    membership = get_membership(user_id, conversation)
    if membership is None:
        return False
    return not membership.joined_at or message.timestamp >= membership.joined_at


def blocked_with_any(user_id, other_ids):
    """True if ``user_id`` and any of ``other_ids`` have a block in either direction."""
    other_ids = [other_id for other_id in other_ids if other_id and other_id != user_id]
    if not other_ids:
        return False
    return BlockedUser.objects.filter(
        Q(blocker_id=user_id, blocked_id__in=other_ids)
        | Q(blocked_id=user_id, blocker_id__in=other_ids)
    ).exists()


def invitable_ids(inviter_id, candidate_ids):
    """The candidates the inviter follows or has a direct chat with (one query each)."""
    candidate_ids = set(candidate_ids)
    if not candidate_ids:
        return set()
    followed = set(
        Follow.objects.filter(follower_id=inviter_id, following_id__in=candidate_ids)
        .values_list("following_id", flat=True)
    )
    remaining = candidate_ids - followed
    chatted = set()
    if remaining:
        rows = Conversation.objects.filter(kind=Conversation.KIND_DIRECT).filter(
            Q(sender_id=inviter_id, receiver_id__in=remaining)
            | Q(receiver_id=inviter_id, sender_id__in=remaining)
        ).values_list("sender_id", "receiver_id")
        for sender_id, receiver_id in rows:
            chatted.add(receiver_id if sender_id == inviter_id else sender_id)
    return followed | chatted


def group_display_name(conversation, viewer_id=None):
    """The group's name, or "Ana, Ben & you"-style from the active members."""
    if conversation.name:
        return conversation.name
    names = [
        row.nickname or row.user.username
        for row in group_participant_rows(conversation)
        if row.user_id != viewer_id
    ]
    if not names:
        return "Just you"
    shown = names[:3]
    extra = len(names) - len(shown)
    label = ", ".join(shown)
    if extra > 0:
        label += f" +{extra}"
    return f"{label} & you" if viewer_id else label
