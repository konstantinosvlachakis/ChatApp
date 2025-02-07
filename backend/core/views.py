from django.shortcuts import render
from rest_framework.decorators import api_view
from django.http import JsonResponse
from django.middleware.csrf import get_token


def front(request, checkout_session_id=None, weblid=None, errorType=None):
    context = {}
    return render(request, "index.html", context)


@api_view(("GET",))
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})
