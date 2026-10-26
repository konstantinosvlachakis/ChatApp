"""
Query-count regression tests.

Each hot endpoint is measured on a small and a larger data set: the number of
queries must stay under a fixed bound and must not grow with the number of
conversations / messages / reactions / translations (no N+1).
"""

from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory

from chatapp.models import (
    BlockedUser,
    Conversation,
    Message,
    MessageReaction,
    MessageTranslation,
    PracticeStats,
    ProfileView,
)
from chatapp.serializers import MessageSerializer, with_message_relations
from chatapp.views import get_block_state

from .factory import make_conversation, make_user

# Upper bounds (queries per request). They must not depend on data size.
MAX_QUERIES = {
    "conversation_detail": 10,
    "messages_page_30": 9,
    "messages_page_100": 9,
    "conversation_list_cold": 6,
    "react": 10,
    "pin": 5,
    "send": 7,
}


def seed_conversations(me, conversation_count, messages_per_conversation):
    """Conversations with reactions, translations, replies and pins."""
    conversations = []
    for _ in range(conversation_count):
        other = make_user(native_language="greek")
        conversation = make_conversation(sender=me, receiver=other)
        conversations.append(conversation)
        Message.objects.bulk_create(
            [
                Message(
                    conversation=conversation,
                    sender=me if index % 2 else other,
                    text=f"message {index}",
                    status="sent" if index % 7 == 0 else "read",
                )
                for index in range(messages_per_conversation)
            ]
        )
        messages = list(conversation.messages.order_by("id"))
        reactions, translations, updated = [], [], []
        for index, message in enumerate(messages):
            if index % 3 == 0:
                reactions.append(MessageReaction(message=message, user=me, emoji="👍"))
                reactions.append(
                    MessageReaction(message=message, user=other, emoji="❤️")
                )
            if index % 4 == 0:
                translations.append(
                    MessageTranslation(
                        message=message,
                        user=me,
                        target_language="en",
                        source_language="el",
                        translated_text=f"translated {index}",
                    )
                )
            if index and index % 5 == 0:
                message.reply_to = messages[index - 1]
                updated.append(message)
            if index % 10 == 0:
                message.pinned_at = timezone.now()
                message.pinned_by = me
                updated.append(message)
        MessageReaction.objects.bulk_create(reactions)
        MessageTranslation.objects.bulk_create(translations)
        Message.objects.bulk_update(updated, ["reply_to", "pinned_at", "pinned_by"])
    return conversations


class QueryCountRegressionTests(TestCase):
    def measure_endpoints(self, conversation_count, messages_per_conversation):
        me = make_user(base_translate_language="english")
        conversations = seed_conversations(
            me, conversation_count, messages_per_conversation
        )
        client = APIClient()
        client.force_authenticate(user=me)
        conversation = conversations[0]
        message = conversation.messages.order_by("-id").first()
        base = f"/api/conversations/{conversation.id}"

        requests = [
            ("conversation_detail", lambda: client.get(f"{base}/")),
            ("messages_page_30", lambda: client.get(f"{base}/messages/?page_size=30")),
            (
                "messages_page_100",
                lambda: client.get(f"{base}/messages/?page_size=100"),
            ),
            ("conversation_list_cold", lambda: client.get("/api/conversations/")),
            (
                "react",
                lambda: client.post(
                    f"/api/messages/{message.id}/react/", {"emoji": "😂"}
                ),
            ),
            (
                "pin",
                lambda: client.patch(
                    f"/api/messages/{message.id}/pin/", {"is_pinned": True}
                ),
            ),
            ("send", lambda: client.post(f"{base}/messages/", {"text": "hi"})),
        ]
        counts = {}
        for label, send_request in requests:
            cache.clear()
            with CaptureQueriesContext(connection) as context:
                response = send_request()
            self.assertLess(response.status_code, 300, (label, response.data))
            counts[label] = len(context.captured_queries)
        return counts

    def test_query_counts_are_bounded_and_independent_of_data_size(self):
        small = self.measure_endpoints(2, 12)
        large = self.measure_endpoints(8, 80)

        for label, bound in MAX_QUERIES.items():
            with self.subTest(endpoint=label):
                self.assertLessEqual(small[label], bound, small)
                self.assertLessEqual(large[label], bound, large)
                self.assertEqual(small[label], large[label], (small, large))


class PrefetchedSerializationParityTests(TestCase):
    def test_prefetched_and_fallback_serialization_match(self):
        me = make_user(base_translate_language="english")
        conversation = seed_conversations(me, 1, 12)[0]
        request = APIRequestFactory().get("/")
        request.user = me
        context = {"request": request}

        plain = MessageSerializer(
            conversation.messages.order_by("id"), many=True, context=context
        ).data
        prefetched = MessageSerializer(
            with_message_relations(conversation.messages.order_by("id"), me),
            many=True,
            context=context,
        ).data

        self.assertEqual(plain, prefetched)
        # Sanity: the data set exercises every prefetched relation.
        self.assertTrue(any(item["reactions"] for item in plain))
        self.assertTrue(any(item["current_user_reaction"] for item in plain))
        self.assertTrue(any(item["translated_text"] for item in plain))
        self.assertTrue(any(item["reply_to"] for item in plain))
        self.assertTrue(any(item["pinned_by"] for item in plain))


