from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.views.generic.base import RedirectView


def home(request):
    return HttpResponse("Welcome to LangVoyage!")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("backend.chatapp.urls")),  # Include your app URLs here
    path(
        "", RedirectView.as_view(url="/api/login/", permanent=False)
    ),  # Redirect root to the login page
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
