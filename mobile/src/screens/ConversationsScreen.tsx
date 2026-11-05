import type { TextInputInstance } from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
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
  confirmPendingMessage,
  countIncomingAfter,
  createFreshMessageTracker,
  findFirstUnreadMessageId,
  isFreshMessage,
  mergeMessagesById,
  trackFreshMessages,
  withCurrentUserReaction,
} from "../components/chat/messageState";
import {
  canTranslateMessage,
  nextTranslateAction,
  translationFromError,
  translationRowState,
  withTranslation,
  type TranslationEntry,
  type TranslationMap,
} from "../components/chat/translation";
import { useReducedMotion } from "../components/chat/useReducedMotion";
import {
  conversationTitle,
  getOtherParticipant,
  groupInvitees,
  groupMembers,
  groupStatusLabel,
  isGroupConversation,
} from "../components/chat/conversationList";
import { buildSeenBy, mergeReads } from "../components/chat/groupReads";
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
  editConversationMessage,
  fetchConversationMessagesPage,
  fetchConversations,
  getCachedConversations,
  markConversationRead,
  deleteConversationMessage,
  pinConversationMessage,
  reactToMessage,
  sendConversationMessage,
  sendMediaMessage,
  translateConversationMessage,
} from "../services/api/conversations";
import { getErrorMessage } from "../services/api/errors";
import { fetchGroupInvites, respondToGroupInvite } from "../services/api/groups";
import { subscribeToPresenceEvents } from "../services/presenceEvents";
import { hapticLight, hapticSelection, hapticSuccess } from "../services/haptics";
import { showToast, toastApiError } from "../services/toast";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";
import { resolveSpeechLanguage } from "../components/chat/speech";
import { setOpenConversationId } from "../services/push";
import { confirmReadLocally, forgetReadLocally, markReadLocally } from "../services/readState";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { ChatMessage, Conversation, GroupInvite } from "../types";
import { ChatOptionsSheet, type ChatOptionsState } from "./chat/ChatOptionsSheet";
import { ChatRoomView, type ChatContentInsets } from "./chat/ChatRoomView";
import { ConversationListView } from "./chat/ConversationListView";
import { GroupDetailsSheet } from "./chat/GroupDetailsSheet";
import { GroupPeopleSheet } from "./chat/GroupPeopleSheet";
import { StickerGifSheet, type MediaPick } from "./chat/StickerGifSheet";
import {
  MessageActionsSheet,
  type MessageMenuAction,
  type MessageMenuState,
} from "./chat/MessageActionsSheet";
import { useChatPresence } from "./chat/useChatPresence";
import { useChatSocket, type ChatGroupEvent } from "./chat/useChatSocket";
import { useStableCallback } from "./chat/useStableCallback";
import { isEmailUnverifiedError } from "../services/emailVerification";

// Chats tab (route `ChatsHome`): conversation list, or the open chat. State, requests and socket
// wiring live here; rendering is in `screens/chat/*` and `components/chat/*`.

// Older history page size for GET /conversations/<id>/messages/ (max 100 server-side).
const OLDER_MESSAGES_PAGE_SIZE = 50;

