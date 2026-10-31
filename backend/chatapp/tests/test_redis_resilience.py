"""A Redis outage must never take the site down (security/sessions resilience).

The cache (core.cache.ResilientRedisCache) fails open with a circuit breaker,
channel-layer broadcasts are best effort (core.realtime), and /api/health/
reports "degraded" (200) instead of failing.
"""

import logging
from unittest.mock import patch

from channels.layers import InMemoryChannelLayer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.core.cache import cache, caches
from django.core.cache.backends.redis import RedisCache
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework.test import APIClient

from chatapp.models import Message
from chatapp.routing import websocket_urlpatterns
from chatapp.tokens import issue_token_pair
from chatapp.views import consume_cache_counter, consume_practice_generator_budget
from core.cache import ResilientRedisCache, cache_breaker, reset_cache_resilience
from core.realtime import (
    broadcast,
    channel_layer_breaker,
    reset_channel_layer_resilience,
)

from .factory import make_conversation, make_user

PLACEHOLDER_HOST = "cache.placeholder.test"
FAILING_CACHES = {
    "default": {
        "BACKEND": "core.cache.ResilientRedisCache",
        "LOCATION": f"redis://{PLACEHOLDER_HOST}:6379/0",
        "OPTIONS": {"socket_connect_timeout": 0.5, "socket_timeout": 0.5},
    }
}
FAILING_LAYERS = {
    "default": {"BACKEND": "chatapp.tests.test_redis_resilience.FailingChannelLayer"}
}


class FailingRedisClient:
    """Stands in for Django's RedisCacheClient: every call raises like a
    deleted / unreachable Redis database."""

    def __init__(self):
        self.calls = 0

    def __getattr__(self, name):
        def fail(*args, **kwargs):
            self.calls += 1
            raise RedisConnectionError(f"Error connecting to {PLACEHOLDER_HOST}:6379")

        return fail


class FailingChannelLayer(InMemoryChannelLayer):
    calls = 0

    async def _fail(self):
        FailingChannelLayer.calls += 1
        raise RedisConnectionError(f"Error connecting to {PLACEHOLDER_HOST}:6379")

    async def group_send(self, group, message):
        await self._fail()

    async def group_add(self, group, channel):
        await self._fail()

    async def group_discard(self, group, channel):
        await self._fail()


def install_failing_client(test):
    """Make every ResilientRedisCache (any thread) use a failing client."""
    client = FailingRedisClient()
    patcher = patch.object(ResilientRedisCache, "_cache", client, create=True)
    patcher.start()
    test.addCleanup(patcher.stop)
    assert isinstance(caches["default"], ResilientRedisCache)
    return client


def reset_resilience():
    reset_cache_resilience()
    reset_channel_layer_resilience()
    FailingChannelLayer.calls = 0


