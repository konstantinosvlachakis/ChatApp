import io from "socket.io-client";
import React, { useState, useEffect } from "react";

const socket = io.connect("http://localhost:3001");

function SendMessage({ onSendMessage, clientId }) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    socket.on("receive_message", (data) => {
      if (data.clientId !== clientId) {
        onSendMessage(data.message, "received");
      }
    });

    return () => {
      socket.off("receive_message");
    };
  }, [onSendMessage, clientId]);

  const sendMessage = () => {
    const messageData = { message, clientId };
    socket.emit("send_message", messageData);
    onSendMessage(message, "sent");
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  return (
    <div className="bg-black flex items-center p-4">
      <input
        type="text"
        placeholder="Message..."
        value={message || ""}
        onChange={handleInputChange}
        className="flex-1 p-2 border rounded"
      />
      <button
        onClick={sendMessage}
        className="ml-2 bg-blue-500 text-white p-2 rounded"
      >
        Send Message
      </button>
    </div>
  );
}

export default SendMessage;
