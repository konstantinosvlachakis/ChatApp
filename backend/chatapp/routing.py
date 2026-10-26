from django.urls import path, re_path

from .consumers import ChatConsumer, PresenceConsumer


websocket_urlpatterns = [
    path("ws/presence/", PresenceConsumer.as_asgi()),
    re_path(r"ws/socket-server/(?P<room_name>[^/]+)/$", ChatConsumer.as_asgi()),
]
