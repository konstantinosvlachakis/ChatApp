from django.urls import re_path
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set
if env == "local":
    from chatapp.consumers import ChatConsumer
else:
    from backend.chatapp.consumers import ChatConsumer


websocket_urlpatterns = [
    re_path(r"ws/socket-server/(?P<room_name>\w+)/$", ChatConsumer.as_asgi()),
]
