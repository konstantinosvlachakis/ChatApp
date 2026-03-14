from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0021_practicestats"),
    ]

    operations = [
        migrations.CreateModel(
            name="BlockedUser",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "blocked",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="blocked_by_users",
                        to="chatapp.profile",
                    ),
                ),
                (
                    "blocker",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="blocked_users",
                        to="chatapp.profile",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="UserReport",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("reason", models.CharField(max_length=64)),
                ("details", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "reported_user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="received_reports",
                        to="chatapp.profile",
                    ),
                ),
                (
                    "reporter",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="submitted_reports",
                        to="chatapp.profile",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="blockeduser",
            constraint=models.UniqueConstraint(
                fields=("blocker", "blocked"), name="uniq_blocker_blocked_pair"
            ),
        ),
    ]
