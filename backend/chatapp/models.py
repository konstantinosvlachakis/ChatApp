from django.db import models
from django.db.models import Q
from django.db.models.functions import Upper
from django.utils import timezone
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.conf import settings


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
        """Used by `manage.py createsuperuser`.

        Profile has no is_staff / is_superuser fields, so this creates a regular
        account (the Django admin is not supported). It used to pass those
        flags to the model and crash.
        """
        if extra_fields.get("email"):
            extra_fields["email"] = extra_fields["email"].strip().lower()
        return self.create_user(username, password, **extra_fields)


class Profile(AbstractBaseUser):
    username = models.CharField(max_length=30, unique=True, db_index=True)
    email = models.EmailField(max_length=255, unique=True, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    native_language = models.CharField(max_length=255, blank=False)
    base_translate_language = models.CharField(max_length=50, default="english")
    languages_practicing = models.JSONField(default=list, blank=True)
    practice_language_levels = models.JSONField(default=dict, blank=True)
    bio = models.TextField(blank=True, default="")
    learning_goal = models.TextField(blank=True, default="")
    location = models.CharField(max_length=255, blank=True, default="")
    location_updated_at = models.DateTimeField(null=True, blank=True)
    profile_image_url = models.CharField(
        max_length=255, blank=False, default="profile_images/MainAfter.jpg"
    )
    complementary_image_1_url = models.CharField(max_length=255, blank=True, default="")
    complementary_image_2_url = models.CharField(max_length=255, blank=True, default="")
    avatar_ring_palette = models.CharField(
        max_length=20,
        choices=[
            ("teal", "Teal"),
            ("blush", "Blush"),
            ("gold", "Gold"),
            ("lavender", "Lavender"),
            ("slate", "Slate"),
        ],
        null=True,
        blank=True,
        default=None,
    )
    avatar_ring_color = models.CharField(max_length=7, default="#1b7f79")
    password = models.CharField(max_length=128, blank=True, null=True)
    is_online = models.BooleanField(default=False, db_index=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    ws_connection_count = models.PositiveIntegerField(default=0)
    # Embedded as the "tv" claim in every JWT (chatapp/tokens.py); bumping it
    # revokes all of the user's access and refresh tokens.
    token_version = models.PositiveIntegerField(default=0)
    # Set when the user proves control of ``email`` (6-digit code or link,
    # chatapp/email_verification.py); cleared when the email changes. New
    # accounts start unverified and can't message people or use the coach.
    email_verified_at = models.DateTimeField(null=True, blank=True)

    objects = ProfileManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        indexes = [
            # Case-insensitive username lookups (username__iexact).
            models.Index(Upper("username"), name="profile_username_upper_idx"),
        ]

    @property
    def age(self):
        """Dynamically compute age from date_of_birth."""
        today = timezone.now().date()
        if self.date_of_birth:
            return (
                today.year
                - self.date_of_birth.year
                - (
                    (today.month, today.day)
                    < (self.date_of_birth.month, self.date_of_birth.day)
                )
            )
        return None

    @property
    def email_verified(self):
        return self.email_verified_at is not None


class EmailVerificationCode(models.Model):
    """The current email verification code of a user (at most one).

    Only an HMAC of the code is stored, bound to the address it was sent to,
    so a code mailed to an old address can't verify a new one. Kept in the
    database (not the cache) so codes survive Redis outages.
    """

    user = models.OneToOneField(
        Profile, on_delete=models.CASCADE, related_name="email_verification_code"
    )
    email = models.EmailField(max_length=255)
    code_hash = models.CharField(max_length=64)
    send_history = models.JSONField(default=list, blank=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)


class PracticeStats(models.Model):
    user = models.OneToOneField(
        Profile, related_name="practice_stats", on_delete=models.CASCADE
    )
    points = models.PositiveIntegerField(default=0)
    xp = models.PositiveIntegerField(default=0)
    level = models.PositiveIntegerField(default=1)
    correct_answers = models.PositiveIntegerField(default=0)
    total_answers = models.PositiveIntegerField(default=0)
    preferred_language = models.CharField(max_length=50, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["-points"], name="pstats_points_idx"),
        ]

    def __str__(self):
        return f"PracticeStats(user={self.user_id}, points={self.points}, level={self.level})"


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
            self.receiver = Profile.objects.get(username="alma")
        super().save(*args, **kwargs)

    class Meta:
        indexes = [
            # Conversation list: WHERE sender = u OR receiver = u ORDER BY -updated_at
            models.Index(fields=["sender", "-updated_at"], name="conv_sender_upd_idx"),
            models.Index(
                fields=["receiver", "-updated_at"], name="conv_receiver_upd_idx"
            ),
        ]

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
    reply_to = models.ForeignKey(
        "self",
        related_name="replies",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    text = models.TextField()
    attachment = models.FileField(
        upload_to="attachments/", blank=True, null=True
    )  # File uploads

    status = models.CharField(max_length=10, choices=MESSAGE_STATUSES, default="sent")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    pinned_at = models.DateTimeField(blank=True, null=True, db_index=True)
    pinned_by = models.ForeignKey(
        Profile,
        related_name="pinned_messages",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            # Only a new message moves the conversation to the top of the list;
            # edits, pins and status changes must not reorder it.
            now = timezone.now()
            Conversation.objects.filter(pk=self.conversation_id).update(
                updated_at=now
            )
            if Message.conversation.is_cached(self):
                self.conversation.updated_at = now

    class Meta:
        indexes = [
            # Message pages and last-message lookups per conversation.
            models.Index(
                fields=["conversation", "-timestamp", "-id"], name="msg_conv_ts_idx"
            ),
            # Unread counts / delivery: only rows not yet read.
            models.Index(
                fields=["conversation", "sender"],
                condition=~Q(status="read"),
                name="msg_conv_unread_idx",
            ),
            # Pinned messages per conversation.
            models.Index(
                fields=["conversation", "-pinned_at"],
                condition=Q(pinned_at__isnull=False),
                name="msg_conv_pinned_idx",
            ),
        ]

    def __str__(self):
        return f"Message by {self.sender.username} in {self.conversation.id}"


class MessageTranslation(models.Model):
    message = models.ForeignKey(
        Message, related_name="translations", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        Profile, related_name="message_translations", on_delete=models.CASCADE
    )
    target_language = models.CharField(max_length=16)
    source_language = models.CharField(max_length=16, blank=True, default="auto")
    translated_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user", "target_language"],
                name="uniq_message_user_target_translation",
            )
        ]

    def __str__(self):
        return f"Translation of message {self.message_id} for user {self.user_id}"


class MessageReaction(models.Model):
    message = models.ForeignKey(
        Message, related_name="reactions", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        Profile, related_name="message_reactions", on_delete=models.CASCADE
    )
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user"], name="uniq_message_user_reaction"
            )
        ]

    def __str__(self):
        return f"Reaction on message {self.message_id} by user {self.user_id}"


