from rest_framework import serializers
from .models import Conversation, Message, Profile
from django.conf import settings

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["id", "username", "email", "native_language", "profile_image_url"]

class MessageSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'text', 'sender', 'attachment', 'attachment_url', 'timestamp']

    def get_attachment_url(self, obj):
        if obj.attachment:  # Assuming `attachment` is the field storing the file
            return f"{settings.BASE_URL}{settings.MEDIA_URL}{obj.attachment}"
        return None

class ConversationSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    receiver = ProfileSerializer(read_only=True)
    messages = MessageSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "sender", "receiver", "created_at", "updated_at", "last_message", "messages"]

    def get_last_message(self, obj):
        # Retrieve the last message in the conversation
        last_message = obj.messages.order_by("-timestamp").first()
        if last_message:
            # Pass the context to the serializer to include the `request` object
            return MessageSerializer(last_message, context=self.context).data
        return None
