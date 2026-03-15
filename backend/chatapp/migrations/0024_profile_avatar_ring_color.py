from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0023_profile_avatar_ring_palette"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="avatar_ring_color",
            field=models.CharField(default="#1b7f79", max_length=7),
        ),
    ]
