from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0017_messagereaction"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="languages_practicing",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
