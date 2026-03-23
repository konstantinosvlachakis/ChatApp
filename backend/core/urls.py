from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from .views import csrf, front


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/csrf/", csrf, name="csrf"),
    path("api/", include("chatapp.urls")),
]

# Serve media files.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += [
        re_path(
            r"^media/(?P<path>.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]

# Serve React frontend for all other routes (development and production)
urlpatterns += [
    re_path(r"^.*$", front, name="home"),
]
