import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from chatapp import exchange_sessions as rules
from chatapp.conversation_members import ACTIVE
from chatapp.models import (
    BlockedUser,
    Conversation,
    ConversationParticipant,
    ExchangeSession,
    Message,
    MessageCorrection,
    Profile,
)

from .factory import make_conversation, make_user

BROADCAST = "chatapp.session_views.broadcast_chat_room_event"
PRESENCE = "chatapp.session_views.broadcast"


class ExchangeSessionTestCase(TestCase):
    def setUp(self):
        self.ana = make_user(
            username="ana",
            native_language="spanish",
            languages_practicing=["english"],
            practice_language_levels={"english": "intermediate"},
        )
        self.ben = make_user(
            username="ben",
            native_language="english",
            languages_practicing=["spanish"],
            practice_language_levels={"spanish": "beginner"},
        )
        self.conversation = make_conversation(sender=self.ana, receiver=self.ben)
        self.url = f"/api/conversations/{self.conversation.id}/session/"
        self.ana_client = APIClient()
        self.ana_client.force_authenticate(self.ana)
        self.ben_client = APIClient()
        self.ben_client.force_authenticate(self.ben)
        patcher = mock.patch("chatapp.exchange_sessions.ai_topics", return_value=[])
        self.ai_topics = patcher.start()
        self.addCleanup(patcher.stop)

    def invite(self, **payload):
        body = {"duration_minutes": 20, "first_language": "english", "second_language": "spanish", **payload}
        with mock.patch(BROADCAST), mock.patch(PRESENCE):
            return self.ana_client.post(self.url, body, format="json")

    def act(self, client, session_id, action, **body):
        with mock.patch(BROADCAST) as broadcast:
            response = client.post(f"/api/exchange-sessions/{session_id}/{action}/", body, format="json")
        return response, broadcast

    def start(self, **payload):
        session_id = self.invite(**payload).data["session"]["id"]
        response, _ = self.act(self.ben_client, session_id, "accept")
        self.assertEqual(response.status_code, 200, response.data)
        return ExchangeSession.objects.get(id=session_id)


class InviteTests(ExchangeSessionTestCase):
    def test_invite_broadcasts_to_room_and_partner(self):
        with mock.patch(BROADCAST) as room, mock.patch(PRESENCE) as presence:
            response = self.ana_client.post(
                self.url,
                {"duration_minutes": 10, "first_language": "english", "second_language": "spanish"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.data)
        session = response.data["session"]
        self.assertEqual(session["status"], "pending")
        self.assertEqual(session["created_by"]["username"], "ana")
        self.assertEqual(session["partner"]["username"], "ben")
        self.assertIsNone(session["started_at"])
        self.assertIsNotNone(session["expires_at"])

        args, kwargs = room.call_args
        self.assertEqual(args, (self.conversation.id, "exchange_session_event"))
        json.dumps(kwargs["session"])  # websocket payloads must be plain JSON
        group, event = presence.call_args.args
        self.assertEqual(group, f"presence_user_{self.ben.id}")
        self.assertEqual(event["type"], "exchange_invite_event")
        self.assertEqual(event["invited_by"]["username"], "ana")
        json.dumps(event)

    def test_get_returns_open_session_and_language_options(self):
        self.invite()
        data = self.ben_client.get(self.url).data
        self.assertEqual(data["session"]["status"], "pending")
        self.assertEqual(data["languages"], ["english", "spanish"])
        # Asked by Ben: his partner Ana's native language comes first.
        self.assertEqual(data["default_languages"], ["spanish", "english"])
        self.assertEqual(data["durations"], [10, 20, 30])

    def test_validation(self):
        cases = [
            ({"duration_minutes": 15}, "invalid_duration"),
            ({"first_language": "english", "second_language": "english"}, "invalid_languages"),
            ({"first_language": "klingon"}, "invalid_languages"),
        ]
        for payload, code in cases:
            with self.subTest(code=code):
                response = self.invite(**payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], code)

    def test_one_open_session_per_chat(self):
        self.invite()
        response = self.invite()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "session_exists")
        self.assertEqual(response.data["session"]["status"], "pending")

    def test_expired_invite_is_closed_lazily_and_a_new_one_allowed(self):
        session_id = self.invite().data["session"]["id"]
        ExchangeSession.objects.filter(id=session_id).update(expires_at=timezone.now() - timedelta(seconds=1))
        with mock.patch(BROADCAST):
            self.assertIsNone(self.ben_client.get(self.url).data["session"])
        self.assertEqual(ExchangeSession.objects.get(id=session_id).status, "expired")
        self.assertEqual(self.invite().status_code, 201)

    def test_outsider_group_blocked_and_unverified(self):
        outsider = APIClient()
        outsider.force_authenticate(make_user())
        self.assertEqual(outsider.get(self.url).status_code, 403)

        group = Conversation.objects.create(kind="group", sender=self.ana, receiver=None, name="g")
        ConversationParticipant.objects.create(conversation=group, user=self.ana, status=ACTIVE)
        response = self.ana_client.get(f"/api/conversations/{group.id}/session/")
        self.assertEqual(response.data["code"], "group_not_supported")

        BlockedUser.objects.create(blocker=self.ben, blocked=self.ana)
        self.assertEqual(self.invite().data["code"], "blocked")
        BlockedUser.objects.all().delete()

        Profile.objects.filter(id=self.ana.id).update(email_verified_at=None)
        self.ana.refresh_from_db()
        self.ana_client.force_authenticate(self.ana)
        self.assertEqual(self.invite().data["code"], "email_unverified")


