from django.db import models
from django.db.models import F, Q
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
    last_seen = models.DateTimeField(null=True, blank=True, db_index=True)
    ws_connection_count = models.PositiveIntegerField(default=0)
    # Embedded as the "tv" claim in every JWT (chatapp/tokens.py); bumping it
    # revokes all of the user's access and refresh tokens.
    token_version = models.PositiveIntegerField(default=0)
    # Set when the user proves control of ``email`` (6-digit code or link,
    # chatapp/email_verification.py); cleared when the email changes. New
    # accounts start unverified and can't message people or use the coach.
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # When the account was created (People "New members"). Accounts that existed
    # before migration 0037 stay NULL (never "new"); new rows get the time now.
    date_joined = models.DateTimeField(null=True, blank=True, default=timezone.now, db_index=True)
    # How partners may correct this user's messages (MessageCorrection):
    # "often" = any text message, "when_asked" = only messages the user flagged
    # (Message.correction_requested), "off" = never.
    CORRECTIONS_OFTEN = "often"
    CORRECTIONS_WHEN_ASKED = "when_asked"
    CORRECTIONS_OFF = "off"
    CORRECTION_PREFERENCES = [
        (CORRECTIONS_OFTEN, "Correct me often"),
        (CORRECTIONS_WHEN_ASKED, "Only when I ask"),
        (CORRECTIONS_OFF, "No corrections"),
    ]
    correction_preference = models.CharField(
        max_length=12, choices=CORRECTION_PREFERENCES, default=CORRECTIONS_OFTEN
    )

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


class PracticeLanguageProgress(models.Model):
    """Per-language drill difficulty (bucket 1-3), moved by accuracy, not XP.

    Created lazily on first practice in a language and seeded from the
    profile's self-reported level (see ``chatapp.practice_progress``).
    ``recent_results`` holds the last answers in this bucket as "1"/"0"
    characters, oldest first (capped at ``PRACTICE_WINDOW``).
    """

    user = models.ForeignKey(
        Profile, related_name="practice_progress", on_delete=models.CASCADE
    )
    language = models.CharField(max_length=50)
    bucket = models.PositiveSmallIntegerField(default=1)
    attempts_in_bucket = models.PositiveIntegerField(default=0)
    recent_results = models.CharField(max_length=50, blank=True, default="")
    promoted_at = models.DateTimeField(null=True, blank=True)
    demoted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "language"], name="practice_progress_user_language_uniq"
            ),
            models.CheckConstraint(
                condition=Q(bucket__gte=1) & Q(bucket__lte=3),
                name="practice_progress_bucket_range",
            ),
        ]

    def __str__(self):
        return f"PracticeLanguageProgress(user={self.user_id}, {self.language}, bucket={self.bucket})"


