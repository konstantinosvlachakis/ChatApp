from django.urls import re_path
from backend.chatapp.consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r"ws/socket-server/(?P<room_name>\w+)/$", ChatConsumer.as_asgi()),
]
