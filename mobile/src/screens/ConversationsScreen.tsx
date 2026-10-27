import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  Easing,
  FlatList,
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CoachAvatar } from "../components/CoachAvatar";
import { Composer, type ComposerHandle } from "../components/chat/Composer";
import { MessageRow } from "../components/chat/MessageRow";
import { formatDaySeparator, getDayKey } from "../components/chat/format";
import { ReportUserModal } from "../components/ReportUserModal";
import { API_BASE_URL } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCoachLanguageOptions } from "../features/coachConversation";
import { tokenStorage } from "../services/storage";
import {
  blockUser,
  fetchPublicProfile,
  reportUser,
  unblockUser,
} from "../services/api/auth";
import {
  createOrGetConversation,
  fetchConversation,
  fetchConversationMessagesPage,
  fetchConversations,
  getCachedConversations,
  markConversationRead,
  deleteConversationMessage,
  pinConversationMessage,
  reactToMessage,
  sendConversationMessage,
  translateConversationMessage,
} from "../services/api/conversations";
import { getErrorMessage } from "../services/api/errors";
import { toastApiError } from "../services/toast";
import { subscribeToPresenceEvents } from "../services/presenceEvents";
import type { ThemeColors } from "../theme/colors";
import type { ChatMessage, Conversation } from "../types";
import { avatarImage } from "../utils/media";

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

// Older history page size for GET /conversations/<id>/messages/ (max 100 server-side).
const OLDER_MESSAGES_PAGE_SIZE = 50;
// Must match CONVERSATION_DETAIL_MESSAGE_LIMIT (backend serializers.py): a detail response
// with fewer embedded messages means there is no older history.
const DETAIL_MESSAGE_LIMIT = 200;

// Broadcast payloads carry no current_user_reaction; derive it from `reactions`.
function withCurrentUserReaction(message: ChatMessage, currentUserId?: number): ChatMessage {
  if ("current_user_reaction" in message || !Array.isArray(message.reactions)) return message;
  const own = message.reactions.find((reaction) => reaction.user_id === currentUserId);
  return { ...message, current_user_reaction: own?.emoji ?? null };
}

function mergeMessagesById(older: ChatMessage[], current: ChatMessage[]) {
  const knownIds = new Set(current.map((message) => message.id));
  return [...older.filter((message) => !knownIds.has(message.id)), ...current];
}

function resolveMediaUrl(path?: string | null) {
  if (!path) return "https://placehold.co/100x100";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

function buildPinnedMessages(messages?: ChatMessage[] | null) {
  return [...(messages || [])]
    .filter((message) => Boolean(message?.is_pinned))
    .sort(
      (left, right) =>
        new Date(right.pinned_at || right.timestamp).getTime() -
        new Date(left.pinned_at || left.timestamp).getTime()
    );
}

function findFirstUnreadMessageId(
  messages: ChatMessage[],
  unreadCount: number,
  currentUserId?: number
) {
  if (!currentUserId || unreadCount <= 0) return null;
  let remaining = unreadCount;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.sender?.id === currentUserId) continue;
    remaining -= 1;
    if (remaining <= 0) return message.id;
  }
  return null;
}

// Debounce for conversation-list refetches after realtime events (trailing, coalesced).
const CONVERSATIONS_REFRESH_DEBOUNCE_MS = 2000;

const messageKeyExtractor = (item: ChatMessage) => String(item.id);

/** Stable function identity that always calls the latest `fn` (for event handlers only). */
function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}

