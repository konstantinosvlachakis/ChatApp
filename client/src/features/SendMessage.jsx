import io from "socket.io-client";
import React, { useState, useEffect } from "react";
import SendIcon from "@mui/icons-material/Send";
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
    <div className="flex items-center p-4">
      <input
        type="text"
        placeholder="Aa"
        value={message || ""}
        onChange={handleInputChange}
        className="flex-1 p-2 rounded-3xl"
      />
      <button
        onClick={sendMessage}
        className="ml-2 text-white p-2 hover:bg-slate-300 rounded-full"
      >
        <SendIcon />
      </button>
    </div>
  );
}

export default SendMessage;
