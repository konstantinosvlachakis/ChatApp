from django.db import models
import uuid
from django.utils import timezone
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

        return self.create_user(username, password, **extra_fields)


class Profile(AbstractBaseUser):
    username = models.CharField(max_length=30, unique=True, db_index=True)
    email = models.EmailField(max_length=255, unique=True, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    native_language = models.CharField(max_length=255, blank=False)
    profile_image_url = models.CharField(
        max_length=255, blank=False, default="media/profile_images/MainAfter.jpg"
    )
    password = models.CharField(max_length=128, blank=True, null=True)

    # Manager for the Profile model
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

        if token_key.startswith("Token "):
            token_key = token_key[6:]

        try:
            token = Token.objects.get(key=token_key)
            return (
                token.user,
                token,
            )
        except Token.DoesNotExist:
            raise AuthenticationFailed("Invalid or expired token")


# Messaging Models
class Conversation(models.Model):
    sender = models.ForeignKey(
        Profile, related_name="sent_conversations", on_delete=models.CASCADE
    )
    receiver = models.ForeignKey(
        Profile,
        related_name="received_conversations",
        on_delete=models.CASCADE,
        default=1,  # Temporarily use the primary key (e.g., ID of Alma)
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Set the receiver to Alma by default
        if not self.receiver:
            self.receiver = Profile.objects.get(username="Alma")
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"Conversation between {self.sender.username} and {self.receiver.username}"
        )


class Message(models.Model):
    MESSAGE_STATUSES = [
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("read", "Read"),
    ]

    conversation = models.ForeignKey(
        Conversation, related_name="messages", on_delete=models.CASCADE
    )
    sender = models.ForeignKey(
        Profile, related_name="sent_messages", on_delete=models.CASCADE
    )
    text = models.TextField()
    attachment = models.FileField(
        upload_to="attachments/", blank=True, null=True
    )  # File uploads

    status = models.CharField(max_length=10, choices=MESSAGE_STATUSES, default="sent")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    def save(self, *args, **kwargs):
        # Update the conversation's updated_at field when a message is created
        self.conversation.updated_at = timezone.now()
        self.conversation.save()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Message by {self.sender.username} in {self.conversation.id}"
