"""Learning from conversations: partner corrections, the phrasebook and its
daily spaced review.

Corrections: a member of a conversation suggests a rewrite of someone else's text
message (one per corrector, editable). The author's ``correction_preference``
decides whether that's allowed ("often" / "when_asked" + the message flag /
"off"). Every change re-broadcasts the message as ``message_corrections`` to the
chat room (per-user fields stripped, like reactions).

Phrasebook: private per user. Entries copy their text (a message, its
translation or a correction), so deleting the message keeps the phrase.
Review scheduling lives in ``chatapp/phrasebook.py``.
"""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.exceptions import error_response

from .conversation_members import can_access_message
from .email_verification import RequireVerifiedEmail
from .models import Message, MessageCorrection, MessageTranslation, PhrasebookEntry, Profile
from .phrasebook import (
    PHRASE_NOTE_MAX_LENGTH,
    PHRASE_TEXT_MAX_LENGTH,
    PHRASEBOOK_MAX_ENTRIES,
    REVIEW_BATCH_SIZE,
    REVIEW_RESULTS,
    clean_language,
    clean_text,
    entry_payload,
    guess_language,
    schedule_review,
)
from .serializers import (
    MessageSerializer,
    message_accepts_corrections,
    message_broadcast_payload,
    reload_message_for_serializer,
)
from .throttles import (
    CorrectionRateThrottle,
    PhrasebookWriteRateThrottle,
    with_default_throttles,
)
from .views import (
    broadcast_chat_room_event,
    build_page_payload,
    paginate,
    parse_page_params,
    users_are_blocked,
)

CORRECTION_TEXT_MAX_LENGTH = 5000
CORRECTION_NOTE_MAX_LENGTH = 500
PHRASEBOOK_PAGE_SIZE = 30


def _not_participant():
    return error_response(
        "You do not have access to this message.", "not_participant", status.HTTP_403_FORBIDDEN
    )


def _load_accessible_message(request, message_id):
    message = get_object_or_404(
        Message.objects.select_related("conversation", "sender"), id=message_id
    )
    if not can_access_message(request.user.id, message):
        return None
    return message


def _respond_with_message(request, message):
    """Serialize for the caller and broadcast the shared view to the room."""
    message = reload_message_for_serializer(message, request.user)
    serialized = MessageSerializer(message, context={"request": request}).data
    broadcast_chat_room_event(
        message.conversation_id,
        "message_corrections_event",
        message=message_broadcast_payload(serialized),
    )
    return Response(serialized, status=status.HTTP_200_OK)


def _parse_bool(value):
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(CorrectionRateThrottle))
def message_correction_view(request, message_id):
    """POST {corrected_text, note?} creates or replaces the caller's correction;
    DELETE removes it. Both return the message."""
    message = _load_accessible_message(request, message_id)
    if message is None:
        return _not_participant()

    if request.method == "DELETE":
        MessageCorrection.objects.filter(message=message, corrector=request.user).delete()
        return _respond_with_message(request, message)

    if message.sender_id == request.user.id:
        return error_response(
            "You can't correct your own message.", "cannot_correct_own", status.HTTP_400_BAD_REQUEST
        )
    if message.kind != Message.KIND_TEXT or not (message.text or "").strip():
        return error_response(
            "Only text messages can be corrected.", "not_correctable", status.HTTP_400_BAD_REQUEST
        )
    preference = message.sender.correction_preference
    if preference == Profile.CORRECTIONS_OFF:
        return error_response(
            "This person has turned corrections off.", "corrections_disabled", status.HTTP_403_FORBIDDEN
        )
    if not message_accepts_corrections(message):
        return error_response(
            "This person only wants corrections on messages they ask about.",
            "corrections_not_requested",
            status.HTTP_403_FORBIDDEN,
        )
    if users_are_blocked(request.user.id, message.sender_id):
        return error_response("You can't correct this message.", "blocked", status.HTTP_403_FORBIDDEN)

    corrected_text = str(request.data.get("corrected_text") or "").strip()
    note = str(request.data.get("note") or "").strip()
    if not corrected_text:
        return error_response(
            "Write the corrected sentence.", "correction_required", status.HTTP_400_BAD_REQUEST
        )
    if len(corrected_text) > CORRECTION_TEXT_MAX_LENGTH:
        return error_response(
            "The correction is too long.", "correction_too_long", status.HTTP_400_BAD_REQUEST
        )
    if len(note) > CORRECTION_NOTE_MAX_LENGTH:
        return error_response(
            f"Keep the explanation under {CORRECTION_NOTE_MAX_LENGTH} characters.",
            "note_too_long",
            status.HTTP_400_BAD_REQUEST,
        )
    if corrected_text == message.text.strip():
        return error_response(
            "The correction is the same as the original.", "unchanged_correction", status.HTTP_400_BAD_REQUEST
        )

    MessageCorrection.objects.update_or_create(
        message=message,
        corrector=request.user,
        defaults={"corrected_text": corrected_text, "note": note},
    )
    return _respond_with_message(request, message)


