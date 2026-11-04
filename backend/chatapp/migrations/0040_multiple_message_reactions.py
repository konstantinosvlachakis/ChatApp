from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("chatapp", "0039_group_conversations")]

    operations = [
        migrations.RemoveConstraint(
            model_name="messagereaction", name="uniq_message_user_reaction"
        ),
        migrations.AddConstraint(
            model_name="messagereaction",
            constraint=models.UniqueConstraint(
                fields=("message", "user", "emoji"),
                name="uniq_message_user_emoji_reaction",
            ),
        ),
    ]
