import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { BASE_URL_IMG } from "../../../constants/constants";
import axios from "../../../utils/axios";
import { BASE_URL } from "../../../constants/constants";
import { useGetConversations } from "../api/getConversations";
import { useMutation, useQueryClient } from "react-query";
import TypingDots from "./TypingDots";

function ConversationList({
  onSelectConversation,
  activeConversationId,
  typingByConversation = {},
}) {
  const { data: conversations = [], error, isLoading } = useGetConversations();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const navigate = useNavigate();
  const [rightClickedConversation, setRightClickedConversation] =
    useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [presenceTypingByConversation, setPresenceTypingByConversation] =
    useState({});

  const wsBaseUrl = BASE_URL.replace(/^http/, "ws");


  // Handles right-click event
  const handleRightClick = (e, conversationId) => {
    e.preventDefault(); // Prevent default right-click menu
    setRightClickedConversation(
      rightClickedConversation === conversationId ? null : conversationId
    );
  };

  
  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId) => {
      const token = sessionStorage.getItem("accessToken");
      return axios.delete(`${BASE_URL}/api/conversations/${conversationId}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
    },
  });

  // Handles deleting the conversation
  const handleDelete = (conversationId) => {
    deleteConversationMutation.mutate(conversationId);
    setRightClickedConversation(null);
  };

  // Attach event listener to close delete button when clicking anywhere
  useEffect(() => {
    const onDocumentClick = () => {
      if (rightClickedConversation) {
        setRightClickedConversation(null);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => {
      document.removeEventListener("click", onDocumentClick);
    };
  }, [rightClickedConversation]);

  useEffect(() => {
    if (!user?.username) return;
    const nextOnline = new Set();

    conversations.forEach((conversation) => {
      const otherUser =
        conversation.sender?.username === user.username
          ? conversation.receiver
          : conversation.sender;

      if (otherUser?.is_online) {
        nextOnline.add(otherUser.id);
      }
    });

    setOnlineUserIds(nextOnline);
  }, [conversations, user?.username]);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    if (!token) return;

    const socket = new WebSocket(
      `${wsBaseUrl}/ws/presence/?token=${encodeURIComponent(token)}`
    );

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "initial_online_users") {
          setOnlineUserIds(new Set(data.user_ids || data.userIds || []));
          return;
        }

        if (data.type === "presence_update") {
          const userId = data.user_id;
          if (typeof userId !== "number") return;

          setOnlineUserIds((prev) => {
            const next = new Set(prev);
            if (data.is_online) {
              next.add(userId);
            } else {
              next.delete(userId);
            }
            return next;
          });
          if (!data.is_online) {
            setPresenceTypingByConversation((prev) => {
              const next = { ...prev };
              conversations.forEach((conversation) => {
                const otherUser =
                  conversation.sender?.username === user?.username
                    ? conversation.receiver
                    : conversation.sender;
                if (otherUser?.id === userId) {
                  next[conversation.id] = false;
                }
              });
              return next;
            });
          }
          return;
        }

        if (data.type === "typing_status") {
          const conversationId = data.conversation_id;
          if (typeof conversationId !== "number") return;

          setPresenceTypingByConversation((prev) => ({
            ...prev,
            [conversationId]: !!data.is_typing,
          }));
        }
      } catch (parseError) {
        console.error("Failed to parse presence event:", parseError);
      }
    };

    return () => {
      socket.close();
    };
  }, [conversations, user?.username, wsBaseUrl]);

  if (isLoading) return <div>Loading conversations...</div>;
  if (error) {
    return <div className="text-red-500">{error.message || "Something went wrong"}</div>;
  }

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
              <div className="relative mr-3">
                <img
                  src={imageSrc}
                  alt={otherUser?.username || "Participant"}
                  className="w-12 h-12 rounded-full"
                />
                {onlineUserIds.has(otherUser?.id) && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-white" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold">
                  {otherUser?.username || "Unknown Participant"}
                </p>
                {(typingByConversation[conversation.id] ||
                  presenceTypingByConversation[conversation.id]) ? (
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <TypingDots />
                    <span>Typing...</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {conversation.last_message?.text || "No messages yet"}{" "}
                    <span className="text-gray-400">
                      ({new Date(conversation.updated_at).toLocaleString()})
                    </span>
                  </p>
                )}
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
