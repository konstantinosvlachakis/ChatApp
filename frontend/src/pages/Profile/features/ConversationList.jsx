import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { fetchConversations } from "../api/fetchConversations"; // Import the fetchConversations function
import { BASE_URL_IMG } from "../../../constants/constants";

function ConversationList({ onSelectConversation, activeConversationId }) {
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const navigate = useNavigate(); // Use navigate for redirection

  useEffect(() => {
    // Use the centralized fetchConversations function
    fetchConversations(setConversations, setError, navigate).finally(() =>
      setLoading(false)
    );
  }, [navigate]);

  if (loading) {
    return <div>Loading conversations...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="overflow-y-auto">
      {conversations.map((conversation) => {
        const otherUser =
          conversation.sender?.username === user?.username
            ? conversation.receiver
            : conversation.sender;

        const imageSrc =
          BASE_URL_IMG + (otherUser?.profile_image_url || "") ||
          "https://via.placeholder.com/50";

        return (
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
              src={imageSrc}
              alt={otherUser?.username || "Participant"}
              className="w-12 h-12 rounded-full mr-3"
            />
            <div className="flex-1">
              <p className="font-semibold">
                {otherUser?.username || "Unknown Participant"}
              </p>
              <p className="text-sm text-gray-500">
                {conversation.last_message?.text || "No messages yet"}{" "}
                <span className="text-gray-400">
                  ({new Date(conversation.updated_at).toLocaleString()})
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ConversationList;