class ResilientCacheUnitTests(SimpleTestCase):
    def setUp(self):
        reset_resilience()
        self.override = override_settings(CACHES=FAILING_CACHES)
        self.override.enable()
        self.client_stub = install_failing_client(self)
        self.cache = caches["default"]

    def tearDown(self):
        self.override.disable()
        reset_resilience()

    def test_every_operation_fails_open(self):
        c = self.cache
        with self.assertLogs("core.cache", level="WARNING"):
            self.assertEqual(c.get("k", "fallback"), "fallback")
        # Each call below is a fresh failure (breaker reset between them).
        cases = [
            (lambda: c.get("k"), None),
            (lambda: c.get_many(["a", "b"]), {}),
            (lambda: c.has_key("k"), False),
            (lambda: c.set("k", 1), None),
            (lambda: c.set_many({"a": 1, "b": 2}), ["a", "b"]),
            (lambda: c.add("k", 1), True),
            (lambda: c.touch("k"), False),
            (lambda: c.delete("k"), False),
            (lambda: c.delete_many(["a"]), None),
            (lambda: c.clear(), False),
            (lambda: c.get_or_set("k", 5), 5),
        ]
        for call, expected in cases:
            reset_cache_resilience()
            with self.subTest(expected=expected), self.assertLogs("core.cache", "WARNING"):
                self.assertEqual(call(), expected)
        for op in (lambda: c.incr("k"), lambda: c.decr("k")):
            reset_cache_resilience()
            with self.assertLogs("core.cache", "WARNING"), self.assertRaises(ValueError):
                op()

    def test_breaker_short_circuits_after_a_failure(self):
        with self.assertLogs("core.cache", "WARNING"):
            self.cache.get("k")
        self.assertTrue(cache_breaker().is_open)
        calls = self.client_stub.calls
        for _ in range(20):
            self.assertIsNone(self.cache.get("k"))
            self.assertTrue(self.cache.add("k", 1))
        self.assertEqual(self.client_stub.calls, calls)  # Redis not touched

    def test_breaker_probes_again_after_the_cooldown(self):
        breaker = cache_breaker()
        now = [1000.0]
        with patch.object(breaker, "_clock", lambda: now[0]):
            with self.assertLogs("core.cache", "WARNING"):
                self.cache.get("k")
            calls = self.client_stub.calls
            now[0] += breaker.cooldown - 0.1
            self.cache.get("k")
            self.assertEqual(self.client_stub.calls, calls)
            now[0] += 0.2
            self.cache.get("k")  # one probe
            self.cache.get("k")  # others keep skipping meanwhile
            self.assertEqual(self.client_stub.calls, calls + 1)

            # Redis is back: the next probe closes the breaker.
            now[0] += breaker.cooldown + 1
            with patch.object(RedisCache, "get", return_value="v"):
                self.assertEqual(self.cache.get("k"), "v")
            self.assertFalse(breaker.is_open)

    def test_failures_are_logged_rate_limited_without_hosts(self):
        with self.assertLogs("core.cache", "WARNING") as logs:
            for _ in range(10):
                cache_breaker().reset()  # always hit Redis
                self.cache.get("k")
        self.assertEqual(len(logs.records), 1)
        self.assertIn("ConnectionError", logs.output[0])
        self.assertNotIn(PLACEHOLDER_HOST, "\n".join(logs.output))
        self.assertEqual(self.client_stub.calls, 10)

    def test_counters_and_generator_budget_degrade(self):
        logging.disable(logging.WARNING)
        try:
            # Coach counters: allowed.
            self.assertTrue(consume_cache_counter("coach_chat:rate_limit:user:1", 1, 60))
            self.assertTrue(consume_cache_counter("coach_chat:rate_limit:user:1", 1, 60))
            # Paid practice generator budget fails closed while degraded.
            self.assertFalse(consume_practice_generator_budget())
        finally:
            logging.disable(logging.NOTSET)


