import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  Image as RNImage,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { CoachAvatar } from "../components/CoachAvatar";
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
  fetchConversations,
  getCachedConversations,
  markConversationRead,
  deleteConversationMessage,
  reactToMessage,
  sendConversationMessage,
  translateConversationMessage,
} from "../services/api/conversations";
import type { ThemeColors } from "../theme/colors";
import type { ChatMessage, Conversation } from "../types";

type PresencePayload =
  | { type: "initial_online_users"; user_ids?: number[]; userIds?: number[] }
  | { type: "presence_update"; user_id: number; is_online: boolean }
  | { type: "typing_status"; conversation_id: number; sender_id: number; is_typing: boolean }
  | { type: "conversation_update"; conversation_id?: number; trigger?: string; actor_id?: number };

type ChatPayload =
  | {
      type: "chat";
      id?: number;
      message?: string;
      sender?: string;
      senderId?: number;
      attachmentUrl?: string | null;
      replyTo?: ChatMessage["reply_to"];
    }
  | { type: "deleteMessage"; messageId: number }
  | { type: "message_status"; messageIds?: number[]; status?: "sent" | "delivered" | "read"; actorId?: number }
  | { type: "message_reaction" | "messageReaction"; message?: ChatMessage }
  | { type: "user_typing" | "user_stopped_typing" };

