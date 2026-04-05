from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0027_message_pinned_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="practice_language_levels",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
