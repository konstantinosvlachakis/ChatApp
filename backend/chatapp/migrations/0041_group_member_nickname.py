from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("chatapp", "0040_multiple_message_reactions")]

    operations = [
        migrations.AddField(
            model_name="conversationparticipant",
            name="nickname",
            field=models.CharField(max_length=40, blank=True, default=""),
        ),
    ]
