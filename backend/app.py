from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
import os
import random
import string
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])
socketio = SocketIO(app, cors_allowed_origins="*")

# Secret key for token generation (use environment variable for security)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "mysecretkey")

# Simulated user database (replace with actual database integration)
users = [
    {
        "id": 1,
        "username": "kostas",
        "password": "1",  # plain text password for testing
    },
    {
        "id": 2,
        "username": "user2",
        "password": "password2",  # plain text password for testing
    },
]

# Simple token storage (for testing purposes)
tokens = {}


# Function to generate a simple token
def generate_token(user):
    token = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    tokens[token] = user["id"]
    return token


# Endpoint to handle user login
@app.route("/login", methods=["POST"])
def login():
    auth = request.get_json()
    if not auth or not auth.get("username") or not auth.get("password"):
        return jsonify({"message": "Invalid credentials"}), 401

    user = next((user for user in users if user["username"] == auth["username"]), None)

    if user and user["password"] == auth["password"]:
        print("Login successful")
        token = generate_token(user)
        return jsonify({"token": token}), 200
    else:
        print("Invalid username or password")
        return jsonify({"message": "Invalid username or password"}), 401


# SocketIO event handlers
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
