import type { TextInputInstance } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  DeviceEventEmitter,
  Easing,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ComposerHandle } from "../components/chat/Composer";
import { MessageRow } from "../components/chat/MessageRow";
import { ImageViewer } from "../components/chat/ImageViewer";
import { ChatAudioContext, ChatAudioController } from "../components/chat/audioController";
import type { PickedAttachment } from "../components/chat/attachments";
import { createChatStyles } from "../components/chat/chatStyles";
import { toReplyPreviewText } from "../components/chat/format";
import { getMessageGroupFlags } from "../components/chat/messageGroups";
import {
  buildPinnedMessages,
  countIncomingAfter,
  findFirstUnreadMessageId,
  mergeMessagesById,
  withCurrentUserReaction,
} from "../components/chat/messageState";
import { useReducedMotion } from "../components/chat/useReducedMotion";
import { ReportUserModal } from "../components/ReportUserModal";
import { API_BASE_URL } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getCoachLanguageOptions } from "../features/coachConversation";
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
import { setOpenConversationId } from "../services/push";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { ChatMessage, Conversation } from "../types";
import { ChatOptionsSheet, type ChatOptionsState } from "./chat/ChatOptionsSheet";
import { ChatRoomView } from "./chat/ChatRoomView";
import { ConversationListView } from "./chat/ConversationListView";
import {
  MessageActionsSheet,
  type MessageMenuAction,
  type MessageMenuState,
} from "./chat/MessageActionsSheet";
import { useChatPresence } from "./chat/useChatPresence";
import { useChatSocket } from "./chat/useChatSocket";
import { useStableCallback } from "./chat/useStableCallback";

// Chats tab (route `ChatsHome`): conversation list, or the open chat. State, requests and socket
// wiring live here; rendering is in `screens/chat/*` and `components/chat/*`.

// Older history page size for GET /conversations/<id>/messages/ (max 100 server-side).
const OLDER_MESSAGES_PAGE_SIZE = 50;
// Must match CONVERSATION_DETAIL_MESSAGE_LIMIT (backend serializers.py): a detail response
// with fewer embedded messages means there is no older history.
const DETAIL_MESSAGE_LIMIT = 200;

// Debounce for conversation-list refetches after realtime events (trailing, coalesced).
const CONVERSATIONS_REFRESH_DEBOUNCE_MS = 2000;

