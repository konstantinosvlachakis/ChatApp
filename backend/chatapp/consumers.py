import json
from channels.generic.websocket import AsyncWebsocketConsumer


# In your WebSocket consumer
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = self.scope["url_route"]["kwargs"]["room_name"]
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data["message"]

        # Broadcast the message to the group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message,
                "sender_channel_name": self.channel_name,  # Include the sender's channel name
            },
        )

    async def chat_message(self, event):
        message = event["message"]
        sender_channel_name = event["sender_channel_name"]

        # Skip sending the message to the sender
        if self.channel_name == sender_channel_name:
            return

        # Send the message to the WebSocket
        await self.send(text_data=json.dumps({"type": "chat", "message": message}))

    async def delete_message(self, event):
        message_id = event["messageId"]
        sender_channel_name = event["sender_channel_name"]

        # Skip sending the delete notification to the sender
        if self.channel_name == sender_channel_name:
            return

        # Notify the WebSocket to delete the message
        await self.send(
            text_data=json.dumps({"type": "deleteMessage", "messageId": message_id})
        )
