"""Redis cache backend that fails open.

A Redis outage must never turn into 500s: throttles, the login lockout,
coach/practice counters, websocket socket caps and the list/profile caches all
read through ``django.core.cache.cache``. ``ResilientRedisCache`` catches
``redis.exceptions.RedisError`` and ``OSError`` in every operation and returns
the operation's "miss / no-op" result, so every caller degrades to
"allowed / uncached":

=================  ====================================================
``get``            ``default`` (cache miss; DRF throttles see no history)
``get_many``       ``{}``
``has_key``        ``False``
``set``            ``None`` (nothing stored)
``set_many``       the keys (Django's "failed keys" list)
``add``            ``True`` ("added": locks count as acquired, the
                   ``practice:scored`` guard lets the submit score, counters
                   then hit ``incr``)
``incr``/``decr``  ``ValueError`` (Django's "missing key"; every counter
                   caller handles it by opening a new window = allowed)
``touch``          ``False``
``delete``         ``False``
``delete_many``    ``None``
``clear``          ``False``
=================  ====================================================

A failure trips a per-process circuit breaker (``CACHE_BREAKER_COOLDOWN_SECONDS``,
default 5 s): while it is open, operations return the fallback at once
instead of waiting for the socket timeout; after the cooldown one call probes
Redis again. Failures are logged at WARNING at most once a minute per process
(``CACHE_FAILURE_LOG_INTERVAL_SECONDS``), with the exception class only.

``cache_degraded()`` lets callers whose fail-open would cost money (the
practice generator's daily budget) fail closed instead.
"""

import logging
import uuid

from django.conf import settings
from django.core.cache import caches
from django.core.cache.backends.base import DEFAULT_TIMEOUT
from django.core.cache.backends.redis import RedisCache

from .resilience import CircuitBreaker, RateLimitedLogger

try:  # redis is installed with channels_redis; keep imports safe without it.
    from redis.exceptions import RedisError
except ImportError:  # pragma: no cover
    RedisError = OSError

logger = logging.getLogger(__name__)

CACHE_ERRORS = (RedisError, OSError)

_breaker = CircuitBreaker(
    getattr(settings, "CACHE_BREAKER_COOLDOWN_SECONDS", 5.0)
)
_failure_log = RateLimitedLogger(
    logger, getattr(settings, "CACHE_FAILURE_LOG_INTERVAL_SECONDS", 60.0)
)

_MISSING = object()


def cache_breaker():
    """The process-wide cache breaker (one Redis cache per process)."""
    return _breaker


def reset_cache_resilience():
    """Close the breaker and forget log rate limits (tests)."""
    _breaker.reset()
    _failure_log.reset()


def cache_degraded():
    """True while the cache breaker is open (Redis recently failed)."""
    return _breaker.is_open


class ResilientRedisCache(RedisCache):
    def _run(self, operation, fallback, *args, **kwargs):
        if not _breaker.allow():
            return fallback()
        try:
            result = getattr(super(), operation)(*args, **kwargs)
        except CACHE_ERRORS as exc:
            _breaker.record_failure()
            _failure_log.warning(
                "cache",
                "Cache unavailable (%s in %s); failing open, Redis skipped for %ss",
                type(exc).__name__,
                operation,
                _breaker.cooldown,
            )
            return fallback()
        if _breaker.record_success():
            logger.info("Cache reachable again; circuit breaker closed")
        return result

    def get(self, key, default=None, version=None):
        return self._run("get", lambda: default, key, default=default, version=version)

    def get_many(self, keys, version=None):
        return self._run("get_many", dict, keys, version=version)

    def has_key(self, key, version=None):
        return self._run("has_key", lambda: False, key, version=version)

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        return self._run(
            "set", lambda: None, key, value, timeout=timeout, version=version
        )

    def set_many(self, data, timeout=DEFAULT_TIMEOUT, version=None):
        return self._run(
            "set_many", lambda: list(data or ()), data, timeout=timeout, version=version
        )

    def add(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        return self._run(
            "add", lambda: True, key, value, timeout=timeout, version=version
        )

    def incr(self, key, delta=1, version=None):
        def missing():
            raise ValueError("Key '%s' not found (cache unavailable)" % key)

        return self._run("incr", missing, key, delta=delta, version=version)

    # decr: BaseCache.decr calls self.incr(key, -delta), which is guarded.

    def touch(self, key, timeout=DEFAULT_TIMEOUT, version=None):
        return self._run("touch", lambda: False, key, timeout=timeout, version=version)

    def delete(self, key, version=None):
        return self._run("delete", lambda: False, key, version=version)

    def delete_many(self, keys, version=None):
        return self._run("delete_many", lambda: None, keys, version=version)

    def clear(self):
        return self._run("clear", lambda: False)

    def probe(self):
        """Health check: one real set/get/delete round trip, bypassing the
        breaker. Raises on failure; a success closes the breaker."""
        key = f"health:check:{uuid.uuid4().hex}"
        try:
            RedisCache.set(self, key, "1", timeout=10)
            value = RedisCache.get(self, key)
            RedisCache.delete(self, key)
        except CACHE_ERRORS:
            _breaker.record_failure()
            raise
        if value != "1":
            raise RuntimeError("cache round-trip mismatch")
        _breaker.record_success()


def probe_cache(cache=None):
    """Round-trip the cache (health check). Raises on failure."""
    # caches[...] is the real backend (django.core.cache.cache is a proxy).
    cache = cache or caches["default"]
    if isinstance(cache, ResilientRedisCache):
        cache.probe()
        return
    key = f"health:check:{uuid.uuid4().hex}"
    cache.set(key, "1", timeout=10)
    try:
        if cache.get(key) != "1":
            raise RuntimeError("cache round-trip mismatch")
    finally:
        cache.delete(key)
