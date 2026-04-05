from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chatapp", "0028_profile_practice_language_levels"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="bio",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="profile",
            name="learning_goal",
            field=models.TextField(blank=True, default=""),
        ),
    ]
