from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.exceptions import AuthenticationFailed
from datetime import timedelta

import logging

logger = logging.getLogger(__name__)


# Custom JWT Token Obtain Pair View
class CustomObtainJWTToken(TokenObtainPairView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        data = request.data
        data["email"] = data["email"].lower()  # Assuming you are using email
        remember_me = str(data.get("remember_me", "")).lower() in ("1", "true", "yes", "on")
        serializer_data = {
            "email": data.get("email"),
            "password": data.get("password"),
        }
        logger.info(f"Login attempt with email: {data.get('email')}")  # Log the email

        serializer = TokenObtainPairSerializer(data=serializer_data)

        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            return Response(
                {
                    "message": "No active account found with the given credentials",
                    "code": "no_active_account",
                },
                status=401,
            )

        access_token = serializer.validated_data["access"]
        refresh_token = serializer.validated_data["refresh"]

        # For remembered sessions, extend refresh token lifetime.
        if remember_me:
            refresh_token_obj = RefreshToken(refresh_token)
            refresh_token_obj.set_exp(lifetime=timedelta(days=30))
            refresh_token = str(refresh_token_obj)
            access_token = str(refresh_token_obj.access_token)

        return Response({"access": str(access_token), "refresh": str(refresh_token)})


# Custom JWT Token Refresh View
class CustomRefreshJWTToken(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)
