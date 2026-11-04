"""Who is in a conversation, in one place.

Direct chats answer from ``Conversation.sender_id``/``receiver_id`` (already loaded, so
no extra query; the participant rows mirror them). Groups read the active
``ConversationParticipant`` rows (one query, or none when ``active_members`` was
prefetched). Every membership check and fan-out list goes through here.
"""
from django.db import transaction
from django.utils import timezone

from .models import Conversation, ConversationParticipant


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
                role=ConversationParticipant.ROLE_MEMBER,
                status=ConversationParticipant.STATUS_ACTIVE,
                joined_at=now,
            )
            for user_id in (sender.pk, receiver.pk)
        ])
    return conversation


def conversation_member_ids(conversation):
    """Ids of the conversation's active members (direct: the pair, sender first)."""
    if not conversation.is_group:
        return [conversation.sender_id, conversation.receiver_id]
    prefetched = getattr(conversation, "active_members", None)
    if prefetched is not None:
        return [participant.user_id for participant in prefetched]
    return list(
        conversation.participants.filter(
            status=ConversationParticipant.STATUS_ACTIVE
        ).order_by("joined_at", "id").values_list("user_id", flat=True)
    )


def is_conversation_member(user_id, conversation):
    """True when ``user_id`` may read and write in ``conversation``."""
    if not conversation.is_group:
        return user_id in (conversation.sender_id, conversation.receiver_id)
    return conversation.participants.filter(
        user_id=user_id, status=ConversationParticipant.STATUS_ACTIVE
    ).exists()


def other_member_ids(conversation, user_id):
    """Everyone in the conversation except ``user_id``."""
    return [member_id for member_id in conversation_member_ids(conversation) if member_id != user_id]