class ConversationDetailMessageCapTests(TestCase):
    def test_detail_embeds_only_latest_messages_oldest_first(self):
        me = make_user()
        conversation = make_conversation(sender=me)
        Message.objects.bulk_create(
            [
                Message(conversation=conversation, sender=me, text=f"m{index}")
                for index in range(8)
            ]
        )
        client = APIClient()
        client.force_authenticate(user=me)

        with mock.patch("chatapp.serializers.CONVERSATION_DETAIL_MESSAGE_LIMIT", 5):
            response = client.get(f"/api/conversations/{conversation.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        texts = [item["text"] for item in response.data["messages"]]
        self.assertEqual(texts, ["m3", "m4", "m5", "m6", "m7"])
        self.assertEqual(response.data["last_message"]["text"], "m7")


class QueryOptimisationBehaviourTests(TestCase):
    def setUp(self):
        self.me = make_user()
        self.other = make_user(native_language="greek")
        self.client = APIClient()
        self.client.force_authenticate(user=self.me)

    def test_only_new_messages_touch_conversation_updated_at(self):
        conversation = make_conversation(sender=self.me, receiver=self.other)
        message = Message.objects.create(
            conversation=conversation, sender=self.me, text="hi"
        )
        after_create = Conversation.objects.get(pk=conversation.pk).updated_at

        response = self.client.patch(
            f"/api/messages/{message.id}/pin/", {"is_pinned": True}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.patch(
            f"/api/messages/{message.id}/edit/", {"text": "edited"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(
            Conversation.objects.get(pk=conversation.pk).updated_at, after_create
        )

    def test_conversation_list_unread_count_and_delivery(self):
        conversation = make_conversation(sender=self.me, receiver=self.other)
        empty_conversation = make_conversation(sender=make_user(), receiver=self.me)
        Message.objects.create(conversation=conversation, sender=self.other, text="a")
        Message.objects.create(conversation=conversation, sender=self.other, text="b")
        Message.objects.create(conversation=conversation, sender=self.me, text="c")

        response = self.client.get("/api/conversations/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_id = {item["id"]: item for item in response.data}
        self.assertEqual(by_id[conversation.id]["unread_count"], 2)
        self.assertEqual(by_id[conversation.id]["last_message"]["text"], "c")
        self.assertEqual(by_id[empty_conversation.id]["unread_count"], 0)
        self.assertIsNone(by_id[empty_conversation.id]["last_message"])
        self.assertEqual(
            set(
                Message.objects.filter(sender=self.other).values_list(
                    "status", flat=True
                )
            ),
            {"delivered"},
        )
        self.assertEqual(
            Message.objects.get(sender=self.me).status, "sent"
        )

    def test_repeat_profile_view_moves_viewer_to_top(self):
        first_viewer = make_user()
        second_viewer = make_user()
        # Back-to-back requests can share a timestamp on coarse clocks (Windows),
        # so advance the clock on every call to make the ordering deterministic.
        start = timezone.now()
        ticks = iter(range(1, 10_000))
        with mock.patch(
            "django.utils.timezone.now",
            side_effect=lambda: start + timedelta(seconds=next(ticks)),
        ):
            for viewer in (first_viewer, second_viewer, first_viewer):
                self.client.force_authenticate(user=viewer)
                response = self.client.get(f"/api/profile/public/{self.me.username}/")
                self.assertEqual(response.status_code, status.HTTP_200_OK)

        views = ProfileView.objects.filter(viewed_profile=self.me).order_by(
            "-updated_at", "-id"
        )
        self.assertEqual(
            [view.viewer_id for view in views], [first_viewer.id, second_viewer.id]
        )

    def test_block_state_uses_single_query(self):
        BlockedUser.objects.create(blocker=self.other, blocked=self.me)
        with self.assertNumQueries(1):
            state = get_block_state(self.me.id, self.other.id)
        self.assertEqual(state, (False, True))
        with self.assertNumQueries(1):
            state = get_block_state(self.other.id, self.me.id)
        self.assertEqual(state, (True, False))

    def test_practice_submit_increments_stats_atomically(self):
        PracticeStats.objects.create(user=self.me, xp=95, points=40, level=1)
        with mock.patch(
            "chatapp.views.get_challenge_answer", return_value=("casa", "spanish")
        ):
            response = self.client.post(
                "/api/practice/submit/",
                {"challenge_id": "x", "selected_word": "casa", "language": "spanish"},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        stats = PracticeStats.objects.get(user=self.me)
        self.assertEqual(stats.xp, 110)
        self.assertEqual(stats.points, 50)
        self.assertEqual(stats.level, 2)
        self.assertEqual(stats.correct_answers, 1)
        self.assertEqual(stats.total_answers, 1)
        self.assertEqual(response.data["stats"]["level"], 2)
        self.assertEqual(response.data["current_rank"], 1)