@api_view(["POST"])
@permission_classes([IsAuthenticated, RequireVerifiedEmail])
@throttle_classes(with_default_throttles(CorrectionRateThrottle))
def message_correction_request_view(request, message_id):
    """The sender asks for (``requested: true``) or withdraws a correction request."""
    message = _load_accessible_message(request, message_id)
    if message is None:
        return _not_participant()
    if message.sender_id != request.user.id:
        return error_response(
            "Only the sender can ask for corrections.", "not_sender", status.HTTP_403_FORBIDDEN
        )
    if message.kind != Message.KIND_TEXT or not (message.text or "").strip():
        return error_response(
            "Only text messages can be corrected.", "not_correctable", status.HTTP_400_BAD_REQUEST
        )
    requested = _parse_bool(request.data.get("requested", True))
    if message.correction_requested != requested:
        message.correction_requested = requested
        message.save(update_fields=["correction_requested"])
    return _respond_with_message(request, message)


# ---------------------------------------------------------------- phrasebook


def _phrase_from_message(request, data):
    """Build entry fields from {message_id, source, correction_id?, text?}.
    Returns (fields, None) or (None, error Response)."""
    try:
        message_id = int(data.get("message_id"))
    except (TypeError, ValueError):
        return None, error_response("Invalid message.", "invalid_message", status.HTTP_400_BAD_REQUEST)
    message = Message.objects.filter(id=message_id).select_related("conversation", "sender").first()
    if message is None or not can_access_message(request.user.id, message):
        return None, _not_participant()
    if not (message.text or "").strip():
        return None, error_response(
            "This message has no text to save.", "nothing_to_save", status.HTTP_400_BAD_REQUEST
        )

    source = str(data.get("source") or PhrasebookEntry.SOURCE_MESSAGE).strip().lower()
    original = message.text.strip()
    fields = {
        "source": source,
        "source_message": message,
        "source_conversation_id": message.conversation_id,
        "language": guess_language(request.user, message.sender),
    }

    if source == PhrasebookEntry.SOURCE_MESSAGE:
        base_text, meaning, context = original, "", ""
        translation = (
            MessageTranslation.objects.filter(message=message, user=request.user)
            .order_by("-updated_at")
            .first()
        )
        if translation and translation.translated_text.strip() != original:
            meaning = translation.translated_text
    elif source == PhrasebookEntry.SOURCE_TRANSLATION:
        translation = (
            MessageTranslation.objects.filter(message=message, user=request.user)
            .order_by("-updated_at")
            .first()
        )
        if translation is None:
            return None, error_response(
                "Translate the message first.", "no_translation", status.HTTP_400_BAD_REQUEST
            )
        base_text, meaning, context = original, translation.translated_text, ""
    elif source == PhrasebookEntry.SOURCE_CORRECTION:
        corrections = MessageCorrection.objects.filter(message=message)
        correction_id = data.get("correction_id")
        if correction_id not in (None, ""):
            try:
                corrections = corrections.filter(id=int(correction_id))
            except (TypeError, ValueError):
                corrections = corrections.none()
        correction = corrections.order_by("created_at", "id").first()
        if correction is None:
            return None, error_response(
                "That correction no longer exists.", "no_correction", status.HTTP_400_BAD_REQUEST
            )
        base_text, meaning, context = correction.corrected_text, "", original
        fields["note"] = correction.note or ""
        if message.sender_id == request.user.id:
            # My own corrected sentence: it's in the language I practise,
            # which is usually what the corrector speaks natively.
            fields["language"] = guess_language(request.user, correction.corrector)
    else:
        return None, error_response("Unknown source.", "invalid_source", status.HTTP_400_BAD_REQUEST)

    # An optional excerpt ("save just this expression") must come from the text.
    excerpt = clean_text(data.get("text"), PHRASE_TEXT_MAX_LENGTH)
    if excerpt:
        if excerpt.lower() not in base_text.lower():
            return None, error_response(
                "The phrase must come from the message.", "invalid_excerpt", status.HTTP_400_BAD_REQUEST
            )
        if excerpt.strip() != base_text.strip() and not context:
            context = original
        base_text = excerpt
    fields["text"] = base_text[:PHRASE_TEXT_MAX_LENGTH]
    fields["meaning"] = meaning[:PHRASE_TEXT_MAX_LENGTH]
    fields["context"] = context[:PHRASE_TEXT_MAX_LENGTH]
    return fields, None


