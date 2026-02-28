import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { API_BASE_URL } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { tokenStorage } from "../services/storage";
import {
  createOrGetConversation,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  reactToMessage,
  sendConversationMessage,
} from "../services/api/conversations";
import type { ThemeColors } from "../theme/colors";
import type { ChatMessage, Conversation } from "../types";

type PresencePayload =
  | { type: "initial_online_users"; user_ids?: number[]; userIds?: number[] }
  | { type: "presence_update"; user_id: number; is_online: boolean }
  | { type: "typing_status"; conversation_id: number; sender_id: number; is_typing: boolean };

type ChatPayload =
  | {
      type: "chat";
      id?: number;
      message?: string;
      sender?: string;
      senderId?: number;
      attachmentUrl?: string | null;
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

export function ConversationsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const currentUserId = user?.user_id;
  const currentUsername = user?.username;
  const wsBaseUrl = useMemo(() => API_BASE_URL.replace(/^http/, "ws"), []);

  const [conversations, setConversations] = useState<Conversation[]>([]);
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

  const selectedConversationIdRef = useRef<number | null>(null);
  const presenceSocketRef = useRef<WebSocket | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
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

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const response = await fetchConversations();
      setConversations(response);
    } finally {
      setLoadingList(false);
    }
  }, []);

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
          await loadConversations();
        }
      } finally {
        setLoadingConversation(false);
      }
    },
    [loadConversations]
  );

  useEffect(() => {
    loadConversations();
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

  const scheduleStopTyping = useCallback(() => {
    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
    }
    stopTypingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent("user_stopped_typing");
    }, 1100);
  }, [sendTypingEvent]);

  const handleMessageInputChange = useCallback(
    (value: string) => {
      setMessageText(value);
      if (!selectedConversation) return;
      if (value.trim().length === 0) {
        const sent = sendTypingEvent("user_stopped_typing");
        if (!sent) {
          setTimeout(() => {
            sendTypingEvent("user_stopped_typing");
          }, 220);
        }
        return;
      }
      const sent = sendTypingEvent("user_typing");
      if (!sent) {
        setTimeout(() => {
          sendTypingEvent("user_typing");
        }, 220);
      }
      scheduleStopTyping();
    },
    [scheduleStopTyping, selectedConversation, sendTypingEvent]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = messageText.trim();
    if (!selectedConversation || !trimmed || sending || !currentUserId || !currentUsername) return;

    setSending(true);
    try {
      const saved = await sendConversationMessage(selectedConversation.id, trimmed);
      const savedMessage: ChatMessage = {
        id: saved.id,
        text: saved.text,
        status: saved.status,
        sender: saved.sender,
        attachment_url: saved.attachment_url || null,
        timestamp: saved.timestamp,
      };

      setSelectedConversation((prev) => {
        if (!prev || prev.id !== selectedConversation.id) return prev;
        const hasMessage = prev.messages.some((m) => m.id === savedMessage.id);
        return hasMessage ? prev : { ...prev, messages: [...prev.messages, savedMessage] };
      });
      setMessageText("");
      sendTypingEvent("user_stopped_typing");

      if (chatSocketRef.current && chatSocketRef.current.readyState === WebSocket.OPEN) {
        chatSocketRef.current.send(
          JSON.stringify({
            type: "chat",
            id: savedMessage.id,
            message: savedMessage.text || "",
            sender: currentUsername,
            senderId: currentUserId,
            attachmentUrl: savedMessage.attachment_url || null,
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
              })
            );
          }
        }, 220);
      }
      await loadConversations();
    } finally {
      setSending(false);
    }
  }, [
    currentUserId,
    currentUsername,
    loadConversations,
    messageText,
    selectedConversation,
    sendTypingEvent,
    sending,
  ]);

  const closeConversation = useCallback(() => {
    selectedConversationIdRef.current = null;
    sendTypingEvent("user_stopped_typing");
    if (chatSocketRef.current) {
      chatSocketRef.current.close();
      chatSocketRef.current = null;
    }
    setSelectedConversation(null);
    setMessageText("");
    setReactionPickerMessageId(null);
  }, [sendTypingEvent]);

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
  }, [currentUserId, setRemoteTyping, wsBaseUrl]);

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
            };

            setSelectedConversation((prev) => {
              if (!prev || prev.id !== conversationId) return prev;
              const exists = prev.messages.some((m) => m.id === newMessage.id);
              return exists ? prev : { ...prev, messages: [...prev.messages, newMessage] };
            });

            if (data.senderId && data.senderId !== currentUserId && isFocused) {
              setRemoteTyping(conversationId, false);
              markConversationRead(conversationId)
                .then(() => DeviceEventEmitter.emit("conversations_refresh"))
                .catch(() => {});
            }
            loadConversations().catch(() => {});
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
            loadConversations().catch(() => {});
            return;
          }

          if (
            (data.type === "message_reaction" || data.type === "messageReaction") &&
            (data as any).message?.id
          ) {
            applyMessageUpdate((data as any).message);
            loadConversations().catch(() => {});
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
      sendTypingEvent("user_stopped_typing");
      if (chatSocketRef.current) {
        chatSocketRef.current.close();
        chatSocketRef.current = null;
      }
      setRemoteTyping(conversationId, false);
    };
  }, [
    applyMessageUpdate,
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

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.sender?.id === currentUserId;
    const showReactionPicker = !isMine && reactionPickerMessageId === item.id;
    const groupedReactions = (item.reactions || []).reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});
    const reactionEntries = Object.entries(groupedReactions);

    return (
      <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
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
            style={[styles.messageBubble, isMine ? styles.messageMine : styles.messageOther]}
            onLongPress={!isMine ? () => setReactionPickerMessageId(item.id) : undefined}
            onPress={() => {
              if (reactionPickerMessageId) {
                setReactionPickerMessageId(null);
              }
            }}
            delayLongPress={450}
          >
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
        >
          <View style={styles.chatHeader}>
            <Pressable style={styles.backButton} onPress={closeConversation}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.chatTitleWrap}>
              <View>
                <Image source={{ uri: resolveMediaUrl(otherUser.profile_image_url) }} style={styles.chatAvatar} />
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
            <View style={styles.chatHeaderSpacer} />
          </View>

          {loadingConversation ? (
            <View style={styles.chatLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={messageListRef}
              data={[...(selectedConversation.messages || [])].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              )}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMessage}
              onContentSizeChange={() => scrollToBottom(false)}
              ListFooterComponent={<View style={styles.messagesFooterSpacer} />}
              refreshControl={
                <RefreshControl refreshing={loadingConversation} onRefresh={onMessageListRefresh} />
              }
              contentContainerStyle={styles.messagesContent}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={handleMessageInputChange}
              onFocus={() => setReactionPickerMessageId(null)}
              placeholder="Type a message..."
              placeholderTextColor={colors.mutedText}
            />
            <Pressable style={styles.sendButton} onPress={sendMessage} disabled={sending}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
                <Image source={{ uri: resolveMediaUrl(otherUser.profile_image_url) }} style={styles.avatarImageWrap} />
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
        refreshControl={<RefreshControl refreshing={loadingList} onRefresh={loadConversations} />}
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
    chatHeaderSpacer: {
      width: 34,
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
    messageContainer: {
      position: "relative",
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
    inputRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
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
