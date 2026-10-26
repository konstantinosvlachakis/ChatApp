from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0024_profile_avatar_ring_color"),
    ]

    operations = [
        migrations.AlterField(
            model_name="profile",
            name="avatar_ring_palette",
            field=models.CharField(
                blank=True,
                choices=[
                    ("teal", "Teal"),
                    ("blush", "Blush"),
                    ("gold", "Gold"),
                    ("lavender", "Lavender"),
                    ("slate", "Slate"),
                ],
                default=None,
                max_length=20,
                null=True,
            ),
        ),
    ]