const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function resolveMediaUrl(path?: string | null) {
  if (!path) return "https://placehold.co/100x100";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

function statusTicks(status?: string) {
  if (status === "read") return "✓✓";
  if (status === "delivered") return "✓✓";
  return "✓";
}

function toReplyPreviewText(message?: { text?: string | null } | null) {
  if (!message?.text) return "Attachment";
  const trimmed = message.text.trim();
  if (!trimmed) return "Attachment";
  return trimmed.length > 70 ? `${trimmed.slice(0, 70)}...` : trimmed;
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
  const [openingFromNotification, setOpeningFromNotification] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [participantUsername, setParticipantUsername] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<Record<number, boolean>>({});
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [messageMenu, setMessageMenu] = useState<{
    message: ChatMessage;
    isMine: boolean;
    top: number;
    align: "left" | "right";
  } | null>(null);
  const [chatActionLoading, setChatActionLoading] = useState(false);
  const [reportTargetUsername, setReportTargetUsername] = useState<string | null>(null);

  const selectedConversationIdRef = useRef<number | null>(null);
  const presenceSocketRef = useRef<WebSocket | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const messageInputRef = useRef<TextInput | null>(null);
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
  const conversationsFetchMetaRef = useRef<{ inFlight: boolean; lastRunAt: number }>({
    inFlight: false,
    lastRunAt: 0,
  });

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  useEffect(() => {
    setReplyTarget(null);
  }, [selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      Object.values(remoteTypingTimeoutsRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
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

  const openConversation = useCallback(
    async (conversationId: number) => {
      setLoadingConversation(true);
      selectedConversationIdRef.current = conversationId;
      try {
        const response = await fetchConversation(conversationId);
        if (selectedConversationIdRef.current === conversationId) {
          setSelectedConversation(response);
          previousMessageCountRef.current = response.messages?.length || 0;
          await markConversationRead(conversationId);
          DeviceEventEmitter.emit("conversations_refresh");
          await loadConversations(true);
        }
      } finally {
        setLoadingConversation(false);
      }
    },
    [loadConversations]
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

  const handleMessageInputChange = useCallback(
    (value: string) => {
      setMessageText(value);
      if (!selectedConversation) return;
      if (value.trim().length === 0) {
        emitTypingStopped();
        return;
      }
      emitTypingStarted();
    },
    [emitTypingStarted, emitTypingStopped, selectedConversation]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = messageText.trim();
    if (!selectedConversation || !trimmed || sending || !currentUserId || !currentUsername) return;

    setSending(true);
    try {
      const saved = await sendConversationMessage(selectedConversation.id, trimmed, replyTarget?.id);
      const savedMessage: ChatMessage = {
        id: saved.id,
        text: saved.text,
        status: saved.status,
        sender: saved.sender,
        attachment_url: saved.attachment_url || null,
        timestamp: saved.timestamp,
        reply_to: saved.reply_to || null,
      };

      setSelectedConversation((prev) => {
        if (!prev || prev.id !== selectedConversation.id) return prev;
        const hasMessage = prev.messages.some((m) => m.id === savedMessage.id);
        return hasMessage ? prev : { ...prev, messages: [...prev.messages, savedMessage] };
      });
      setMessageText("");
      setReplyTarget(null);
      emitTypingStopped();
      bumpConversationToTop({
        conversationId: selectedConversation.id,
        lastMessage: savedMessage,
        resetUnread: true,
        updatedAt: savedMessage.timestamp || new Date().toISOString(),
      });

      if (chatSocketRef.current && chatSocketRef.current.readyState === WebSocket.OPEN) {
        chatSocketRef.current.send(
          JSON.stringify({
            type: "chat",
            id: savedMessage.id,
            message: savedMessage.text || "",
            sender: currentUsername,
            senderId: currentUserId,
            attachmentUrl: savedMessage.attachment_url || null,
            replyTo: savedMessage.reply_to || null,
          })
        );
      } else {
        setTimeout(() => {
          if (chatSocketRef.current && chatSocketRef.current.readyState === WebSocket.OPEN) {
            chatSocketRef.current.send(
              JSON.stringify({
                type: "chat",
                id: savedMessage.id,
                message: savedMessage.text || "",
                sender: currentUsername,
                senderId: currentUserId,
                attachmentUrl: savedMessage.attachment_url || null,
                replyTo: savedMessage.reply_to || null,
              })
            );
          }
        }, 220);
      }
      await loadConversations(true);
    } finally {
      setSending(false);
    }
  }, [
    bumpConversationToTop,
    currentUserId,
    currentUsername,
    emitTypingStopped,
    loadConversations,
    messageText,
    replyTarget?.id,
    selectedConversation,
    sending,
  ]);

  const closeConversation = useCallback(() => {
    selectedConversationIdRef.current = null;
    emitTypingStopped();
    if (chatSocketRef.current) {
      chatSocketRef.current.close();
      chatSocketRef.current = null;
    }
    setSelectedConversation(null);
    setMessageText("");
    setReactionPickerMessageId(null);
    setReplyTarget(null);
  }, [emitTypingStopped]);

  const startConversation = useCallback(async () => {
    const username = participantUsername.trim();
    if (!username || creatingConversation) return;

    try {
      setCreatingConversation(true);
      const { id } = await createOrGetConversation(username);
      setParticipantUsername("");
      await openConversation(id);
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.response?.data?.detail || "Could not open chat.";
      Alert.alert("Chat error", message);
    } finally {
      setCreatingConversation(false);
    }
  }, [creatingConversation, openConversation, participantUsername]);

  const applyMessageUpdate = useCallback((updatedMessage: ChatMessage) => {
    setSelectedConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((message) =>
          message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
        ),
      };
    });
  }, []);

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
        const isBlocked = Boolean(profile.is_blocked_by_me);
        Alert.alert(username, "Conversation options", [
          { text: "Cancel", style: "cancel" },
          {
            text: "View profile",
            onPress: () => navigation.navigate("PublicProfile", { username }),
          },
          {
            text: isBlocked ? "Unblock user" : "Block user",
            onPress: async () => {
              try {
                setChatActionLoading(true);
                if (isBlocked) {
                  await unblockUser(username);
                  await loadConversations(true);
                  Alert.alert("Unblocked", `${username} can contact you again.`);
                } else {
                  await blockUser(username);
                  closeConversation();
                  await loadConversations(true);
                  Alert.alert("Blocked", `${username} has been blocked.`);
                }
              } catch {
                Alert.alert("Failed", `Could not ${isBlocked ? "unblock" : "block"} this user.`);
              } finally {
                setChatActionLoading(false);
              }
            },
          },
          {
            text: "Report user",
            style: "destructive",
            onPress: () => handleReportUser(username),
          },
        ]);
      } catch {
        Alert.alert("Unavailable", "Could not load chat options right now.");
      } finally {
        setChatActionLoading(false);
      }
    },
    [chatActionLoading, closeConversation, handleReportUser, loadConversations, navigation]
  );

  const handleReactionSelect = useCallback(
    async (message: ChatMessage, emoji: string) => {
      try {
        const nextEmoji = message.current_user_reaction === emoji ? "" : emoji;
        const updated = await reactToMessage(message.id, nextEmoji);
        applyMessageUpdate(updated);
      } catch {
        Alert.alert("Reaction failed", "Could not update reaction.");
      } finally {
        setReactionPickerMessageId(null);
      }
    },
    [applyMessageUpdate]
  );

  useEffect(() => {
    let mounted = true;
    const connectPresence = async () => {
      if (!currentUserId) return;

      const token = await tokenStorage.getAccessToken();
      if (!token || !mounted) return;

      const socket = new WebSocket(`${wsBaseUrl}/ws/presence/?token=${encodeURIComponent(token)}`);
      presenceSocketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as PresencePayload;
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
            if (data.conversation_id) {
              bumpConversationToTop({
                conversationId: data.conversation_id,
                updatedAt: new Date().toISOString(),
              });
            }
            loadConversations(true).catch(() => {});
          }
        } catch {}
      };
    };

    connectPresence();
    return () => {
      mounted = false;
      if (presenceSocketRef.current) {
        presenceSocketRef.current.close();
        presenceSocketRef.current = null;
      }
    };
  }, [bumpConversationToTop, currentUserId, loadConversations, setRemoteTyping, wsBaseUrl]);

  useEffect(() => {
    let mounted = true;
    const conversationId = selectedConversation?.id;
    if (!conversationId) return;

    const connectChat = async () => {
      const token = await tokenStorage.getAccessToken();
      if (!token || !mounted) return;

      const socket = new WebSocket(
        `${wsBaseUrl}/ws/socket-server/${conversationId}/?token=${encodeURIComponent(token)}`
      );
      chatSocketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ChatPayload;
          if (data.type === "chat") {
            const newMessage: ChatMessage = {
              id: data.id || Date.now(),
              text: data.message || "",
              sender: {
                id: data.senderId || 0,
                username: data.sender || "Unknown",
              },
              timestamp: new Date().toISOString(),
              reply_to: data.replyTo || null,
            };

            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              const exists = prev.messages.some((m) => m.id === newMessage.id);
              return exists ? prev : { ...prev, messages: [...prev.messages, newMessage] };
            });

            const isIncoming = Boolean(data.senderId && data.senderId !== currentUserId);
            const shouldResetUnread = isIncoming && isFocused;
            bumpConversationToTop({
              conversationId,
              lastMessage: newMessage,
              unreadDelta: isIncoming && !isFocused ? 1 : 0,
              resetUnread: shouldResetUnread,
              updatedAt: new Date().toISOString(),
            });

            if (data.senderId && data.senderId !== currentUserId && isFocused) {
              setRemoteTyping(conversationId, false);
              markConversationRead(conversationId)
                .then(() => DeviceEventEmitter.emit("conversations_refresh"))
                .catch(() => {});
            }
            loadConversations(true).catch(() => {});
            return;
          }

          if (data.type === "deleteMessage") {
            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              return { ...prev, messages: prev.messages.filter((m) => m.id !== data.messageId) };
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
    loadConversations,
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

  const messageIndexById = useMemo(() => {
    const indexMap: Record<number, number> = {};
    sortedMessages.forEach((message, index) => {
      indexMap[message.id] = index;
    });
    return indexMap;
  }, [sortedMessages]);

  const activateMessageInput = useCallback(() => {
    const focusInput = () => {
      const input = messageInputRef.current;
      if (!input) return;
      input.focus();
      const cursorPosition = messageText.length;
      input.setNativeProps({
        selection: { start: cursorPosition, end: cursorPosition },
      });
    };
    Keyboard.dismiss();
    requestAnimationFrame(focusInput);
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
  }, [messageText.length]);

  const handleSwipe = useCallback((message: ChatMessage) => {
    setReactionPickerMessageId(null);
    setReplyTarget(message);
    ignoreNextOutsideTapRef.current = true;
    replyActivatedAtRef.current = Date.now();
    activateMessageInput();
  }, [activateMessageInput]);

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
    if (messageInputRef.current?.isFocused()) return;
    clearReplyTarget();
  }, [clearReplyTarget, replyTarget]);

  const jumpToMessage = useCallback(
    (messageId: number) => {
      const index = messageIndexById[messageId];
      if (index === undefined) return;
      messageListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMessageId(messageId);
      setTimeout(() => {
        setHighlightedMessageId((prev) => (prev === messageId ? null : prev));
      }, 1400);
    },
    [messageIndexById]
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

  const handleMessageTap = useCallback(
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
    },
    [handleSingleMessageTap, handleSwipe]
  );

  const handleInputFocus = useCallback(() => {
    setReactionPickerMessageId(null);
    const input = messageInputRef.current;
    if (!input) return;
    const cursorPosition = messageText.length;
    input.setNativeProps({
      selection: { start: cursorPosition, end: cursorPosition },
    });
  }, [messageText.length]);

  const renderReplySwipeAction = useCallback(
    (isMine: boolean) => (
      <View style={[styles.replySwipeAction, isMine ? styles.replySwipeActionMine : styles.replySwipeActionOther]}>
        <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={18} color={colors.primary} />
      </View>
    ),
    [colors.primary, styles]
  );

  const deleteMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        await deleteConversationMessage(message.id);
        setSelectedConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.filter((m) => m.id !== message.id),
          };
        });

        if (chatSocketRef.current && chatSocketRef.current.readyState === WebSocket.OPEN) {
          chatSocketRef.current.send(
            JSON.stringify({
              type: "deleteMessage",
              messageId: message.id,
            })
          );
        }
        loadConversations(true).catch(() => {});
      } catch {
        Alert.alert("Delete failed", "Could not delete this message.");
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
        Alert.alert("Translation failed", "Could not translate this message.");
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
        destructive?: boolean;
        onPress: () => void;
      }> = [
        {
          key: "reply",
          label: "Reply",
          onPress: () => {
            closeMessageMenu();
            handleSwipe(message);
          },
        },
        {
          key: "react",
          label: "React",
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
          onPress: async () => {
            closeMessageMenu();
            await translateMessage(message);
          },
        });
      }
      if (isMine) {
        actions.push({
          key: "delete",
          label: "Delete",
          destructive: true,
          onPress: async () => {
            closeMessageMenu();
            await deleteMessage(message);
          },
        });
      }
      return actions;
    },
    [closeMessageMenu, deleteMessage, handleSwipe, translateMessage]
  );

  const openMessageMenu = useCallback(
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
    },
    [buildMessageMenuActions, windowHeight]
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.sender?.id === currentUserId;
    const isReplyActive = replyTarget?.id === item.id;
    const showReactionPicker = !isMine && reactionPickerMessageId === item.id;
    const groupedReactions = (item.reactions || []).reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});
    const reactionEntries = Object.entries(groupedReactions);
    const replyAuthor =
      item.reply_to?.sender?.id === currentUserId ? "You" : item.reply_to?.sender?.username || "User";

    let swipeableRef: Swipeable | null = null;
    const handleSwipeOpen = (direction: "left" | "right") => {
      if ((isMine && direction !== "right") || (!isMine && direction !== "left")) return;
      swipeableRef?.close();
      handleSwipe(item);
    };

    return (
      <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
        <Swipeable
          ref={(instance) => {
            swipeableRef = instance;
          }}
          friction={1.05}
          overshootLeft={false}
          overshootRight={false}
          leftThreshold={8}
          rightThreshold={8}
          dragOffsetFromLeftEdge={8}
          dragOffsetFromRightEdge={8}
          containerStyle={styles.swipeContainer}
          childrenContainerStyle={styles.swipeChildren}
          renderLeftActions={!isMine ? () => renderReplySwipeAction(false) : undefined}
          renderRightActions={isMine ? () => renderReplySwipeAction(true) : undefined}
          onSwipeableWillOpen={handleSwipeOpen}
        >
        <View style={styles.messageContainer}>
          {showReactionPicker ? (
            <View style={styles.reactionPicker}>
              {ALLOWED_REACTIONS.map((emoji) => (
                <Pressable
                  key={`${item.id}-${emoji}`}
                  style={[
                    styles.reactionPickerItem,
                    item.current_user_reaction === emoji && styles.reactionPickerItemActive,
                  ]}
                  onPress={() => handleReactionSelect(item, emoji)}
                >
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            style={[
              styles.messageBubble,
              isMine ? styles.messageMine : styles.messageOther,
              isReplyActive
                ? isMine
                  ? styles.messageBubbleReplyActiveMine
                  : styles.messageBubbleReplyActiveOther
                : null,
              highlightedMessageId === item.id ? styles.messageBubbleHighlighted : null,
            ]}
            onLongPress={(event) => {
              event.stopPropagation();
              openMessageMenu(item, isMine, event.nativeEvent.pageY);
            }}
            onPress={(event) => {
              event.stopPropagation();
              handleMessageTap(item);
            }}
            delayLongPress={450}
          >
            {isReplyActive ? (
              <View style={[styles.replyActiveIndicator, isMine ? styles.replyActiveIndicatorMine : styles.replyActiveIndicatorOther]}>
                <Ionicons name={isMine ? "arrow-undo" : "arrow-redo"} size={14} color={colors.primary} />
              </View>
            ) : null}
            {item.reply_to ? (
              <View style={[styles.replySnippet, isMine ? styles.replySnippetMine : styles.replySnippetOther]}>
                <Text
                  numberOfLines={1}
                  style={[styles.replySnippetAuthor, isMine ? styles.replySnippetAuthorMine : styles.replySnippetAuthorOther]}
                >
                  {replyAuthor}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.replySnippetText, isMine ? styles.replySnippetTextMine : styles.replySnippetTextOther]}
                >
                  {toReplyPreviewText(item.reply_to)}
                </Text>
              </View>
            ) : null}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.messageText, isMine ? styles.messageTextMine : styles.messageTextOther]}
            >
              {item.text || ""}
            </Text>
            <View style={styles.messageMetaRow}>
              <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : styles.messageTimeOther]}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              {isMine ? (
                <Text style={[styles.statusTick, item.status === "read" ? styles.statusTickRead : styles.statusTickDefault]}>
                  {statusTicks(item.status)}
                </Text>
              ) : null}
            </View>
          </Pressable>

          {reactionEntries.length > 0 ? (
            <View style={[styles.reactionsRow, isMine ? styles.reactionsRowMine : styles.reactionsRowOther]}>
              {reactionEntries.map(([emoji, count]) => (
                <View
                  key={`${item.id}-${emoji}`}
                  style={[
                    styles.reactionChip,
                    item.current_user_reaction === emoji && styles.reactionChipMine,
                  ]}
                >
                  <Text style={styles.reactionChipText}>
                    {emoji} {count}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        </Swipeable>
      </View>
    );
  };

  const onMessageListRefresh = useCallback(async () => {
    if (!selectedConversation?.id) return;
    setLoadingConversation(true);
    try {
      const updated = await fetchConversation(selectedConversation.id);
      setSelectedConversation(updated);
      previousMessageCountRef.current = updated.messages?.length || 0;
    } finally {
      setLoadingConversation(false);
    }
  }, [selectedConversation?.id]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    scrollToBottom(false);
  }, [selectedConversation?.id, scrollToBottom]);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    const messageCount = selectedConversation.messages?.length || 0;
    const previousCount = previousMessageCountRef.current;
    if (messageCount > previousCount) {
      scrollToBottom(true);
    }
    previousMessageCountRef.current = messageCount;
  }, [selectedConversation?.id, selectedConversation?.messages?.length, scrollToBottom]);

  if (selectedConversation) {
    const otherUser =
      selectedConversation.sender.username === currentUsername
        ? selectedConversation.receiver
        : selectedConversation.sender;

    return (
      <SafeAreaView style={styles.container}>
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
                <RNImage source={{ uri: resolveMediaUrl(otherUser.profile_image_url) }} style={styles.chatAvatar} />
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
            <Pressable
              style={styles.chatHeaderAction}
              onPress={(event) => {
                event.stopPropagation();
                openChatActions(otherUser.username);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </Pressable>
          </Pressable>

          {loadingConversation ? (
            <View style={styles.chatLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={messageListRef}
              data={sortedMessages}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMessage}
              onContentSizeChange={() => scrollToBottom(false)}
              onScrollToIndexFailed={(info) => {
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
              }}
              ListFooterComponent={<View style={styles.messagesFooterSpacer} />}
              refreshControl={
                <RefreshControl refreshing={loadingConversation} onRefresh={onMessageListRefresh} />
              }
              contentContainerStyle={styles.messagesContent}
              onScrollBeginDrag={() => replyTarget && clearReplyTarget()}
            />
          )}

          <View style={styles.inputWrap}>
            {replyTarget ? (
              <View style={styles.replyComposerBar}>
                <View style={styles.replyComposerTextWrap}>
                  <Text style={styles.replyComposerLabel}>
                    Replying to {replyTarget.sender?.id === currentUserId ? "your message" : replyTarget.sender?.username || "user"}
                  </Text>
                  <Text style={styles.replyComposerText} numberOfLines={1}>
                    {toReplyPreviewText(replyTarget)}
                  </Text>
                </View>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    setReplyTarget(null);
                  }}
                  style={styles.replyComposerClose}
                >
                  <Ionicons name="close" size={16} color={colors.mutedText} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                ref={messageInputRef}
                style={styles.input}
                value={messageText}
                onChangeText={handleMessageInputChange}
                onPressIn={(event) => {
                  event.stopPropagation();
                  activateMessageInput();
                }}
                onFocus={handleInputFocus}
                placeholder={
                  replyTarget
                    ? `Reply to: ${toReplyPreviewText(replyTarget)}`
                    : "Type a message..."
                }
                placeholderTextColor={colors.mutedText}
              />
              <Pressable
                style={styles.sendButton}
                onPress={(event) => {
                  event.stopPropagation();
                  sendMessage();
                }}
                disabled={sending}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
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
            } catch {
              Alert.alert("Failed", "Could not send this report.");
            } finally {
              setChatActionLoading(false);
            }
          }}
        />
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
                  styles.messageMenu,
                  { top: messageMenu.top },
                  messageMenu.align === "left" ? styles.messageMenuLeft : styles.messageMenuRight,
                ]}
              >
                {buildMessageMenuActions(messageMenu.message, messageMenu.isMine).map((action) => (
                  <Pressable
                    key={`${messageMenu.message.id}-${action.key}`}
                    style={styles.messageMenuItem}
                    onPress={action.onPress}
                  >
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
      </SafeAreaView>
    );
  }

  if (openingFromNotification) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.openingConversationText}>Opening conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
                <RNImage source={{ uri: resolveMediaUrl(otherUser.profile_image_url) }} style={styles.avatarImageWrap} />
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
    chatHeaderAction: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
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
      borderWidth: 2,
      borderColor: colors.primary,
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
    messageMenu: {
      position: "absolute",
      minWidth: 152,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 7,
    },
    messageMenuLeft: {
      left: 14,
    },
    messageMenuRight: {
      right: 14,
    },
    messageMenuItem: {
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    messageMenuItemText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "600",
    },
    messageMenuItemTextDanger: {
      color: colors.danger,
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
