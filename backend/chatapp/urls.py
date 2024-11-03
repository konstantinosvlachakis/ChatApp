from django.urls import path
from .views import login_view, register_view, profile_view, profile_edit_view

urlpatterns = [
    path("login/", login_view, name="login"),
    path("register/", register_view, name="register"),
    path("profile/", profile_view, name="profile"),
    path(
        "profile/edit/", profile_edit_view, name="profile_edit"
    ),  # Added trailing slash
]
