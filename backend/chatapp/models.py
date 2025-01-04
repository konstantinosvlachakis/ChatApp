from django.db import models
import uuid
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager


class ProfileManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        """Creates and returns a user with an encrypted password."""
        if not username:
            raise ValueError("The Username must be set")
        user = self.model(username=username, **extra_fields)
        user.set_password(password)  # Hash the password before saving
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        """Creates and returns a superuser with an encrypted password."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        # Create a superuser by calling the create_user method
        return self.create_user(username, password, **extra_fields)


class Profile(AbstractBaseUser):
    username = models.CharField(max_length=30, unique=True)
    email = models.EmailField(max_length=255, unique=True, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    native_language = models.CharField(max_length=255, blank=False)
    profile_image_url = models.CharField(max_length=255, blank=True, null=True)
    password = models.CharField(max_length=128, blank=True, null=True)

    # Define the manager for the Profile model
    objects = ProfileManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.username


class Token(models.Model):
    user = models.OneToOneField(
        Profile, on_delete=models.CASCADE
    )  # Link to Profile, ensuring each Profile can have one Token
    key = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return str(self.key)


class CustomTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token_key = request.headers.get("Authorization")
        if not token_key:
            return None  # No token in request

        # Strip the prefix 'Token ' if provided
        if token_key.startswith("Token "):
            token_key = token_key[6:]

        try:
            token = Token.objects.get(key=token_key)
            return (
                token.user,  # This should be a Profile instance now
                token,
            )
        except Token.DoesNotExist:
            raise AuthenticationFailed("Invalid or expired token")
