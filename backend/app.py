# app.py
from flask import Flask, request
from flask_socketio import SocketIO, emit
import pandas as pd

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")


@socketio.on("connect")
def handle_connect():
    print(f"Client {request.sid} connected")


@socketio.on("disconnect")
def handle_disconnect():
    print(f"Client {request.sid} disconnected")


@socketio.on("send_message")
def handle_send_message(data):
    print("Received message:", data["message"])
    emit("receive_message", data, broadcast=True)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=3001, debug=True)
