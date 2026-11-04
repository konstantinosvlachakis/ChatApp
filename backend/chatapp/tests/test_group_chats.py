"""Group chats: create, invite, accept/decline, history, read state, leave/remove,
rename, list opt-in, push and realtime (feat/group-chats-api)."""
import json
from datetime import timedelta
from unittest.mock import patch

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from chatapp.models import BlockedUser, Conversation, ConversationParticipant, Follow, Message
from chatapp.routing import websocket_urlpatterns

from .factory import make_conversation, make_message, make_user

ws_application = URLRouter(websocket_urlpatterns)


class GroupTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.owner = make_user(username="owner", email="owner@example.com")
        self.ana = make_user(username="ana", email="ana@example.com")
        self.ben = make_user(username="ben", email="ben@example.com")
        self.stranger = make_user(username="stranger", email="stranger@example.com")
        # The owner follows Ana and already chats with Ben: both can be invited.
        Follow.objects.create(follower=self.owner, following=self.ana)
        make_conversation(sender=self.ben, receiver=self.owner)

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def create_group(self, members=("ana", "ben"), name="Greek club", user=None):
        return self.as_user(user or self.owner).post(
            "/api/conversations/groups/", {"members": list(members), "name": name}, format="json"
        )

    def accept(self, user, conversation_id):
        return self.as_user(user).post(
            f"/api/conversations/{conversation_id}/invite/", {"action": "accept"}, format="json"
        )

    def participant(self, conversation_id, user):
        return ConversationParticipant.objects.get(conversation_id=conversation_id, user=user)


class CreateGroupTests(GroupTestBase):
    def test_owner_is_active_and_invitees_are_pending(self):
        response = self.create_group()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["kind"], "group")
        self.assertEqual(body["name"], "Greek club")
        self.assertEqual(body["my_role"], "owner")
        self.assertIsNone(body["receiver"])
        self.assertEqual(
            {(p["user"]["username"], p["role"], p["status"]) for p in body["participants"]},
            {("owner", "owner", "active"), ("ana", "member", "pending"), ("ben", "member", "pending")},
        )
        self.assertNotIn("email", json.dumps(body["participants"]))

    def test_unnamed_group_gets_a_default_display_name(self):
        group_id = self.create_group(name="").json()["id"]
        self.accept(self.ana, group_id)

        body = self.as_user(self.owner).get(f"/api/conversations/{group_id}/").json()

        self.assertEqual(body["name"], "")
        self.assertEqual(body["display_name"], "ana & you")

    def test_only_people_you_follow_or_chat_with_can_be_invited(self):
        response = self.create_group(members=["ana", "stranger"])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "not_invitable")
        self.assertEqual(response.json()["usernames"], ["stranger"])
        self.assertFalse(Conversation.objects.filter(kind="group").exists())

    def test_unknown_usernames_and_empty_lists_are_rejected(self):
        self.assertEqual(self.create_group(members=["ana", "ghost"]).json()["code"], "user_not_found")
        self.assertEqual(self.create_group(members=[]).json()["code"], "invalid_members")
        self.assertEqual(self.create_group(members=["owner"]).json()["code"], "invalid_members")

    def test_group_size_and_name_length_are_capped(self):
        names = []
        for index in range(8):
            friend = make_user(username=f"friend{index}", email=f"friend{index}@example.com")
            Follow.objects.create(follower=self.owner, following=friend)
            names.append(friend.username)

        self.assertEqual(self.create_group(members=names).json()["code"], "group_full")
        self.assertEqual(self.create_group(name="x" * 61).json()["code"], "invalid_name")
        self.assertEqual(self.create_group(members=names[:7]).status_code, status.HTTP_201_CREATED)

    def test_blocks_among_the_people_stop_the_group_without_saying_who(self):
        BlockedUser.objects.create(blocker=self.ana, blocked=self.ben)

        response = self.create_group()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["code"], "cannot_add")
        self.assertNotIn("ana", response.json()["error"])