class LifecycleTests(ExchangeSessionTestCase):
    def test_only_partner_answers_and_only_starter_cancels(self):
        session_id = self.invite().data["session"]["id"]
        response, _ = self.act(self.ana_client, session_id, "accept")
        self.assertEqual(response.data["code"], "not_invitee")
        response, _ = self.act(self.ben_client, session_id, "cancel")
        self.assertEqual(response.data["code"], "not_starter")
        response, broadcast = self.act(self.ana_client, session_id, "cancel")
        self.assertEqual(response.data["session"]["status"], "cancelled")
        broadcast.assert_called_once()
        response, _ = self.act(self.ben_client, session_id, "accept")
        self.assertEqual(response.data["code"], "session_not_pending")

    def test_decline(self):
        session_id = self.invite().data["session"]["id"]
        response, _ = self.act(self.ben_client, session_id, "decline")
        self.assertEqual(response.data["session"]["status"], "declined")

    def test_accept_starts_timer_with_a_library_topic(self):
        session = self.start()
        self.assertEqual(session.status, "active")
        payload = rules.session_payload(session)
        self.assertEqual(payload["current_language"], "english")
        self.assertEqual(payload["topic_source"], "library")
        # Ben is a Spanish beginner: the lower level picks tier 1 topics.
        self.assertTrue(payload["topic"]["id"].startswith("t1-"))
        self.assertEqual(
            payload["ends_at"], rules.iso(session.started_at + timedelta(minutes=20))
        )
        self.assertEqual(
            payload["halfway_at"], rules.iso(session.started_at + timedelta(minutes=10))
        )

    def test_switch_early_once(self):
        session = self.start()
        response, _ = self.act(self.ana_client, session.id, "switch")
        self.assertEqual(response.data["session"]["current_language"], "spanish")
        response, _ = self.act(self.ben_client, session.id, "switch")
        self.assertEqual(response.data["code"], "already_switched")

    def test_topics_rotate_without_repeats_and_custom_topic(self):
        session = self.start()
        seen = {session.topic["id"]}
        for _ in range(3):
            response, _ = self.act(self.ben_client, session.id, "topic")
            seen.add(response.data["session"]["topic"]["id"])
        self.assertEqual(len(seen), 4)
        response, _ = self.act(self.ben_client, session.id, "topic", title="Our favourite films")
        self.assertEqual(response.data["session"]["topic"]["title"], "Our favourite films")
        self.assertEqual(response.data["session"]["topic_source"], "custom")

    def test_ai_topics_are_used_first(self):
        self.ai_topics.return_value = [
            {"id": "ai-0", "title": "Street food", "prompts": ["Best snack?"]},
            {"id": "ai-1", "title": "Music", "prompts": ["Last concert?"]},
        ]
        session = self.start()
        self.assertEqual(session.topic["title"], "Street food")
        self.assertEqual(session.topic_source, "ai")
        response, _ = self.act(self.ben_client, session.id, "topic")
        self.assertEqual(response.data["session"]["topic"]["title"], "Music")

    def test_actions_require_an_active_session_and_a_participant(self):
        session_id = self.invite().data["session"]["id"]
        response, _ = self.act(self.ana_client, session_id, "switch")
        self.assertEqual(response.data["code"], "session_not_active")
        stranger = APIClient()
        stranger.force_authenticate(make_user())
        response, _ = self.act(stranger, session_id, "end")
        self.assertEqual(response.status_code, 403)
        response, _ = self.act(self.ana_client, session_id, "dance")
        self.assertEqual(response.status_code, 404)

    def test_end_builds_a_language_balance_summary(self):
        session = self.start()
        start = timezone.now() - timedelta(minutes=12)
        ExchangeSession.objects.filter(id=session.id).update(started_at=start)
        early = Message.objects.create(conversation=self.conversation, sender=self.ana, text="hello")
        Message.objects.create(conversation=self.conversation, sender=self.ben, text="hi")
        Message.objects.filter(id=early.id).update(timestamp=start + timedelta(minutes=2))
        Message.objects.filter(text="hi").update(timestamp=start + timedelta(minutes=3))
        late = Message.objects.create(conversation=self.conversation, sender=self.ben, text="hola amigo")
        MessageCorrection.objects.create(message=late, corrector=self.ana, corrected_text="¡Hola, amigo!")

        response, broadcast = self.act(self.ben_client, session.id, "end")
        self.assertEqual(response.status_code, 200)
        data = response.data["session"]
        self.assertEqual(data["status"], "ended")
        self.assertEqual(data["ended_by_id"], self.ben.id)
        summary = data["summary"]
        english, spanish = summary["languages"]
        self.assertEqual(english["language"], "english")
        self.assertEqual(english["minutes"], 10.0)
        self.assertEqual(english["messages"], {str(self.ana.id): 1, str(self.ben.id): 1})
        self.assertEqual(spanish["message_count"], 1)
        self.assertAlmostEqual(spanish["minutes"], 2.0, places=0)
        self.assertEqual(summary["correction_count"], 1)
        self.assertEqual(summary["corrections"][0]["message_id"], late.id)
        json.dumps(broadcast.call_args.kwargs["session"])

        # Still shown (end card), then a new session can start.
        self.assertEqual(self.ana_client.get(self.url).data["session"]["status"], "ended")
        self.assertEqual(self.invite().status_code, 201)

    def test_timer_end_is_applied_on_read(self):
        session = self.start()
        ExchangeSession.objects.filter(id=session.id).update(
            started_at=timezone.now() - timedelta(minutes=25)
        )
        with mock.patch(BROADCAST) as broadcast:
            data = self.ana_client.get(self.url).data["session"]
        self.assertEqual(data["status"], "ended")
        self.assertIsNone(data["ended_by_id"])
        self.assertEqual(data["summary"]["total_minutes"], 20.0)
        broadcast.assert_called_once()


