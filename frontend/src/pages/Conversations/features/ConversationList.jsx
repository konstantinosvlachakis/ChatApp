import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { fetchConversations } from "../api/fetchConversations";
import { BASE_URL_IMG } from "../../../constants/constants";
import axios from "../../../utils/axios";
import { BASE_URL } from "../../../constants/constants";

function ConversationList({ onSelectConversation, activeConversationId }) {
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const navigate = useNavigate();
  const [rightClickedConversation, setRightClickedConversation] =
    useState(null);

  useEffect(() => {
    fetchConversations(setConversations, setError, navigate).finally(() =>
      setLoading(false)
    );
  }, [navigate]);

  // Handles right-click event
  const handleRightClick = (e, conversationId) => {
    e.preventDefault(); // Prevent default right-click menu
    setRightClickedConversation(
      rightClickedConversation === conversationId ? null : conversationId
    );
  };

  // Handles deleting the conversation
  const handleDelete = (conversationId) => {
    axios.delete(`${BASE_URL}/api/conversations/${conversationId}/`, {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("accessToken")}`,
      },
    });

    setConversations((prev) =>
      prev.filter((conversation) => conversation.id !== conversationId)
    );
    setRightClickedConversation(null);
  };

  // Handles clicking anywhere else to close the delete button smoothly
  const handleClickOutside = (e) => {
    if (rightClickedConversation) {
      setRightClickedConversation(null);
    }
  };

  // Attach event listener to close delete button when clicking anywhere
  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [rightClickedConversation]);

  if (loading) return <div>Loading conversations...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="">
      {conversations.map((conversation) => {
        const otherUser =
          conversation.sender?.username === user?.username
            ? conversation.receiver
            : conversation.sender;

        const imageSrc =
          BASE_URL_IMG + ("/media/" + otherUser?.profile_image_url || "") ||
          "https://via.placeholder.com/50";

        console.log("Image URL:", imageSrc); // Debugging line

        return (
          <div key={conversation.id} className="relative">
            {/* Conversation Container */}
            <div
              className={`flex items-center p-2 cursor-pointer transition-all duration-300 ${
                rightClickedConversation === conversation.id
                  ? "w-[80%]"
                  : "w-full"
              }`}
              onContextMenu={(e) => handleRightClick(e, conversation.id)}
              onClick={() => {
                if (rightClickedConversation !== conversation.id) {
                  onSelectConversation(conversation);
                  navigate(`/conversations/${conversation.id}`);
                }
              }}
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

            {/* Delete Button (Slides in from the right) */}
            <div
              className={`absolute right-0 top-0 bottom-0 flex items-center justify-center w-20 bg-red-500 text-white font-bold text-sm cursor-pointer transition-all duration-300 ${
                rightClickedConversation === conversation.id
                  ? "opacity-100 w-20"
                  : "opacity-0 w-0"
              }`}
              onClick={() => handleDelete(conversation.id)}
            >
              Delete
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ConversationList;