class InviteFlowTests(GroupTestBase):
    def setUp(self):
        super().setUp()
        self.group_id = self.create_group().json()["id"]

    def test_pending_invitees_see_the_invite_but_not_the_chat(self):
        invites = self.as_user(self.ana).get("/api/conversations/invites/").json()["invites"]
        messages = self.as_user(self.ana).get(f"/api/conversations/{self.group_id}/messages/")
        listed = self.as_user(self.ana).get("/api/conversations/?include=groups").json()

        self.assertEqual(len(invites), 1)
        self.assertEqual(invites[0]["conversation_id"], self.group_id)
        self.assertEqual(invites[0]["invited_by"]["username"], "owner")
        self.assertEqual([member["username"] for member in invites[0]["members"]], ["owner"])
        self.assertEqual(messages.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn(self.group_id, [item["id"] for item in listed])

    def test_accepting_joins_the_group(self):
        response = self.accept(self.ana, self.group_id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = self.participant(self.group_id, self.ana)
        self.assertEqual(row.status, "active")
        self.assertIsNotNone(row.joined_at)
        listed = self.as_user(self.ana).get("/api/conversations/?include=groups").json()
        self.assertIn(self.group_id, [item["id"] for item in listed])
        self.assertEqual(self.as_user(self.ana).get("/api/conversations/invites/").json()["invites"], [])

    def test_declining_drops_the_invite(self):
        response = self.as_user(self.ben).post(
            f"/api/conversations/{self.group_id}/invite/", {"action": "decline"}, format="json"
        )

        self.assertEqual(response.json(), {"declined": True})
        self.assertFalse(
            ConversationParticipant.objects.filter(conversation_id=self.group_id, user=self.ben).exists()
        )
        self.assertEqual(self.accept(self.ben, self.group_id).status_code, status.HTTP_404_NOT_FOUND)

    def test_a_block_made_after_the_invite_stops_the_join(self):
        BlockedUser.objects.create(blocker=self.owner, blocked=self.ana)

        response = self.accept(self.ana, self.group_id)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.json()["code"], "cannot_join")
        self.assertFalse(
            ConversationParticipant.objects.filter(conversation_id=self.group_id, user=self.ana).exists()
        )

    def test_any_member_can_invite_people_they_know(self):
        self.accept(self.ana, self.group_id)
        cara = make_user(username="cara", email="cara@example.com")
        Follow.objects.create(follower=self.ana, following=cara)

        response = self.as_user(self.ana).post(
            f"/api/conversations/{self.group_id}/members/", {"usernames": ["cara"]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = self.participant(self.group_id, cara)
        self.assertEqual((row.status, row.invited_by_id), ("pending", self.ana.id))

    def test_invites_need_membership_and_skip_people_already_in(self):
        outsider = self.as_user(self.stranger).post(
            f"/api/conversations/{self.group_id}/members/", {"usernames": ["ana"]}, format="json"
        )
        pending = self.as_user(self.ana).post(
            f"/api/conversations/{self.group_id}/members/", {"usernames": ["ben"]}, format="json"
        )
        again = self.as_user(self.owner).post(
            f"/api/conversations/{self.group_id}/members/", {"usernames": ["ana"]}, format="json"
        )

        self.assertEqual(outsider.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(pending.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(again.json()["code"], "already_member")

    def test_invites_count_toward_the_size_cap(self):
        for index in range(5):
            friend = make_user(username=f"pal{index}", email=f"pal{index}@example.com")
            Follow.objects.create(follower=self.owner, following=friend)
        self.as_user(self.owner).post(
            f"/api/conversations/{self.group_id}/members/",
            {"usernames": [f"pal{index}" for index in range(5)]},
            format="json",
        )  # owner + ana + ben + 5 = 8
        extra = make_user(username="extra", email="extra@example.com")
        Follow.objects.create(follower=self.owner, following=extra)

        response = self.as_user(self.owner).post(
            f"/api/conversations/{self.group_id}/members/", {"usernames": ["extra"]}, format="json"
        )

        self.assertEqual(response.json()["code"], "group_full")

    def test_direct_chats_cannot_take_members(self):
        direct = make_conversation(sender=self.owner, receiver=self.ana)

        response = self.as_user(self.owner).post(
            f"/api/conversations/{direct.id}/members/", {"usernames": ["ben"]}, format="json"
        )

        self.assertEqual(response.json()["code"], "not_a_group")


class GroupMessagingTests(GroupTestBase):
    def setUp(self):
        super().setUp()
        self.group_id = self.create_group().json()["id"]
        self.group = Conversation.objects.get(id=self.group_id)
        self.accept(self.ana, self.group_id)

    def test_late_joiners_only_see_messages_from_when_they_joined(self):
        # The owner and Ana joined an hour ago; this message predates Ben's join.
        ConversationParticipant.objects.filter(conversation=self.group, status="active").update(
            joined_at=timezone.now() - timedelta(hours=1)
        )
        earlier = make_message(conversation=self.group, sender=self.owner, text="Before Ben")
        Message.objects.filter(id=earlier.id).update(timestamp=timezone.now() - timedelta(minutes=5))
        self.accept(self.ben, self.group_id)
        later = make_message(conversation=self.group, sender=self.ana, text="Welcome Ben")

        page = self.as_user(self.ben).get(f"/api/conversations/{self.group_id}/messages/").json()
        detail = self.as_user(self.ben).get(f"/api/conversations/{self.group_id}/").json()
        react_old = self.as_user(self.ben).post(f"/api/messages/{earlier.id}/react/", {"emoji": "👍"}, format="json")
        owner_page = self.as_user(self.owner).get(f"/api/conversations/{self.group_id}/messages/").json()

        self.assertEqual([m["id"] for m in page["messages"]], [later.id])
        self.assertEqual([m["id"] for m in detail["messages"]], [later.id])
        self.assertEqual(react_old.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual([m["id"] for m in owner_page["messages"]], [earlier.id, later.id])

    def test_unread_counts_and_seen_position_per_member(self):
        self.as_user(self.owner).post(f"/api/conversations/{self.group_id}/messages/", {"text": "Γεια σας"})
        self.as_user(self.owner).post(f"/api/conversations/{self.group_id}/messages/", {"text": "Τι κάνετε;"})

        listed = self.as_user(self.ana).get("/api/conversations/?include=groups").json()
        group_item = next(item for item in listed if item["id"] == self.group_id)
        self.assertEqual(group_item["unread_count"], 2)
        self.assertEqual(group_item["last_message"]["text"], "Τι κάνετε;")
        self.assertEqual(group_item["display_name"], "Greek club")

        read = self.as_user(self.ana).patch(f"/api/conversations/{self.group_id}/read/")
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(self.participant(self.group_id, self.ana).last_read_at)
        listed = self.as_user(self.ana).get("/api/conversations/?include=groups").json()
        self.assertEqual(next(item for item in listed if item["id"] == self.group_id)["unread_count"], 0)
        # Group messages keep "sent": Message.status can't say who read them.
        self.assertFalse(Message.objects.filter(conversation_id=self.group_id).exclude(status="sent").exists())

    def test_groups_are_opt_in_in_the_conversation_list(self):
        plain = self.as_user(self.owner).get("/api/conversations/").json()
        with_groups = self.as_user(self.owner).get("/api/conversations/?include=groups").json()

        # The owner is the group's ``sender``: the default list must still skip it.
        self.assertNotIn(self.group_id, [item["id"] for item in plain])
        self.assertIn(self.group_id, [item["id"] for item in with_groups])
        direct = next(item for item in with_groups if item["kind"] == "direct")
        self.assertEqual(direct["participants"], [])

    def test_group_messages_push_to_every_other_member(self):
        with patch("chatapp.views.schedule_group_message_push") as push:
            self.as_user(self.ana).post(f"/api/conversations/{self.group_id}/messages/", {"text": "Καλημέρα"})

        kwargs = push.call_args.kwargs
        self.assertEqual(kwargs["recipient_ids"], [self.owner.id])
        self.assertEqual(kwargs["group_name"], "Greek club")
        self.assertEqual(kwargs["sender_username"], "ana")

    def test_invites_push_to_invitees(self):
        cara = make_user(username="cara", email="cara@example.com")
        Follow.objects.create(follower=self.owner, following=cara)

        with patch("chatapp.group_views.schedule_group_invite_push") as push:
            self.as_user(self.owner).post(
                f"/api/conversations/{self.group_id}/members/", {"usernames": ["cara"]}, format="json"
            )

        self.assertEqual(push.call_args.kwargs["recipient_ids"], [cara.id])

    def test_blocks_between_members_do_not_stop_group_messages(self):
        BlockedUser.objects.create(blocker=self.ana, blocked=self.owner)

        response = self.as_user(self.owner).post(f"/api/conversations/{self.group_id}/messages/", {"text": "hi"})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class LeaveRemoveRenameTests(GroupTestBase):
    def setUp(self):
        super().setUp()
        self.group_id = self.create_group().json()["id"]
        self.accept(self.ana, self.group_id)
        self.accept(self.ben, self.group_id)

    def test_member_leaves_and_loses_access(self):
        response = self.as_user(self.ana).delete(f"/api/conversations/{self.group_id}/members/ana/")

        self.assertEqual(response.json(), {"left": True, "group_deleted": False})
        self.assertEqual(
            self.as_user(self.ana).get(f"/api/conversations/{self.group_id}/messages/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_deleting_a_group_chat_means_leaving_it(self):
        response = self.as_user(self.ben).delete(f"/api/conversations/{self.group_id}/")

        self.assertTrue(response.json()["left"])
        self.assertTrue(Conversation.objects.filter(id=self.group_id).exists())

    def test_owner_leaving_hands_over_to_the_longest_member(self):
        self.as_user(self.owner).delete(f"/api/conversations/{self.group_id}/members/owner/")

        self.assertEqual(self.participant(self.group_id, self.ana).role, "owner")
        self.assertEqual(self.participant(self.group_id, self.ben).role, "member")

    def test_the_last_member_leaving_deletes_the_group(self):
        for user in (self.ana, self.ben):
            self.as_user(user).delete(f"/api/conversations/{self.group_id}/")

        response = self.as_user(self.owner).delete(f"/api/conversations/{self.group_id}/")

        self.assertEqual(response.json(), {"left": True, "group_deleted": True})
        self.assertFalse(Conversation.objects.filter(id=self.group_id).exists())

    def test_only_the_owner_removes_people(self):
        by_member = self.as_user(self.ana).delete(f"/api/conversations/{self.group_id}/members/ben/")
        by_owner = self.as_user(self.owner).delete(f"/api/conversations/{self.group_id}/members/ben/")

        self.assertEqual(by_member.json()["code"], "not_owner")
        self.assertEqual(by_owner.json(), {"removed": "ben"})
        self.assertFalse(
            ConversationParticipant.objects.filter(conversation_id=self.group_id, user=self.ben).exists()
        )

    def test_a_member_who_left_cannot_edit_their_old_messages(self):
        message = make_message(conversation=Conversation.objects.get(id=self.group_id), sender=self.ana)
        self.as_user(self.ana).delete(f"/api/conversations/{self.group_id}/")

        response = self.as_user(self.ana).patch(f"/api/messages/{message.id}/edit/", {"text": "changed"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_renames_members_cannot(self):
        renamed = self.as_user(self.owner).patch(f"/api/conversations/{self.group_id}/", {"name": "Τάξη"}, format="json")
        denied = self.as_user(self.ana).patch(f"/api/conversations/{self.group_id}/", {"name": "Mine"}, format="json")
        too_long = self.as_user(self.owner).patch(f"/api/conversations/{self.group_id}/", {"name": "x" * 61}, format="json")
        cleared = self.as_user(self.owner).patch(f"/api/conversations/{self.group_id}/", {"name": ""}, format="json")

        self.assertEqual(renamed.json()["name"], "Τάξη")
        self.assertEqual(denied.json()["code"], "not_owner")
        self.assertEqual(too_long.json()["code"], "invalid_name")
        self.assertEqual(cleared.json()["display_name"], "ana, ben & you")


class GroupListQueryCountTests(GroupTestBase):
    def test_list_with_groups_has_a_fixed_query_count(self):
        group_ids = []
        for _ in range(3):
            group_id = self.create_group().json()["id"]
            self.accept(self.ana, group_id)
            make_message(conversation=Conversation.objects.get(id=group_id), sender=self.ana)
            group_ids.append(group_id)
        self.as_user(self.owner)

        def run():
            cache.clear()
            return self.client.get("/api/conversations/?include=groups")

        run()
        with CaptureQueriesContext(connection) as three_groups:
            run()
        group_id = self.create_group().json()["id"]
        self.accept(self.ben, group_id)
        with CaptureQueriesContext(connection) as four_groups:
            response = run()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(four_groups.captured_queries), len(three_groups.captured_queries))


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class GroupWebsocketTests(TransactionTestCase):
    def setUp(self):
        self.owner = make_user(username="owner", email="owner@example.com")
        self.ana = make_user(username="ana", email="ana@example.com")
        self.ben = make_user(username="ben", email="ben@example.com")
        self.group = Conversation.objects.create(kind="group", name="Club", sender=self.owner)
        now = timezone.now()
        for user, role, state in (
            (self.owner, "owner", "active"),
            (self.ana, "member", "active"),
            (self.ben, "member", "pending"),
        ):
            ConversationParticipant.objects.create(
                conversation=self.group, user=user, role=role, status=state,
                joined_at=now if state == "active" else None,
            )
        self.path = f"/ws/socket-server/{self.group.id}/"

    async def _connect(self, user):
        communicator = WebsocketCommunicator(
            ws_application, self.path,
            headers=[(b"authorization", f"Bearer {AccessToken.for_user(user)}".encode())],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def test_members_join_and_pending_invitees_are_rejected(self):
        member = await self._connect(self.ana)
        self.assertTrue(await member.receive_nothing(timeout=0.2))

        pending = await self._connect(self.ben)
        self.assertEqual(await pending.receive_output(timeout=2), {"type": "websocket.close", "code": 4403})

        await member.disconnect()
        await pending.wait()

    async def test_typing_reaches_other_members_and_calls_are_ignored(self):
        owner = await self._connect(self.owner)
        ana = await self._connect(self.ana)

        await ana.send_to(text_data=json.dumps({"type": "user_typing"}))
        self.assertEqual(json.loads(await owner.receive_from(timeout=2)), {"type": "user_typing", "senderId": self.ana.id})

        await ana.send_to(text_data=json.dumps({"type": "webrtc_offer", "sdp": "x", "callMode": "audio"}))
        self.assertTrue(await owner.receive_nothing(timeout=0.3))

        await owner.disconnect()
        await ana.disconnect()

    async def test_a_removed_member_is_disconnected(self):
        from channels.layers import get_channel_layer

        ana = await self._connect(self.ana)
        await get_channel_layer().group_send(
            str(self.group.id),
            {
                "type": "group_updated_event", "conversation_id": self.group.id, "trigger": "removed",
                "actor_id": self.owner.id, "user_ids": [self.ana.id], "removed_user_ids": [self.ana.id],
            },
        )

        self.assertEqual(await ana.receive_output(timeout=2), {"type": "websocket.close", "code": 4403})
        await ana.wait()
