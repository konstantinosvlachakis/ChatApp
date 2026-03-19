from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0025_alter_profile_avatar_ring_palette"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
