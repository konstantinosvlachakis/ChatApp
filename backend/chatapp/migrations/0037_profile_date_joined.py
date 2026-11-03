import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    """Add Profile.date_joined without marking existing accounts as new.

    AddField runs without a default, so existing rows stay NULL ("not new");
    the AlterField then adds the Python-side default (timezone.now) for rows
    created afterwards. Changing only a Python default on a nullable column
    doesn't touch existing rows. Also indexes last_seen for the People
    "Active today" filter and "Recently active" sort.
    """

    dependencies = [
        ("chatapp", "0036_practice_language_progress"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="date_joined",
            field=models.DateTimeField(blank=True, null=True, db_index=True),
        ),
        migrations.AlterField(
            model_name="profile",
            name="date_joined",
            field=models.DateTimeField(
                blank=True, null=True, db_index=True, default=django.utils.timezone.now
            ),
        ),
        migrations.AlterField(
            model_name="profile",
            name="last_seen",
            field=models.DateTimeField(blank=True, null=True, db_index=True),
        ),
    ]
