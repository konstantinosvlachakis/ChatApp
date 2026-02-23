from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import TemplateView


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("chatapp.urls")),
]

# Serve media files (Heroku has no separate media server configured).
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve React frontend for all other routes (development and production)
urlpatterns += [
    re_path(r"^.*$", TemplateView.as_view(template_name="index.html"), name="home"),
]
