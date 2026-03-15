import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePresence } from "../../../context/PresenceContext";
import { useUser } from "../../../context/UserContext";
import { BASE_URL_IMG } from "../../../constants/constants";
import axios from "../../../utils/axios";
import { BASE_URL } from "../../../constants/constants";
import { useGetConversations } from "../api/getConversations";
import { useMutation, useQueryClient } from "react-query";
import TypingDots from "./TypingDots";
import CoachAvatar from "../../../components/CoachAvatar";
import {
  COACH_CONVERSATION_ID,
  COACH_CONVERSATION_UPDATED_EVENT,
  getCoachConversation,
} from "./coachConversation";

const DEFAULT_AVATAR = `${BASE_URL_IMG}/media/profile_images/MainAfter.jpg`;

const resolveAvatarUrl = (path) => {
  if (!path) return DEFAULT_AVATAR;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
  if (path.startsWith("media/")) return `${BASE_URL_IMG}/${path}`;
  return `${BASE_URL_IMG}/media/${path}`;
};

const MessageStatusTicks = ({ status = "sent" }) => {
  if (status === "read") {
    return <span className="ml-2 text-xs font-semibold text-sky-400">✓✓</span>;
  }
  if (status === "delivered") {
    return <span className="ml-2 text-xs font-semibold text-gray-400">✓✓</span>;
  }
  return <span className="ml-2 text-xs font-semibold text-gray-400">✓</span>;
};

