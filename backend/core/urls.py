from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.views.generic.base import RedirectView
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set

urlpatterns = [
    path("admin/", admin.site.urls),
]

if env == "local":
    urlpatterns += [
        path("api/", include("chatapp.urls")),
    ]
else:
    urlpatterns += [
        path("api/", include("backend.chatapp.urls")),
    ]

# Add media routes during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Redirect home to login
urlpatterns += [
    path("", RedirectView.as_view(url="/api/login/", permanent=False)),
]