export function ConversationsScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const warm = warmColors(isDark);
  const chatStyles = useMemo(() => createChatStyles(warm), [warm]);
  const reduceMotion = useReducedMotion();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
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
  const [messageMenu, setMessageMenu] = useState<MessageMenuState>(null);
  const [chatActionsMenu, setChatActionsMenu] = useState<ChatOptionsState>(null);
  const [chatActionLoading, setChatActionLoading] = useState(false);
  const [reportTargetUsername, setReportTargetUsername] = useState<string | null>(null);
  // Full-screen photo viewer (original attachment URL).
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  // One shared voice-note player for the open chat (only one plays at a time).
  const [audioController] = useState(() => new ChatAudioController());
  const sendInFlightRef = useRef(false);

  const selectedConversationIdRef = useRef<number | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  const searchInputRef = useRef<TextInputInstance | null>(null);
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
  // Within ~140 px of the newest message: new messages and layout changes keep the list pinned to
  // the bottom only then (or for our own sends), so reading older messages isn't interrupted.
  const isNearBottomRef = useRef(true);
  // Set by a drag or an explicit jump (search, pinned, reply quote); cleared at the bottom.
  const userScrolledRef = useRef(false);
  // Newest message when the user scrolled away; incoming messages after it are counted on the
  // jump-to-latest button.
  const [jumpAnchorMessageId, setJumpAnchorMessageId] = useState<number | null>(null);
  const latestMessageRef = useRef<ChatMessage | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  // Push: no foreground banner for the chat that is on screen (services/push.ts).
  useEffect(() => {
    setOpenConversationId(isFocused ? selectedConversation?.id ?? null : null);
    return () => setOpenConversationId(null);
  }, [isFocused, selectedConversation?.id]);

  useEffect(() => {
    setReplyTarget(null);
    setViewerImageUrl(null);
  }, [selectedConversation?.id]);

  // Voice notes: stop and free the player on chat switch, blur and unmount...
  useEffect(() => {
    if (!isFocused) audioController.release();
    return () => audioController.release();
  }, [audioController, isFocused, selectedConversation?.id]);

  // ...and when the app leaves the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") audioController.release();
    });
    return () => subscription.remove();
  }, [audioController]);

  useEffect(() => {
    setReactionPickerMessageId(null);
    setHighlightedMessageId(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResultIds([]);
    setActiveSearchIndex(0);
    setShowPinnedModal(false);
    setShowJumpToLatest(false);
    setJumpAnchorMessageId(null);
    isNearBottomRef.current = true;
    userScrolledRef.current = false;
    initialUnreadCountRef.current = selectedConversation?.unread_count || 0;
  }, [selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
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

  // Called by Composer with its draft; resolves true when sent. A photo send shows an optimistic
  // bubble (negative id, `local_status: "sending"`) that the saved message replaces.
  const sendMessage = useStableCallback(
    async (messageText: string, attachment: PickedAttachment | null): Promise<boolean> => {
      const trimmed = messageText.trim();
      if (!selectedConversation || (!trimmed && !attachment) || !currentUserId || !currentUsername) return false;
      if (sending || sendInFlightRef.current) return false;

      const conversationId = selectedConversation.id;
      const replyTo = replyTarget && replyTarget.id > 0 ? replyTarget : null;
      const optimisticId = attachment ? -Date.now() : null;
      sendInFlightRef.current = true;
      setSending(true);
      if (attachment && optimisticId !== null) {
        const optimistic: ChatMessage = {
          id: optimisticId,
          text: trimmed,
          sender: { id: currentUserId, username: currentUsername },
          status: "sent",
          attachment_url: attachment.uri,
          local_mime_type: attachment.mimeType,
          local_status: "sending",
          timestamp: new Date().toISOString(),
          reply_to: replyTo
            ? {
                id: replyTo.id,
                text: replyTo.text,
                timestamp: replyTo.timestamp,
                sender: { id: replyTo.sender?.id, username: replyTo.sender?.username },
              }
            : null,
          reactions: [],
        };
        setSelectedConversation((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          return { ...prev, messages: [...prev.messages, optimistic] };
        });
        setReplyTarget(null);
      }
      try {
        const saved = await sendConversationMessage(
          conversationId,
          trimmed,
          replyTo?.id,
          attachment ? { uri: attachment.uri, name: attachment.name, type: attachment.mimeType } : null
        );
        const savedMessage: ChatMessage = {
          ...saved,
          attachment_url: saved.attachment_url || null,
          reply_to: saved.reply_to || null,
        };

        setSelectedConversation((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          // Drop the optimistic bubble; the broadcast may already have added the saved id.
          const withoutOptimistic =
            optimisticId === null ? prev.messages : prev.messages.filter((m) => m.id !== optimisticId);
          const hasMessage = withoutOptimistic.some((m) => m.id === savedMessage.id);
          if (hasMessage && withoutOptimistic === prev.messages) return prev;
          const nextMessages = hasMessage ? withoutOptimistic : [...withoutOptimistic, savedMessage];
          return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
        });
        if (selectedConversationIdRef.current === conversationId) {
          setReplyTarget(null);
          initialUnreadCountRef.current = 0;
          setUnreadAnchorMessageId(null);
          emitTypingStopped();
        }
        bumpConversationToTop({
          conversationId,
          lastMessage: savedMessage,
          resetUnread: true,
          updatedAt: savedMessage.timestamp || new Date().toISOString(),
        });

        // No socket relay: the server broadcasts message_created to the chat room. The list was
        // patched above; reconcile once (coalesced with the conversation_update this causes).
        scheduleConversationsRefresh();
        return true;
      } catch (error) {
        // The draft stays in (or is restored to) the composer so the user can retry.
        if (optimisticId !== null) {
          setSelectedConversation((prev) => {
            if (!prev || prev.id !== conversationId) return prev;
            return { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) };
          });
          if (replyTo && selectedConversationIdRef.current === conversationId) {
            setReplyTarget((current) => current ?? replyTo);
          }
        }
        toastApiError(
          error,
          attachment ? "Could not send your photo." : "Could not send your message.",
          "Message not sent"
        );
        return false;
      } finally {
        sendInFlightRef.current = false;
        setSending(false);
      }
    }
  );

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
    setJumpAnchorMessageId(null);
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
    [chatActionLoading]
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
  useChatPresence({
    currentUserId,
    setOnlineUserIds,
    setConversations,
    setRemoteTyping,
    bumpConversationToTop,
    scheduleConversationsRefresh,
  });

  // The open chat's socket (message/typing/status events for selectedConversation).
  useChatSocket({
    conversationId: selectedConversation?.id,
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
  });

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
    if (message.local_status === "sending") return;
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
      userScrolledRef.current = true;
      messageListRef.current?.scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.5 });
      setHighlightedMessageId(messageId);
      messageHighlightOpacity.stopAnimation();
      messageHighlightScale.stopAnimation();
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (reduceMotion) {
        // Static outline instead of the fade/scale pulse.
        messageHighlightOpacity.setValue(1);
        messageHighlightScale.setValue(1);
        highlightTimeoutRef.current = setTimeout(() => {
          highlightTimeoutRef.current = null;
          messageHighlightOpacity.setValue(0);
          setHighlightedMessageId((prev) => (prev === messageId ? null : prev));
        }, 1200);
        return;
      }
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
    [messageHighlightOpacity, messageHighlightScale, messageIndexById, reduceMotion]
  );

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    scrollToBottom(!reduceMotion);
  }, [reduceMotion, scrollToBottom]);

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
      const actions: MessageMenuAction[] = [
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

  // Rows pass the touch's pageY; the menu is a bottom sheet now, so it isn't needed.
  const openMessageMenu = useStableCallback((message: ChatMessage, isMine: boolean, _pageY: number) => {
    setMessageMenu({ message, isMine });
  });

  const messageMenuActions = useMemo(
    () => (messageMenu ? buildMessageMenuActions(messageMenu.message, messageMenu.isMine) : []),
    [buildMessageMenuActions, messageMenu]
  );

  // Same request and result alert as the menu's Translate action.
  const handleTranslateChip = useStableCallback((message: ChatMessage) => {
    translateMessage(message);
  });

  const openImageViewer = useCallback((url: string) => {
    setViewerImageUrl(url);
  }, []);
  const closeImageViewer = useCallback(() => {
    setViewerImageUrl(null);
  }, []);

  // reply_to payloads carry no attachment: quote the loaded original so photos read "Photo".
  const replyPreviewById = useMemo(() => {
    const byId = new Map<number, ChatMessage>();
    sortedMessages.forEach((message) => byId.set(message.id, message));
    const previews: Record<number, string> = {};
    sortedMessages.forEach((message) => {
      if (!message.reply_to) return;
      previews[message.id] = toReplyPreviewText(byId.get(message.reply_to.id) ?? message.reply_to);
    });
    return previews;
  }, [sortedMessages]);

  // Per-row flags derived from the whole list (day separators, group position), computed once per
  // message-list / unread-anchor change; rows get primitives only.
  const groupFlagsById = useMemo(
    () => getMessageGroupFlags(sortedMessages, unreadAnchorMessageId),
    [sortedMessages, unreadAnchorMessageId]
  );

  latestMessageRef.current = sortedMessages[sortedMessages.length - 1] ?? null;
  const jumpUnreadCount = useMemo(
    () => countIncomingAfter(sortedMessages, jumpAnchorMessageId, currentUserId),
    [currentUserId, jumpAnchorMessageId, sortedMessages]
  );

  const otherParticipant = selectedConversation
    ? selectedConversation.sender.username === currentUsername
      ? selectedConversation.receiver
      : selectedConversation.sender
    : null;
  const otherAvatarName = otherParticipant?.username ?? null;
  const otherAvatarPath = otherParticipant?.profile_image_url ?? null;

  const searchResultIdSet = useMemo(() => new Set(searchResultIds), [searchResultIds]);
  const normalizedSearchQuery = searchQuery.trim();
  const activeSearchMessageId =
    activeSearchIndex < searchResultIds.length ? searchResultIds[activeSearchIndex] : null;

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMine = item.sender?.id === currentUserId;
      const isSearchMatch = Boolean(normalizedSearchQuery) && searchResultIdSet.has(item.id);
      const flags = groupFlagsById[item.id];
      return (
        <MessageRow
          item={item}
          currentUserId={currentUserId}
          isMine={isMine}
          dayLabel={flags?.dayLabel ?? null}
          showUnreadDivider={unreadAnchorMessageId === item.id}
          startsGroup={flags?.startsGroup ?? true}
          endsGroup={flags?.endsGroup ?? true}
          avatarName={otherAvatarName}
          avatarPath={otherAvatarPath}
          isReplyActive={replyTarget?.id === item.id}
          showReactionPicker={reactionPickerMessageId === item.id}
          isHighlighted={highlightedMessageId === item.id}
          searchHighlight={isSearchMatch ? normalizedSearchQuery : null}
          isActiveSearchMatch={isSearchMatch && activeSearchMessageId === item.id}
          replyPreview={replyPreviewById[item.id] ?? null}
          showTranslate={
            !isMine &&
            item.local_status !== "sending" &&
            item.can_translate !== false &&
            Boolean((item.text || "").trim())
          }
          styles={chatStyles}
          warm={warm}
          highlightOpacity={messageHighlightOpacity}
          highlightScale={messageHighlightScale}
          onSwipeReply={handleSwipe}
          onReactionSelect={handleReactionSelect}
          onOpenMenu={openMessageMenu}
          onTap={handleMessageTap}
          onOpenImage={openImageViewer}
          onTranslate={handleTranslateChip}
        />
      );
    },
    [
      activeSearchMessageId,
      chatStyles,
      currentUserId,
      groupFlagsById,
      handleMessageTap,
      handleReactionSelect,
      handleSwipe,
      handleTranslateChip,
      highlightedMessageId,
      messageHighlightOpacity,
      messageHighlightScale,
      normalizedSearchQuery,
      openImageViewer,
      openMessageMenu,
      otherAvatarName,
      otherAvatarPath,
      reactionPickerMessageId,
      replyPreviewById,
      replyTarget?.id,
      searchResultIdSet,
      unreadAnchorMessageId,
      warm,
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
      // Follow new messages when already at the bottom, or when the newest one is ours.
      const newest = latestMessageRef.current;
      if (isNearBottomRef.current || (newest && newest.sender?.id === currentUserId)) {
        scrollToBottom(true);
      }
    }
    previousMessageCountRef.current = messageCount;
  }, [currentUserId, selectedConversation?.id, selectedConversation?.messages?.length, scrollToBottom]);

  const handleMessageListContentSizeChange = useCallback(() => {
    if (skipAutoScrollRef.current) return;
    if (unreadAnchorMessageId == null && isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom, unreadAnchorMessageId]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      messageListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index - 48),
        animated: !reduceMotion,
      });
      setTimeout(() => {
        messageListRef.current?.scrollToIndex({
          index: info.index,
          animated: !reduceMotion,
          viewPosition: 0.5,
        });
      }, 160);
    },
    [reduceMotion]
  );

  const handleMessageListScrollBeginDrag = useCallback(() => {
    userScrolledRef.current = true;
    if (replyTarget) clearReplyTarget();
  }, [clearReplyTarget, replyTarget]);

  const handleMessageListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const isAway = distanceFromBottom > 140;
      if (!isAway) {
        isNearBottomRef.current = true;
        userScrolledRef.current = false;
      } else if (userScrolledRef.current) {
        // Only a drag or a jump leaves the bottom; intermediate offsets while the first batches
        // render (or programmatic scrollToEnd) must not stop the list from following new content.
        isNearBottomRef.current = false;
      }
      setShowJumpToLatest(isAway);
      setJumpAnchorMessageId((prev) => (isAway ? prev ?? latestMessageRef.current?.id ?? null : null));
      if (contentOffset.y < 120 && nextOlderPageRef.current != null) {
        loadOlderMessages();
      }
    },
    [loadOlderMessages]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResultIds([]);
    setActiveSearchIndex(0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    clearSearch();
  }, [clearSearch]);

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [closeSearch, searchOpen]);

  const openOtherUserProfile = useCallback(
    (username: string) => {
      navigation.navigate("People", {
        screen: "PublicProfile",
        params: { username },
      });
    },
    [navigation]
  );

  const handleOptionsViewProfile = useCallback(
    (username: string) => {
      setChatActionsMenu(null);
      openOtherUserProfile(username);
    },
    [openOtherUserProfile]
  );

  const handleOptionsReport = useCallback(
    (username: string) => {
      setChatActionsMenu(null);
      handleReportUser(username);
    },
    [handleReportUser]
  );

  const openPinnedList = useCallback(() => setShowPinnedModal(true), []);
  const closePinnedList = useCallback(() => setShowPinnedModal(false), []);

  const handleReportSubmit = useCallback(
    async ({ reason, details }: { reason: string; details: string }) => {
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
    },
    [reportTargetUsername]
  );

  const openCoach = useCallback(() => navigation.navigate("CoachChat"), [navigation]);
  const findPeople = useCallback(() => navigation.navigate("People"), [navigation]);
  const refreshList = useCallback(() => loadConversations(true), [loadConversations]);
  const openConversationFromList = useCallback(
    (conversationId: number) => {
      openConversation(conversationId).catch((error) => {
        toastApiError(error, "Could not open this chat.", "Chat unavailable");
      });
    },
    [openConversation]
  );

  if (selectedConversation && otherParticipant) {
    const otherUser = otherParticipant;
    const trimmedSearch = searchQuery.trim();

    return (
      <ChatAudioContext.Provider value={audioController}>
        <ChatRoomView
          warm={warm}
          chatStyles={chatStyles}
          reduceMotion={reduceMotion}
          onTouchEndCapture={handleGlobalTouchEnd}
          otherUser={otherUser}
          isOnline={onlineUserIds.has(otherUser.id)}
          isTyping={Boolean(typingByConversation[selectedConversation.id])}
          optionsLoading={chatActionLoading}
          onBack={closeConversation}
          onOpenProfile={() => openOtherUserProfile(otherUser.username)}
          onOpenOptions={() => openChatActions(otherUser.username)}
          searchOpen={searchOpen}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          searchResultLabel={
            trimmedSearch ? `${searchResultIds.length ? activeSearchIndex + 1 : 0}/${searchResultIds.length}` : ""
          }
          searchHasResults={searchResultIds.length > 0}
          onToggleSearch={toggleSearch}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          onSearchPrevious={handleSearchPrevious}
          onSearchNext={handleSearchNext}
          onCloseSearch={closeSearch}
          pinnedMessages={pinnedMessages}
          showPinnedList={showPinnedModal}
          onOpenPinnedList={openPinnedList}
          onClosePinnedList={closePinnedList}
          onJumpToPinned={handlePinnedMessagePress}
          onUnpin={togglePinnedMessage}
          loadingConversation={loadingConversation}
          messageListRef={messageListRef}
          messages={sortedMessages}
          renderMessage={renderMessage}
          loadingOlderMessages={loadingOlderMessages}
          refreshingConversation={refreshingConversation}
          onRefresh={onMessageListRefresh}
          onContentSizeChange={handleMessageListContentSizeChange}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScrollBeginDrag={handleMessageListScrollBeginDrag}
          onScroll={handleMessageListScroll}
          showJumpToLatest={showJumpToLatest}
          jumpUnreadCount={jumpUnreadCount}
          onJumpToLatest={jumpToLatest}
          composerRef={composerRef}
          currentUserId={currentUserId}
          replyTarget={replyTarget}
          sending={sending}
          onClearReply={clearReplyTarget}
          onComposerFocus={handleComposerFocus}
          onTypingStart={emitTypingStarted}
          onTypingStop={emitTypingStopped}
          onSend={sendMessage}
        >
          <ReportUserModal
            colors={colors}
            visible={Boolean(reportTargetUsername)}
            username={reportTargetUsername || undefined}
            loading={chatActionLoading}
            onClose={() => setReportTargetUsername(null)}
            onSubmit={handleReportSubmit}
          />
          <ChatOptionsSheet
            warm={warm}
            menu={chatActionsMenu}
            loading={chatActionLoading}
            reduceMotion={reduceMotion}
            onClose={closeChatActionsMenu}
            onViewProfile={handleOptionsViewProfile}
            onReport={handleOptionsReport}
            onToggleBlock={handleToggleUserBlock}
          />
          <MessageActionsSheet
            warm={warm}
            menu={messageMenu}
            actions={messageMenuActions}
            reduceMotion={reduceMotion}
            onClose={closeMessageMenu}
          />
          <ImageViewer url={viewerImageUrl} onClose={closeImageViewer} />
        </ChatRoomView>
      </ChatAudioContext.Provider>
    );
  }

  if (openingFromNotification) {
    return (
      <OpeningState warm={warm} />
    );
  }

  return (
    <ConversationListView
      warm={warm}
      conversations={sortedConversations}
      currentUserId={currentUserId}
      currentUsername={currentUsername}
      onlineUserIds={onlineUserIds}
      typingByConversation={typingByConversation}
      loadingList={loadingList}
      coachLanguageValue={coachLanguageValue}
      coachLanguageLabel={coachLanguageLabel}
      searchQuery={participantUsername}
      onSearchQueryChange={setParticipantUsername}
      creatingConversation={creatingConversation}
      onStartConversation={startConversation}
      onOpenConversation={openConversationFromList}
      onOpenCoach={openCoach}
      onFindPeople={findPeople}
      onRefresh={refreshList}
    />
  );
}

/** Shown while a push/banner tap opens a conversation. */
function OpeningState({ warm }: { warm: WarmColors }) {
  const styles = useMemo(() => createOpeningStyles(warm), [warm]);
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={warm.teal} />
        <Text style={styles.text}>Opening conversation…</Text>
      </View>
    </SafeAreaView>
  );
}

const createOpeningStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: warm.paper },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    text: { color: warm.mutedInk, fontSize: 14, fontFamily: fontFamilies.bodySemiBold },
  });
