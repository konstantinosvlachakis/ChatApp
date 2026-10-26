from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0015_profile_base_translate_language"),
    ]

    operations = [
        migrations.CreateModel(
            name="MessageTranslation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("target_language", models.CharField(max_length=16)),
                ("source_language", models.CharField(blank=True, default="auto", max_length=16)),
                ("translated_text", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="translations", to="chatapp.message")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="message_translations", to="chatapp.profile")),
            ],
        ),
        migrations.AddConstraint(
            model_name="messagetranslation",
            constraint=models.UniqueConstraint(fields=("message", "user", "target_language"), name="uniq_message_user_target_translation"),
        ),
    ]
