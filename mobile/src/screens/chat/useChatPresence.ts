import { useEffect, type Dispatch, type SetStateAction } from "react";
import { subscribeToPresenceEvents } from "../../services/presenceEvents";
import type { ChatMessage, Conversation } from "../../types";

type UseChatPresenceArgs = {
  currentUserId: number | undefined;
  setOnlineUserIds: Dispatch<SetStateAction<Set<number>>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setRemoteTyping: (conversationId: number, isTyping: boolean) => void;
  bumpConversationToTop: (args: {
    conversationId: number;
    lastMessage?: ChatMessage | null;
    updatedAt?: string;
  }) => void;
  scheduleConversationsRefresh: () => void;
};

/**
 * Presence/typing/conversation_update events from RootNavigator's presence socket (the app's only
 * one, via services/presenceEvents.ts). Moved unchanged from ConversationsScreen.
 */
export function useChatPresence({
  currentUserId,
  setOnlineUserIds,
  setConversations,
  setRemoteTyping,
  bumpConversationToTop,
  scheduleConversationsRefresh,
}: UseChatPresenceArgs) {
  useEffect(() => {
    if (!currentUserId) return;
    return subscribeToPresenceEvents((data) => {
      if (data.type === "initial_online_users") {
        const ids = data.user_ids || data.userIds || [];
        setOnlineUserIds(new Set(ids));
        return;
      }
      if (data.type === "presence_update") {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (data.is_online) next.add(data.user_id);
          else next.delete(data.user_id);
          return next;
        });
        return;
      }
      if (data.type === "typing_status") {
        setRemoteTyping(data.conversation_id, Boolean(data.is_typing));
        return;
      }
      if (data.type === "conversation_update") {
        const conversationId = data.conversation_id;
        if (conversationId && data.trigger === "messages_read" && data.actor_id != null) {
          // Read receipts don't reorder the list or change previews: patch locally, no refetch.
          const readByMe = data.actor_id === currentUserId;
          setConversations((prev) =>
            prev.map((conversation) => {
              if (conversation.id !== conversationId) return conversation;
              if (readByMe) {
                return conversation.unread_count ? { ...conversation, unread_count: 0 } : conversation;
              }
              const lastMessage = conversation.last_message;
              if (!lastMessage || lastMessage.sender?.id !== currentUserId || lastMessage.status === "read") {
                return conversation;
              }
              return { ...conversation, last_message: { ...lastMessage, status: "read" } };
            })
          );
          return;
        }
        if (conversationId) {
          bumpConversationToTop({
            conversationId,
            updatedAt: new Date().toISOString(),
          });
        }
        scheduleConversationsRefresh();
      }
    });
  }, [bumpConversationToTop, currentUserId, scheduleConversationsRefresh, setConversations, setOnlineUserIds, setRemoteTyping]);
}