export function ConversationsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const currentUserId = user?.user_id;
  const currentUsername = user?.username;
  const wsBaseUrl = useMemo(() => API_BASE_URL.replace(/^http/, "ws"), []);
  const coachLanguageLabel = useMemo(
    () => getCoachLanguageOptions(user)[0]?.label || "English",
    [user]
  );
  const coachLanguageValue = useMemo(
    () => getCoachLanguageOptions(user)[0]?.value || "english",
    [user]
  );

  const [conversations, setConversations] = useState<Conversation[]>(() => getCachedConversations() || []);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Pull-to-refresh of the open chat: keeps the message list mounted (unlike loadingConversation).
  const [refreshingConversation, setRefreshingConversation] = useState(false);
  const [openingFromNotification, setOpeningFromNotification] = useState(false);
  const [sending, setSending] = useState(false);
  const [participantUsername, setParticipantUsername] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<Record<number, boolean>>({});
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultIds, setSearchResultIds] = useState<number[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [showPinnedModal, setShowPinnedModal] = useState(false);
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState<number | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{
    message: ChatMessage;
    isMine: boolean;
    top: number;
    align: "left" | "right";
  } | null>(null);
  const [chatActionsMenu, setChatActionsMenu] = useState<{
    username: string;
    isBlocked: boolean;
  } | null>(null);
  const [chatActionLoading, setChatActionLoading] = useState(false);
  const [reportTargetUsername, setReportTargetUsername] = useState<string | null>(null);

  const selectedConversationIdRef = useRef<number | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const messageHighlightOpacity = useRef(new Animated.Value(0)).current;
  const messageHighlightScale = useRef(new Animated.Value(0.985)).current;
  const ignoreNextOutsideTapRef = useRef(false);
  const replyActivatedAtRef = useRef(0);
  const lastTapRef = useRef<{ messageId: number | null; at: number }>({
    messageId: null,
    at: 0,
  });
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocalUserTypingRef = useRef(false);
  const remoteTypingTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const previousMessageCountRef = useRef(0);
  const initialUnreadCountRef = useRef(0);
  // Older-history paging: the detail embeds the newest messages (first "page"); the next
  // /messages/ page to request, or null when there is nothing older.
  const nextOlderPageRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  // Set while prepending older messages so the list doesn't jump to the bottom.
  const skipAutoScrollRef = useRef(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const conversationsFetchMetaRef = useRef<{ inFlight: boolean; lastRunAt: number }>({
    inFlight: false,
    lastRunAt: 0,
  });
  const conversationsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  useEffect(() => {
    setReplyTarget(null);
  }, [selectedConversation?.id]);

  useEffect(() => {
    setReactionPickerMessageId(null);
    setHighlightedMessageId(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResultIds([]);
    setActiveSearchIndex(0);
    setShowPinnedModal(false);
    setShowJumpToLatest(false);
    initialUnreadCountRef.current = selectedConversation?.unread_count || 0;
  }, [selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      Object.values(remoteTypingTimeoutsRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (conversationsRefreshTimerRef.current) {
        clearTimeout(conversationsRefreshTimerRef.current);
        conversationsRefreshTimerRef.current = null;
      }
    };
  }, []);

  const setRemoteTyping = useCallback((conversationId: number, isTyping: boolean) => {
    const existing = remoteTypingTimeoutsRef.current[conversationId];
    if (existing) {
      clearTimeout(existing);
      remoteTypingTimeoutsRef.current[conversationId] = null;
    }

    setTypingByConversation((prev) => ({ ...prev, [conversationId]: isTyping }));

    if (isTyping) {
      remoteTypingTimeoutsRef.current[conversationId] = setTimeout(() => {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: false }));
        remoteTypingTimeoutsRef.current[conversationId] = null;
      }, 5000);
    }
  }, []);

  const loadConversations = useCallback(async (force = false) => {
    const minIntervalMs = 4000;
    const now = Date.now();
    if (!force && now - conversationsFetchMetaRef.current.lastRunAt < minIntervalMs) {
      return;
    }
    if (conversationsFetchMetaRef.current.inFlight) return;

    const cached = !force ? getCachedConversations() : null;
    if (!force && cached) {
      setConversations(cached);
    }

    conversationsFetchMetaRef.current.inFlight = true;
    conversationsFetchMetaRef.current.lastRunAt = now;
    const shouldShowLoader = force || !cached;
    if (shouldShowLoader) {
      setLoadingList(true);
    }
    try {
      // Revalidate from network on non-forced loads when cache exists.
      const response = await fetchConversations({ force: force || Boolean(cached) });
      setConversations(response);
    } finally {
      conversationsFetchMetaRef.current.inFlight = false;
      if (shouldShowLoader) {
        setLoadingList(false);
      }
    }
  }, []);

  // Coalesces realtime-triggered list refetches into one request ~2 s after the first event;
  // skipped when a fetch already started after that event (its response includes the change).
  const scheduleConversationsRefresh = useCallback(() => {
    if (conversationsRefreshTimerRef.current) return;
    const requestedAt = Date.now();
    const fire = () => {
      conversationsRefreshTimerRef.current = null;
      const meta = conversationsFetchMetaRef.current;
      if (meta.lastRunAt > requestedAt) return;
      if (meta.inFlight) {
        conversationsRefreshTimerRef.current = setTimeout(fire, 500);
        return;
      }
      loadConversations(true).catch(() => {});
    };
    conversationsRefreshTimerRef.current = setTimeout(fire, CONVERSATIONS_REFRESH_DEBOUNCE_MS);
  }, [loadConversations]);

  const bumpConversationToTop = useCallback(
    ({
      conversationId,
      lastMessage,
      unreadDelta = 0,
      resetUnread = false,
      updatedAt,
    }: {
      conversationId: number;
      lastMessage?: ChatMessage | null;
      unreadDelta?: number;
      resetUnread?: boolean;
      updatedAt?: string;
    }) => {
      setConversations((prev) => {
        const index = prev.findIndex((conversation) => conversation.id === conversationId);
        if (index === -1) return prev;

        const existing = prev[index];
        const nextUnread = resetUnread
          ? 0
          : Math.max(0, (existing.unread_count || 0) + unreadDelta);
        const nextConversation: Conversation = {
          ...existing,
          updated_at: updatedAt || new Date().toISOString(),
          unread_count: nextUnread,
          last_message: lastMessage === undefined ? existing.last_message : lastMessage,
        };

        const remaining = [...prev.slice(0, index), ...prev.slice(index + 1)];
        return [nextConversation, ...remaining];
      });
    },
    []
  );

  const resetOlderPaging = useCallback((embeddedMessageCount: number) => {
    loadingOlderRef.current = false;
    setLoadingOlderMessages(false);
    // Fewer than the detail limit embedded means the whole history is already loaded.
    // Otherwise start at the first page past the embedded messages; overlap with what we
    // already have is deduped by id.
    nextOlderPageRef.current =
      embeddedMessageCount >= DETAIL_MESSAGE_LIMIT
        ? Math.floor(embeddedMessageCount / OLDER_MESSAGES_PAGE_SIZE) + 1
        : null;
  }, []);

  const openConversation = useCallback(
    async (conversationId: number) => {
      setLoadingConversation(true);
      selectedConversationIdRef.current = conversationId;
      try {
        const response = await fetchConversation(conversationId);
        if (selectedConversationIdRef.current === conversationId) {
          initialUnreadCountRef.current = response.unread_count || 0;
          // No unread anchor on open: the chat used to stay behind the spinner until mark-read
          // cleared it, so it opened at the bottom; keep that now that it shows immediately.
          setUnreadAnchorMessageId(null);
          setSelectedConversation(response);
          previousMessageCountRef.current = response.messages?.length || 0;
          resetOlderPaging(response.messages?.length || 0);
          setLoadingConversation(false);
          // Background: mark read, then refresh badge + list.
          markConversationRead(conversationId)
            .then(() => {
              if (selectedConversationIdRef.current === conversationId) {
                initialUnreadCountRef.current = 0;
                setUnreadAnchorMessageId(null);
              }
              DeviceEventEmitter.emit("conversations_refresh");
              return loadConversations(true);
            })
            .catch(() => {});
        }
      } finally {
        // A newer open (or going back) owns the spinner now.
        if (
          selectedConversationIdRef.current === conversationId ||
          selectedConversationIdRef.current === null
        ) {
          setLoadingConversation(false);
        }
      }
    },
    [loadConversations, resetOlderPaging]
  );

  useEffect(() => {
    loadConversations(false);
  }, [loadConversations]);

  useEffect(() => {
    const refreshListener = DeviceEventEmitter.addListener("conversations_refresh", () => {
      loadConversations(true).catch(() => {});
    });
    return () => {
      refreshListener.remove();
    };
  }, [loadConversations]);

  useEffect(() => {
    const targetConversationId = Number(route.params?.openConversationId);
    const openSignal = route.params?.openFromBannerAt;
    if (!targetConversationId || Number.isNaN(targetConversationId) || !openSignal) return;

    setOpeningFromNotification(true);
    openConversation(targetConversationId).finally(() => {
      setOpeningFromNotification(false);
      navigation.setParams({
        openConversationId: undefined,
        openFromBannerAt: undefined,
      });
    });
  }, [navigation, openConversation, route.params?.openConversationId, route.params?.openFromBannerAt]);

  const sendTypingEvent = useCallback(
    (eventType: "user_typing" | "user_stopped_typing") => {
      if (!chatSocketRef.current || chatSocketRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }
      chatSocketRef.current.send(
        JSON.stringify({
          type: eventType,
          sender: currentUsername,
        })
      );
      return true;
    },
    [currentUsername]
  );

  const emitTypingStarted = useCallback(() => {
    if (isLocalUserTypingRef.current) return;
    isLocalUserTypingRef.current = true;
    const sent = sendTypingEvent("user_typing");
    if (!sent) {
      setTimeout(() => {
        sendTypingEvent("user_typing");
      }, 220);
    }
  }, [sendTypingEvent]);

  const emitTypingStopped = useCallback(() => {
    if (!isLocalUserTypingRef.current) return;
    isLocalUserTypingRef.current = false;
    const sent = sendTypingEvent("user_stopped_typing");
    if (!sent) {
      setTimeout(() => {
        sendTypingEvent("user_stopped_typing");
      }, 220);
    }
  }, [sendTypingEvent]);

  // Called by Composer with its draft; resolves true when sent so the draft is cleared.
  const sendMessage = useStableCallback(async (messageText: string): Promise<boolean> => {
    const trimmed = messageText.trim();
    if (!selectedConversation || !trimmed || sending || !currentUserId || !currentUsername) return false;

    setSending(true);
    try {
      const saved = await sendConversationMessage(selectedConversation.id, trimmed, replyTarget?.id);
      const savedMessage: ChatMessage = {
        ...saved,
        attachment_url: saved.attachment_url || null,
        reply_to: saved.reply_to || null,
      };

      setSelectedConversation((prev) => {
        if (!prev || prev.id !== selectedConversation.id) return prev;
        const hasMessage = prev.messages.some((m) => m.id === savedMessage.id);
        if (hasMessage) return prev;
        const nextMessages = [...prev.messages, savedMessage];
        return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
      });
      if (selectedConversationIdRef.current === selectedConversation.id) {
        setReplyTarget(null);
        initialUnreadCountRef.current = 0;
        setUnreadAnchorMessageId(null);
        emitTypingStopped();
      }
      bumpConversationToTop({
        conversationId: selectedConversation.id,
        lastMessage: savedMessage,
        resetUnread: true,
        updatedAt: savedMessage.timestamp || new Date().toISOString(),
      });

      // No socket relay: the server broadcasts message_created to the chat room. The list was
      // patched above; reconcile once (coalesced with the conversation_update this causes).
      scheduleConversationsRefresh();
      return true;
    } catch (error) {
      // The draft stays in the input so the user can retry.
      toastApiError(error, "Could not send your message.", "Message not sent");
      return false;
    } finally {
      setSending(false);
    }
  });

  const closeConversation = useCallback(() => {
    selectedConversationIdRef.current = null;
    emitTypingStopped();
    if (chatSocketRef.current) {
      chatSocketRef.current.close();
      chatSocketRef.current = null;
    }
    setSelectedConversation(null);
    setReactionPickerMessageId(null);
    setReplyTarget(null);
    setUnreadAnchorMessageId(null);
    setShowJumpToLatest(false);
  }, [emitTypingStopped]);

  const startConversation = useCallback(async () => {
    const username = participantUsername.trim();
    if (!username || creatingConversation) return;

    try {
      setCreatingConversation(true);
      const { id } = await createOrGetConversation(username);
      setParticipantUsername("");
      await openConversation(id);
    } catch (error) {
      Alert.alert("Chat error", getErrorMessage(error, "Could not open chat."));
    } finally {
      setCreatingConversation(false);
    }
  }, [creatingConversation, openConversation, participantUsername]);

  const applyMessageUpdate = useCallback((incomingMessage: ChatMessage) => {
    // Socket payloads omit per-user fields; spreading keeps this user's own values.
    const updatedMessage = withCurrentUserReaction(incomingMessage, currentUserId);
    setSelectedConversation((prev) => {
      if (!prev) return prev;
      const nextMessages = prev.messages.map((message) =>
        message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
      );
      return {
        ...prev,
        messages: nextMessages,
        pinned_messages: buildPinnedMessages(nextMessages),
      };
    });
  }, [currentUserId]);

  const togglePinnedMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        const updated = await pinConversationMessage(message.id, !message.is_pinned);
        applyMessageUpdate(updated);
        await loadConversations(true);
      } catch (error) {
        toastApiError(error, "Could not update this pinned message.", "Pin failed");
      }
    },
    [applyMessageUpdate, loadConversations]
  );

  const handleReportUser = useCallback((username: string) => {
    if (chatActionLoading) return;
    setReportTargetUsername(username);
  }, [chatActionLoading]);

  const openChatActions = useCallback(
    async (username: string) => {
      if (chatActionLoading) return;
      try {
        setChatActionLoading(true);
        const profile = await fetchPublicProfile(username);
        setChatActionsMenu({
          username,
          isBlocked: Boolean(profile.is_blocked_by_me),
        });
      } catch (error) {
        toastApiError(error, "Could not load chat options right now.", "Unavailable");
      } finally {
        setChatActionLoading(false);
      }
    },
    [chatActionLoading, closeConversation, handleReportUser, loadConversations, navigation]
  );

  const closeChatActionsMenu = useCallback(() => {
    if (chatActionLoading) return;
    setChatActionsMenu(null);
  }, [chatActionLoading]);

  const handleToggleUserBlock = useCallback(async () => {
    if (!chatActionsMenu || chatActionLoading) return;
    const { username, isBlocked } = chatActionsMenu;
    try {
      setChatActionLoading(true);
      if (isBlocked) {
        await unblockUser(username);
        await loadConversations(true);
        setChatActionsMenu({ username, isBlocked: false });
        Alert.alert("Unblocked", `${username} can contact you again.`);
      } else {
        await blockUser(username);
        setChatActionsMenu(null);
        closeConversation();
        await loadConversations(true);
        Alert.alert("Blocked", `${username} has been blocked.`);
      }
    } catch (error) {
      toastApiError(error, `Could not ${isBlocked ? "unblock" : "block"} this user.`, "Failed");
    } finally {
      setChatActionLoading(false);
    }
  }, [chatActionLoading, chatActionsMenu, closeConversation, loadConversations]);

  const handleReactionSelect = useCallback(
    async (message: ChatMessage, emoji: string) => {
      try {
        const nextEmoji = message.current_user_reaction === emoji ? "" : emoji;
        const updated = await reactToMessage(message.id, nextEmoji);
        applyMessageUpdate(updated);
      } catch (error) {
        toastApiError(error, "Could not update reaction.", "Reaction failed");
      } finally {
        setReactionPickerMessageId(null);
      }
    },
    [applyMessageUpdate]
  );

  // Presence events come from RootNavigator's presence socket (the app's only one).
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
  }, [bumpConversationToTop, currentUserId, scheduleConversationsRefresh, setRemoteTyping]);

  useEffect(() => {
    let mounted = true;
    const conversationId = selectedConversation?.id;
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
    currentUserId,
    isFocused,
    scheduleConversationsRefresh,
    selectedConversation?.id,
    sendTypingEvent,
    setRemoteTyping,
    wsBaseUrl,
  ]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [conversations]);

  const sortedMessages = useMemo(() => {
    if (!selectedConversation) return [];
    return [...(selectedConversation.messages || [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [selectedConversation]);

  const pinnedMessages = useMemo(
    () => buildPinnedMessages(selectedConversation?.pinned_messages || selectedConversation?.messages || []),
    [selectedConversation?.messages, selectedConversation?.pinned_messages]
  );

  const latestPinnedMessage = pinnedMessages[0] || null;
  const additionalPinnedCount = Math.max(0, pinnedMessages.length - 1);

  const searchMatches = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return sortedMessages
      .filter((message) => String(message.text || "").toLowerCase().includes(normalizedQuery))
      .map((message) => message.id);
  }, [searchQuery, sortedMessages]);

  useEffect(() => {
    if (!searchOpen) return;
    setSearchResultIds(searchMatches);
    setActiveSearchIndex((current) =>
      searchMatches.length === 0 ? 0 : Math.min(current, searchMatches.length - 1)
    );
  }, [searchMatches, searchOpen]);

  const messageIndexById = useMemo(() => {
    const indexMap: Record<number, number> = {};
    sortedMessages.forEach((message, index) => {
      indexMap[message.id] = index;
    });
    return indexMap;
  }, [sortedMessages]);

  const handleSwipe = useCallback((message: ChatMessage) => {
    setReactionPickerMessageId(null);
    setReplyTarget(message);
    ignoreNextOutsideTapRef.current = true;
    replyActivatedAtRef.current = Date.now();
    composerRef.current?.activate();
  }, []);

  const clearReplyTarget = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const handleGlobalTouchEnd = useCallback(() => {
    if (!replyTarget) return;
    if (ignoreNextOutsideTapRef.current) {
      ignoreNextOutsideTapRef.current = false;
      return;
    }
    if (Date.now() - replyActivatedAtRef.current < 900) return;
    if (composerRef.current?.isFocused()) return;
    clearReplyTarget();
  }, [clearReplyTarget, replyTarget]);

  const jumpToMessage = useCallback(
    (messageId: number) => {
      const index = messageIndexById[messageId];
      if (index === undefined) return;
      messageListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMessageId(messageId);
      messageHighlightOpacity.stopAnimation();
      messageHighlightScale.stopAnimation();
      messageHighlightOpacity.setValue(0);
      messageHighlightScale.setValue(0.985);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(messageHighlightOpacity, {
            toValue: 1,
            duration: 170,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(messageHighlightOpacity, {
            toValue: 0,
            duration: 1050,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(messageHighlightScale, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(messageHighlightScale, {
            toValue: 1,
            duration: 1000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setHighlightedMessageId((prev) => (prev === messageId ? null : prev));
      });
    },
    [messageHighlightOpacity, messageHighlightScale, messageIndexById]
  );

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  const handleSearchSubmit = useCallback(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return;

    const nextMatches = sortedMessages
      .filter((message) => String(message.text || "").toLowerCase().includes(normalizedQuery))
      .map((message) => message.id);

    setSearchResultIds(nextMatches);
    setActiveSearchIndex(0);
    const targetId = nextMatches[0];
    if (targetId != null) {
      jumpToMessage(targetId);
    }
  }, [jumpToMessage, searchQuery, sortedMessages]);

  const handleSearchNext = useCallback(() => {
    if (!searchMatches.length) return;
    const nextIndex = (activeSearchIndex + 1) % searchMatches.length;
    setActiveSearchIndex(nextIndex);
    jumpToMessage(searchMatches[nextIndex]);
  }, [activeSearchIndex, jumpToMessage, searchMatches]);

  const handleSearchPrevious = useCallback(() => {
    if (!searchMatches.length) return;
    const nextIndex = activeSearchIndex === 0 ? searchMatches.length - 1 : activeSearchIndex - 1;
    setActiveSearchIndex(nextIndex);
    jumpToMessage(searchMatches[nextIndex]);
  }, [activeSearchIndex, jumpToMessage, searchMatches]);

  const handlePinnedMessagePress = useCallback(
    (message: ChatMessage) => {
      setShowPinnedModal(false);
      jumpToMessage(message.id);
    },
    [jumpToMessage]
  );

  const handleSingleMessageTap = useCallback(
    (message: ChatMessage) => {
      if (message.reply_to?.id) {
        jumpToMessage(message.reply_to.id);
        return;
      }
      if (reactionPickerMessageId) {
        setReactionPickerMessageId(null);
      }
    },
    [jumpToMessage, reactionPickerMessageId]
  );

  const handleMessageTap = useStableCallback(
    (message: ChatMessage) => {
      const now = Date.now();
      const isDoubleTap =
        lastTapRef.current.messageId === message.id && now - lastTapRef.current.at <= 280;

      if (isDoubleTap) {
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
          singleTapTimeoutRef.current = null;
        }
        lastTapRef.current = { messageId: null, at: 0 };
        handleSwipe(message);
        return;
      }

      lastTapRef.current = { messageId: message.id, at: now };
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      singleTapTimeoutRef.current = setTimeout(() => {
        handleSingleMessageTap(message);
        singleTapTimeoutRef.current = null;
      }, 240);
    }
  );

  const handleComposerFocus = useCallback(() => {
    setReactionPickerMessageId(null);
  }, []);

  const deleteMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        await deleteConversationMessage(message.id);
        setSelectedConversation((prev) => {
          if (!prev) return prev;
          const nextMessages = prev.messages.filter((m) => m.id !== message.id);
          return {
            ...prev,
            messages: nextMessages,
            pinned_messages: buildPinnedMessages(nextMessages),
          };
        });
        // The server broadcasts message_deleted to the chat room after the DELETE.
        loadConversations(true).catch(() => {});
      } catch (error) {
        toastApiError(error, "Could not delete this message.", "Delete failed");
      }
    },
    [loadConversations]
  );

  const translateMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        const result = await translateConversationMessage(
          message.id,
          user?.base_translate_language || "english"
        );
        const translatedText = result?.translated_text || "";
        if (translatedText) {
          Alert.alert("Translation", translatedText);
        } else {
          Alert.alert("Translation", "No translation returned.");
        }
      } catch (error: any) {
        const translatedText = error?.response?.data?.translated_text;
        if (translatedText) {
          Alert.alert("Translation", translatedText);
          return;
        }
        toastApiError(error, "Could not translate this message.", "Translation failed");
      }
    },
    [user?.base_translate_language]
  );

  const closeMessageMenu = useCallback(() => {
    setMessageMenu(null);
  }, []);

  const buildMessageMenuActions = useCallback(
    (message: ChatMessage, isMine: boolean) => {
      const actions: Array<{
        key: string;
        label: string;
        icon: keyof typeof Ionicons.glyphMap;
        destructive?: boolean;
        onPress: () => void;
      }> = [
        {
          key: "reply",
          label: "Reply",
          icon: "arrow-undo",
          onPress: () => {
            closeMessageMenu();
            handleSwipe(message);
          },
        },
        {
          key: "react",
          label: "React",
          icon: "happy-outline",
          onPress: () => {
            closeMessageMenu();
            setReactionPickerMessageId(message.id);
          },
        },
      ];

      if (!isMine && (message.text || "").trim()) {
        actions.push({
          key: "translate",
          label: "Translate",
          icon: "language-outline",
          onPress: async () => {
            closeMessageMenu();
            await translateMessage(message);
          },
        });
      }

      actions.push({
        key: "pin",
        label: message.is_pinned ? "Unpin" : "Pin",
        icon: message.is_pinned ? "pin-outline" : "pin",
        onPress: async () => {
          closeMessageMenu();
          await togglePinnedMessage(message);
        },
      });

      if (isMine) {
        actions.push({
          key: "delete",
          label: "Delete",
          icon: "trash-outline",
          destructive: true,
          onPress: async () => {
            closeMessageMenu();
            await deleteMessage(message);
          },
        });
      }
      return actions;
    },
    [closeMessageMenu, deleteMessage, handleSwipe, togglePinnedMessage, translateMessage]
  );

  const openMessageMenu = useStableCallback(
    (message: ChatMessage, isMine: boolean, pageY: number) => {
      const rowHeight = 44;
      const basePadding = 10;
      const actionCount = buildMessageMenuActions(message, isMine).length;
      const menuHeight = actionCount * rowHeight + basePadding * 2;
      const gap = 12;
      const screenPadding = 16;
      const availableBelow = windowHeight - pageY - screenPadding;
      const openAbove = availableBelow < menuHeight + gap;
      const top = openAbove
        ? Math.max(screenPadding, pageY - menuHeight - gap)
        : Math.min(windowHeight - menuHeight - screenPadding, pageY + gap);

      setMessageMenu({
        message,
        isMine,
        top,
        align: isMine ? "right" : "left",
      });
    }
  );

  // Per-row flags derived from the whole list, computed once per message-list change.
  const dayLabelById = useMemo(() => {
    const labels: Record<number, string | null> = {};
    sortedMessages.forEach((message, index) => {
      const dayKey = getDayKey(message.timestamp);
      const previousDayKey = getDayKey(index > 0 ? sortedMessages[index - 1]?.timestamp : null);
      labels[message.id] = dayKey && dayKey !== previousDayKey ? formatDaySeparator(message.timestamp) : null;
    });
    return labels;
  }, [sortedMessages]);

  const searchResultIdSet = useMemo(() => new Set(searchResultIds), [searchResultIds]);
  const normalizedSearchQuery = searchQuery.trim();
  const activeSearchMessageId =
    activeSearchIndex < searchResultIds.length ? searchResultIds[activeSearchIndex] : null;

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMine = item.sender?.id === currentUserId;
      const isSearchMatch = Boolean(normalizedSearchQuery) && searchResultIdSet.has(item.id);
      return (
        <MessageRow
          item={item}
          currentUserId={currentUserId}
          isMine={isMine}
          dayLabel={dayLabelById[item.id] ?? null}
          showUnreadDivider={unreadAnchorMessageId === item.id}
          isReplyActive={replyTarget?.id === item.id}
          showReactionPicker={!isMine && reactionPickerMessageId === item.id}
          isHighlighted={highlightedMessageId === item.id}
          searchHighlight={isSearchMatch ? normalizedSearchQuery : null}
          isActiveSearchMatch={isSearchMatch && activeSearchMessageId === item.id}
          styles={styles}
          colors={colors}
          highlightOpacity={messageHighlightOpacity}
          highlightScale={messageHighlightScale}
          onSwipeReply={handleSwipe}
          onReactionSelect={handleReactionSelect}
          onOpenMenu={openMessageMenu}
          onTap={handleMessageTap}
        />
      );
    },
    [
      activeSearchMessageId,
      colors,
      currentUserId,
      dayLabelById,
      handleMessageTap,
      handleReactionSelect,
      handleSwipe,
      highlightedMessageId,
      messageHighlightOpacity,
      messageHighlightScale,
      normalizedSearchQuery,
      openMessageMenu,
      reactionPickerMessageId,
      replyTarget?.id,
      searchResultIdSet,
      styles,
      unreadAnchorMessageId,
    ]
  );

  const onMessageListRefresh = useCallback(async () => {
    const conversationId = selectedConversation?.id;
    if (!conversationId) return;
    setRefreshingConversation(true);
    const requestedAt = Date.now();
    try {
      const updated = await fetchConversation(conversationId);
      if (selectedConversationIdRef.current !== conversationId) return;
      const sortedUpdatedMessages = [...(updated.messages || [])].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      // The refreshed detail covers [oldest, newest] (all history if under the detail limit):
      // it wins inside that window; keep already-loaded older pages and newer live messages.
      const refreshedIds = new Set(sortedUpdatedMessages.map((message) => message.id));
      const windowStart =
        sortedUpdatedMessages.length >= DETAIL_MESSAGE_LIMIT
          ? new Date(sortedUpdatedMessages[0].timestamp).getTime()
          : -Infinity;
      const windowEnd = sortedUpdatedMessages.length
        ? new Date(sortedUpdatedMessages[sortedUpdatedMessages.length - 1].timestamp).getTime()
        : requestedAt;
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        const kept = prev.messages.filter((message) => {
          if (refreshedIds.has(message.id)) return false;
          const time = new Date(message.timestamp).getTime();
          return time < windowStart || time > windowEnd;
        });
        const nextMessages = mergeMessagesById(kept, sortedUpdatedMessages);
        return { ...updated, messages: nextMessages };
      });
      initialUnreadCountRef.current = updated.unread_count || 0;
      setUnreadAnchorMessageId(
        findFirstUnreadMessageId(
          sortedUpdatedMessages,
          updated.unread_count || 0,
          currentUserId
        )
      );
      // Keep older-history paging unless nothing was pageable before (history may have grown).
      if (nextOlderPageRef.current == null && !loadingOlderRef.current) {
        resetOlderPaging(updated.messages?.length || 0);
      }
    } catch (error) {
      toastApiError(error, "Could not refresh this chat.", "Refresh failed");
    } finally {
      setRefreshingConversation(false);
    }
  }, [currentUserId, resetOlderPaging, selectedConversation?.id]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = selectedConversation?.id;
    const page = nextOlderPageRef.current;
    if (!conversationId || page == null || loadingOlderRef.current) return;

    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const response = await fetchConversationMessagesPage(
        conversationId,
        page,
        OLDER_MESSAGES_PAGE_SIZE
      );
      if (selectedConversationIdRef.current !== conversationId) return;
      const knownIds = new Set((selectedConversation?.messages || []).map((m) => m.id));
      const hasNewMessages = (response.messages || []).some((m) => !knownIds.has(m.id));
      if (hasNewMessages) {
        skipAutoScrollRef.current = true;
        setTimeout(() => {
          skipAutoScrollRef.current = false;
        }, 600);
      }
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        const nextMessages = mergeMessagesById(response.messages || [], prev.messages);
        return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
      });
      nextOlderPageRef.current = response.pagination?.has_next ? page + 1 : null;
    } catch {
      // Keep the page so the next scroll to the top retries.
    } finally {
      if (selectedConversationIdRef.current === conversationId) {
        loadingOlderRef.current = false;
        setLoadingOlderMessages(false);
      }
    }
  }, [selectedConversation?.id, selectedConversation?.messages]);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    if (unreadAnchorMessageId != null) {
      requestAnimationFrame(() => jumpToMessage(unreadAnchorMessageId));
      return;
    }
    scrollToBottom(false);
  }, [jumpToMessage, scrollToBottom, selectedConversation?.id, unreadAnchorMessageId]);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    const messageCount = selectedConversation.messages?.length || 0;
    const previousCount = previousMessageCountRef.current;
    if (messageCount > previousCount && !skipAutoScrollRef.current) {
      scrollToBottom(true);
    }
    previousMessageCountRef.current = messageCount;
  }, [selectedConversation?.id, selectedConversation?.messages?.length, scrollToBottom]);

  const handleMessageListContentSizeChange = useCallback(() => {
    if (skipAutoScrollRef.current) return;
    if (unreadAnchorMessageId == null) {
      scrollToBottom(false);
    }
  }, [scrollToBottom, unreadAnchorMessageId]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      messageListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index - 48),
        animated: true,
      });
      setTimeout(() => {
        messageListRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: 0.5,
        });
      }, 160);
    },
    []
  );

  const handleMessageListScrollBeginDrag = useCallback(() => {
    if (replyTarget) clearReplyTarget();
  }, [clearReplyTarget, replyTarget]);

  const handleMessageListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      setShowJumpToLatest(distanceFromBottom > 140);
      if (contentOffset.y < 120 && nextOlderPageRef.current != null) {
        loadOlderMessages();
      }
    },
    [loadOlderMessages]
  );

  if (selectedConversation) {
    const otherUser =
      selectedConversation.sender.username === currentUsername
        ? selectedConversation.receiver
        : selectedConversation.sender;

    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          onTouchEndCapture={handleGlobalTouchEnd}
        >
          <Pressable style={styles.chatHeader} onPress={() => replyTarget && clearReplyTarget()}>
            <Pressable
              style={styles.backButton}
              onPress={(event) => {
                event.stopPropagation();
                closeConversation();
              }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.chatTitleWrap}>
              <View>
                <RNImage source={{ uri: avatarImage(resolveMediaUrl(otherUser.profile_image_url), 34) }} style={styles.chatAvatar} />
                {onlineUserIds.has(otherUser.id) ? <View style={styles.onlineDotChat} /> : null}
              </View>
              <View>
                <Text style={styles.chatTitle}>{otherUser.username}</Text>
                {typingByConversation[selectedConversation.id] ? (
                  <Text style={styles.typingText}>Typing...</Text>
                ) : onlineUserIds.has(otherUser.id) ? (
                  <Text style={styles.onlineText}>Online</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.chatHeaderActions}>
              <Pressable
                style={styles.chatHeaderActionSoft}
                onPress={(event) => {
                  event.stopPropagation();
                  setSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) {
                      setSearchQuery("");
                      setSearchResultIds([]);
                      setActiveSearchIndex(0);
                    } else {
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }
                    return next;
                  });
                }}
              >
                <Ionicons name="search" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                style={styles.chatHeaderActionSoft}
                onPress={(event) => {
                  event.stopPropagation();
                  openChatActions(otherUser.username);
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
              </Pressable>
            </View>
          </Pressable>

          {searchOpen ? (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={colors.mutedText} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search in conversation"
                placeholderTextColor={colors.mutedText}
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
              />
              <Text style={styles.searchCountText}>
                {searchQuery.trim() ? `${searchResultIds.length ? activeSearchIndex + 1 : 0}/${searchResultIds.length}` : ""}
              </Text>
              <Pressable
                style={styles.searchActionButton}
                onPress={handleSearchPrevious}
                disabled={!searchResultIds.length}
              >
                <Ionicons name="chevron-up" size={16} color={searchResultIds.length ? colors.text : colors.mutedText} />
              </Pressable>
              <Pressable
                style={styles.searchActionButton}
                onPress={handleSearchNext}
                disabled={!searchResultIds.length}
              >
                <Ionicons name="chevron-down" size={16} color={searchResultIds.length ? colors.text : colors.mutedText} />
              </Pressable>
              <Pressable
                style={styles.searchActionButton}
                onPress={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchResultIds([]);
                  setActiveSearchIndex(0);
                }}
              >
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            </View>
          ) : null}

          {latestPinnedMessage ? (
            <View style={styles.pinnedStripWrap}>
              <Pressable
                style={styles.pinnedStrip}
                onPress={() => handlePinnedMessagePress(latestPinnedMessage)}
              >
                <View style={styles.pinnedStripIcon}>
                  <Ionicons name="pin" size={12} color={colors.primary} />
                </View>
                <Text numberOfLines={1} style={styles.pinnedStripText}>
                  {latestPinnedMessage.text?.trim() || "Pinned attachment"}
                </Text>
                {additionalPinnedCount > 0 ? (
                  <Pressable
                    style={styles.pinnedCountBadge}
                    onPress={(event) => {
                      event.stopPropagation();
                      setShowPinnedModal(true);
                    }}
                  >
                    <Text style={styles.pinnedCountBadgeText}>+{additionalPinnedCount}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.pinnedStripClose}
                  onPress={(event) => {
                    event.stopPropagation();
                    togglePinnedMessage(latestPinnedMessage);
                  }}
                >
                  <Ionicons name="close" size={15} color={colors.mutedText} />
                </Pressable>
              </Pressable>
            </View>
          ) : null}

          {loadingConversation ? (
            <View style={styles.chatLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={messageListRef}
              data={sortedMessages}
              keyExtractor={messageKeyExtractor}
              renderItem={renderMessage}
              onContentSizeChange={handleMessageListContentSizeChange}
              // Keeps the visible message in place when older messages are prepended.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListHeaderComponent={
                loadingOlderMessages ? (
                  <ActivityIndicator style={styles.olderMessagesLoader} color={colors.primary} />
                ) : null
              }
              onScrollToIndexFailed={handleScrollToIndexFailed}
              ListFooterComponent={<View style={styles.messagesFooterSpacer} />}
              refreshControl={
                <RefreshControl refreshing={refreshingConversation} onRefresh={onMessageListRefresh} />
              }
              contentContainerStyle={styles.messagesContent}
              onScrollBeginDrag={handleMessageListScrollBeginDrag}
              onScroll={handleMessageListScroll}
              scrollEventThrottle={16}
            />
          )}

          {showJumpToLatest ? (
            <Pressable style={styles.jumpToLatestButton} onPress={jumpToLatest}>
              <Text style={styles.jumpToLatestText}>Latest</Text>
            </Pressable>
          ) : null}

          <Composer
            ref={composerRef}
            styles={styles}
            colors={colors}
            currentUserId={currentUserId}
            replyTarget={replyTarget}
            sending={sending}
            onClearReply={clearReplyTarget}
            onFocus={handleComposerFocus}
            onTypingStart={emitTypingStarted}
            onTypingStop={emitTypingStopped}
            onSend={sendMessage}
          />
        </KeyboardAvoidingView>
        <ReportUserModal
          colors={colors}
          visible={Boolean(reportTargetUsername)}
          username={reportTargetUsername || undefined}
          loading={chatActionLoading}
          onClose={() => setReportTargetUsername(null)}
          onSubmit={async ({ reason, details }) => {
            if (!reportTargetUsername) return;
            try {
              setChatActionLoading(true);
              await reportUser({ username: reportTargetUsername, reason, details });
              Alert.alert("Report sent", "Thanks. We will review this report.");
              setReportTargetUsername(null);
            } catch (error) {
              toastApiError(error, "Could not send this report.", "Failed");
            } finally {
              setChatActionLoading(false);
            }
          }}
        />
        <Modal
          transparent
          visible={Boolean(chatActionsMenu)}
          animationType="fade"
          onRequestClose={closeChatActionsMenu}
        >
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuOverlayTouchable} onPress={closeChatActionsMenu} />
            {chatActionsMenu ? (
              <View style={styles.chatActionsSheetWrap}>
                <View style={styles.chatActionsSheet}>
                  <View style={styles.chatActionsHandle} />
                  <View style={styles.chatActionsHeader}>
                    <View style={styles.chatActionsHeaderIcon}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.chatActionsHeaderTextWrap}>
                      <Text style={styles.chatActionsTitle}>{chatActionsMenu.username}</Text>
                      <Text style={styles.chatActionsSubtitle}>Conversation options</Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.chatActionsItem}
                    onPress={() => {
                      setChatActionsMenu(null);
                      navigation.navigate("PublicProfile", { username: chatActionsMenu.username });
                    }}
                  >
                    <View style={styles.chatActionsItemIconWrap}>
                      <Ionicons name="person-circle-outline" size={18} color={colors.text} />
                    </View>
                    <View style={styles.chatActionsItemBody}>
                      <Text style={styles.chatActionsItemTitle}>View profile</Text>
                      <Text style={styles.chatActionsItemSubtitle}>
                        See photos, languages, and profile details
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={[styles.chatActionsItem, styles.chatActionsItemDestructive]}
                    onPress={() => {
                      setChatActionsMenu(null);
                      handleReportUser(chatActionsMenu.username);
                    }}
                  >
                    <View style={[styles.chatActionsItemIconWrap, styles.chatActionsItemIconWrapDestructive]}>
                      <Ionicons name="flag-outline" size={18} color={colors.danger} />
                    </View>
                    <View style={styles.chatActionsItemBody}>
                      <Text style={[styles.chatActionsItemTitle, styles.chatActionsItemTitleDanger]}>Report user</Text>
                      <Text style={styles.chatActionsItemSubtitle}>
                        Let us know if something feels unsafe
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={[styles.chatActionsItem, styles.chatActionsItemWarning]}
                    onPress={handleToggleUserBlock}
                    disabled={chatActionLoading}
                  >
                    <View style={[styles.chatActionsItemIconWrap, styles.chatActionsItemIconWrapWarning]}>
                      {chatActionLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons
                          name={chatActionsMenu.isBlocked ? "checkmark-circle-outline" : "ban-outline"}
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </View>
                    <View style={styles.chatActionsItemBody}>
                      <Text style={styles.chatActionsItemTitle}>
                        {chatActionsMenu.isBlocked ? "Unblock user" : "Block user"}
                      </Text>
                      <Text style={styles.chatActionsItemSubtitle}>
                        {chatActionsMenu.isBlocked
                          ? "Allow this user to contact you again"
                          : "Prevent this user from messaging you"}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable style={styles.chatActionsCancel} onPress={closeChatActionsMenu}>
                    <Text style={styles.chatActionsCancelText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </Modal>
        <Modal
          transparent
          visible={Boolean(messageMenu)}
          animationType="fade"
          onRequestClose={closeMessageMenu}
        >
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuOverlayTouchable} onPress={closeMessageMenu} />
            {messageMenu ? (
              <View
                style={[
                  styles.messageMenuSheet,
                  { top: messageMenu.top },
                  messageMenu.align === "left" ? styles.messageMenuLeft : styles.messageMenuRight,
                ]}
              >
                <View style={styles.messageMenuPreview}>
                  <Text style={styles.messageMenuPreviewLabel}>
                    {messageMenu.isMine ? "Your message" : messageMenu.message.sender?.username || "Message"}
                  </Text>
                  <Text numberOfLines={2} style={styles.messageMenuPreviewText}>
                    {messageMenu.message.text?.trim() || "Attachment"}
                  </Text>
                </View>
                {buildMessageMenuActions(messageMenu.message, messageMenu.isMine).map((action) => (
                  <Pressable
                    key={`${messageMenu.message.id}-${action.key}`}
                    style={[
                      styles.messageMenuItem,
                      action.destructive ? styles.messageMenuItemDanger : undefined,
                    ]}
                    onPress={action.onPress}
                  >
                    <View
                      style={[
                        styles.messageMenuItemIconWrap,
                        action.destructive ? styles.messageMenuItemIconWrapDanger : undefined,
                      ]}
                    >
                      <Ionicons
                        name={action.icon}
                        size={16}
                        color={action.destructive ? colors.danger : colors.text}
                      />
                    </View>
                    <Text
                      style={[
                        styles.messageMenuItemText,
                        action.destructive ? styles.messageMenuItemTextDanger : undefined,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Modal>
        <Modal
          transparent
          visible={showPinnedModal}
          animationType="fade"
          onRequestClose={() => setShowPinnedModal(false)}
        >
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuOverlayTouchable} onPress={() => setShowPinnedModal(false)} />
            <View style={styles.pinnedModal}>
              <Text style={styles.pinnedModalTitle}>Pinned messages</Text>
              {pinnedMessages.map((message) => (
                <Pressable
                  key={`mobile-pinned-${message.id}`}
                  style={styles.pinnedModalItem}
                  onPress={() => handlePinnedMessagePress(message)}
                >
                  <Text numberOfLines={2} style={styles.pinnedModalItemText}>
                    {message.text?.trim() || "Pinned attachment"}
                  </Text>
                  <Pressable
                    style={styles.pinnedModalItemClose}
                    onPress={(event) => {
                      event.stopPropagation();
                      togglePinnedMessage(message);
                    }}
                  >
                    <Ionicons name="close" size={15} color={colors.mutedText} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (openingFromNotification) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.chatLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.openingConversationText}>Opening conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Conversations</Text>
        <Pressable
          style={styles.coachCard}
          onPress={() => navigation.navigate("CoachChat")}
        >
          <CoachAvatar language={coachLanguageValue} size={48} />
          <View style={styles.coachBody}>
            <View style={styles.coachHeaderRow}>
              <Text style={styles.coachName}>Lumi AI Coach</Text>
              <View style={styles.coachOnlineBadge}>
                <Text style={styles.coachOnlineBadgeText}>Online</Text>
              </View>
            </View>
            <Text style={styles.coachPreview}>
              Practice {coachLanguageLabel}, switch modes, and get quick corrections.
            </Text>
          </View>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
        </Pressable>
        <View style={styles.newChatRow}>
          <TextInput
            style={styles.newChatInput}
            value={participantUsername}
            onChangeText={setParticipantUsername}
            placeholder="Start chat by username"
            placeholderTextColor={colors.mutedText}
            autoCapitalize="none"
          />
          <Pressable style={styles.newChatButton} onPress={startConversation} disabled={creatingConversation}>
            <Text style={styles.newChatButtonText}>{creatingConversation ? "..." : "Start"}</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={sortedConversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const otherUser = item.sender.username === currentUsername ? item.receiver : item.sender;
          return (
            <Pressable style={styles.conversationCard} onPress={() => openConversation(item.id)}>
              <View>
                <RNImage source={{ uri: avatarImage(resolveMediaUrl(otherUser.profile_image_url), 44) }} style={styles.avatarImageWrap} />
                {onlineUserIds.has(otherUser.id) ? <View style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.conversationBody}>
                <View style={styles.conversationHeader}>
                  <Text style={styles.conversationName}>{otherUser.username}</Text>
                  {item.unread_count > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={styles.conversationPreview}>
                  {typingByConversation[item.id] ? "Typing..." : item.last_message?.text || "No messages yet"}
                </Text>
              </View>
            </Pressable>
          );
        }}
        refreshControl={<RefreshControl refreshing={loadingList} onRefresh={() => loadConversations(true)} />}
        ListEmptyComponent={
          loadingList ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Text style={styles.emptyText}>No conversations yet.</Text>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

export type ConversationStyles = ReturnType<typeof createStyles>;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    listHeader: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
    },
    listTitle: {
      fontSize: 30,
      fontWeight: "800",
      color: colors.text,
    },
    coachCard: {
      marginTop: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    coachAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    coachBody: {
      flex: 1,
    },
    coachHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    coachName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
    },
    coachOnlineBadge: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    coachOnlineBadgeText: {
      color: colors.success,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    coachPreview: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    newChatRow: {
      marginTop: 10,
      flexDirection: "row",
      gap: 8,
    },
    newChatInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.inputBackground,
    },
    newChatButton: {
      backgroundColor: colors.navy,
      borderRadius: 12,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    newChatButtonText: {
      color: "#fff",
      fontWeight: "700",
    },
    listContent: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    conversationCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    avatarImageWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceMuted,
    },
    onlineDot: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    onlineDotChat: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    conversationBody: {
      flex: 1,
    },
    conversationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    conversationName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    unreadBadge: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignItems: "center",
    },
    unreadBadgeText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 12,
    },
    conversationPreview: {
      color: colors.mutedText,
      fontSize: 13,
    },
    emptyWrap: {
      marginTop: 30,
      alignItems: "center",
    },
    emptyText: {
      marginTop: 30,
      textAlign: "center",
      color: colors.mutedText,
    },
    chatHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    chatHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    backButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    chatTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    chatAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceMuted,
    },
    chatTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
    },
    typingText: {
      fontSize: 12,
      color: colors.primary,
      marginTop: 1,
    },
    onlineText: {
      fontSize: 12,
      color: colors.success,
      marginTop: 1,
    },
    chatHeaderActionSoft: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    searchBar: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      paddingVertical: 0,
    },
    searchCountText: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "700",
      minWidth: 34,
      textAlign: "center",
    },
    searchActionButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    pinnedStripWrap: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 2,
      alignItems: "center",
    },
    pinnedStrip: {
      width: "100%",
      maxWidth: 360,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    pinnedStripIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    pinnedStripText: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    pinnedCountBadge: {
      borderRadius: 999,
      backgroundColor: colors.surface,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pinnedCountBadgeText: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "800",
    },
    pinnedStripClose: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    chatLoading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    openingConversationText: {
      marginTop: 10,
      color: colors.mutedText,
      fontSize: 13,
      fontWeight: "600",
    },
    messagesContent: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    messagesFooterSpacer: {
      height: 14,
    },
    olderMessagesLoader: {
      paddingVertical: 10,
    },
    daySeparatorRow: {
      alignItems: "center",
      marginBottom: 10,
      marginTop: 6,
    },
    daySeparatorText: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.2,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    unreadDividerRow: {
      alignItems: "center",
      marginBottom: 10,
      marginTop: 2,
    },
    unreadDividerText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    messageRow: {
      flexDirection: "row",
    },
    messageRowMine: {
      justifyContent: "flex-end",
    },
    messageRowOther: {
      justifyContent: "flex-start",
    },
    swipeContainer: {
      overflow: "visible",
    },
    swipeChildren: {
      overflow: "visible",
    },
    messageContainer: {
      position: "relative",
      maxWidth: "100%",
    },
    replySwipeAction: {
      width: 22,
      marginVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    replySwipeActionMine: {
      marginLeft: 6,
    },
    replySwipeActionOther: {
      marginRight: 6,
    },
    reactionPicker: {
      position: "absolute",
      top: -44,
      left: 0,
      zIndex: 20,
      flexDirection: "row",
      gap: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 4,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    reactionPickerItem: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    reactionPickerItemActive: {
      backgroundColor: colors.surfaceMuted,
    },
    reactionPickerEmoji: {
      fontSize: 16,
    },
    messageBubble: {
      maxWidth: "100%",
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    messageBubbleReplyActiveMine: {
      transform: [{ translateX: -18 }],
    },
    messageBubbleReplyActiveOther: {
      transform: [{ translateX: 18 }],
    },
    messageBubbleHighlighted: {
      shadowColor: colors.primary,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    messageBubbleHighlightOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}10`,
    },
    replyActiveIndicator: {
      position: "absolute",
      top: -8,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 2,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    replyActiveIndicatorMine: {
      right: -8,
    },
    replyActiveIndicatorOther: {
      left: -8,
    },
    messageMine: {
      backgroundColor: colors.navy,
      borderBottomRightRadius: 6,
    },
    messageOther: {
      backgroundColor: colors.surfaceMuted,
      borderBottomLeftRadius: 6,
    },
    messageText: {
      fontSize: 15,
      flexShrink: 1,
      lineHeight: 21,
    },
    inlineHighlight: {
      backgroundColor: "#fef3c7",
      color: colors.text,
      borderRadius: 4,
    },
    inlineHighlightActive: {
      backgroundColor: "#fde68a",
    },
    messageFlagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
    },
    messageFlagText: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    messageFlagTextMine: {
      color: "#dbeafe",
    },
    messageFlagTextOther: {
      color: colors.mutedText,
    },
    messageEditedText: {
      marginTop: 4,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    messageEditedTextMine: {
      color: "#cbd5e1",
    },
    messageEditedTextOther: {
      color: colors.mutedText,
    },
    replySnippet: {
      borderLeftWidth: 3,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 6,
    },
    replySnippetMine: {
      borderLeftColor: "#dbeafe",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    replySnippetOther: {
      borderLeftColor: colors.primary,
      backgroundColor: colors.surface,
    },
    replySnippetAuthor: {
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 1,
    },
    replySnippetAuthorMine: {
      color: "#e2e8f0",
    },
    replySnippetAuthorOther: {
      color: colors.primary,
    },
    replySnippetText: {
      fontSize: 12,
    },
    replySnippetTextMine: {
      color: "#e2e8f0",
    },
    replySnippetTextOther: {
      color: colors.mutedText,
    },
    messageTextMine: {
      color: "#fff",
    },
    messageTextOther: {
      color: colors.text,
    },
    messageMetaRow: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 4,
    },
    messageTime: {
      fontSize: 11,
    },
    messageTimeMine: {
      color: "#cbd5e1",
      textAlign: "left",
    },
    messageTimeOther: {
      color: colors.mutedText,
      textAlign: "left",
    },
    statusTick: {
      fontSize: 11,
      fontWeight: "700",
    },
    statusTickDefault: {
      color: "#cbd5e1",
    },
    statusTickRead: {
      color: colors.primary,
    },
    reactionsRow: {
      marginTop: 6,
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    reactionsRowMine: {
      justifyContent: "flex-end",
    },
    reactionsRowOther: {
      justifyContent: "flex-start",
    },
    reactionChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    reactionChipMine: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceMuted,
    },
    reactionChipText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: "600",
    },
    inputWrap: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    jumpToLatestButton: {
      position: "absolute",
      right: 14,
      bottom: 82,
      zIndex: 20,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    jumpToLatestText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: "800",
    },
    replyComposerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      backgroundColor: colors.surfaceMuted,
    },
    replyComposerTextWrap: {
      flex: 1,
      marginRight: 8,
    },
    replyComposerLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
      marginBottom: 1,
    },
    replyComposerText: {
      fontSize: 12,
      color: colors.text,
    },
    replyComposerClose: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(8, 15, 33, 0.26)",
      justifyContent: "flex-start",
      alignItems: "stretch",
    },
    menuOverlayTouchable: {
      ...StyleSheet.absoluteFillObject,
    },
    chatActionsSheetWrap: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    chatActionsSheet: {
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 14,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    chatActionsHandle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginBottom: 12,
      opacity: 0.9,
    },
    chatActionsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    chatActionsHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    chatActionsHeaderTextWrap: {
      flex: 1,
    },
    chatActionsTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
    },
    chatActionsSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      marginTop: 2,
    },
    chatActionsItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 18,
      paddingHorizontal: 10,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    chatActionsItemWarning: {
      backgroundColor: colors.surfaceMuted,
    },
    chatActionsItemDestructive: {
      backgroundColor: `${colors.danger}08`,
    },
    chatActionsItemIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    chatActionsItemIconWrapWarning: {
      backgroundColor: colors.surface,
    },
    chatActionsItemIconWrapDestructive: {
      backgroundColor: `${colors.danger}14`,
    },
    chatActionsItemBody: {
      flex: 1,
    },
    chatActionsItemTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    chatActionsItemTitleDanger: {
      color: colors.danger,
    },
    chatActionsItemSubtitle: {
      color: colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    chatActionsCancel: {
      marginTop: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      backgroundColor: colors.surfaceMuted,
    },
    chatActionsCancelText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    messageMenuSheet: {
      position: "absolute",
      minWidth: 208,
      maxWidth: 280,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 8,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 9,
    },
    messageMenuLeft: {
      left: 14,
    },
    messageMenuRight: {
      right: 14,
    },
    messageMenuPreview: {
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginBottom: 6,
    },
    messageMenuPreviewLabel: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 3,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    messageMenuPreviewText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    messageMenuItem: {
      minHeight: 46,
      paddingHorizontal: 10,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    messageMenuItemDanger: {
      backgroundColor: `${colors.danger}10`,
    },
    messageMenuItemIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    messageMenuItemIconWrapDanger: {
      backgroundColor: `${colors.danger}18`,
    },
    messageMenuItemText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "600",
      flex: 1,
    },
    messageMenuItemTextDanger: {
      color: colors.danger,
    },
    pinnedModal: {
      position: "absolute",
      left: 16,
      right: 16,
      top: 110,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    pinnedModalTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    pinnedModalItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: colors.surfaceMuted,
      marginBottom: 6,
    },
    pinnedModalItemText: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      lineHeight: 19,
    },
    pinnedModalItemClose: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    inputRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      backgroundColor: colors.inputBackground,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
    },
  });