/** `kind`/`media` for the optimistic copy of a sticker or GIF (the server stores the real media). */
function optimisticMediaFields(media: MediaPick): Pick<ChatMessage, "kind" | "media"> {
  if (media.kind === "gif") return { kind: "gif", media: media.gif };
  const [pack, id] = media.sticker.ref.split(":");
  return {
    kind: "sticker",
    media: { pack, id, label: media.sticker.label, url: media.sticker.url },
  };
}
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
  const [participantUsername, setParticipantUsername] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<Record<number, boolean>>({});
  // Group chats: pending invites, the open sheet, read positions ("Seen by") and who is typing.
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [respondingInviteId, setRespondingInviteId] = useState<number | null>(null);
  const [groupSheet, setGroupSheet] = useState<"create" | "add" | "details" | null>(null);
  const [mediaSheetVisible, setMediaSheetVisible] = useState(false);
  const [nicknameTargetUsername, setNicknameTargetUsername] = useState<string | null>(null);
  const openGroupNicknameEditor = useCallback((username: string) => {
    if (!username) return;
    setNicknameTargetUsername(username);
    setGroupSheet("details");
  }, []);
  const [groupPreselected, setGroupPreselected] = useState<string[]>([]);
  const [groupReads, setGroupReads] = useState<Record<number, string | null>>({});
  const [groupTypingUserId, setGroupTypingUserId] = useState<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  // Own message being edited in the composer (long-press → Edit).
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const editingMessageRef = useRef<ChatMessage | null>(null);
  editingMessageRef.current = editingMessage;
  // Jump highlight: the row pulses whenever `nonce` changes (Reanimated, in MessageRow).
  const [highlight, setHighlight] = useState<{ messageId: number; nonce: number } | null>(null);
  // Inline translations of the open chat, cached per message id for the session.
  const [translations, setTranslationsState] = useState<TranslationMap>({});
  const translationsRef = useRef<TranslationMap>(translations);
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
  // Sends are shown at once but POSTed one at a time, in order (see sendMessage).
  const sendQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const optimisticSeqRef = useRef(0);

  const selectedConversationIdRef = useRef<number | null>(null);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  const searchInputRef = useRef<TextInputInstance | null>(null);
  const ignoreNextOutsideTapRef = useRef(false);
  const replyActivatedAtRef = useRef(0);
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
  // List metrics for an inset-aware scroll-to-bottom: keyboard-controller adds the keyboard
  // height as a bottom content inset that FlatList.scrollToEnd doesn't know about.
  const listContentHeightRef = useRef(0);
  const listLayoutHeightRef = useRef(0);
  const listBottomInsetRef = useRef(0);
  // Conversation whose open-time auto-scroll (bottom or unread divider) already ran.
  const autoScrolledConversationRef = useRef<number | null>(null);
  // Rows of messages that arrived while the chat is open animate in once.
  const freshTrackerRef = useRef(createFreshMessageTracker());
  const highlightNonceRef = useRef(0);

  const setTranslations = useCallback((update: (prev: TranslationMap) => TranslationMap) => {
    const next = update(translationsRef.current);
    translationsRef.current = next;
    setTranslationsState(next);
  }, []);

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
    setEditingMessage(null);
    setViewerImageUrl(null);
    Speech.stop().catch(() => {});
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
    setHighlight(null);
    translationsRef.current = {};
    setTranslationsState({});
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
      // Clear the tab badge and the row's unread pill at once; the server read follows below.
      markReadLocally(conversationId);
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId && conversation.unread_count
            ? { ...conversation, unread_count: 0 }
            : conversation
        )
      );
      try {
        const response = await fetchConversation(conversationId);
        if (selectedConversationIdRef.current === conversationId) {
          initialUnreadCountRef.current = response.unread_count || 0;
          // Unread divider above the first unread message; the open-time effect scrolls to it.
          // It stays after mark-read until the user sends, refreshes or a new message arrives.
          const sortedOpenMessages = [...(response.messages || [])].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setUnreadAnchorMessageId(
            findFirstUnreadMessageId(sortedOpenMessages, response.unread_count || 0, currentUserId)
          );
          autoScrolledConversationRef.current = null;
          setSelectedConversation(response);
          previousMessageCountRef.current = response.messages?.length || 0;
          resetOlderPaging(response.messages?.length || 0);
          setLoadingConversation(false);
          // Background: mark read, then refresh badge + list.
          markConversationRead(conversationId)
            .then(() => {
              confirmReadLocally(conversationId);
              if (selectedConversationIdRef.current === conversationId) {
                initialUnreadCountRef.current = 0;
              }
              DeviceEventEmitter.emit("conversations_refresh");
              return loadConversations(true);
            })
            .catch(() => forgetReadLocally(conversationId));
        }
      } catch (error) {
        forgetReadLocally(conversationId);
        throw error;
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
    [currentUserId, loadConversations, resetOlderPaging]
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

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await fetchGroupInvites());
    } catch {
      // Invites are a side section; the list still works without them.
    }
  }, []);

  useEffect(() => {
    if (isFocused) loadInvites();
  }, [isFocused, loadInvites]);

  // New invites (and accept/decline from another device) arrive on the presence socket.
  useEffect(
    () =>
      subscribeToPresenceEvents((event) => {
        if (event.type === "group_invite") loadInvites();
        if (event.type === "conversation_update" && event.trigger === "group_members") loadInvites();
      }),
    [loadInvites]
  );

  const respondToInvite = useStableCallback(async (invite: GroupInvite, action: "accept" | "decline") => {
    setRespondingInviteId(invite.conversation_id);
    try {
      await respondToGroupInvite(invite.conversation_id, action);
      setInvites((current) => current.filter((item) => item.conversation_id !== invite.conversation_id));
      if (action === "accept") {
        hapticSuccess();
        await loadConversations(true);
        await openConversation(invite.conversation_id);
      }
    } catch (error) {
      toastApiError(error, action === "accept" ? "Couldn't join the group." : "Couldn't decline the invite.");
      loadInvites();
    } finally {
      setRespondingInviteId(null);
    }
  });

  // Members/name changed (or someone read): refetch the open group's detail, keeping the
  // loaded messages (the detail only carries the latest page).
  const refreshOpenGroup = useStableCallback(async () => {
    const conversationId = selectedConversationIdRef.current;
    if (!conversationId) return;
    try {
      const updated = await fetchConversation(conversationId);
      if (selectedConversationIdRef.current !== conversationId) return;
      setSelectedConversation((previous) =>
        previous && previous.id === conversationId
          ? {
              ...previous,
              name: updated.name,
              display_name: updated.display_name,
              participants: updated.participants,
              my_role: updated.my_role,
            }
          : previous
      );
    } catch {
      // Removed from the group: the socket closes and the list refetch drops it.
    }
  });

  const handleGroupEvent = useStableCallback((event: ChatGroupEvent) => {
    if (event.type === "group_updated") {
      refreshOpenGroup();
    } else if (event.type === "group_read") {
      setGroupReads((current) => ({ ...current, [event.userId]: event.lastReadAt }));
    } else if (event.type === "typing") {
      setGroupTypingUserId((current) =>
        event.isTyping ? event.senderId : current === event.senderId ? null : current
      );
    }
  });

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

  // Composer send while editing: shows the new text at once, PATCHes it, reverts on failure
  // (the composer restores the draft and edit mode comes back).
  const saveEdit = useStableCallback(async (text: string): Promise<boolean> => {
    const original = editingMessageRef.current;
    if (!original || !selectedConversation) return false;
    const conversationId = selectedConversation.id;
    const trimmed = text.trim();
    if (!trimmed) return false;
    setEditingMessage(null);
    if (trimmed === (original.text || "").trim()) return true;
    const patch = (fields: Partial<ChatMessage>) =>
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        const messages = prev.messages.map((m) => (m.id === original.id ? { ...m, ...fields } : m));
        return { ...prev, messages, pinned_messages: buildPinnedMessages(messages) };
      });
    patch({ text: trimmed, edited_at: new Date().toISOString() });
    try {
      const saved = await editConversationMessage(original.id, trimmed);
      patch({ text: saved.text ?? trimmed, edited_at: saved.edited_at ?? new Date().toISOString() });
      scheduleConversationsRefresh();
      return true;
    } catch (error) {
      patch({ text: original.text, edited_at: original.edited_at ?? null });
      if (selectedConversationIdRef.current === conversationId) setEditingMessage(original);
      toastApiError(error, "Could not save your edit.", "Edit not saved");
      return false;
    }
  });

  const startEditing = useCallback((message: ChatMessage) => {
    setReplyTarget(null);
    setEditingMessage(message);
    composerRef.current?.setDraft(message.text || "");
  }, []);

  const cancelEditing = useCallback(() => setEditingMessage(null), []);

  // Called by Composer with its draft (or by the sticker/GIF sheet with `media`); resolves true
  // when sent. Every send shows an optimistic bubble at once (negative id,
  // `local_status: "sending"`) that the saved message fills in place (POST response or socket
  // echo, whichever comes first). Requests go out one at a time, in the order they were sent.
  const sendMessage = useStableCallback(
    async (messageText: string, attachment: PickedAttachment | null, media: MediaPick | null = null): Promise<boolean> => {
      const trimmed = media ? "" : messageText.trim();
      if (!selectedConversation || (!trimmed && !attachment && !media) || !currentUserId || !currentUsername) return false;
      if (editingMessageRef.current && !attachment && !media) return saveEdit(messageText);

      const conversationId = selectedConversation.id;
      const replyTo = replyTarget && replyTarget.id > 0 ? replyTarget : null;
      optimisticSeqRef.current = (optimisticSeqRef.current + 1) % 100;
      const optimisticId = -(Date.now() * 100 + optimisticSeqRef.current);
      {
        const optimistic: ChatMessage = {
          id: optimisticId,
          local_key: String(optimisticId),
          text: trimmed,
          sender: { id: currentUserId, username: currentUsername },
          status: "sent",
          attachment_url: attachment?.uri ?? null,
          local_mime_type: attachment?.mimeType ?? null,
          ...(media ? optimisticMediaFields(media) : null),
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
        initialUnreadCountRef.current = 0;
        setUnreadAnchorMessageId(null);
        emitTypingStopped();
        // Sending always brings the list back to the newest message.
        isNearBottomRef.current = true;
        userScrolledRef.current = false;
        scrollToBottom(!reduceMotion);
      }
      const request = sendQueueRef.current.then(() =>
        media
          ? sendMediaMessage(
              conversationId,
              media.kind === "sticker"
                ? { kind: "sticker", stickerRef: media.sticker.ref }
                : { kind: "gif", gifId: media.gif.id },
              replyTo?.id
            )
          : sendConversationMessage(
              conversationId,
              trimmed,
              replyTo?.id,
              attachment ? { uri: attachment.uri, name: attachment.name, type: attachment.mimeType } : null
            )
      );
      // The next send waits for this one, failed or not.
      sendQueueRef.current = request.catch(() => undefined);
      try {
        const saved = await request;
        const savedMessage: ChatMessage = {
          ...saved,
          attachment_url: saved.attachment_url || null,
          reply_to: saved.reply_to || null,
        };

        setSelectedConversation((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          if (prev.messages.some((m) => m.id === savedMessage.id)) {
            // The socket echo already filled the bubble; drop a leftover optimistic copy if any.
            if (!prev.messages.some((m) => m.id === optimisticId)) return prev;
            const nextMessages = prev.messages.filter((m) => m.id !== optimisticId);
            return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
          }
          // Fill the optimistic bubble in place (same list key: the row is reused, no flash).
          const nextMessages =
            confirmPendingMessage(prev.messages, savedMessage, optimisticId) ?? [...prev.messages, savedMessage];
          return { ...prev, messages: nextMessages, pinned_messages: buildPinnedMessages(nextMessages) };
        });
        hapticSuccess();
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
        // The draft is restored to the composer so the user can retry.
        setSelectedConversation((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          return { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) };
        });
        if (replyTo && selectedConversationIdRef.current === conversationId) {
          setReplyTarget((current) => current ?? replyTo);
        }
        toastApiError(
          error,
          media
            ? media.kind === "gif"
              ? "Could not send the GIF."
              : "Could not send the sticker."
            : attachment
              ? attachment.mimeType.startsWith("audio/")
                ? "Could not send your voice message."
                : "Could not send your photo."
              : "Could not send your message.",
          "Message not sent"
        );
        return false;
      }
    }
  );

  const openMediaSheet = useCallback(() => setMediaSheetVisible(true), []);
  const closeMediaSheet = useCallback(() => setMediaSheetVisible(false), []);
  const sendMedia = useStableCallback((pick: MediaPick) => {
    setMediaSheetVisible(false);
    void sendMessage("", null, pick);
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
      // 403 email_unverified: the central verify prompt (AppTabs) is already showing.
      if (!isEmailUnverifiedError(error)) {
        Alert.alert("Chat error", getErrorMessage(error, "Could not open chat."));
      }
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
      hapticSelection();
      try {
        const updated = await reactToMessage(message.id, emoji);
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
    onGroupEvent: handleGroupEvent,
  });

  // Read positions follow the open group (reset when another chat opens).
  const readsConversationIdRef = useRef<number | null>(null);
  useEffect(() => {
    const id = selectedConversation?.id ?? null;
    const participants = selectedConversation?.participants || [];
    setGroupReads((current) => mergeReads(readsConversationIdRef.current === id ? current : {}, participants));
    if (readsConversationIdRef.current !== id) setGroupTypingUserId(null);
    readsConversationIdRef.current = id;
  }, [selectedConversation?.id, selectedConversation?.participants]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [conversations]);

  // Keyed on the messages array only: other conversation fields don't re-sort or regroup.
  const selectedMessages = selectedConversation?.messages;
  const sortedMessages = useMemo(() => {
    if (!selectedMessages) return [];
    return [...selectedMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [selectedMessages]);

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
    if (editingMessageRef.current) {
      // Replying leaves edit mode (and drops the edit draft).
      setEditingMessage(null);
      composerRef.current?.setDraft("");
    }
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

  // Scroll to a message (search, pinned, reply quote, unread divider). Stable identity so effects
  // that call it don't re-run on every new message.
  const jumpToMessage = useStableCallback((messageId: number, options?: { highlight?: boolean }) => {
    const index = messageIndexById[messageId];
    if (index === undefined) return;
    userScrolledRef.current = true;
    messageListRef.current?.scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.5 });
    if (options?.highlight === false) return;
    // MessageRow runs the pulse on the UI thread (static outline with reduced motion).
    highlightNonceRef.current += 1;
    setHighlight({ messageId, nonce: highlightNonceRef.current });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      highlightTimeoutRef.current = null;
      setHighlight((prev) => (prev?.messageId === messageId ? null : prev));
    }, 1300);
  });

  // Inset-aware: with the keyboard open the list has an extra bottom inset (keyboard-controller)
  // that FlatList.scrollToEnd ignores, which would leave the last message under the composer.
  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (!list) return;
      const inset = listBottomInsetRef.current;
      if (inset > 0 && listLayoutHeightRef.current > 0 && listContentHeightRef.current > 0) {
        list.scrollToOffset({
          offset: Math.max(0, listContentHeightRef.current + inset - listLayoutHeightRef.current),
          animated,
        });
        return;
      }
      list.scrollToEnd({ animated });
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    isNearBottomRef.current = true;
    userScrolledRef.current = false;
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

  // Single tap on a bubble (recognised natively by MessageRow; it waits for a double tap only on
  // translatable received messages): reply quote -> jump to the original, else close the picker.
  const handleMessageTap = useStableCallback((message: ChatMessage) => {
    if (message.reply_to?.id) {
      jumpToMessage(message.reply_to.id);
      return;
    }
    if (reactionPickerMessageId) {
      setReactionPickerMessageId(null);
    }
  });

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

  const setTranslationEntry = useCallback(
    (messageId: number, entry: TranslationEntry | null) => {
      setTranslations((prev) => withTranslation(prev, messageId, entry));
    },
    [setTranslations]
  );

  // Double-tap (or the menu's Translate, `forceShow`): show the translation inline under the
  // original, or toggle a cached one. One request per message per session; results for a chat
  // that is no longer open are dropped.
  const toggleTranslation = useStableCallback((message: ChatMessage, forceShow = false) => {
    if (!canTranslateMessage(message, currentUserId)) return;
    const action = nextTranslateAction(translationsRef.current[message.id], message.translated_text, forceShow);
    if (action.kind === "busy") return;
    hapticSelection();
    if (action.kind === "toggle") {
      setTranslationEntry(message.id, action.next);
      return;
    }
    const conversationId = selectedConversationIdRef.current;
    setTranslationEntry(message.id, { status: "loading" });
    translateConversationMessage(message.id, user?.base_translate_language || "english")
      .then((result) => {
        if (selectedConversationIdRef.current !== conversationId) return;
        const translatedText = String(result?.translated_text || "").trim();
        if (translatedText) {
          setTranslationEntry(message.id, { status: "done", text: translatedText, visible: true });
          return;
        }
        setTranslationEntry(message.id, null);
        showToast("No translation came back for this message.", { title: "Translation" });
      })
      .catch((error: any) => {
        if (selectedConversationIdRef.current !== conversationId) return;
        const fromError = translationFromError(error?.data ?? error?.response?.data);
        if (fromError.text) {
          setTranslationEntry(message.id, { status: "done", text: fromError.text, visible: true });
          return;
        }
        setTranslationEntry(message.id, null);
        if (fromError.sameLanguage) {
          showToast("This message is already in your language.", { title: "Nothing to translate" });
          return;
        }
        toastApiError(error, "Couldn't translate this message. Please try again.", "Translation failed");
      });
  });

  const handleToggleTranslation = useStableCallback((message: ChatMessage) => {
    toggleTranslation(message);
  });

  const closeMessageMenu = useCallback(() => {
    setMessageMenu(null);
  }, []);

  // Same actions as the web right-click menu: React, Reply, Copy, Speak, Pin, Translate, Edit, Delete.
  const buildMessageMenuActions = useCallback(
    (message: ChatMessage, isMine: boolean) => {
      const text = (message.text || "").trim();
      const isTextKind = !message.kind || message.kind === "text";
      const actions: MessageMenuAction[] = [
        {
          key: "react",
          label: "React",
          icon: "happy-outline",
          onPress: () => {
            closeMessageMenu();
            setReactionPickerMessageId(message.id);
          },
        },
        {
          key: "reply",
          label: "Reply",
          icon: "arrow-undo",
          onPress: () => {
            closeMessageMenu();
            handleSwipe(message);
          },
        },
      ];

      if (text) {
        actions.push(
          {
            key: "copy",
            label: "Copy",
            icon: "copy-outline",
            onPress: () => {
              closeMessageMenu();
              Clipboard.setStringAsync(text)
                .then(() => {
                  hapticSelection();
                  showToast("Copied to clipboard", { variant: "success", durationMs: 1500 });
                })
                .catch(() => showToast("Could not copy the message.", { variant: "error" }));
            },
          },
          {
            key: "speak",
            label: "Speak",
            icon: "volume-high-outline",
            onPress: () => {
              closeMessageMenu();
              const sender = (selectedConversation?.participants || []).find(
                (participant) => participant.user.id === message.sender?.id
              );
              const directPartner = selectedConversation
                ? getOtherParticipant(selectedConversation, currentUsername)
                : null;
              const senderNative = isMine
                ? null
                : sender?.user.native_language ?? directPartner?.native_language ?? null;
              Speech.stop()
                .catch(() => {})
                .finally(() => {
                  Speech.speak(text, {
                    language: resolveSpeechLanguage(text, [message.translated_source_language, senderNative]),
                  });
                });
            },
          }
        );
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

      if (!isMine && canTranslateMessage(message, currentUserId)) {
        const entry = translationsRef.current[message.id];
        const showing = entry?.status === "done" && entry.visible;
        actions.push({
          key: "translate",
          label: showing ? "Show original" : "Translate",
          icon: "language-outline",
          onPress: () => {
            closeMessageMenu();
            if (showing) toggleTranslation(message);
            else toggleTranslation(message, true);
          },
        });
      }

      if (isMine) {
        if (isTextKind && text && message.id > 0) {
          actions.push({
            key: "edit",
            label: "Edit",
            icon: "create-outline",
            onPress: () => {
              closeMessageMenu();
              startEditing(message);
            },
          });
        }
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
    [
      closeMessageMenu,
      currentUserId,
      currentUsername,
      deleteMessage,
      handleSwipe,
      selectedConversation,
      startEditing,
      togglePinnedMessage,
      toggleTranslation,
    ]
  );

  // Long press (bubble or attachment): bottom-sheet menu with a light haptic.
  const openMessageMenu = useStableCallback((message: ChatMessage, isMine: boolean) => {
    hapticLight();
    setMessageMenu({ message, isMine });
  });

  const messageMenuActions = useMemo(
    () => (messageMenu ? buildMessageMenuActions(messageMenu.message, messageMenu.isMine) : []),
    // `translations` only so the Translate/Show original label is current while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildMessageMenuActions, messageMenu, translations]
  );

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

  // Messages that arrived since the chat opened (see trackFreshMessages): their rows animate in.
  useMemo(
    () => trackFreshMessages(freshTrackerRef.current, selectedConversation?.id ?? null, sortedMessages, Date.now()),
    [selectedConversation?.id, sortedMessages]
  );

  latestMessageRef.current = sortedMessages[sortedMessages.length - 1] ?? null;
  const jumpUnreadCount = useMemo(
    () => countIncomingAfter(sortedMessages, jumpAnchorMessageId, currentUserId),
    [currentUserId, jumpAnchorMessageId, sortedMessages]
  );

  const isGroup = isGroupConversation(selectedConversation);
  // Direct chats only (a group's sender is its creator, not "the other person").
  const otherParticipant = selectedConversation ? getOtherParticipant(selectedConversation, currentUsername) : null;
  const otherAvatarName = otherParticipant?.username ?? null;
  const otherAvatarPath = otherParticipant?.profile_image_url ?? null;
  const seenBy = useMemo(
    () =>
      isGroup && selectedConversation
        ? buildSeenBy(sortedMessages, groupReads, selectedConversation.participants, currentUserId)
        : null,
    [currentUserId, groupReads, isGroup, selectedConversation, sortedMessages]
  );

  const searchResultIdSet = useMemo(() => new Set(searchResultIds), [searchResultIds]);
  const normalizedSearchQuery = searchQuery.trim();
  const activeSearchMessageId =
    activeSearchIndex < searchResultIds.length ? searchResultIds[activeSearchIndex] : null;
  const highlightedMessageId = highlight?.messageId ?? null;
  const highlightNonce = highlight?.nonce ?? 0;

  // Re-created only when list-wide row inputs change (messages, picker, reply target, search,
  // highlight, translations). Typing, presence and composer keystrokes don't touch it, and each
  // memoized MessageRow re-renders only if its own primitive props changed.
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMine = item.sender?.id === currentUserId;
      const isSearchMatch = Boolean(normalizedSearchQuery) && searchResultIdSet.has(item.id);
      const flags = groupFlagsById[item.id];
      const translation = translationRowState(translations[item.id]);
      return (
        <MessageRow
          item={item}
          currentUserId={currentUserId}
          isMine={isMine}
          dayLabel={flags?.dayLabel ?? null}
          showUnreadDivider={unreadAnchorMessageId === item.id}
          startsGroup={flags?.startsGroup ?? true}
          endsGroup={flags?.endsGroup ?? true}
          avatarName={isGroup ? selectedConversation?.participants?.find((row) => row.user.id === item.sender?.id)?.nickname || item.sender?.username || null : otherAvatarName}
          avatarPath={isGroup ? item.sender?.profile_image_url ?? null : otherAvatarPath}
          senderLabel={isGroup ? selectedConversation?.participants?.find((row) => row.user.id === item.sender?.id)?.nickname || item.sender?.username || null : null}
          replyAuthorOverride={isGroup ? selectedConversation?.participants?.find((row) => row.user.id === item.reply_to?.sender?.id)?.nickname || null : null}
          seenLabel={seenBy && seenBy.messageId === item.id ? seenBy.label : null}
          isGroup={isGroup}
          isReplyActive={replyTarget?.id === item.id}
          showReactionPicker={reactionPickerMessageId === item.id}
          highlightNonce={highlightedMessageId === item.id ? highlightNonce : 0}
          searchHighlight={isSearchMatch ? normalizedSearchQuery : null}
          isActiveSearchMatch={isSearchMatch && activeSearchMessageId === item.id}
          replyPreview={replyPreviewById[item.id] ?? null}
          canTranslate={!isMine && canTranslateMessage(item, currentUserId)}
          translatedText={translation.translatedText}
          translating={translation.translating}
          animateIn={isFreshMessage(freshTrackerRef.current, item.id, Date.now())}
          styles={chatStyles}
          warm={warm}
          onSwipeReply={handleSwipe}
          onReactionSelect={handleReactionSelect}
          onOpenReactionPicker={setReactionPickerMessageId}
          onEditGroupNickname={openGroupNicknameEditor}
          onOpenMenu={openMessageMenu}
          onTap={handleMessageTap}
          onToggleTranslation={handleToggleTranslation}
          onOpenImage={openImageViewer}
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
      handleToggleTranslation,
      highlightNonce,
      highlightedMessageId,
      isGroup,
      selectedConversation?.participants,
      seenBy,
      normalizedSearchQuery,
      openImageViewer,
      openMessageMenu,
      openGroupNicknameEditor,
      otherAvatarName,
      otherAvatarPath,
      reactionPickerMessageId,
      replyPreviewById,
      replyTarget?.id,
      searchResultIdSet,
      translations,
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

  // Open-time scroll: to the unread divider when there is one (no pulse), else to the bottom. A
  // later anchor (pull-to-refresh) scrolls to it again; clearing it never yanks the list.
  useEffect(() => {
    const conversationId = selectedConversation?.id;
    if (!conversationId || loadingConversation) return;
    if (unreadAnchorMessageId != null) {
      autoScrolledConversationRef.current = conversationId;
      requestAnimationFrame(() => jumpToMessage(unreadAnchorMessageId, { highlight: false }));
      return;
    }
    if (autoScrolledConversationRef.current !== conversationId) {
      autoScrolledConversationRef.current = conversationId;
      scrollToBottom(false);
    }
  }, [jumpToMessage, loadingConversation, scrollToBottom, selectedConversation?.id, unreadAnchorMessageId]);

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

  const handleMessageListContentSizeChange = useCallback((_width: number, height: number) => {
    listContentHeightRef.current = height;
    if (skipAutoScrollRef.current) return;
    if (unreadAnchorMessageId == null && isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom, unreadAnchorMessageId]);

  const handleMessageListLayout = useCallback((event: LayoutChangeEvent) => {
    listLayoutHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const handleContentInsetChange = useCallback((insets: ChatContentInsets) => {
    listBottomInsetRef.current = insets.bottom;
  }, []);

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
      // The keyboard inset extends the scroll range past the content (see scrollToBottom).
      const distanceFromBottom =
        contentSize.height + listBottomInsetRef.current - (contentOffset.y + layoutMeasurement.height);
      const isAway = distanceFromBottom > 140;
      if (!isAway) {
        isNearBottomRef.current = true;
        userScrolledRef.current = false;
      } else if (userScrolledRef.current) {
        // Only a drag or a jump leaves the bottom; intermediate offsets while the first batches
        // render (or programmatic scrollToEnd) must not stop the list from following new content.
        isNearBottomRef.current = false;
      }
      setShowJumpToLatest((prev) => (prev === isAway ? prev : isAway));
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
  // Stable header callbacks (ChatHeader is memoized).
  const otherUsernameForActions = otherParticipant?.username ?? "";
  const handleOpenOtherProfile = useCallback(() => {
    if (isGroup) { setNicknameTargetUsername(null); setGroupSheet("details"); }
    else if (otherUsernameForActions) openOtherUserProfile(otherUsernameForActions);
  }, [isGroup, openOtherUserProfile, otherUsernameForActions]);
  const handleOpenChatOptions = useCallback(() => {
    if (isGroup) { setNicknameTargetUsername(null); setGroupSheet("details"); }
    else if (otherUsernameForActions) openChatActions(otherUsernameForActions);
  }, [isGroup, openChatActions, otherUsernameForActions]);
  const handleStartGroupWith = useCallback((username: string) => {
    setChatActionsMenu(null);
    setGroupPreselected([username]);
    setGroupSheet("create");
  }, []);
  const openNewGroup = useCallback(() => {
    setGroupPreselected([]);
    setGroupSheet("create");
  }, []);
  const closeGroupSheet = useCallback(() => { setGroupSheet(null); setNicknameTargetUsername(null); }, []);
  const handleGroupCreated = useStableCallback(async (group: Conversation) => {
    setGroupSheet(null);
    showToast("Group created. Invites are on their way.", { variant: "success" });
    await loadConversations(true);
    if (group?.id) {
      closeConversation();
      openConversation(group.id).catch(() => {});
    }
  });
  const handleGroupInvited = useStableCallback(() => {
    setGroupSheet(null);
    showToast("Invites sent. They'll join when they accept.", { variant: "success" });
    refreshOpenGroup();
  });
  const handleLeftGroup = useStableCallback(() => {
    setGroupSheet(null);
    closeConversation();
    loadConversations(true).catch(() => {});
  });

  // A group invite banner/push tap: show the list (invite cards are at the top).
  useEffect(() => {
    if (!route.params?.showInvitesAt) return;
    if (selectedConversationIdRef.current) closeConversation();
    loadInvites();
    navigation.setParams({ showInvitesAt: undefined });
  }, [closeConversation, loadInvites, navigation, route.params?.showInvitesAt]);
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

  if (selectedConversation && (otherParticipant || isGroup)) {
    const groupOthers = isGroup
      ? groupMembers(selectedConversation).filter((member) => member.id !== currentUserId)
      : [];
    const groupTitle = conversationTitle(selectedConversation, currentUsername);
    // Groups have no single "other user"; the header shows the group instead.
    const otherUser = otherParticipant ?? { id: -1, username: groupTitle };
    const groupTypingName = isGroup
      ? selectedConversation.participants?.find((row) => row.user.id === groupTypingUserId)?.nickname || groupOthers.find((member) => member.id === groupTypingUserId)?.username || null
      : null;
    const groupHeader = isGroup
      ? {
          title: groupTitle,
          members: groupOthers,
          status: groupStatusLabel(
            groupOthers.length + 1,
            groupOthers.filter((member) => onlineUserIds.has(member.id)).length,
            groupInvitees(selectedConversation).length
          ),
          typingLabel: typingByConversation[selectedConversation.id]
            ? groupTypingName
              ? `${groupTypingName} is typing…`
              : "Someone is typing…"
            : null,
        }
      : null;
    const trimmedSearch = searchQuery.trim();

    return (
      <ChatAudioContext.Provider value={audioController}>
        <ChatRoomView
          warm={warm}
          chatStyles={chatStyles}
          reduceMotion={reduceMotion}
          onTouchEndCapture={handleGlobalTouchEnd}
          otherUser={otherUser}
          group={groupHeader}
          isOnline={
            isGroup ? groupOthers.some((member) => onlineUserIds.has(member.id)) : onlineUserIds.has(otherUser.id)
          }
          isTyping={Boolean(typingByConversation[selectedConversation.id])}
          optionsLoading={chatActionLoading}
          onBack={closeConversation}
          onOpenProfile={handleOpenOtherProfile}
          onOpenOptions={handleOpenChatOptions}
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
          onListLayout={handleMessageListLayout}
          onContentInsetChange={handleContentInsetChange}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScrollBeginDrag={handleMessageListScrollBeginDrag}
          onScroll={handleMessageListScroll}
          showJumpToLatest={showJumpToLatest}
          jumpUnreadCount={jumpUnreadCount}
          onJumpToLatest={jumpToLatest}
          composerRef={composerRef}
          conversationId={selectedConversation.id}
          currentUserId={currentUserId}
          replyTarget={replyTarget}
          editingMessage={editingMessage}
          onCancelEdit={cancelEditing}
          sending={false}
          onClearReply={clearReplyTarget}
          onComposerFocus={handleComposerFocus}
          onTypingStart={emitTypingStarted}
          onTypingStop={emitTypingStopped}
          onSend={sendMessage}
          onOpenMediaPicker={openMediaSheet}
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
            onStartGroup={handleStartGroupWith}
          />
          {isGroup ? (
            <GroupDetailsSheet
              warm={warm}
              reduceMotion={reduceMotion}
              visible={groupSheet === "details"}
              group={selectedConversation}
              initialNicknameUsername={nicknameTargetUsername}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              onClose={closeGroupSheet}
              onChanged={refreshOpenGroup}
              onLeft={handleLeftGroup}
              onAddPeople={() => setGroupSheet("add")}
              onOpenProfile={(username) => {
                setGroupSheet(null);
                openOtherUserProfile(username);
              }}
            />
          ) : null}
          <GroupPeopleSheet
            warm={warm}
            reduceMotion={reduceMotion}
            visible={groupSheet === "add" || groupSheet === "create"}
            mode={groupSheet === "add" ? "add" : "create"}
            group={isGroup ? selectedConversation : null}
            conversations={conversations}
            currentUsername={currentUsername}
            preselected={groupPreselected}
            onClose={closeGroupSheet}
            onDone={groupSheet === "add" ? handleGroupInvited : handleGroupCreated}
          />
          <StickerGifSheet
            warm={warm}
            reduceMotion={reduceMotion}
            visible={mediaSheetVisible}
            onClose={closeMediaSheet}
            onPick={sendMedia}
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
    <>
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
      invites={invites}
      respondingInviteId={respondingInviteId}
      onRespondInvite={respondToInvite}
      onNewGroup={openNewGroup}
    />
    <GroupPeopleSheet
      warm={warm}
      reduceMotion={reduceMotion}
      visible={groupSheet === "create"}
      mode="create"
      conversations={conversations}
      currentUsername={currentUsername}
      preselected={groupPreselected}
      onClose={closeGroupSheet}
      onDone={handleGroupCreated}
    />
    </>
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
