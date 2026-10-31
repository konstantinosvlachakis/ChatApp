import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


def warn_if_rate_limits_are_per_process(settings):
    """Throttles, the login lockout, coach budgets and websocket caps live in the
    default cache. Without Redis that is a per-process LocMemCache, so every
    limit is multiplied by the number of processes (dynos x workers)."""
    if getattr(settings, "ENVIRONMENT", "local") != "production":
        return False
    backend = str((settings.CACHES.get("default") or {}).get("BACKEND", ""))
    if "locmem" not in backend.lower():
        return False
    logger.warning(
        "Rate limits use a per-process LocMemCache (no Redis cache configured): "
        "each limit applies per process, not globally. Set USE_REDIS_REALTIME=true "
        "with a Redis URL in production."
    )
    return True


class ChatappConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "chatapp"

    def ready(self):
        from django.conf import settings

        warn_if_rate_limits_are_per_process(settings)
