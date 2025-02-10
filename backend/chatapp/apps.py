from django.apps import AppConfig
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set


class ChatappConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"

    if env == "local":
        name = "chatapp"
    else:
        name = "backend.chatapp"
