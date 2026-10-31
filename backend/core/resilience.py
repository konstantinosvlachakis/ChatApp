"""Small building blocks for failing open on Redis outages.

- ``CircuitBreaker``: after a failure, skip the dependency for ``cooldown``
  seconds so requests don't each wait for a connect timeout; after the
  cooldown one caller probes it again (the others keep skipping meanwhile).
- ``RateLimitedLogger``: at most one WARNING per key per ``interval`` seconds
  (per process), with a count of the failures it suppressed in between.

Both are per process and thread-safe. Messages must never contain hosts,
URLs or exception text: callers pass the exception class name only.
"""

import logging
import threading
import time


class CircuitBreaker:
    def __init__(self, cooldown_seconds, clock=time.monotonic):
        self.cooldown = float(cooldown_seconds)
        self._clock = clock
        self._lock = threading.Lock()
        self._open_until = 0.0
        self._tripped = False

    @property
    def is_open(self):
        """True while tripped (including the probe window after the cooldown)."""
        return self._tripped

    def allow(self):
        """May the caller use the dependency now?"""
        if not self._tripped:
            return True
        with self._lock:
            if not self._tripped:
                return True
            now = self._clock()
            if now < self._open_until:
                return False
            # Cooldown over: let this caller probe, keep the others out until
            # it reports back (or another cooldown passes).
            self._open_until = now + self.cooldown
            return True

    def record_failure(self):
        """Trip the breaker. Returns True if it was closed before."""
        with self._lock:
            was_closed = not self._tripped
            self._tripped = True
            self._open_until = self._clock() + self.cooldown
            return was_closed

    def record_success(self):
        """Close the breaker. Returns True if it was open before."""
        if not self._tripped:
            return False
        with self._lock:
            was_open = self._tripped
            self._tripped = False
            self._open_until = 0.0
            return was_open

    def reset(self):
        with self._lock:
            self._tripped = False
            self._open_until = 0.0


class RateLimitedLogger:
    def __init__(self, logger, interval_seconds=60.0, clock=time.monotonic):
        self.logger = logger
        self.interval = float(interval_seconds)
        self._clock = clock
        self._lock = threading.Lock()
        self._last = {}
        self._suppressed = {}

    def warning(self, key, message, *args):
        """Log ``message % args`` (+ suppressed count) unless ``key`` logged recently."""
        with self._lock:
            now = self._clock()
            last = self._last.get(key)
            if last is not None and now - last < self.interval:
                self._suppressed[key] = self._suppressed.get(key, 0) + 1
                return False
            suppressed = self._suppressed.pop(key, 0)
            self._last[key] = now
        if suppressed:
            message = f"{message} ({suppressed} similar failures suppressed)"
        self.logger.warning(message, *args)
        return True

    def reset(self):
        with self._lock:
            self._last.clear()
            self._suppressed.clear()


resilience_logger = logging.getLogger("core.resilience")
