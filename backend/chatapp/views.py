from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from .models import Token, Profile
import json
import logging


@csrf_exempt
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

            # Retrieve the user from the Profile model
            user = Profile.objects.filter(username=username).first()

            # Check if the user exists and if the password is correct
            if user and user.check_password(password):
                # Create or retrieve the token
                token, _ = Token.objects.get_or_create(user=user)
                return JsonResponse({"token": token.key}, status=200)
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
            print(data)
            username = data.get("username")
            password = data.get("password")
            native_language = data.get(
                "nativeLanguage"
            )  # Get native_language from the request

            if not username or not password or not native_language:
                return JsonResponse(
                    {"error": "Username, password, and native language required"},
                    status=400,
                )

            # Check if the username already exists
            if Profile.objects.filter(
                username=username
            ).exists():  # Change User to Profile
                return JsonResponse({"error": "Username already exists"}, status=400)

            # Create the new user
            user = Profile.objects.create_user(
                username=username, password=password, native_language=native_language
            )
            return JsonResponse({"message": "User registered successfully"}, status=201)

        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({"error": "Only POST method allowed"}, status=405)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user
    profile_data = {
        "username": user.username,
        "native_language": user.native_language,  # Include the native language
        "profile_image_url": user.profile_image_url,  # Include the profile image URL
    }
    return JsonResponse(profile_data, status=200)


logger = logging.getLogger(__name__)


@api_view(["PATCH"])
# @permission_classes([IsAuthenticated])
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        print(data)
        user = request.user

        # Update fields if they are present in the request body
        username = data.get("username")
        native_language = data.get("native_language")
        profile_image_url = data.get(
            "profile_image_url"
        )  # Include profile image URL if necessary

        # Update only if data is provided
        if username:
            user.username = username
        if native_language:
            user.native_language = native_language
        if profile_image_url:
            user.profile_image_url = profile_image_url  # Update profile image URL

        # Save the updated user object
        user.save()

        # Return the updated user data
        return JsonResponse(
            {
                "message": "Profile updated successfully",
                "updated_profile": {
                    "username": user.username,
                    "native_language": user.native_language,
                    "profile_image_url": user.profile_image_url,
                },
            },
            status=200,
        )

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON format"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
