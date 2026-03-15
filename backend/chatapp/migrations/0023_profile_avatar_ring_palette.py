from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0022_blockeduser_userreport"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="avatar_ring_palette",
            field=models.CharField(
                choices=[
                    ("teal", "Teal"),
                    ("blush", "Blush"),
                    ("gold", "Gold"),
                    ("lavender", "Lavender"),
                    ("slate", "Slate"),
                ],
                default="teal",
                max_length=20,
            ),
        ),
    ]
