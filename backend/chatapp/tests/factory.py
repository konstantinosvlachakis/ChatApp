from itertools import count

from chatapp.models import Conversation, Message, Profile

_SEQ = count(1)


def make_user(**kwargs):
    idx = next(_SEQ)
    defaults = {
        "username": f"user{idx}",
        "email": f"user{idx}@example.com",
        "password": "pass1234",
        "native_language": "english",
    }
    defaults.update(kwargs)
    raw_password = defaults.pop("password")
    return Profile.objects.create_user(password=raw_password, **defaults)


def make_conversation(sender=None, receiver=None):
    sender = sender or make_user()
    receiver = receiver or make_user(native_language="greek")
    return Conversation.objects.create(sender=sender, receiver=receiver)


def make_message(conversation=None, sender=None, **kwargs):
    conversation = conversation or make_conversation()
    sender = sender or conversation.sender
    defaults = {"text": "Hello"}
    defaults.update(kwargs)
    return Message.objects.create(conversation=conversation, sender=sender, **defaults)
