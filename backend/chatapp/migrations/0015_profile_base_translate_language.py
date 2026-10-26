from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0014_profile_complementary_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="base_translate_language",
            field=models.CharField(default="english", max_length=50),
        ),
    ]
