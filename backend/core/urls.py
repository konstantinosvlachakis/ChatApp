from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse


def home(request):
    return HttpResponse("Welcome to LangVoyage!")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("backend.chatapp.urls")),  # Include your app URLs here
    path("", home, name="home"),  # Add this line for the root path
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
