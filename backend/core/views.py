from pathlib import Path
from django.conf import settings
from django.shortcuts import render
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from django.http import JsonResponse
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny

FRONTEND_BUILD_DIR = Path(settings.TEMPLATES[0]["DIRS"][0])


def resolve_frontend_template(request_path):
    normalized = request_path.strip("/")
    if not normalized:
        return "index.html"

    candidate = FRONTEND_BUILD_DIR / normalized / "index.html"
    if candidate.is_file():
        return f"{normalized}/index.html"

    return "index.html"


def front(request, checkout_session_id=None, weblid=None, errorType=None):
    context = {}
    return render(request, resolve_frontend_template(request.path), context)


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})
