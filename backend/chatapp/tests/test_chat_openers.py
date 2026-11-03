from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from chatapp import openers
from chatapp.gemini import CoachAIError
from chatapp.models import BlockedUser
from chatapp.throttles import ChatOpenersRateThrottle
from .factory import make_conversation, make_user

AI_LINES = [
    "Hi Lucia! I'm a native Greek speaker. Fancy swapping Greek for Spanish?",
    "Relaxed chats about food sound perfect. What's your favourite dish to cook?",
    "Madrid is on my list. Which neighbourhood should I see first?",
]


class ChatOpenersTests(TestCase):
    def setUp(self):
        cache.clear()
        self.viewer = make_user(username="kostas", native_language="greek",
                                languages_practicing=["spanish", "english"],
                                practice_language_levels={"spanish": "beginner", "english": "fluent"})
        self.partner = make_user(username="lucia", native_language="spanish",
                                 languages_practicing=["greek"], practice_language_levels={"greek": "beginner"},
                                 learning_goal="Relaxed chats about food", location="Madrid, Spain",
                                 bio="Demo profile. Fictional account for exploring LangVoyage. I love cooking.")
        self.conversation = make_conversation(self.viewer, self.partner)
        self.client = APIClient()
        self.client.force_authenticate(self.viewer)
        self.url = f"/api/conversations/{self.conversation.id}/openers/"

    def get(self):
        return self.client.get(self.url)

    @mock.patch("chatapp.openers.generate_conversation_openers", return_value=AI_LINES)
    def test_ai_lines_are_returned_and_cached(self, generate):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"openers": AI_LINES, "source": "ai"})
        viewer_context, partner_context = generate.call_args.args
        self.assertEqual(viewer_context["native_language"], "Greek")
        self.assertNotIn("goal", viewer_context)
        self.assertEqual(partner_context["goal"], "Relaxed chats about food")
        self.assertEqual(partner_context["about"], "I love cooking.")  # demo prefix stripped
        self.assertEqual(partner_context["city"], "Madrid")
        self.assertNotIn("email", partner_context)
        self.assertEqual(self.get().json()["source"], "ai")
        self.assertEqual(generate.call_count, 1)

    @mock.patch("chatapp.openers.generate_conversation_openers", side_effect=CoachAIError("down"))
    def test_ai_failure_falls_back_to_templates(self, _generate):
        body = self.get().json()
        self.assertEqual(body["source"], "template")
        self.assertEqual(body["openers"], [
            "I saw your goal: “Relaxed chats about food”. How can I help?",
            "I'm a native Greek speaker. Want to practice together?",
            "What's a Spanish phrase you use every day?",
        ])

    @mock.patch("chatapp.openers.generate_conversation_openers",
                return_value=["Hi!", "See https://example.com", "Hi!"])
    def test_unusable_ai_lines_fall_back_and_are_not_cached(self, generate):
        self.assertEqual(self.get().json()["source"], "template")
        self.get()
        self.assertEqual(generate.call_count, 2)

    @mock.patch("chatapp.openers.generate_conversation_openers", return_value=AI_LINES)
    def test_unverified_or_blocked_viewers_get_templates_without_ai(self, generate):
        self.viewer.email_verified_at = None
        self.viewer.save(update_fields=["email_verified_at"])
        self.assertEqual(self.get().json()["source"], "template")
        self.viewer.email_verified_at = self.partner.email_verified_at
        self.viewer.save(update_fields=["email_verified_at"])
        BlockedUser.objects.create(blocker=self.partner, blocked=self.viewer)
        self.assertEqual(self.get().json()["source"], "template")
        generate.assert_not_called()

    @mock.patch("chatapp.openers.generate_conversation_openers", return_value=AI_LINES)
    def test_daily_cap_falls_back_to_templates(self, generate):
        with mock.patch.object(openers, "DAILY_LIMIT_PER_USER", 1):
            self.assertEqual(self.get().json()["source"], "ai")
            cache.delete(openers.cache_key(self.conversation.id, self.viewer.id))
            self.assertEqual(self.get().json()["source"], "template")
        self.assertEqual(generate.call_count, 1)

    def test_only_participants(self):
        self.client.force_authenticate(make_user())
        response = self.get()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "not_participant")
        self.assertEqual(self.client.get("/api/conversations/999999/openers/").status_code, 404)

    def test_template_without_shared_language_or_goal(self):
        partner = make_user(native_language="arabic", languages_practicing=["french"])
        self.assertEqual(openers.template_openers(self.viewer, partner), [
            "How long have you been learning French?",
            "What's an Arabic phrase you use every day?",
            "What got you into language exchange?",
        ])

    def test_throttle_scope(self):
        self.assertEqual(ChatOpenersRateThrottle.scope, "chat_openers")
