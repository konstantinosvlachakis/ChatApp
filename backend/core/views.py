from django.shortcuts import render


def front(request, checkout_session_id=None, weblid=None, errorType=None):
    context = {}
    return render(request, "index.html", context)
