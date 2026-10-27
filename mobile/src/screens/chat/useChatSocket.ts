import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { DeviceEventEmitter } from "react-native";
import { buildPinnedMessages, withCurrentUserReaction } from "../../components/chat/messageState";
import { markConversationRead } from "../../services/api/conversations";
import { tokenStorage } from "../../services/storage";
import type { ChatMessage, Conversation } from "../../types";

// Message events are broadcast by the server after REST writes (to every socket in the
// room, including the sender's). Their `message` omits per-user fields
// (current_user_reaction, can_translate, translated_*).
type ChatPayload =
  | { type: "message_created"; message?: ChatMessage }
  | { type: "message_deleted"; messageId: number }
  | { type: "message_status"; messageIds?: number[]; status?: "sent" | "delivered" | "read"; actorId?: number }
  | { type: "message_edited" | "message_pinned"; message?: ChatMessage }
  | { type: "message_reaction" | "messageReaction"; message?: ChatMessage }
  | { type: "user_typing" | "user_stopped_typing" };

type BumpConversation = (args: {
  conversationId: number;
  lastMessage?: ChatMessage | null;
  unreadDelta?: number;
  resetUnread?: boolean;
  updatedAt?: string;
}) => void;

type UseChatSocketArgs = {
  conversationId: number | undefined;
  isFocused: boolean;
  currentUserId: number | undefined;
  wsBaseUrl: string;
  chatSocketRef: MutableRefObject<WebSocket | null>;
  isLocalUserTypingRef: MutableRefObject<boolean>;
  selectedConversationIdRef: MutableRefObject<number | null>;
  initialUnreadCountRef: MutableRefObject<number>;
  setSelectedConversation: Dispatch<SetStateAction<Conversation | null>>;
  setUnreadAnchorMessageId: Dispatch<SetStateAction<number | null>>;
  applyMessageUpdate: (message: ChatMessage) => void;
  bumpConversationToTop: BumpConversation;
  scheduleConversationsRefresh: () => void;
  sendTypingEvent: (eventType: "user_typing" | "user_stopped_typing") => boolean;
  setRemoteTyping: (conversationId: number, isTyping: boolean) => void;
};

/**
 * The open chat's websocket (`/ws/socket-server/<id>/`), moved unchanged from ConversationsScreen.
 * Opened per conversation id and re-opened when focus changes; no reconnect (see system-map).
 */
export function useChatSocket({
  conversationId,
  isFocused,
  currentUserId,
  wsBaseUrl,
  chatSocketRef,
  isLocalUserTypingRef,
  selectedConversationIdRef,
  initialUnreadCountRef,
  setSelectedConversation,
  setUnreadAnchorMessageId,
  applyMessageUpdate,
  bumpConversationToTop,
  scheduleConversationsRefresh,
  sendTypingEvent,
  setRemoteTyping,
}: UseChatSocketArgs) {
  useEffect(() => {
    let mounted = true;
    if (!conversationId) return;

    const connectChat = async () => {
      const token = await tokenStorage.getAccessToken();
      if (!token || !mounted) return;

      const socket = new (WebSocket as any)(`${wsBaseUrl}/ws/socket-server/${conversationId}/`, undefined, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      chatSocketRef.current = socket;

      socket.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ChatPayload;
          if (data.type === "message_created") {
            if (!data.message?.id) return;
            const broadcast = withCurrentUserReaction(data.message, currentUserId);
            const senderId = broadcast.sender?.id;
            const newMessage: ChatMessage = {
              translated_text: null,
              translated_source_language: null,
              can_translate: senderId !== currentUserId && Boolean((broadcast.text || "").trim()),
              ...broadcast,
            };

            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              // Our own sends are already appended from the POST response: dedupe by id.
              const alreadyListed = prev.messages.some((m) => m.id === newMessage.id);
              if (alreadyListed) {
                const merged = prev.messages.map((m) =>
                  m.id === newMessage.id ? { ...m, ...broadcast } : m
                );
                return { ...prev, messages: merged, pinned_messages: buildPinnedMessages(merged) };
              }
              const nextMessages = [...prev.messages, newMessage];
              return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
            });

            const isIncoming = Boolean(senderId && senderId !== currentUserId);
            if (!isIncoming) {
              // sendMessage already updated the list for our own message.
              return;
            }
            const shouldResetUnread = isIncoming && isFocused;
            bumpConversationToTop({
              conversationId,
              lastMessage: newMessage,
              unreadDelta: isIncoming && !isFocused ? 1 : 0,
              resetUnread: shouldResetUnread,
              updatedAt: new Date().toISOString(),
            });

            if (isFocused) {
              setRemoteTyping(conversationId, false);
              markConversationRead(conversationId)
                .then(() => {
                  if (selectedConversationIdRef.current === conversationId) {
                    initialUnreadCountRef.current = 0;
                    setUnreadAnchorMessageId(null);
                  }
                  DeviceEventEmitter.emit("conversations_refresh");
                })
                .catch(() => {});
            }
            scheduleConversationsRefresh();
            return;
          }

          if (data.type === "message_deleted") {
            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              const nextMessages = prev.messages.filter((m) => m.id !== data.messageId);
              return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
            });
            return;
          }

          if (data.type === "message_status") {
            const ids = new Set(data.messageIds || []);
            if (!ids.size || !data.status) return;
            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              return {
                ...prev,
                messages: prev.messages.map((message) =>
                  ids.has(message.id) ? { ...message, status: data.status } : message
                ),
              };
            });
            return;
          }

          if (
            (data.type === "message_reaction" || data.type === "messageReaction") &&
            (data as any).message?.id
          ) {
            applyMessageUpdate((data as any).message);
            return;
          }

          if (
            (data.type === "message_pinned" || data.type === "message_edited") &&
            (data as any).message?.id
          ) {
            applyMessageUpdate((data as any).message);
            return;
          }

          if (data.type === "user_typing") {
            setRemoteTyping(conversationId, true);
            return;
          }

          if (data.type === "user_stopped_typing") {
            setRemoteTyping(conversationId, false);
          }
        } catch {}
      };
    };

    connectChat();
    return () => {
      mounted = false;
      isLocalUserTypingRef.current = false;
      sendTypingEvent("user_stopped_typing");
      if (chatSocketRef.current) {
        chatSocketRef.current.close();
        chatSocketRef.current = null;
      }
      setRemoteTyping(conversationId, false);
    };
  }, [
    applyMessageUpdate,
    bumpConversationToTop,
    chatSocketRef,
    conversationId,
    currentUserId,
    initialUnreadCountRef,
    isFocused,
    isLocalUserTypingRef,
    scheduleConversationsRefresh,
    selectedConversationIdRef,
    sendTypingEvent,
    setRemoteTyping,
    setSelectedConversation,
    setUnreadAnchorMessageId,
    wsBaseUrl,
  ]);
}
