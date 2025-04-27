from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import TemplateView
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set
api_prefix = "backend.chatapp.urls" if env != "local" else "chatapp.urls"


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api_prefix)),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve React frontend for all other routes (development and production)
urlpatterns += [
    re_path(r"^.*$", TemplateView.as_view(template_name="index.html"), name="home"),
]
