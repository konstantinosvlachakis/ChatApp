from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0020_profile_location_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="PracticeStats",
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
                ("points", models.PositiveIntegerField(default=0)),
                ("xp", models.PositiveIntegerField(default=0)),
                ("level", models.PositiveIntegerField(default=1)),
                ("correct_answers", models.PositiveIntegerField(default=0)),
                ("total_answers", models.PositiveIntegerField(default=0)),
                ("preferred_language", models.CharField(blank=True, default="", max_length=50)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=models.CASCADE,
                        related_name="practice_stats",
                        to="chatapp.profile",
                    ),
                ),
            ],
        ),
    ]
