import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from chatapp.models import (
    BlockedUser,
    MessageCorrection,
    MessageTranslation,
    PhrasebookEntry,
    Profile,
)
from chatapp.phrasebook import schedule_review

from .factory import make_conversation, make_message, make_user


class CorrectionTests(TestCase):
    def setUp(self):
        self.learner = make_user(
            username="learner", native_language="english", languages_practicing=["spanish"]
        )
        self.partner = make_user(
            username="partner", native_language="spanish", languages_practicing=["english"]
        )
        self.outsider = make_user(username="outsider")
        self.conversation = make_conversation(sender=self.learner, receiver=self.partner)
        self.message = make_message(
            conversation=self.conversation, sender=self.learner, text="Yo soy cansado"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.partner)
        self.url = f"/api/messages/{self.message.id}/correction/"

    def test_partner_corrects_and_room_gets_broadcast(self):
        with mock.patch("chatapp.learning_views.broadcast_chat_room_event") as broadcast:
            response = self.client.post(
                self.url, {"corrected_text": "Estoy cansado", "note": "estar for states"}
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["corrections"]), 1)
        correction = response.data["corrections"][0]
        self.assertEqual(correction["corrected_text"], "Estoy cansado")
        self.assertEqual(correction["note"], "estar for states")
        self.assertEqual(correction["corrector"]["username"], "partner")
        self.assertTrue(response.data["accepts_corrections"])

        broadcast.assert_called_once()
        args, kwargs = broadcast.call_args
        self.assertEqual(args, (self.conversation.id, "message_corrections_event"))
        self.assertNotIn("can_translate", kwargs["message"])
        # Websocket payloads are json.dumps'd by the consumer.
        json.dumps(kwargs["message"])

    def test_second_post_replaces_own_correction_and_delete_removes_it(self):
        self.client.post(self.url, {"corrected_text": "Estoy cansada"})
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(MessageCorrection.objects.count(), 1)
        self.assertEqual(response.data["corrections"][0]["corrected_text"], "Estoy cansado")

        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["corrections"], [])

    def test_validation(self):
        cases = [
            ({"corrected_text": ""}, 400, "correction_required"),
            ({"corrected_text": "Yo soy cansado"}, 400, "unchanged_correction"),
            ({"corrected_text": "x" * 5001}, 400, "correction_too_long"),
            ({"corrected_text": "Estoy", "note": "n" * 501}, 400, "note_too_long"),
        ]
        for payload, expected_status, code in cases:
            with self.subTest(code=code):
                response = self.client.post(self.url, payload)
                self.assertEqual(response.status_code, expected_status)
                self.assertEqual(response.data["code"], code)

    def test_cannot_correct_own_message(self):
        self.client.force_authenticate(self.learner)
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "cannot_correct_own")

    def test_outsider_gets_403(self):
        self.client.force_authenticate(self.outsider)
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "not_participant")

    def test_sticker_messages_are_not_correctable(self):
        sticker = make_message(
            conversation=self.conversation, sender=self.learner, text="", kind="sticker",
            media={"pack": "p", "id": "x"},
        )
        response = self.client.post(
            f"/api/messages/{sticker.id}/correction/", {"corrected_text": "hola"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "not_correctable")

    def test_preference_off_blocks_corrections(self):
        Profile.objects.filter(id=self.learner.id).update(correction_preference="off")
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "corrections_disabled")

    def test_when_asked_requires_the_sender_flag(self):
        Profile.objects.filter(id=self.learner.id).update(correction_preference="when_asked")
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "corrections_not_requested")

        # Only the sender can ask.
        request_url = f"/api/messages/{self.message.id}/correction-request/"
        self.assertEqual(self.client.post(request_url, {"requested": True}).status_code, 403)

        learner_client = APIClient()
        learner_client.force_authenticate(self.learner)
        with mock.patch("chatapp.learning_views.broadcast_chat_room_event") as broadcast:
            response = learner_client.post(request_url, {"requested": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["correction_requested"])
        self.assertTrue(response.data["accepts_corrections"])
        broadcast.assert_called_once()

        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 200)

    def test_blocked_pair_cannot_correct(self):
        BlockedUser.objects.create(blocker=self.learner, blocked=self.partner)
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "blocked")

    def test_unverified_email_cannot_correct(self):
        Profile.objects.filter(id=self.partner.id).update(email_verified_at=None)
        self.partner.refresh_from_db()
        self.client.force_authenticate(self.partner)
        response = self.client.post(self.url, {"corrected_text": "Estoy cansado"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_unverified")

    def test_messages_list_includes_corrections(self):
        MessageCorrection.objects.create(
            message=self.message, corrector=self.partner, corrected_text="Estoy cansado"
        )
        response = self.client.get(f"/api/conversations/{self.conversation.id}/messages/")
        self.assertEqual(response.status_code, 200)
        listed = next(m for m in response.data["messages"] if m["id"] == self.message.id)
        self.assertEqual(listed["corrections"][0]["corrected_text"], "Estoy cansado")
        self.assertEqual(listed["sender"]["correction_preference"], "often")


class CorrectionPreferenceTests(TestCase):
    def test_profile_edit_validates_and_returns_preference(self):
        user = make_user()
        client = APIClient()
        client.force_authenticate(user)
        response = client.patch(
            "/api/profile/edit/", {"correction_preference": "when_asked"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["updated_profile"]["correction_preference"], "when_asked")
        self.assertEqual(client.get("/api/profile/").json()["correction_preference"], "when_asked")

        response = client.patch(
            "/api/profile/edit/", {"correction_preference": "always"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_correction_preference")


class PhrasebookTests(TestCase):
    def setUp(self):
        self.learner = make_user(
            username="learner", native_language="english", languages_practicing=["spanish"]
        )
        self.partner = make_user(
            username="partner", native_language="spanish", languages_practicing=["english"]
        )
        self.conversation = make_conversation(sender=self.learner, receiver=self.partner)
        self.incoming = make_message(
            conversation=self.conversation, sender=self.partner, text="¿Quedamos mañana por la tarde?"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.learner)

    def test_save_message_with_translation_and_dedupe(self):
        MessageTranslation.objects.create(
            message=self.incoming, user=self.learner, target_language="en",
            source_language="es", translated_text="Shall we meet tomorrow afternoon?",
        )
        response = self.client.post(
            "/api/phrasebook/", {"message_id": self.incoming.id, "source": "translation"}
        )
        self.assertEqual(response.status_code, 201, response.data)
        entry = response.data["entry"]
        self.assertEqual(entry["text"], "¿Quedamos mañana por la tarde?")
        self.assertEqual(entry["meaning"], "Shall we meet tomorrow afternoon?")
        self.assertEqual(entry["language"], "spanish")
        self.assertEqual(entry["source_conversation_id"], self.conversation.id)

        again = self.client.post(
            "/api/phrasebook/", {"message_id": self.incoming.id, "source": "message"}
        )
        self.assertEqual(again.status_code, 200)
        self.assertFalse(again.data["created"])
        self.assertEqual(PhrasebookEntry.objects.count(), 1)

    def test_excerpt_must_come_from_message(self):
        response = self.client.post(
            "/api/phrasebook/", {"message_id": self.incoming.id, "text": "por la tarde"}
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["entry"]["text"], "por la tarde")
        self.assertEqual(response.data["entry"]["context"], "¿Quedamos mañana por la tarde?")

        response = self.client.post(
            "/api/phrasebook/", {"message_id": self.incoming.id, "text": "hasta luego"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_excerpt")

    def test_save_correction_of_own_message(self):
        mine = make_message(conversation=self.conversation, sender=self.learner, text="Yo soy cansado")
        MessageCorrection.objects.create(
            message=mine, corrector=self.partner, corrected_text="Estoy cansado", note="estar"
        )
        response = self.client.post(
            "/api/phrasebook/", {"message_id": mine.id, "source": "correction"}
        )
        self.assertEqual(response.status_code, 201)
        entry = response.data["entry"]
        self.assertEqual(entry["text"], "Estoy cansado")
        self.assertEqual(entry["context"], "Yo soy cansado")
        self.assertEqual(entry["note"], "estar")
        self.assertEqual(entry["language"], "spanish")
        self.assertEqual(entry["source"], "correction")

    def test_translation_source_requires_translation(self):
        response = self.client.post(
            "/api/phrasebook/", {"message_id": self.incoming.id, "source": "translation"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "no_translation")

    def test_cannot_save_from_someone_elses_conversation(self):
        other_chat = make_conversation()
        foreign = make_message(conversation=other_chat, text="secret")
        response = self.client.post("/api/phrasebook/", {"message_id": foreign.id})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(PhrasebookEntry.objects.exists())

    def test_manual_entry_list_search_edit_delete_and_isolation(self):
        response = self.client.post(
            "/api/phrasebook/",
            {"text": "Echar de menos", "meaning": "To miss someone", "language": "Spanish"},
        )
        self.assertEqual(response.status_code, 201)
        entry_id = response.data["entry"]["id"]
        self.assertEqual(response.data["entry"]["language"], "spanish")

        listing = self.client.get("/api/phrasebook/", {"q": "miss"}).data
        self.assertEqual([e["id"] for e in listing["entries"]], [entry_id])
        self.assertEqual(listing["due_count"], 1)
        self.assertEqual(listing["languages"], ["spanish"])
        self.assertEqual(self.client.get("/api/phrasebook/", {"q": "zzz"}).data["entries"], [])

        response = self.client.patch(
            f"/api/phrasebook/{entry_id}/", {"note": "Te echo de menos"}, format="json"
        )
        self.assertEqual(response.data["entry"]["note"], "Te echo de menos")

        stranger = APIClient()
        stranger.force_authenticate(self.partner)
        self.assertEqual(stranger.get("/api/phrasebook/").data["entries"], [])
        self.assertEqual(stranger.delete(f"/api/phrasebook/{entry_id}/").status_code, 404)
        self.assertEqual(stranger.post(f"/api/phrasebook/{entry_id}/review/", {"result": "good"}).status_code, 404)

        self.assertEqual(self.client.delete(f"/api/phrasebook/{entry_id}/").status_code, 204)
        self.assertFalse(PhrasebookEntry.objects.exists())

    def test_entry_survives_message_deletion(self):
        self.client.post("/api/phrasebook/", {"message_id": self.incoming.id})
        self.incoming.delete()
        entry = PhrasebookEntry.objects.get()
        self.assertIsNone(entry.source_message_id)
        self.assertEqual(entry.text, "¿Quedamos mañana por la tarde?")

    def test_review_queue_and_grading(self):
        due = PhrasebookEntry.objects.create(user=self.learner, text="uno")
        PhrasebookEntry.objects.create(
            user=self.learner, text="dos", due_at=timezone.now() + timedelta(days=2)
        )
        review = self.client.get("/api/phrasebook/review/").data
        self.assertEqual([card["id"] for card in review["cards"]], [due.id])
        self.assertEqual(review["due_count"], 1)
        self.assertEqual(review["total_count"], 2)
        self.assertEqual(review["reviewed_today"], 0)
        self.assertIsNotNone(review["next_due_at"])

        response = self.client.post(f"/api/phrasebook/{due.id}/review/", {"result": "good"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["entry"]["interval_days"], 1)
        self.assertEqual(response.data["due_count"], 0)
        self.assertEqual(self.client.get("/api/phrasebook/review/").data["reviewed_today"], 1)

        bad = self.client.post(f"/api/phrasebook/{due.id}/review/", {"result": "perfect"})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.data["code"], "invalid_result")


class ScheduleReviewTests(TestCase):
    def test_intervals_grow_and_again_resets(self):
        now = timezone.now()
        entry = PhrasebookEntry(text="x", ease=250)
        schedule_review(entry, "good", now)
        self.assertEqual(entry.interval_days, 1)
        schedule_review(entry, "good", now)
        self.assertEqual(entry.interval_days, 3)
        schedule_review(entry, "good", now)
        self.assertEqual(entry.interval_days, 8)  # round(3 * 2.5)
        schedule_review(entry, "easy", now)
        self.assertGreater(entry.interval_days, 20)
        self.assertEqual(entry.ease, 265)

        schedule_review(entry, "again", now)
        self.assertEqual(entry.interval_days, 0)
        self.assertEqual(entry.repetitions, 0)
        self.assertEqual(entry.lapses, 1)
        self.assertEqual(entry.ease, 245)
        self.assertEqual(entry.due_at, now + timedelta(minutes=10))
        self.assertEqual(entry.review_count, 5)

    def test_hard_and_caps(self):
        now = timezone.now()
        entry = PhrasebookEntry(text="x", ease=135, interval_days=300, repetitions=5)
        schedule_review(entry, "hard", now)
        self.assertEqual(entry.interval_days, 360)
        self.assertEqual(entry.ease, 130)
        schedule_review(entry, "easy", now)
        self.assertEqual(entry.interval_days, 365)
