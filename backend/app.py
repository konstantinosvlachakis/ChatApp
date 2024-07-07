from flask import Flask, request, jsonify, redirect, session
from flask_socketio import SocketIO, emit, disconnect
import os
import random
import string
from flask_cors import CORS
import psycopg2
from psycopg2 import sql, extras
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])
socketio = SocketIO(app, cors_allowed_origins="*")

# Secret key for token generation (use environment variable for security)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")

# Database connection configuration
DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")

# Simple token storage (for testing purposes)
tokens = {}

# List to store connected users
connected_users = []


# Function to generate a simple token
def generate_token(user_id):
    token = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    tokens[token] = user_id
    return token


# Function to generate a session ID
def generate_session_id():
    return "".join(random.choices(string.ascii_letters + string.digits, k=32))


# Function to get a database connection
def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS
        )
        return conn
    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        return None


# Endpoint to get the list of connected users
@app.route("/connected-users", methods=["GET"])
def get_connected_users():
    if "user_id" not in session:
        return jsonify({"message": "Unauthorized"}), 401

    current_user_id = session["user_id"]
    filtered_users = [user for user in connected_users if user["id"] != current_user_id]

    return jsonify(filtered_users)


# Endpoint to handle user login
@app.route("/", methods=["GET"])
def default_route():
    return redirect("/login")


@app.route("/login", methods=["POST"])
def login():
    auth = request.get_json()
    if not auth or not auth.get("username") or not auth.get("password"):
        return jsonify({"message": "Invalid credentials"}), 401

    conn = get_db_connection()
    if conn is None:
        return jsonify({"message": "Database connection error"}), 500

    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT uid, username, password FROM users WHERE username = %s",
            (auth["username"],),
        )
        user = cur.fetchone()
        cur.close()
        conn.close()

        if user and user[2] == auth["password"]:
            print("Login successful")

            token = generate_token(user[0])
            session["user_id"] = user[0]  # Store user ID in Flask session
            session_id = generate_session_id()

            # Check if user is already in connected_users
            if not any(u["id"] == user[0] for u in connected_users):
                connected_users.append(
                    {
                        "id": user[0],
                        "username": user[1],
                        "avatar_url": f"https://i.pravatar.cc/150?img={user[0]}",
                        "sid": session_id,  # Assign the generated session ID
                    }
                )
            else:
                print(f"User {user[1]} is already connected")

            return (
                jsonify({"token": token, "session_id": session_id, "user_id": user[0]}),
                200,
            )
        else:
            print("Invalid username or password")
            return jsonify({"message": "Invalid username or password"}), 401
    except psycopg2.Error as e:
        print(f"Database query error: {e}")
        return jsonify({"message": "Database query error"}), 500


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
        app, host="0.0.0.0", port=3001, debug=True
    )  # Set debug=False in production-like environment