# Messaging Models
class Conversation(models.Model):
    """A chat. ``direct``: exactly ``sender`` + ``receiver`` (an unordered pair; "sender"
    is whoever started it). ``group``: members are the active ``ConversationParticipant``
    rows; ``sender`` is the creator and ``receiver`` is NULL.

    Every conversation also has participant rows (backfilled by migration 0039 for
    direct chats), but direct-chat checks read ``sender_id``/``receiver_id`` so they
    cost no extra query (``conversation_member_ids``).
    """

    KIND_DIRECT = "direct"
    KIND_GROUP = "group"
    KINDS = [(KIND_DIRECT, "Direct"), (KIND_GROUP, "Group")]

    kind = models.CharField(max_length=10, choices=KINDS, default=KIND_DIRECT)
    name = models.CharField(max_length=60, blank=True, default="")
    sender = models.ForeignKey(
        Profile, related_name="sent_conversations", on_delete=models.CASCADE
    )
    receiver = models.ForeignKey(
        Profile,
        related_name="received_conversations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_group(self):
        return self.kind == self.KIND_GROUP

    class Meta:
        indexes = [
            # Conversation list: WHERE sender = u OR receiver = u ORDER BY -updated_at
            models.Index(fields=["sender", "-updated_at"], name="conv_sender_upd_idx"),
            models.Index(
                fields=["receiver", "-updated_at"], name="conv_receiver_upd_idx"
            ),
        ]
        constraints = [
            # A direct chat always has both people; a group never uses receiver.
            models.CheckConstraint(
                condition=(
                    models.Q(kind="direct", receiver__isnull=False)
                    | models.Q(kind="group", receiver__isnull=True)
                ),
                name="conv_kind_receiver_check",
            ),
        ]

    def __str__(self):
        if self.is_group:
            return f"Group conversation {self.pk} ({self.name or 'unnamed'})"
        return f"Conversation {self.pk} between users {self.sender_id} and {self.receiver_id}"


class ConversationParticipant(models.Model):
    """Membership of a conversation. ``pending`` = invited to a group, not accepted yet
    (sees nothing, receives nothing); ``active`` = member. Leaving or being removed
    deletes the row."""

    ROLE_OWNER = "owner"
    ROLE_MEMBER = "member"
    ROLES = [(ROLE_OWNER, "Owner"), (ROLE_MEMBER, "Member")]
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUSES = [(STATUS_PENDING, "Pending"), (STATUS_ACTIVE, "Active")]

    conversation = models.ForeignKey(
        Conversation, related_name="participants", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        Profile, related_name="conversation_memberships", on_delete=models.CASCADE
    )
    role = models.CharField(max_length=10, choices=ROLES, default=ROLE_MEMBER)
    status = models.CharField(max_length=10, choices=STATUSES, default=STATUS_ACTIVE)
    nickname = models.CharField(max_length=40, blank=True, default="")
    invited_by = models.ForeignKey(
        Profile,
        related_name="sent_conversation_invites",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    # Group read receipts ("Seen by"); direct chats keep using Message.status.
    last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"], name="uniq_conversation_participant"
            ),
        ]
        indexes = [
            # "My conversations" / "my invites": WHERE user = u AND status = s
            models.Index(fields=["user", "status"], name="conv_part_user_status_idx"),
        ]

    def __str__(self):
        return f"ConversationParticipant(conversation={self.conversation_id}, user={self.user_id}, {self.status})"


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
    KIND_TEXT = "text"
    KIND_STICKER = "sticker"
    KIND_GIF = "gif"
    MESSAGE_KINDS = [
        (KIND_TEXT, "Text"),  # text and/or an uploaded attachment
        (KIND_STICKER, "Sticker"),
        (KIND_GIF, "GIF"),
    ]

    text = models.TextField()
    attachment = models.FileField(
        upload_to="attachments/", blank=True, null=True
    )  # File uploads
    kind = models.CharField(max_length=10, choices=MESSAGE_KINDS, default=KIND_TEXT)
    # sticker: {"pack", "id"}; gif: {"provider", "id", "title", "url",
    # "still_url", "width", "height"} (chatapp/message_media.py). NULL for text.
    media = models.JSONField(blank=True, null=True)

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
    # The sender asked partners to correct this message (needed when their
    # correction_preference is "when_asked").
    correction_requested = models.BooleanField(default=False)

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
                fields=["message", "user", "emoji"], name="uniq_message_user_emoji_reaction"
            )
        ]

    def __str__(self):
        return f"Reaction on message {self.message_id} by user {self.user_id}"


class MessageCorrection(models.Model):
    """A partner's suggested rewrite of a text message (one per corrector)."""

    message = models.ForeignKey(
        Message, related_name="corrections", on_delete=models.CASCADE
    )
    corrector = models.ForeignKey(
        Profile, related_name="message_corrections", on_delete=models.CASCADE
    )
    corrected_text = models.TextField()
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "corrector"], name="uniq_message_corrector_correction"
            )
        ]

    def __str__(self):
        return f"Correction of message {self.message_id} by user {self.corrector_id}"


