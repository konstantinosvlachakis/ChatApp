from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0012_remove_profile_age"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="is_online",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="profile",
            name="last_seen",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="profile",
            name="ws_connection_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
