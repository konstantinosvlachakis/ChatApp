"""
ASGI config for mywebsite project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.0/howto/deployment/asgi/
"""

import os
import sys
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

# Ensure the `backend` directory is in the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set the default settings module for the 'backend' project
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Import routing after setting the environment to avoid circular imports
import chatapp.routing

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(
            URLRouter(chatapp.routing.websocket_urlpatterns)
        ),
    }
)
