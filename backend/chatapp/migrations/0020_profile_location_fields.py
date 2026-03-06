from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0019_message_reply_to"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="location",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="profile",
            name="location_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
