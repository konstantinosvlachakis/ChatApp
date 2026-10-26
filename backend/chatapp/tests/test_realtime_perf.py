import asyncio
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from asgiref.sync import async_to_sync, sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from chatapp.models import BlockedUser, Profile
from chatapp.routing import websocket_urlpatterns

from .factory import make_conversation, make_user

ws_application = URLRouter(websocket_urlpatterns)


class capture_queries:
    """Async wrapper for CaptureQueriesContext.

    Consumers run their ORM calls via database_sync_to_async on the test's
    main thread, and the async test body may resolve `connection` to another
    wrapper, so the context is entered, exited and read on the sync side.
    """

    def __init__(self):
        self.captured_queries = []

    async def __aenter__(self):
        self._ctx = CaptureQueriesContext(connection)
        await sync_to_async(self._ctx.__enter__)()
        return self

    async def __aexit__(self, *exc_info):
        def finish():
            self._ctx.__exit__(*exc_info)
            self.captured_queries = list(self._ctx.captured_queries)

        await sync_to_async(finish)()


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class RealtimePerformanceTests(TransactionTestCase):
    def setUp(self):
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        # carol shares no conversation with alice.
        self.carol = make_user(username="carol", email="carol@example.com")
        # dave and erin share a conversation with alice but a block exists
        # (alice blocked dave; erin blocked alice).
        self.dave = make_user(username="dave", email="dave@example.com")
        self.erin = make_user(username="erin", email="erin@example.com")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        make_conversation(sender=self.dave, receiver=self.alice)
        make_conversation(sender=self.alice, receiver=self.erin)
        make_conversation(sender=self.bob, receiver=self.carol)
        BlockedUser.objects.create(blocker=self.alice, blocked=self.dave)
        BlockedUser.objects.create(blocker=self.erin, blocked=self.alice)
        self.chat_path = f"/ws/socket-server/{self.conversation.id}/"

    async def _connect(self, path, user):
        communicator = WebsocketCommunicator(
            ws_application, f"{path}?token={AccessToken.for_user(user)}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def _connect_presence(self, user):
        communicator = await self._connect("/ws/presence/", user)
        initial = await communicator.receive_json_from(timeout=2)
        self.assertEqual(initial["type"], "initial_online_users")
        return communicator, initial

    async def test_typing_frames_cost_no_queries(self):
        alice_ws = await self._connect(self.chat_path, self.alice)
        bob_ws = await self._connect(self.chat_path, self.bob)
        bob_presence, _ = await self._connect_presence(self.bob)
        try:
            async with capture_queries() as ctx:
                for frame_type in ("user_typing", "user_typing", "user_stopped_typing"):
                    await alice_ws.send_json_to({"type": frame_type})
                    typing = await bob_ws.receive_json_from(timeout=2)
                    self.assertEqual(typing["type"], frame_type)
                    status = await bob_presence.receive_json_from(timeout=2)
                    self.assertEqual(status["type"], "typing_status")
                    self.assertEqual(status["conversation_id"], self.conversation.id)
                    self.assertEqual(status["sender_id"], self.alice.id)
                    self.assertEqual(status["is_typing"], frame_type == "user_typing")
            self.assertEqual(len(ctx.captured_queries), 0, ctx.captured_queries)
        finally:
            await alice_ws.disconnect()
            await bob_ws.disconnect()
            await bob_presence.disconnect()

    async def test_presence_changes_reach_only_unblocked_contacts(self):
        # bob connects last so carol (his contact) coming online is already
        # reflected in his initial list rather than queued as an update.
        carol_ws, _ = await self._connect_presence(self.carol)
        dave_ws, _ = await self._connect_presence(self.dave)
        erin_ws, _ = await self._connect_presence(self.erin)
        bob_ws, bob_initial = await self._connect_presence(self.bob)
        self.assertEqual(bob_initial["user_ids"], [self.carol.id])
        bob_online = await carol_ws.receive_json_from(timeout=2)
        self.assertEqual(bob_online["user_id"], self.bob.id)
        try:
            alice_ws, alice_initial = await self._connect_presence(self.alice)
            # Alice's own initial list only contains unblocked contacts.
            self.assertEqual(alice_initial["user_ids"], [self.bob.id])

            online = await bob_ws.receive_json_from(timeout=2)
            self.assertEqual(
                online,
                {"type": "presence_update", "user_id": self.alice.id, "is_online": True},
            )
            for outsider in (carol_ws, dave_ws, erin_ws):
                self.assertTrue(await outsider.receive_nothing(timeout=0.2))

            await alice_ws.disconnect()
            offline = await bob_ws.receive_json_from(timeout=2)
            self.assertEqual(
                offline,
                {"type": "presence_update", "user_id": self.alice.id, "is_online": False},
            )
            for outsider in (carol_ws, dave_ws, erin_ws):
                self.assertTrue(await outsider.receive_nothing(timeout=0.2))
        finally:
            for ws in (bob_ws, carol_ws, dave_ws, erin_ws):
                await ws.disconnect()

    async def test_blocked_contacts_do_not_see_user_in_initial_list(self):
        alice_ws, _ = await self._connect_presence(self.alice)
        try:
            for user in (self.dave, self.erin, self.carol):
                ws, initial = await self._connect_presence(user)
                self.assertNotIn(self.alice.id, initial["user_ids"])
                await ws.disconnect()
        finally:
            await alice_ws.disconnect()

    async def test_connect_and_disconnect_query_counts_are_bounded(self):
        async with capture_queries() as presence_connect:
            presence_ws, _ = await self._connect_presence(self.alice)
        # came online (2 updates) + contacts (1) + initial online list (1).
        # Non-zero also proves the capture sees the consumers' queries.
        self.assertGreater(len(presence_connect.captured_queries), 0)
        self.assertLessEqual(len(presence_connect.captured_queries), 4)

        async with capture_queries() as chat_connect:
            chat_ws = await self._connect(self.chat_path, self.alice)
        # participant check (1) + already-online counter bump (1)
        self.assertLessEqual(len(chat_connect.captured_queries), 2)

        async with capture_queries() as chat_disconnect:
            await chat_ws.disconnect()
        # one decrement, no conversation re-read
        self.assertLessEqual(len(chat_disconnect.captured_queries), 1)

        async with capture_queries() as presence_disconnect:
            await presence_ws.disconnect()
        # last socket: decrement attempt + went-offline update; contacts cached
        self.assertLessEqual(len(presence_disconnect.captured_queries), 2)

        alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 0)
        self.assertFalse(alice.is_online)

    async def test_connection_count_tracks_multiple_sockets(self):
        first, _ = await self._connect_presence(self.alice)
        second = await self._connect(self.chat_path, self.alice)
        alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 2)
        self.assertTrue(alice.is_online)

        await second.disconnect()
        alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 1)
        self.assertTrue(alice.is_online)

        await first.disconnect()
        alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 0)
        self.assertFalse(alice.is_online)

        # A disconnect after presence/offline already zeroed the counter must
        # never drive it below zero.
        stray = await self._connect(self.chat_path, self.alice)
        await sync_to_async(
            Profile.objects.filter(id=self.alice.id).update
        )(ws_connection_count=0, is_online=False)
        await stray.disconnect()
        alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 0)
        self.assertFalse(alice.is_online)

    async def test_stale_online_flag_is_treated_as_offline_on_connect(self):
        stale = timezone.now() - timedelta(hours=1)
        await sync_to_async(Profile.objects.filter(id=self.alice.id).update)(
            is_online=True, ws_connection_count=3, last_seen=stale
        )
        bob_ws, bob_initial = await self._connect_presence(self.bob)
        self.assertNotIn(self.alice.id, bob_initial["user_ids"])
        alice_ws, _ = await self._connect_presence(self.alice)
        try:
            online = await bob_ws.receive_json_from(timeout=2)
            self.assertEqual(online["user_id"], self.alice.id)
            self.assertTrue(online["is_online"])
        finally:
            await alice_ws.disconnect()
            await bob_ws.disconnect()

    async def test_heartbeat_within_interval_does_not_write(self):
        presence_ws, _ = await self._connect_presence(self.alice)
        try:
            async with capture_queries() as ctx:
                for _ in range(3):
                    await presence_ws.send_json_to({"type": "heartbeat"})
                self.assertTrue(await presence_ws.receive_nothing(timeout=0.2))
            self.assertEqual(len(ctx.captured_queries), 0, ctx.captured_queries)
        finally:
            await presence_ws.disconnect()

    async def test_heartbeat_after_interval_refreshes_last_seen(self):
        presence_ws, _ = await self._connect_presence(self.alice)
        old = timezone.now() - timedelta(minutes=5)
        await sync_to_async(Profile.objects.filter(id=self.alice.id).update)(
            last_seen=old
        )
        try:
            with patch("chatapp.consumers.PRESENCE_TOUCH_INTERVAL_SECONDS", 0):
                await presence_ws.send_json_to({"type": "heartbeat"})
                self.assertTrue(await presence_ws.receive_nothing(timeout=0.2))
            alice = await sync_to_async(Profile.objects.get)(id=self.alice.id)
            self.assertGreater(alice.last_seen, old)
        finally:
            await presence_ws.disconnect()


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class PresenceOfflineViewFanoutTests(TransactionTestCase):
    def setUp(self):
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.carol = make_user(username="carol", email="carol@example.com")
        self.dave = make_user(username="dave", email="dave@example.com")
        make_conversation(sender=self.alice, receiver=self.bob)
        make_conversation(sender=self.alice, receiver=self.dave)
        BlockedUser.objects.create(blocker=self.dave, blocked=self.alice)
        Profile.objects.filter(id=self.alice.id).update(
            is_online=True, ws_connection_count=2, last_seen=timezone.now()
        )

    def test_offline_view_notifies_only_unblocked_contacts(self):
        layer = get_channel_layer()
        channels = {}
        for user in (self.bob, self.carol, self.dave):
            channel_name = async_to_sync(layer.new_channel)()
            async_to_sync(layer.group_add)(f"presence_user_{user.id}", channel_name)
            channels[user.username] = channel_name

        client = APIClient()
        client.force_authenticate(user=self.alice)
        response = client.post("/api/presence/offline/")
        self.assertEqual(response.status_code, 200)

        async def receive_or_none(channel_name):
            try:
                return await asyncio.wait_for(layer.receive(channel_name), 0.2)
            except asyncio.TimeoutError:
                return None

        event = async_to_sync(receive_or_none)(channels["bob"])
        self.assertEqual(event["type"], "presence_update_event")
        self.assertEqual(event["user_id"], self.alice.id)
        self.assertFalse(event["is_online"])
        self.assertIsNone(async_to_sync(receive_or_none)(channels["carol"]))
        self.assertIsNone(async_to_sync(receive_or_none)(channels["dave"]))

        alice = Profile.objects.get(id=self.alice.id)
        self.assertEqual(alice.ws_connection_count, 0)
        self.assertFalse(alice.is_online)


class ResetPresenceCommandTests(TransactionTestCase):
    def test_reset_presence_clears_stale_counters(self):
        stuck = make_user(username="stuck", email="stuck@example.com")
        idle = make_user(username="idle", email="idle@example.com")
        Profile.objects.filter(id=stuck.id).update(is_online=True, ws_connection_count=4)

        out = StringIO()
        call_command("reset_presence", stdout=out)

        stuck.refresh_from_db()
        idle.refresh_from_db()
        self.assertEqual(stuck.ws_connection_count, 0)
        self.assertFalse(stuck.is_online)
        self.assertEqual(idle.ws_connection_count, 0)
        self.assertIn("1 profile", out.getvalue())
