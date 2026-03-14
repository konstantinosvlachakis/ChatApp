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
    path("profile/delete/", delete_account_view, name="delete_account"),
    path("profile/moderation/", moderation_summary_view, name="moderation_summary"),
    path("presence/offline/", mark_presence_offline_view, name="presence_offline"),
    path("coach/chat/", coach_chat_view, name="coach_chat"),
    path("profile/data", profile_data_view, name="profile_data"),
    path("profile/public/<str:username>/", public_profile_view, name="public_profile"),
    path("profile/public/<str:username>/block/", block_user_view, name="block_user"),
    path("profile/public/<str:username>/report/", report_user_view, name="report_user"),
    path("profile/edit/", profile_edit_view, name="profile_edit"),
    path("profile/location/", profile_location_update_view, name="profile_location_update"),
    path(
        "profile/<int:user_id>/update-image/",
        update_profile_image,
        name="update_profile_image",
    ),
    # Conversations
    path("conversations/", ConversationListView.as_view(), name="conversation_list"),
    path(
        "conversations/<int:conversation_id>/",
        ConversationDetailView.as_view(),
        name="conversation_list",
    ),
    path(
        "conversations/<int:conversation_id>/messages/",
        MessageListView.as_view(),
        name="conversation_messages",  # Send and receive messages
    ),
    path(
        "conversations/<int:conversation_id>/read/",
        mark_conversation_read_view,
        name="mark_conversation_read",
    ),
    path(
        "messages/<int:message_id>/delete/",
        MessageDeleteView.as_view(),
        name="delete_message",  # Delete a specific message
    ),
    path("messages/translate/", translate_message_view, name="translate_message"),
    path(
        "messages/<int:message_id>/react/",
        react_to_message_view,
        name="react_to_message",
    ),
    path("practice/state/", practice_state_view, name="practice_state"),
    path("practice/challenge/", practice_challenge_view, name="practice_challenge"),
    path("practice/submit/", practice_submit_view, name="practice_submit"),
]
websocket_urlpatterns = [
    path(
        "ws/socket-server/<int:conversation_id>/", consumers.ChatConsumer.as_asgi()
    ),  # Match the client-side URL
    path("ws/presence/", consumers.PresenceConsumer.as_asgi()),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
