import React, { useEffect, useState } from "react";
import axios from "axios";

function ConversationList({ onSelectConversation, activeConversationId }) {
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          setError("Unauthorized access. Please log in again.");
          return;
        }

        const response = await axios.get(
          "http://localhost:8000/api/conversations/",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        console.log(response.data);
        setConversations(response.data);
      } catch (err) {
        console.error("Error fetching conversations:", err);
        if (err.response?.status === 401) {
          setError("Session expired. Please log in again.");
        } else {
          setError("Failed to load conversations");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  if (loading) {
    return <div>Loading conversations...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="overflow-y-auto">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`flex items-center p-2 cursor-pointer ${
            activeConversationId === conversation.id
              ? "bg-gray-300"
              : "hover:bg-gray-200"
          }`}
          onClick={() => onSelectConversation(conversation)}
        >
          <img
            src={
              conversation.sender.profile_image_url ||
              "https://via.placeholder.com/50"
            }
            alt={conversation.name || "Participant"}
            className="w-12 h-12 rounded-full mr-3"
          />
          <div className="flex-1">
            <p className="font-semibold">
              {conversation.sender.username || "Unknown Participant"}
            </p>
            <p className="text-sm text-gray-500">
              {conversation.sender.last_message?.text || "No messages yet"}{" "}
              <span className="text-gray-400">
                ({new Date(conversation.sender.updated_at).toLocaleString()})
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ConversationList;
