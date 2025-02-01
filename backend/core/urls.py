from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.views.generic.base import RedirectView
from django.http import HttpResponse
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set


def home(request):
    return HttpResponse("Welcome to LangVoyage!")


urlpatterns = [
    path("admin/", admin.site.urls),
]

if env == "local":
    urlpatterns += [
        path("api/", include("chatapp.urls")),
        path("", home),
    ]
else:
    urlpatterns += [
        path("api/", include("backend.chatapp.urls")),
        path("", home),
    ]

# Add media routes during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Keep the redirect at the bottom
urlpatterns += [
    path("", RedirectView.as_view(url="/api/login/", permanent=False)),
]
