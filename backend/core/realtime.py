"""Best-effort channel-layer calls.

Broadcasts are side effects: a Redis channel-layer outage must not fail the
HTTP request that triggered them (sending a message, a password reset, ...)
or crash a consumer mid-disconnect (which would leave presence stuck online).
These helpers bound each call with a timeout, swallow and log (rate-limited,
exception class only) failures, and share a per-process circuit breaker so an
outage costs one timeout per cooldown instead of one per broadcast.

Websocket connects still fail during an outage (``safe_group_add`` returns
False and the consumer closes with 1011); clients reconnect with backoff.
"""

import asyncio
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings

from .resilience import CircuitBreaker, RateLimitedLogger

logger = logging.getLogger(__name__)

CHANNEL_LAYER_TIMEOUT_SECONDS = float(
    getattr(settings, "CHANNEL_LAYER_TIMEOUT_SECONDS", 2.0)
)

_breaker = CircuitBreaker(getattr(settings, "CHANNEL_LAYER_BREAKER_COOLDOWN_SECONDS", 5.0))
_failure_log = RateLimitedLogger(
    logger, getattr(settings, "CACHE_FAILURE_LOG_INTERVAL_SECONDS", 60.0)
)


def channel_layer_breaker():
    return _breaker


def reset_channel_layer_resilience():
    _breaker.reset()
    _failure_log.reset()


async def _guarded(operation, call):
    if not _breaker.allow():
        return False
    try:
        await asyncio.wait_for(call(), timeout=CHANNEL_LAYER_TIMEOUT_SECONDS)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - best effort, never propagate
        _breaker.record_failure()
        _failure_log.warning(
            "channel_layer",
            "Channel layer unavailable (%s in %s); skipped for %ss",
            type(exc).__name__,
            operation,
            _breaker.cooldown,
        )
        return False
    if _breaker.record_success():
        logger.info("Channel layer reachable again; circuit breaker closed")
    return True


async def safe_group_send(channel_layer, group, message):
    """group_send that never raises; True if it was sent."""
    if channel_layer is None:
        return False
    return await _guarded(
        "group_send", lambda: channel_layer.group_send(group, message)
    )


async def safe_group_add(channel_layer, group, channel_name):
    if channel_layer is None:
        return False
    return await _guarded(
        "group_add", lambda: channel_layer.group_add(group, channel_name)
    )


async def safe_group_discard(channel_layer, group, channel_name):
    if channel_layer is None:
        return False
    return await _guarded(
        "group_discard", lambda: channel_layer.group_discard(group, channel_name)
    )


def broadcast(group, message, channel_layer=None):
    """Sync group_send for views/signals; never raises. True if sent."""
    channel_layer = channel_layer or get_channel_layer()
    if channel_layer is None:
        return False
    return async_to_sync(safe_group_send)(channel_layer, group, message)


def probe_channel_layer(channel_layer=None):
    """Health check: one cheap round trip (a no-op group_discard), bypassing
    the breaker. Raises on failure; a success closes the breaker."""
    channel_layer = channel_layer or get_channel_layer()
    if channel_layer is None:
        raise RuntimeError("no channel layer configured")

    async def run():
        await asyncio.wait_for(
            channel_layer.group_discard("health-probe", "health-probe.none"),
            timeout=CHANNEL_LAYER_TIMEOUT_SECONDS,
        )

    try:
        async_to_sync(run)()
    except Exception:
        _breaker.record_failure()
        raise
    _breaker.record_success()
