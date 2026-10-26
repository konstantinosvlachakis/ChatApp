from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0013_profile_presence_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="complementary_image_1_url",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="profile",
            name="complementary_image_2_url",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
