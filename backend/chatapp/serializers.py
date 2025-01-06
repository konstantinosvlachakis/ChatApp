from rest_framework import serializers
from .models import Conversation, Message, Profile

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["id", "username", "email", "native_language", "profile_image_url"]

class MessageSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "text", "sender", "timestamp", "status"]

class ConversationSerializer(serializers.ModelSerializer):
    sender = ProfileSerializer(read_only=True)
    receiver = ProfileSerializer(read_only=True)
    messages = MessageSerializer(many=True, read_only=True)  # Removed `source`
    last_message = serializers.SerializerMethodField()  # For computing the last message dynamically

    class Meta:
        model = Conversation
        fields = ["id", "sender", "receiver", "created_at", "updated_at", "last_message", "messages"]

    def get_last_message(self, obj):
        last_message = obj.messages.order_by("-timestamp").first()
        return MessageSerializer(last_message).data if last_message else None