def _due_count(user, now=None):
    return PhrasebookEntry.objects.filter(user=user, due_at__lte=now or timezone.now()).count()


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PhrasebookWriteRateThrottle))
def phrasebook_view(request):
    """GET ?page=&page_size=&q=&language= lists entries newest first.
    POST saves one: {message_id, source: message|translation|correction,
    correction_id?, text? (excerpt), meaning?, note?, language?} or a manual
    {text, meaning?, note?, context?, language?}. An entry with the same text
    (case-insensitive) is returned instead of duplicated (``created: false``)."""
    user = request.user
    if request.method == "GET":
        queryset = PhrasebookEntry.objects.filter(user=user)
        query = str(request.query_params.get("q") or "").strip()[:100]
        if query:
            queryset = queryset.filter(
                Q(text__icontains=query) | Q(meaning__icontains=query) | Q(note__icontains=query)
            )
        language = clean_language(request.query_params.get("language"))
        if language:
            queryset = queryset.filter(language=language)
        page, page_size = parse_page_params(request.query_params, PHRASEBOOK_PAGE_SIZE)
        page_size = min(page_size, 50)
        paginator, page_obj = paginate(queryset.order_by("-created_at", "-id"), page, page_size)
        entries = list(page_obj.object_list) if page_obj is not None else []
        return Response(
            {
                "entries": [entry_payload(entry) for entry in entries],
                "pagination": build_page_payload(paginator, page_obj, page, page_size),
                "due_count": _due_count(user),
                "languages": sorted(
                    language
                    for language in PhrasebookEntry.objects.filter(user=user)
                    .exclude(language="")
                    .values_list("language", flat=True)
                    .distinct()
                ),
            }
        )

    data = request.data
    if data.get("message_id") not in (None, ""):
        fields, error = _phrase_from_message(request, data)
        if error is not None:
            return error
    else:
        fields = {
            "source": PhrasebookEntry.SOURCE_MANUAL,
            "text": clean_text(data.get("text"), PHRASE_TEXT_MAX_LENGTH),
            "context": clean_text(data.get("context"), PHRASE_TEXT_MAX_LENGTH),
            "meaning": "",
            "language": "",
        }
        if not fields["text"]:
            return error_response("Write the phrase to save.", "text_required", status.HTTP_400_BAD_REQUEST)

    # Caller-supplied meaning/note/language override the derived ones.
    if data.get("meaning") not in (None, ""):
        fields["meaning"] = clean_text(data.get("meaning"), PHRASE_TEXT_MAX_LENGTH)
    if data.get("note") not in (None, ""):
        fields["note"] = clean_text(data.get("note"), PHRASE_NOTE_MAX_LENGTH)
    if data.get("language") not in (None, ""):
        fields["language"] = clean_language(data.get("language"))

    existing = PhrasebookEntry.objects.filter(user=user, text__iexact=fields["text"]).first()
    if existing is not None:
        return Response({"entry": entry_payload(existing), "created": False}, status=status.HTTP_200_OK)
    if PhrasebookEntry.objects.filter(user=user).count() >= PHRASEBOOK_MAX_ENTRIES:
        return error_response(
            "Your phrasebook is full. Remove a few phrases first.", "phrasebook_full", status.HTTP_400_BAD_REQUEST
        )
    entry = PhrasebookEntry.objects.create(user=user, **fields)
    return Response({"entry": entry_payload(entry), "created": True}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PhrasebookWriteRateThrottle))
def phrasebook_entry_view(request, entry_id):
    """PATCH {text?, meaning?, note?, language?} edits; DELETE removes."""
    entry = PhrasebookEntry.objects.filter(id=entry_id, user=request.user).first()
    if entry is None:
        return error_response("Phrase not found.", "not_found", status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data
    if "text" in data:
        text = clean_text(data.get("text"), PHRASE_TEXT_MAX_LENGTH)
        if not text:
            return error_response("Write the phrase to save.", "text_required", status.HTTP_400_BAD_REQUEST)
        entry.text = text
    if "meaning" in data:
        entry.meaning = clean_text(data.get("meaning"), PHRASE_TEXT_MAX_LENGTH)
    if "note" in data:
        entry.note = clean_text(data.get("note"), PHRASE_NOTE_MAX_LENGTH)
    if "language" in data:
        entry.language = clean_language(data.get("language"))
    entry.save()
    return Response({"entry": entry_payload(entry)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def phrasebook_review_view(request):
    """Today's review: up to REVIEW_BATCH_SIZE due cards (oldest due first)."""
    now = timezone.now()
    entries = PhrasebookEntry.objects.filter(user=request.user)
    due = entries.filter(due_at__lte=now)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    next_due = entries.filter(due_at__gt=now).order_by("due_at").values_list("due_at", flat=True).first()
    return Response(
        {
            "cards": [entry_payload(entry) for entry in due.order_by("due_at", "id")[:REVIEW_BATCH_SIZE]],
            "due_count": due.count(),
            "total_count": entries.count(),
            "reviewed_today": entries.filter(last_reviewed_at__gte=start_of_day).count(),
            "next_due_at": next_due,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes(with_default_throttles(PhrasebookWriteRateThrottle))
def phrasebook_review_entry_view(request, entry_id):
    """POST {result: again|hard|good|easy} records one review."""
    result = str(request.data.get("result") or "").strip().lower()
    if result not in REVIEW_RESULTS:
        return error_response(
            "Result must be again, hard, good or easy.", "invalid_result", status.HTTP_400_BAD_REQUEST
        )
    entry = PhrasebookEntry.objects.filter(id=entry_id, user=request.user).first()
    if entry is None:
        return error_response("Phrase not found.", "not_found", status.HTTP_404_NOT_FOUND)
    now = timezone.now()
    entry.save(update_fields=schedule_review(entry, result, now))
    return Response({"entry": entry_payload(entry), "due_count": _due_count(request.user, now)})
