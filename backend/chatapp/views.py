from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from .models import Token, Profile
import json
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Conversation, Message
from .serializers import MessageSerializer
from rest_framework.permissions import AllowAny
from .serializers import ConversationSerializer
from rest_framework.parsers import QueryDict

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
            # Extract data from request
            username = data.get("username")
            password = data.get("password")
            native_language = data.get("nativeLanguage")
            email = data.get("email")
            date_of_birth = data.get("dateOfBirth")

            # Validate required fields
            if not username or not password or not native_language or not email:
                return JsonResponse(
                    {"error": "Username, password, native language, and email are required"},
                    status=400,
                )

            # Check if the username already exists
            if Profile.objects.filter(username=username).exists():
                return JsonResponse({"error": "Username already exists"}, status=400)

            # Check if the email already exists
            if Profile.objects.filter(email=email).exists():
                return JsonResponse({"error": "Email already exists"}, status=400)

            # Create the new user
            user = Profile.objects.create_user(
                username=username,
                password=password,
                native_language=native_language,
                email=email,
                date_of_birth=date_of_birth,
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
        "user_id": user.id,
        "username": user.username,
        "native_language": user.native_language,  # Include the native language
        "profile_image_url": user.profile_image_url,  # Include the profile image URL
        "date_of_birth": user.date_of_birth,  # Include the date of birth
        "email": user.email,  # Include the email
        
    }
    return JsonResponse(profile_data, status=200)



@api_view(["PATCH"])
# @permission_classes([IsAuthenticated])
def profile_edit_view(request):
    try:
        data = json.loads(request.body)  # Parse the JSON request body
        user = request.user

        # Update fields if they are present in the request body
        username = data.get("username")
        print(username)
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




class MessageListView(APIView):
    def get(self, request, conversation_id):
        # Debug: Print authorization header for troubleshooting
        print(f"Authorization Header: {request.headers.get('Authorization')}")
        
        # Fetch conversation where the user is either the sender or receiver
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            sender=request.user
        )
        
        # Fetch all messages in the conversation
        messages = conversation.messages.all()
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request, conversation_id):
        # If request.data is a QueryDict, convert it to a dictionary
        print(request.user)
        print(request.user.id)

        # Fetch conversation where the user is the sender
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            
        )

        # Get the message text from the request body
        text = request.data.get("text", "")
        if not text:
            return Response(
                {"error": "Message content is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create a new message
        message = Message.objects.create(
            conversation=conversation,
            text=text,
            sender=request.user
        )

        # Serialize and return the new message
        serializer = MessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class MessageDeleteView(APIView):
    def delete(self, request, message_id):
        message = get_object_or_404(Message, id=message_id, sender=request.user)
        message.delete()
        return Response({"message": "Message deleted successfully"}, status=status.HTTP_200_OK)
    
class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.all()
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)