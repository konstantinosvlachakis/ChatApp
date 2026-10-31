import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def mark_existing_users_verified(apps, schema_editor):
    """Accounts created before email verification existed keep messaging:
    they are marked verified now (Profile has no date_joined; last_login is
    the best "since" we have, else the migration time)."""
    Profile = apps.get_model("chatapp", "Profile")
    now = django.utils.timezone.now()
    Profile.objects.filter(email_verified_at__isnull=True, last_login__isnull=False).update(
        email_verified_at=models.F("last_login")
    )
    Profile.objects.filter(email_verified_at__isnull=True).update(email_verified_at=now)


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0034_profile_token_version"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="EmailVerificationCode",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("email", models.EmailField(max_length=255)),
                ("code_hash", models.CharField(max_length=64)),
                ("send_history", models.JSONField(blank=True, default=list)),
                ("expires_at", models.DateTimeField()),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_verification_code",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.RunPython(mark_existing_users_verified, migrations.RunPython.noop),
    ]
