from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("chatapp", "0026_message_edited_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="pinned_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="pinned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pinned_messages",
                to="chatapp.profile",
            ),
        ),
    ]
