import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { usePresence } from "../../../context/PresenceContext";
import { useUser } from "../../../context/UserContext";
import api from "../../../lib/api";
import { toastApiError } from "../../../components/Toast";
import { useGetConversations } from "../api/getConversations";
import { CONVERSATIONS_LIST_QUERY_KEY } from "../api/conversationListCache";
import {
  CONVERSATION_LIST_REFETCH_DEBOUNCE_MS,
  applyConversationUpdateToList,
  createTrailingDebounce,
} from "../api/conversationListRefetch";
import { useMutation, useQueryClient } from "react-query";
import TypingDots from "./TypingDots";
import ChatAvatar from "./ChatAvatar";
import {
  coachMatchesQuery,
  filterConversations,
  formatListTime,
  getOtherParticipant,
} from "../utils/conversationSearch";
import CoachAvatar from "../../../components/CoachAvatar";
import {
  COACH_CONVERSATION_ID,
  COACH_CONVERSATION_UPDATED_EVENT,
  getCoachConversation,
} from "./coachConversation";

const MessageStatusTicks = ({ status = "sent" }) => {
  const label = status === "read" ? "Seen" : status === "delivered" ? "Delivered" : "Sent";
  return (
    <span className={`cv-ticks ${status === "read" ? "is-read" : ""}`} title={label}>
      <span aria-hidden="true">{status === "sent" ? "✓" : "✓✓"}</span>
      <span className="lv-visually-hidden">{label}</span>
    </span>
  );
};