@override_settings(
    CACHES=FAILING_CACHES,
    CHANNEL_LAYERS=FAILING_LAYERS,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_RESET_EMAIL_ASYNC=False,
)
class RedisOutageEndpointTests(TestCase):
    """With both the cache and the channel layer down, requests still work."""

    def setUp(self):
        reset_resilience()
        self.client_stub = install_failing_client(self)
        self.user = make_user(email="outage@example.com", password="old-Passphrase-77")
        self.other = make_user(native_language="greek")
        self.conversation = make_conversation(sender=self.user, receiver=self.other)
        logging.disable(logging.WARNING)

    def tearDown(self):
        logging.disable(logging.NOTSET)
        reset_resilience()

    def test_csrf_endpoint(self):
        response = APIClient().get("/api/csrf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrfToken", response.json())

    def test_login_and_refresh(self):
        client = APIClient()
        response = client.post(
            "/api/token/",
            {"email": "outage@example.com", "password": "old-Passphrase-77"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        refresh = client.post(
            "/api/token/refresh/", {"refresh": response.json()["refresh"]}, format="json"
        )
        self.assertEqual(refresh.status_code, 200, refresh.content)

    def test_wrong_password_is_401_not_500(self):
        response = APIClient().post(
            "/api/token/",
            {"email": "outage@example.com", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_password_reset_request(self):
        response = APIClient().post(
            "/api/auth/password-reset/", {"email": "outage@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_message_send_succeeds_when_broadcast_fails(self):
        client = APIClient()
        client.force_authenticate(self.user)
        url = f"/api/conversations/{self.conversation.id}/messages/"
        with self.captureOnCommitCallbacks(execute=True):
            response = client.post(url, {"text": "Hello during an outage"})
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(Message.objects.filter(text="Hello during an outage").exists())
        self.assertGreaterEqual(FailingChannelLayer.calls, 1)
        self.assertTrue(channel_layer_breaker().is_open)
        # Lists and reads keep working (cache misses).
        self.assertEqual(client.get("/api/conversations/").status_code, 200)
        self.assertEqual(client.get(url).status_code, 200)
        self.assertEqual(client.get("/api/profile/").status_code, 200)
        self.assertEqual(client.get("/api/profile/data").status_code, 200)

    def test_logout_all_succeeds_when_revocation_broadcast_fails(self):
        client = APIClient()
        client.force_authenticate(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            response = client.post("/api/auth/logout-all/")
        self.assertEqual(response.status_code, 200, response.content)

    @patch("chatapp.views.generate_coach_reply", return_value="Bonjour !")
    def test_coach_counters_fail_open(self, _generate):
        client = APIClient()
        client.force_authenticate(self.user)
        for _ in range(3):
            response = client.post("/api/coach/chat/", {"message": "Salut"}, format="json")
            self.assertEqual(response.status_code, 200, response.content)

    @override_settings(
        REST_FRAMEWORK={
            "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
            "DEFAULT_THROTTLE_RATES": {"anon": "1/minute"},
        }
    )
    def test_throttles_allow_requests_while_the_cache_is_down(self):
        for _ in range(3):
            self.assertEqual(APIClient().get("/api/csrf/").status_code, 200)

    def test_health_reports_degraded_with_200(self):
        response = APIClient().get("/api/health/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["checks"]["database"]["status"], "ok")
        self.assertEqual(body["checks"]["cache"]["status"], "error")
        self.assertEqual(body["checks"]["cache"]["breaker"], "open")
        self.assertEqual(body["checks"]["channel_layer"]["status"], "error")
        self.assertNotIn(PLACEHOLDER_HOST, response.content.decode())
        self.assertNotIn("6379", response.content.decode())

    def test_health_probe_bypasses_an_open_breaker(self):
        cache.get("k")  # trips the breaker
        calls = self.client_stub.calls
        APIClient().get("/api/health/")
        self.assertGreater(self.client_stub.calls, calls)


class BroadcastHelperTests(SimpleTestCase):
    def setUp(self):
        reset_resilience()

    def tearDown(self):
        reset_resilience()

    def test_broadcast_swallows_layer_errors_and_short_circuits(self):
        layer = FailingChannelLayer()
        with self.assertLogs("core.realtime", "WARNING") as logs:
            self.assertFalse(broadcast("room", {"type": "x"}, channel_layer=layer))
            for _ in range(5):
                self.assertFalse(broadcast("room", {"type": "x"}, channel_layer=layer))
        self.assertEqual(FailingChannelLayer.calls, 1)
        self.assertEqual(len(logs.records), 1)
        self.assertNotIn(PLACEHOLDER_HOST, logs.output[0])

    def test_broadcast_works_on_a_healthy_layer(self):
        self.assertTrue(broadcast("room", {"type": "x"}, channel_layer=InMemoryChannelLayer()))


ws_application = URLRouter(websocket_urlpatterns)


@override_settings(CACHES=FAILING_CACHES, CHANNEL_LAYERS=FAILING_LAYERS)
class WebsocketOutageTests(TransactionTestCase):
    def setUp(self):
        reset_resilience()
        install_failing_client(self)
        self.alice = make_user(username="alice", email="alice@example.com")
        self.bob = make_user(username="bob", email="bob@example.com")
        self.conversation = make_conversation(sender=self.alice, receiver=self.bob)
        logging.disable(logging.WARNING)

    def tearDown(self):
        logging.disable(logging.NOTSET)
        reset_resilience()

    async def test_sockets_close_with_1011_when_the_channel_layer_is_down(self):
        pair = await database_sync_to_async(issue_token_pair)(self.alice)
        for path in ("/ws/presence/", f"/ws/socket-server/{self.conversation.id}/"):
            communicator = WebsocketCommunicator(
                ws_application,
                path,
                headers=[(b"authorization", f"Bearer {pair['access']}".encode())],
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            output = await communicator.receive_output(timeout=2)
            self.assertEqual(output, {"type": "websocket.close", "code": 1011})
            await communicator.wait()
