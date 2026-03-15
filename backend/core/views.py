from django.shortcuts import render
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from django.http import JsonResponse
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny


def front(request, checkout_session_id=None, weblid=None, errorType=None):
    context = {}
    return render(request, "index.html", context)


@api_view(("GET",))
@authentication_classes([])
@permission_classes([AllowAny])
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})
