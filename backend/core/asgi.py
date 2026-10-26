"""
ASGI config for mywebsite project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.0/howto/deployment/asgi/
"""

import os
import sys

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

# Ensure the `backend` directory is in the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set the default settings module for the 'backend' project
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Initialize Django before importing modules that rely on the app registry.
django_asgi_app = get_asgi_application()

from chatapp.routing import websocket_urlpatterns

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Consumers authenticate the JWT themselves and never read
        # scope["user"]/scope["session"], so no session/auth middleware (which
        # would cost a session + user lookup on every handshake).
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
