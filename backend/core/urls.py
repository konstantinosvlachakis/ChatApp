from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include, re_path
from django.views.static import serve
from .views import api_not_found, csrf, front, health
from pathlib import Path


FRONTEND_BUILD_DIR = Path(settings.TEMPLATES[0]["DIRS"][0])


urlpatterns = [
    # No Django admin: Profile has no is_staff, so /admin/ was only an
    # unthrottled password oracle. /admin/ now falls through to the SPA.
    path("api/csrf/", csrf, name="csrf"),
    path("api/health/", health, name="health"),
    path("api/", include("chatapp.urls")),
    # Unknown API paths get a JSON 404 instead of falling through to the SPA.
    re_path(r"^api(?:/.*)?$", api_not_found, name="api_not_found"),
    re_path(
        r"^(?P<path>(?:favicon\.ico|manifest\.json|robots\.txt|sitemap\.xml|logo192\.png|logo512\.png|og-image\.png|coach-avatar-favicon\.svg))$",
        serve,
        {"document_root": str(FRONTEND_BUILD_DIR)},
    ),
]

# Serve media files from local disk only when they are stored there. With Cloudinary
# as the default storage, media URLs point straight at Cloudinary (storage.url()),
# so the app never streams uploads through the ASGI workers.
uses_local_media_storage = "cloudinary" not in settings.STORAGES["default"]["BACKEND"].lower()
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif uses_local_media_storage:
    urlpatterns += [
        re_path(
            r"^media/(?P<path>.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]

# Serve React frontend for all other routes (development and production).
# Non-GET/HEAD requests to these paths get 405 (see views.front).
urlpatterns += [
    re_path(r"^.*$", front, name="home"),
]

handler500 = "core.views.server_error"