function ConversationList({
  onSelectConversation,
  activeConversationId,
  typingByConversation = {},
  searchQuery = "",
}) {
  const { data: conversations = [], error, isLoading } = useGetConversations();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { onlineUserIds, subscribeToPresenceEvents } = usePresence();
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
  const activeConversationIdRef = useRef(activeConversationId);
  const refetchListDebouncedRef = useRef(null);
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
      return api.delete(`/api/conversations/${conversationId}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
    },
    onError: (error) => {
      toastApiError(error, "Couldn't delete the conversation");
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
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const refetchListDebounced = createTrailingDebounce(() => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
    }, CONVERSATION_LIST_REFETCH_DEBOUNCE_MS);
    refetchListDebouncedRef.current = refetchListDebounced;
    return () => {
      refetchListDebouncedRef.current = null;
      // Run a pending refetch now rather than drop it: the nav badge (Layout) still reads
      // this query after the list unmounts.
      refetchListDebounced.flush();
    };
  }, [queryClient]);

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
        // Patch what the payload (or the open ChatRoom's socket) already tells us; refetch
        // the whole list only otherwise, debounced so bursts cost one request.
        const needsRefetch = applyConversationUpdateToList(queryClient, data, {
          currentUserId: user?.user_id,
          activeConversationId: activeConversationIdRef.current,
        });
        if (needsRefetch) refetchListDebouncedRef.current?.();
      }
    });
  }, [queryClient, subscribeToPresenceEvents, user?.user_id, user?.username]);

  if (isLoading) return <p className="cv-list-status" role="status">Loading conversations…</p>;
  if (error) {
    return (
      <p className="cv-list-status is-error" role="alert">
        {error.message || "Something went wrong"}
      </p>
    );
  }

  const coachConversation = user ? getCoachConversation(user) : null;
  const showCoach = Boolean(coachConversation) && coachMatchesQuery(coachConversation, searchQuery);
  const visibleConversations = filterConversations(conversations, searchQuery, user?.username);
  const isSearching = Boolean(searchQuery.trim());
  const isCoachActive = activeConversationId === COACH_CONVERSATION_ID;

  return (
    <div>
      {showCoach && (
        <div className="cv-companion">
          <p className="cv-section-label">Your practice companion</p>
          <Link
            to={`/conversations/${COACH_CONVERSATION_ID}`}
            className={`cv-row is-companion ${isCoachActive ? "is-active" : ""}`}
            aria-current={isCoachActive ? "page" : undefined}
          >
            <CoachAvatar language={coachConversation.sender?.language} size={48} hideBadge />
            <span className="cv-row-body">
              <span className="cv-row-top">
                <span className="cv-row-name">
                  Lumi <span className="cv-ai-tag">AI</span>
                </span>
                {coachConversation.last_message?.timestamp && (
                  <span className="cv-row-time">
                    {formatListTime(coachConversation.last_message.timestamp)}
                  </span>
                )}
              </span>
              <span className="cv-row-bottom">
                {typingByConversation[COACH_CONVERSATION_ID] ? (
                  <span className="cv-row-typing">
                    <TypingDots className="cv-typing-dots" />
                    Typing…
                  </span>
                ) : (
                  <span className="cv-row-preview">
                    {coachConversation.last_message?.text ||
                      "Switch modes, change languages, and practise with Lumi."}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </div>
      )}

      {conversations.length > 0 && !isSearching && <p className="cv-section-label">Chats</p>}

      {visibleConversations.map((conversation) => {
        const otherUser = getOtherParticipant(conversation, user?.username);
        const otherName = otherUser?.username || "Unknown participant";
        const lastMessage = conversation.last_message;
        const timeLabel = formatListTime(lastMessage?.timestamp || conversation.updated_at);
        const unreadCount = conversation.unread_count || 0;
        const isOnline = onlineUserIds.has(otherUser?.id);
        const isActive = String(activeConversationId) === String(conversation.id);
        const isTyping =
          typingByConversation[conversation.id] || presenceTypingByConversation[conversation.id];
        const isLastMessageFromCurrentUser = lastMessage?.sender?.id === user?.user_id;
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
        const preview = lastMessage
          ? lastMessage.text || (lastMessage.attachment_url || lastMessage.attachment ? "Attachment" : "Message")
          : "No messages yet";

        return (
          <div key={conversation.id} className={`cv-row-wrap${isDeleteVisible ? " is-delete-revealed" : ""}`}>
            <div
              className="cv-row-delete-reveal"
              style={{ opacity: isDeleteVisible ? 1 : 0 }}
              aria-hidden={!isDeleteVisible}
            >
              <button
                type="button"
                tabIndex={isDeleteVisible ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteConversation(conversation.id, otherUser?.username);
                }}
              >
                Delete
              </button>
            </div>
            <Link
              to={`/conversations/${conversation.id}`}
              className={`cv-row ${isActive ? "is-active" : ""} ${unreadCount > 0 ? "has-unread" : ""}`}
              aria-current={isActive ? "page" : undefined}
              style={{
                transform: `translateX(${translateX}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease-out",
              }}
              onContextMenu={(e) => handleRightClick(e, conversation.id)}
              onTouchStart={(e) => handleTouchStart(e, conversation.id)}
              onTouchMove={(e) => handleTouchMove(e, conversation.id)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onClick={(event) => {
                if (isMobileDeleteVisible) {
                  event.preventDefault();
                  setSwipedConversationId(null);
                  return;
                }
                if (isDesktopDeleteVisible) {
                  event.preventDefault();
                  setRightClickedConversation(null);
                  return;
                }
                onSelectConversation?.(conversation);
              }}
            >
              <ChatAvatar
                name={otherName}
                imagePath={otherUser?.profile_image_url}
                size={48}
                online={isOnline}
              />
              <span className="cv-row-body">
                <span className="cv-row-top">
                  <span className="cv-row-name">{otherName}</span>
                  {timeLabel && <span className="cv-row-time">{timeLabel}</span>}
                </span>
                <span className="cv-row-bottom">
                  {isTyping ? (
                    <span className="cv-row-typing">
                      <TypingDots className="cv-typing-dots" />
                      Typing…
                    </span>
                  ) : (
                    <>
                      {isLastMessageFromCurrentUser && (
                        <MessageStatusTicks status={lastMessage?.status} />
                      )}
                      <span className="cv-row-preview">{preview}</span>
                    </>
                  )}
                  {unreadCount > 0 && (
                    <span className="cv-row-badge" aria-hidden="true">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
              </span>
              <span className="lv-visually-hidden">
                {[isOnline ? "online" : "", unreadCount > 0 ? `${unreadCount} unread` : ""]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </Link>
            <button
              type="button"
              className="cv-icon-button cv-row-more"
              tabIndex={isDeleteVisible ? -1 : 0}
              aria-hidden={isDeleteVisible}
              onClick={(event) => {
                event.stopPropagation();
                requestDeleteConversation(conversation.id, otherUser?.username);
              }}
              aria-label={`Delete conversation with ${otherName}`}
            >
              <DeleteOutlineRoundedIcon />
            </button>
          </div>
        );
      })}

      {visibleConversations.length === 0 && (
        <div className="cv-list-empty">
          {isSearching ? (
            <p>No conversations match “{searchQuery.trim()}”.</p>
          ) : (
            <>
              <p>No conversations yet.</p>
              <Link to="/community" className="cv-pill-button is-primary" style={{ marginTop: 12 }}>
                Find people
              </Link>
            </>
          )}
        </div>
      )}

      {conversationPendingDelete && (
        <div className="cv-confirm-backdrop">
          <div
            className="cv-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cv-confirm-title"
            aria-describedby="cv-confirm-text"
            onKeyDown={(event) => {
              if (event.key === "Escape") setConversationPendingDelete(null);
            }}
          >
            <h2 id="cv-confirm-title">Delete conversation?</h2>
            <p id="cv-confirm-text">
              This will permanently remove your conversation with{" "}
              <strong>{conversationPendingDelete.username}</strong>.
            </p>
            <div className="cv-confirm-actions">
              <button
                type="button"
                // Focus the safe choice first.
                autoFocus
                onClick={() => setConversationPendingDelete(null)}
                className="cv-pill-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(conversationPendingDelete.id)}
                className="cv-pill-button is-danger"
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
