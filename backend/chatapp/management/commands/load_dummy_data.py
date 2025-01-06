from django.core.management.base import BaseCommand
from chatapp.models import Profile, Conversation, Message

class Command(BaseCommand):
    help = "Load dummy data into the database"

    def handle(self, *args, **kwargs):
        data = [
            {
                "id": 1,
                "username": "John Doe",
                "lastMessage": "Hey! How are you?",
                "timestamp": "10:45 AM",
                "profile_image_url": "https://randomuser.me/api/portraits/men/1.jpg",
                "unreadCount": 2,
                "messages": [
                    {"text": "Hey!", "isSentByUser": True},
                    {"text": "How are you?", "isSentByUser": True},
                    {"text": "I'm good, how about you?", "isSentByUser": False},
                ],
            },
            {
                "id": 2,
                "username": "Jane Smith",
                "lastMessage": "See you later!",
                "timestamp": "Yesterday",
                "profile_image_url": "https://randomuser.me/api/portraits/women/2.jpg",
                "unreadCount": 3,
                "messages": [
                    {"text": "Hey Jane!", "isSentByUser": True},
                    {"text": "Hi there!", "isSentByUser": False},
                    {"text": "See you later!", "isSentByUser": False},
                ],
            },
        ]

        # Ensure Alma exists as the default receiver
        receiver, _ = Profile.objects.get_or_create(
            username="Alma", defaults={"native_language": "English"}
        )

        for conversation_data in data:
            # Create or update the sender profile
            sender, created = Profile.objects.get_or_create(
                username=conversation_data["username"],
                defaults={"native_language": "English"}
            )
            if not created:
                # Update profile_image_url if the user already exists
                sender.profile_image_url = conversation_data["profile_image_url"]
                sender.save()

            # Create or update the conversation
            conversation, created = Conversation.objects.get_or_create(
                id=conversation_data["id"],
                defaults={"sender": sender, "receiver": receiver}
            )
            if not created:
                conversation.sender = sender
                conversation.receiver = receiver
                conversation.save()

            # Add messages to the conversation
            for message_data in conversation_data["messages"]:
                sender_obj = sender if message_data["isSentByUser"] else receiver
                Message.objects.get_or_create(
                    conversation=conversation,
                    sender=sender_obj,
                    text=message_data["text"],
                )

        self.stdout.write(self.style.SUCCESS("Dummy data loaded successfully!"))
