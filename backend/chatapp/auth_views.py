from django.http import HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.exceptions import AuthenticationFailed

import logging

logger = logging.getLogger(__name__)


# Custom JWT Token Obtain Pair View
class CustomObtainJWTToken(TokenObtainPairView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        data = request.data
        data["username"] = data["username"].lower()  # Assuming you are using username
        logger.info(
            f"Login attempt with username: {data.get('username')}"
        )  # Log the username

        serializer = TokenObtainPairSerializer(data=data)

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

        return Response({"access": str(access_token), "refresh": str(refresh_token)})


# Custom JWT Token Refresh View
class CustomRefreshJWTToken(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)
