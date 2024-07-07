from flask import Flask, request, jsonify, redirect
from flask_socketio import SocketIO, emit, disconnect
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

# List to store connected users
connected_users = []


# Function to generate a simple token
def generate_token(user):
    token = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    tokens[token] = user["id"]
    return token


# Function to generate a session ID
def generate_session_id():
    return "".join(random.choices(string.ascii_letters + string.digits, k=32))


# Endpoint to get the list of connected users
@app.route("/connected-users", methods=["GET"])
def get_connected_users():
    return jsonify(connected_users)


# Endpoint to handle user login
@app.route("/", methods=["GET"])
def default_route():
    return redirect("/login")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        auth = request.get_json()
        if not auth or not auth.get("username") or not auth.get("password"):
            return jsonify({"message": "Invalid credentials"}), 401

        user = next(
            (user for user in users if user["username"] == auth["username"]), None
        )

        if user and user["password"] == auth["password"]:
            print("Login successful")

            token = generate_token(user)
            session_id = generate_session_id()

            # Check if user is already in connected_users
            if not any(u["id"] == user["id"] for u in connected_users):
                connected_users.append(
                    {
                        "id": user["id"],
                        "username": user["username"],
                        "avatar_url": f"https://i.pravatar.cc/150?img={user['id']}",
                        "sid": session_id,  # Assign the generated session ID
                    }
                )
            else:
                print(f"User {user['username']} is already connected")

            return jsonify({"token": token, "session_id": session_id}), 200
        else:
            print("Invalid username or password")
            return jsonify({"message": "Invalid username or password"}), 401

    # Handle GET request for login page rendering or redirect
    return (
        "This is the login page"  # Replace with your actual login page HTML or template
    )


# SocketIO event handlers
@socketio.on("connect")
def handle_connect():
    print(f"Client {request.sid} connected")


@socketio.on("disconnect")
def handle_disconnect():
    print(f"Client {request.sid} disconnected")
    # Remove user from the connected_users list
    global connected_users
    connected_users = [user for user in connected_users if user["sid"] != request.sid]


@socketio.on("send_message")
def handle_send_message(data):
    print("Received message:", data["message"])
    emit("receive_message", data, broadcast=True)


if __name__ == "__main__":
    socketio.run(
        app, host="0.0.0.0", port=3001, debug=False
    )  # Set debug=False in production-like environment