class BlockedUser(models.Model):
    blocker = models.ForeignKey(
        Profile, related_name="blocked_users", on_delete=models.CASCADE
    )
    blocked = models.ForeignKey(
        Profile, related_name="blocked_by_users", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["blocker", "blocked"], name="uniq_blocker_blocked_pair"
            )
        ]

    def __str__(self):
        return f"Block({self.blocker_id}->{self.blocked_id})"


class UserReport(models.Model):
    reporter = models.ForeignKey(
        Profile, related_name="submitted_reports", on_delete=models.CASCADE
    )
    reported_user = models.ForeignKey(
        Profile, related_name="received_reports", on_delete=models.CASCADE
    )
    reason = models.CharField(max_length=64)
    details = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report({self.reporter_id}->{self.reported_user_id}:{self.reason})"


class ProfileView(models.Model):
    viewer = models.ForeignKey(
        Profile, related_name="profile_views_made", on_delete=models.CASCADE
    )
    viewed_profile = models.ForeignKey(
        Profile, related_name="profile_views_received", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["viewer", "viewed_profile"], name="uniq_profile_view_pair"
            )
        ]
        indexes = [
            # Recent viewers of a profile.
            models.Index(
                fields=["viewed_profile", "-updated_at"], name="pview_viewed_upd_idx"
            ),
        ]
        ordering = ["-updated_at"]

    def __str__(self):
        return f"ProfileView({self.viewer_id}->{self.viewed_profile_id})"


class PushDevice(models.Model):
    """An Expo push token for one of a user's devices (mobile app)."""

    PLATFORM_IOS = "ios"
    PLATFORM_ANDROID = "android"
    PLATFORM_CHOICES = [(PLATFORM_IOS, "iOS"), (PLATFORM_ANDROID, "Android")]

    user = models.ForeignKey(
        Profile, related_name="push_devices", on_delete=models.CASCADE
    )
    # A token identifies a device install, so it belongs to at most one user;
    # registering it again moves it to whoever is logged in now.
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=16, choices=PLATFORM_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "is_active"], name="pushdev_user_active_idx"),
        ]

    def __str__(self):
        return f"PushDevice({self.user_id}:{self.platform})"
