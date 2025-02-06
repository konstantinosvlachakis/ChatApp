from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import RedirectView, TemplateView
import os

env = os.getenv("DJANGO_ENV", "local")  # Default to "local" if not set

urlpatterns = [
    path("admin/", admin.site.urls),
]

# Include API routes
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

# Serve React frontend
urlpatterns += [
    # Serve React index.html for any route not matched above
    re_path(r"^.*$", TemplateView.as_view(template_name="index.html"), name="home"),
]