class PhrasebookEntry(models.Model):
    """A phrase a user saved to learn, with its spaced-review schedule
    (chatapp/phrasebook.py). Text is copied, so it survives message deletion."""

    SOURCE_MANUAL = "manual"
    SOURCE_MESSAGE = "message"
    SOURCE_TRANSLATION = "translation"
    SOURCE_CORRECTION = "correction"
    SOURCES = [
        (SOURCE_MANUAL, "Manual"),
        (SOURCE_MESSAGE, "Message"),
        (SOURCE_TRANSLATION, "Translation"),
        (SOURCE_CORRECTION, "Correction"),
    ]

    user = models.ForeignKey(
        Profile, related_name="phrasebook_entries", on_delete=models.CASCADE
    )
    # The phrase to remember, what it means, a free note and the sentence it
    # came from (the original message / the uncorrected sentence).
    text = models.TextField()
    meaning = models.TextField(blank=True, default="")
    note = models.TextField(blank=True, default="")
    context = models.TextField(blank=True, default="")
    language = models.CharField(max_length=50, blank=True, default="")
    source = models.CharField(max_length=12, choices=SOURCES, default=SOURCE_MANUAL)
    source_message = models.ForeignKey(
        Message,
        related_name="phrasebook_entries",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    source_conversation_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Spaced review (SM-2 style): next due time, current interval, ease in
    # percent (250 = x2.5), successful reviews in a row, forgotten count.
    due_at = models.DateTimeField(default=timezone.now)
    interval_days = models.PositiveIntegerField(default=0)
    ease = models.PositiveSmallIntegerField(default=250)
    repetitions = models.PositiveIntegerField(default=0)
    lapses = models.PositiveIntegerField(default=0)
    review_count = models.PositiveIntegerField(default=0)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "due_at"], name="phrase_user_due_idx"),
            models.Index(fields=["user", "-created_at"], name="phrase_user_created_idx"),
        ]

    def __str__(self):
        return f"Phrasebook entry {self.id} for user {self.user_id}"


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


class Follow(models.Model):
    """A quiet bookmark: ``follower`` keeps ``following`` in their list.

    There are no public counts; the followed person only gets a notification.
    Blocking either way deletes the pair's follows (``block_user_view``).
    """

    follower = models.ForeignKey(
        Profile, related_name="following_links", on_delete=models.CASCADE
    )
    following = models.ForeignKey(
        Profile, related_name="follower_links", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "following"], name="uniq_follow_pair"
            ),
            models.CheckConstraint(
                condition=~Q(follower=F("following")), name="follow_not_self"
            ),
        ]
        indexes = [
            # "People you follow", newest first.
            models.Index(
                fields=["follower", "-created_at"], name="follow_follower_created_idx"
            ),
            # "Who follows X" (follows_you / Follow back).
            models.Index(fields=["following", "follower"], name="follow_following_idx"),
        ]

    def __str__(self):
        return f"Follow({self.follower_id}->{self.following_id})"


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


class ExchangeSession(models.Model):
    """A timed, guided language exchange inside a direct chat (chatapp/exchange_sessions.py).

    pending (invite, expires) -> active (timer runs; language switches at the
    halfway point or earlier on request) -> ended. Or declined / cancelled /
    expired. Expiry and the end of the timer are applied lazily on the next
    read or action, so no background worker is needed.
    """

    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_ENDED = "ended"
    STATUS_DECLINED = "declined"
    STATUS_CANCELLED = "cancelled"
    STATUS_EXPIRED = "expired"
    STATUSES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_ENDED, "Ended"),
        (STATUS_DECLINED, "Declined"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_EXPIRED, "Expired"),
    ]
    OPEN_STATUSES = (STATUS_PENDING, STATUS_ACTIVE)

    conversation = models.ForeignKey(
        Conversation, related_name="exchange_sessions", on_delete=models.CASCADE
    )
    created_by = models.ForeignKey(
        Profile, related_name="started_exchange_sessions", on_delete=models.CASCADE
    )
    partner = models.ForeignKey(
        Profile, related_name="invited_exchange_sessions", on_delete=models.CASCADE
    )
    status = models.CharField(max_length=10, choices=STATUSES, default=STATUS_PENDING)
    duration_minutes = models.PositiveSmallIntegerField(default=20)
    first_language = models.CharField(max_length=50)
    second_language = models.CharField(max_length=50)
    # {"id", "title", "prompts": [str]} or null; topic_queue holds suggestions
    # not shown yet, used_topics the library ids already shown.
    topic = models.JSONField(null=True, blank=True)
    topic_source = models.CharField(max_length=10, blank=True, default="")
    topic_queue = models.JSONField(default=list, blank=True)
    used_topics = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    switched_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    ended_by = models.ForeignKey(
        Profile,
        related_name="ended_exchange_sessions",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    summary = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "-created_at"], name="xsession_conv_created_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["conversation"],
                condition=Q(status__in=["pending", "active"]),
                name="uniq_open_exchange_session",
            )
        ]

    def __str__(self):
        return f"Exchange session {self.id} in conversation {self.conversation_id}"
