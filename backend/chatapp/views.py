from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

import json


@csrf_exempt  # Consider using CSRF tokens instead of disabling CSRF
def login_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            username = data.get("username")
            password = data.get("password")

            if not username or not password:
                return JsonResponse(
                    {"error": "Username and password required"}, status=400
                )

            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                return JsonResponse({"message": "Login successful"}, status=200)
            else:
                return JsonResponse({"error": "Invalid credentials"}, status=400)

        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@csrf_exempt
def register_view(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            username = data.get("username")
            password = data.get("password")

            if not username or not password:
                return JsonResponse(
                    {"error": "Username and password required"}, status=400
                )

            # Check if the username already exists
            if User.objects.filter(username=username).exists():
                return JsonResponse({"error": "Username already exists"}, status=400)

            # Create the new user
            user = User.objects.create_user(username=username, password=password)
            user.save()
            return JsonResponse({"message": "User registered successfully"}, status=201)

        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@csrf_exempt
def profile_view(request):
    if request.method == "GET":
        try:
            user = request.user
            profile_data = {
                "username": user.username,
            }
            return JsonResponse(profile_data, status=200)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
    else:
        return JsonResponse({"error": "Only GET method allowed"}, status=405)


@require_http_methods(["PATCH"])  # PATCH is more appropriate for partial updates
@csrf_exempt
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        user = request.user

        # Update fields if they are present in the request body
        username = data.get("username")
        nativeLanguage = data.get("nativeLanguage")

        # Update only if data is provided; avoid empty fields if validation needed
        if username:
            user.username = username
        if nativeLanguage:
            user.nativeLanguage = nativeLanguage

        # Save the updated user object
        user.save()

        # Return the updated user data
        return JsonResponse(
            {
                "message": "Profile updated successfully",
                "updated_profile": {
                    "username": user.username,
                    "nativeLanguage": user.nativeLanguage,
                },
            },
            status=200,
        )

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON format"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