function ConversationList({
  onSelectConversation,
  activeConversationId,
  typingByConversation = {},
}) {
  const { data: conversations = [], error, isLoading } = useGetConversations();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { onlineUserIds, subscribeToPresenceEvents } = usePresence();
  const navigate = useNavigate();
  const [rightClickedConversation, setRightClickedConversation] =
    useState(null);
  const [swipedConversationId, setSwipedConversationId] = useState(null);
  const [swipeOffsetByConversation, setSwipeOffsetByConversation] = useState({});
  const [conversationPendingDelete, setConversationPendingDelete] = useState(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const [presenceTypingByConversation, setPresenceTypingByConversation] =
    useState({});
  const [, setCoachRefreshTick] = useState(0);
  const conversationsRef = useRef(conversations);
  const touchStateRef = useRef({
    id: null,
    startX: 0,
    startY: 0,
    isSwiping: false,
    currentOffset: 0,
  });
  // Handles right-click event
  const handleRightClick = (e, conversationId) => {
    if (isMobile) return;
    e.preventDefault(); // Prevent default right-click menu
    setRightClickedConversation(
      rightClickedConversation === conversationId ? null : conversationId
    );
    setSwipedConversationId(null);
    setSwipeOffsetByConversation({});
  };

  
  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId) => {
      return axios.delete(`${BASE_URL}/api/conversations/${conversationId}/`, {
        withCredentials: true,
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
    setSwipedConversationId(null);
    setSwipeOffsetByConversation({});
    setConversationPendingDelete(null);
  };

  const requestDeleteConversation = (conversationId, username) => {
    setConversationPendingDelete({
      id: conversationId,
      username: username || "this conversation",
    });
  };

  const handleTouchStart = (event, conversationId) => {
    if (!isMobile) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStateRef.current = {
      id: conversationId,
      startX: touch.clientX,
      startY: touch.clientY,
      isSwiping: false,
      currentOffset: swipedConversationId === conversationId ? -80 : 0,
    };
  };

  const handleTouchMove = (event, conversationId) => {
    if (!isMobile || touchStateRef.current.id !== conversationId) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStateRef.current.startX;
    const deltaY = touch.clientY - touchStateRef.current.startY;

    if (!touchStateRef.current.isSwiping) {
      if (Math.abs(deltaX) < 10 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      touchStateRef.current.isSwiping = true;
    }
    event.preventDefault();
    const nextOffset = Math.max(-80, Math.min(0, deltaX));
    touchStateRef.current.currentOffset = nextOffset;
    setSwipeOffsetByConversation((prev) => ({
      ...prev,
      [conversationId]: nextOffset,
    }));
  };

  const handleTouchEnd = () => {
    const { id, currentOffset } = touchStateRef.current;
    if (id != null) {
      if (currentOffset <= -40) {
        setSwipedConversationId(id);
      } else {
        setSwipedConversationId(null);
      }
      setSwipeOffsetByConversation((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    touchStateRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      isSwiping: false,
      currentOffset: 0,
    };
  };

  // Attach event listener to close delete button when clicking anywhere
  useEffect(() => {
    const onDocumentClick = () => {
      if (rightClickedConversation) {
        setRightClickedConversation(null);
      }
      if (swipedConversationId) {
        setSwipedConversationId(null);
      }
      setSwipeOffsetByConversation({});
    };

    document.addEventListener("click", onDocumentClick);
    return () => {
      document.removeEventListener("click", onDocumentClick);
    };
  }, [rightClickedConversation, swipedConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onMediaChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setSwipedConversationId(null);
        setSwipeOffsetByConversation({});
      }
    };
    mediaQuery.addEventListener("change", onMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", onMediaChange);
    };
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const refreshCoach = () => setCoachRefreshTick((tick) => tick + 1);
    window.addEventListener(COACH_CONVERSATION_UPDATED_EVENT, refreshCoach);
    return () => {
      window.removeEventListener(COACH_CONVERSATION_UPDATED_EVENT, refreshCoach);
    };
  }, []);

  useEffect(() => {
    return subscribeToPresenceEvents((data) => {
      if (data?.type === "presence_update") {
        const userId = data.user_id;
        if (typeof userId !== "number" || data.is_online) return;

        setPresenceTypingByConversation((prev) => {
          const next = { ...prev };
          conversationsRef.current.forEach((conversation) => {
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
        return;
      }

      if (data?.type === "typing_status") {
        const conversationId = data.conversation_id;
        if (typeof conversationId !== "number") return;
        if (data.sender_id === user?.user_id) return;

        setPresenceTypingByConversation((prev) => ({
          ...prev,
          [conversationId]: !!data.is_typing,
        }));
        return;
      }

      if (data?.type === "conversation_update") {
        queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
        queryClient.refetchQueries({
          queryKey: ["conversationsList"],
          type: "active",
        });
      }
    });
  }, [queryClient, subscribeToPresenceEvents, user?.user_id, user?.username]);

  if (isLoading) return <div>Loading conversations...</div>;
  if (error) {
    return <div className="text-red-500">{error.message || "Something went wrong"}</div>;
  }

  const coachConversation = user ? getCoachConversation(user) : null;

  return (
    <div>
      {coachConversation && (
        <div className="border-b border-slate-200/80 bg-[linear-gradient(120deg,_rgba(240,249,255,0.96),_rgba(236,253,245,0.94)_58%,_rgba(255,251,235,0.96))] px-3 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
            AI Studio
          </p>
          <button
            type="button"
            onClick={() => navigate(`/conversations/${COACH_CONVERSATION_ID}`)}
            className={`flex w-full items-center gap-3 rounded-3xl border px-3 py-3 text-left shadow-sm transition ${
              activeConversationId === COACH_CONVERSATION_ID
                ? "border-teal-200 bg-white"
                : "border-white/70 bg-white/75 hover:border-teal-100 hover:bg-white"
            }`}
          >
            <CoachAvatar
              language={coachConversation.sender?.language}
              size={48}
              hideBadge
              className="rounded-[18px] border border-slate-200 shadow-md"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                  Lumi
                </p>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                  AI
                </span>
              </div>
              {typingByConversation[COACH_CONVERSATION_ID] ? (
                <div className="flex items-center gap-2 pt-1 text-sm text-slate-500">
                  <TypingDots />
                  <span>Typing...</span>
                </div>
              ) : (
                <p className="truncate pt-1 text-xs text-slate-500 sm:text-sm">
                  {coachConversation.last_message?.text || "Switch modes, change languages, and practise with Lumi."}
                </p>
              )}
            </div>
          </button>
        </div>
      )}
      {conversations.map((conversation) => {
        const otherUser =
          conversation.sender?.username === user?.username
            ? conversation.receiver
            : conversation.sender;

        const imageSrc = resolveAvatarUrl(otherUser?.profile_image_url);

        const lastUpdated = new Date(conversation.updated_at);
        const formattedUpdated = Number.isNaN(lastUpdated.getTime())
          ? ""
          : lastUpdated.toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
        const isLastMessageFromCurrentUser =
          conversation.last_message?.sender?.id === user?.user_id;
        const isDesktopDeleteVisible = rightClickedConversation === conversation.id;
        const isMobileDeleteVisible = swipedConversationId === conversation.id;
        const isDeleteVisible = isDesktopDeleteVisible || isMobileDeleteVisible;
        const liveOffset = swipeOffsetByConversation[conversation.id];
        const translateX = typeof liveOffset === "number"
          ? liveOffset
          : isDeleteVisible
            ? -80
            : 0;
        const isDragging = typeof liveOffset === "number";

        return (
          <div key={conversation.id} className="relative">
            <div
              className={`absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-rose-500 text-white transition-all duration-200 ${
                isDeleteVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteConversation(conversation.id, otherUser?.username);
                }}
                className="h-full w-full text-xs font-semibold"
              >
                Delete
              </button>
            </div>
            {/* Conversation Container */}
            <div
              className={`relative z-10 flex w-full cursor-pointer items-center gap-3 p-2 sm:p-3 ${
                isDragging ? "transition-none" : "transition-transform duration-200 ease-out"
              }`}
              style={{ transform: `translateX(${translateX}px)` }}
              onContextMenu={(e) => handleRightClick(e, conversation.id)}
              onTouchStart={(e) => handleTouchStart(e, conversation.id)}
              onTouchMove={(e) => handleTouchMove(e, conversation.id)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onClick={() => {
                if (isMobileDeleteVisible) {
                  setSwipedConversationId(null);
                  return;
                }
                if (isDesktopDeleteVisible) {
                  setRightClickedConversation(null);
                  return;
                }
                onSelectConversation?.(conversation);
                navigate(`/conversations/${conversation.id}`);
              }}
            >
              <div className="relative mr-3">
                <img
                  src={imageSrc}
                  alt={otherUser?.username || "Participant"}
                  className="h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = DEFAULT_AVATAR;
                  }}
                />
                {onlineUserIds.has(otherUser?.id) && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold sm:text-base">
                  {otherUser?.username || "Unknown Participant"}
                </p>
                {(typingByConversation[conversation.id] ||
                  presenceTypingByConversation[conversation.id]) ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <TypingDots />
                    <span>Typing...</span>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-2">
                    <p className="truncate text-xs text-gray-500 sm:text-sm">
                      {conversation.last_message?.text || "No messages yet"}
                    </p>
                    <div className="flex items-center text-[11px] text-gray-400 sm:text-xs">
                      {isLastMessageFromCurrentUser && (
                        <MessageStatusTicks
                          status={conversation.last_message?.status}
                        />
                      )}
                      {formattedUpdated && <span className="ml-2">{formattedUpdated}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {conversationPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Delete conversation?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently remove your conversation with{" "}
              <span className="font-semibold text-slate-800">
                {conversationPendingDelete.username}
              </span>
              .
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConversationPendingDelete(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(conversationPendingDelete.id)}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationList;