class TopicCleaningTests(TestCase):
    def test_clean_ai_topics(self):
        raw = [
            {"title": "  Street   food ", "prompts": ["Best snack?", "", "See www.x.com"]},
            {"title": "https://spam", "prompts": ["x"]},
            {"title": "No prompts", "prompts": []},
            "nonsense",
        ]
        self.assertEqual(
            rules.clean_ai_topics(raw),
            [{"id": "ai-0", "title": "Street food", "prompts": ["Best snack?"]}],
        )


class AiTopicTests(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        ana = make_user(native_language="spanish", languages_practicing=["english"])
        ben = make_user(native_language="english", languages_practicing=["spanish"])
        self.session = ExchangeSession(
            conversation=make_conversation(sender=ana, receiver=ben),
            created_by=ana,
            partner=ben,
            first_language="english",
            second_language="spanish",
            expires_at=timezone.now(),
        )

    def test_uses_gemini_and_releases_db_first(self):
        before_ai = mock.Mock()
        with mock.patch(
            "chatapp.gemini.generate_session_topics",
            return_value=[{"title": "Street food", "prompts": ["Best snack?"]}],
        ) as generate:
            topics = rules.ai_topics(self.session, before_ai=before_ai)
        self.assertEqual(topics[0]["title"], "Street food")
        before_ai.assert_called_once()
        context = generate.call_args.args[0]
        self.assertEqual(context["languages"], ["english", "spanish"])

    def test_without_api_key_returns_empty(self):
        with mock.patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
            self.assertEqual(rules.ai_topics(self.session), [])
