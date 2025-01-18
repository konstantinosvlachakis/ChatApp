from django.urls import path
from .views import *
from .auth_views import CustomObtainJWTToken, CustomRefreshJWTToken
from django.conf import settings
from django.conf.urls.static import static
from . import consumers

urlpatterns = [
    # Authentication
    path("token/", CustomObtainJWTToken.as_view(), name="token_obtain_pair"),
    path("token/refresh/", CustomRefreshJWTToken.as_view(), name="token_refresh"),
    path("login/", login_view, name="login"),
    path("register/", register_view, name="register"),
    
    # Profile
    path("profile/", profile_view, name="profile"),
    path("profile/edit/", profile_edit_view, name="profile_edit"),
    path('profile/<int:user_id>/update-image/', update_profile_image, name='update_profile_image'),

    # Conversations
    path("conversations/", ConversationListView.as_view(), name="conversation_list"),

    path(
        "conversations/<int:conversation_id>/messages/", 
        MessageListView.as_view(), 
        name="conversation_messages"  # Send and receive messages
    ),
    path(
        "messages/<int:message_id>/delete/",
        MessageDeleteView.as_view(),
        name="delete_message"  # Delete a specific message
    ),

]
websocket_urlpatterns = [
    path('ws/socket-server/<int:conversation_id>/', consumers.ChatConsumer.as_asgi()),  # Match the client-side URL
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)