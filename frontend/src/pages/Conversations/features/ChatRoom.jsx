import React, { useState, useRef, useEffect, useCallback } from "react";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import TypingDots from "./TypingDots";
import CallPanel from "./CallPanel";
import axios from "../../../utils/axios";
import { deleteMessage } from "../api/deleteMessage";
import { editMessage } from "../api/editMessage";
import { pinMessage } from "../api/pinMessage";
import PushPinRoundedIcon from "@mui/icons-material/PushPinRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { BASE_URL } from "../../../constants/constants";
import { useUser } from "../../../context/UserContext";
import { usePresence } from "../../../context/PresenceContext";
import { markConversationRead } from "../api/markConversationRead";
import { useQueryClient } from "react-query";
import { getLegacyAccessToken } from "../../../utils/auth";

const CALL_TIMEOUT_MS = 30000;
const MESSAGE_PAGE_SIZE = 30;
const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const DEFAULT_AVATAR = "/media/profile_images/MainAfter.jpg";
const SOCKET_RECONNECT_DELAYS_MS = [800, 1500, 3000, 5000];
const SCROLL_BOTTOM_THRESHOLD_PX = 72;

const getIceServers = () => {
  const rawValue = process.env.REACT_APP_WEBRTC_ICE_SERVERS;
  if (!rawValue) return DEFAULT_ICE_SERVERS;

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_ICE_SERVERS;
    }
    return parsed;
  } catch (error) {
    console.warn("Invalid REACT_APP_WEBRTC_ICE_SERVERS, using default STUN server.");
    return DEFAULT_ICE_SERVERS;
  }
};

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const resolveAvatarUrl = (path) => {
  if (!path) return `${BASE_URL}${DEFAULT_AVATAR}`;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${BASE_URL}/${path}`;
  return `${BASE_URL}/media/${path}`;
};

const ChatRoom = ({ conversation, onConversationTypingChange }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const [pinnedMessages, setPinnedMessages] = useState(conversation.pinned_messages || []);
  const [showPinnedMenu, setShowPinnedMenu] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [callState, setCallState] = useState("idle");
  const [callMode, setCallMode] = useState("audio");
  const [callError, setCallError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [currentMessagesPage, setCurrentMessagesPage] = useState(1);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingMessage, setReplyingMessage] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultIds, setSearchResultIds] = useState([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const socket = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const isSocketUnmountingRef = useRef(false);
  const messagesContainerRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const incomingOfferRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callStateRef = useRef("idle");
  const callModeRef = useRef("audio");
  const callStartedAtRef = useRef(null);
  const callTimerIntervalRef = useRef(null);
  const ringAudioContextRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const scrollAdjustmentHeightRef = useRef(null);
  const isFetchingOlderRef = useRef(false);
  const isLocalUserTypingRef = useRef(false);
  const currentUserIdRef = useRef(null);
  const currentMessagesPageRef = useRef(1);
  const hasOlderMessagesRef = useRef(false);
  const pinnedMenuRef = useRef(null);
  const searchRequestRef = useRef(0);
  const initialUnreadCountRef = useRef(0);

  const { user, loading } = useUser();
  const { onlineUserIds } = usePresence();
  const queryClient = useQueryClient();

  const otherUser =
    conversation?.sender?.username === user?.username
      ? conversation?.receiver
      : conversation?.sender;
  const otherUserAvatarUrl = resolveAvatarUrl(otherUser?.profile_image_url);

  const mergeMessageUpdate = useCallback((updatedMessage) => {
    if (!updatedMessage?.id) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg))
    );
    setPinnedMessages((prev) => {
      const remaining = prev.filter((msg) => msg.id !== updatedMessage.id);
      if (!updatedMessage.is_pinned) {
        return remaining;
      }
      return [...remaining, updatedMessage].sort((a, b) => {
        const left = new Date(b.pinned_at || b.timestamp || 0).getTime();
        const right = new Date(a.pinned_at || a.timestamp || 0).getTime();
        return left - right;
      });
    });
  }, []);

  const mergeMessageStatusUpdate = useCallback((messageIds, nextStatus) => {
    if (!Array.isArray(messageIds) || !messageIds.length || !nextStatus) return;

    const ids = new Set(messageIds);
    setMessages((prev) =>
      prev.map((message) =>
        ids.has(message.id) ? { ...message, status: nextStatus } : message
      )
    );
  }, []);

  const collectSearchMatches = useCallback((messageList, query) => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return [];

    return messageList
      .filter((message) => String(message?.text || "").toLowerCase().includes(normalizedQuery))
      .map((message) => message.id);
  }, []);

  const findFirstUnreadMessageId = useCallback((messageList, unreadCount, currentUserId) => {
    const normalizedUnreadCount = Number(unreadCount) || 0;
    if (!normalizedUnreadCount || !currentUserId || !Array.isArray(messageList)) return null;

    let remainingUnread = normalizedUnreadCount;

    for (let index = messageList.length - 1; index >= 0; index -= 1) {
      const message = messageList[index];
      if (!message || message.sender?.id === currentUserId || message.isSystem) continue;

      remainingUnread -= 1;
      if (remainingUnread <= 0) {
        return message.id;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    currentUserIdRef.current = user?.user_id ?? null;
  }, [user?.user_id]);

  useEffect(() => {
    currentMessagesPageRef.current = currentMessagesPage;
  }, [currentMessagesPage]);

  useEffect(() => {
    hasOlderMessagesRef.current = hasOlderMessages;
  }, [hasOlderMessages]);

  useEffect(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResultIds([]);
    setActiveSearchIndex(0);
    setIsSearchingMessages(false);
    setUnreadAnchorMessageId(null);
    setShowJumpToLatest(false);
    searchRequestRef.current = 0;
    initialUnreadCountRef.current = Number(conversation?.unread_count) || 0;
  }, [conversation?.id]);

  useEffect(() => {
    if (!showPinnedMenu) return undefined;

    const handlePointerDown = (event) => {
      if (!pinnedMenuRef.current?.contains(event.target)) {
        setShowPinnedMenu(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showPinnedMenu]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  const updateJumpToLatestVisibility = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > SCROLL_BOTTOM_THRESHOLD_PX);
  }, []);

  const waitForNextPaint = useCallback(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
    []
  );

  const scrollToMessage = useCallback(
    async (messageId, behavior = "smooth") => {
      const container = messagesContainerRef.current;
      if (!container || !messageId) return false;

      const selector = `[data-message-id="${messageId}"]`;
      const target = container.querySelector(selector);
      if (!target) return false;

      target.scrollIntoView({ behavior, block: "center" });
      const bubble = target.querySelector('[data-message-bubble="true"]');
      if (bubble) {
        bubble.style.transition = "box-shadow 900ms ease, transform 260ms ease";
        bubble.style.boxShadow =
          "0 0 0 3px rgba(148, 163, 184, 0.28), 0 16px 32px -24px rgba(15, 23, 42, 0.35)";
        bubble.style.transform = "translateY(-1px)";
        window.setTimeout(() => {
          bubble.style.boxShadow = "";
          bubble.style.transform = "";
        }, 260);
      }
      return true;
    },
    []
  );

  const fetchMessagesPage = useCallback(
    async (conversationId, page, { force = false } = {}) => {
      const cacheKey = ["conversationMessagesPage", conversationId, page];
      if (!force) {
        const cached = queryClient.getQueryData(cacheKey);
        if (cached) return cached;
      }

      const response = await axios.get(
        `${BASE_URL}/api/conversations/${conversationId}/messages/`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
          params: {
            page,
            page_size: MESSAGE_PAGE_SIZE,
          },
        }
      );

      const payload = response.data || {};
      const normalized = {
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        pinned_messages: Array.isArray(payload.pinned_messages)
          ? payload.pinned_messages
          : [],
        pagination: payload.pagination || null,
      };
      queryClient.setQueryData(cacheKey, normalized);
      return normalized;
    },
    [queryClient]
  );

  const resolveFirstUnreadMessageId = useCallback(
    async (messageList, unreadCount) => {
      if (!conversation?.id || !unreadCount || !currentUserIdRef.current) return null;

      let workingMessages = Array.isArray(messageList) ? [...messageList] : [];
      let candidateId = findFirstUnreadMessageId(
        workingMessages,
        unreadCount,
        currentUserIdRef.current
      );
      let nextPage = currentMessagesPageRef.current + 1;
      let hasMore = hasOlderMessagesRef.current;

      while (!candidateId && hasMore) {
        const payload = await fetchMessagesPage(conversation.id, nextPage, { force: true });
        const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];

        if (nextMessages.length) {
          const seen = new Set(workingMessages.map((message) => message.id));
          const uniqueOlder = nextMessages.filter((message) => !seen.has(message.id));
          workingMessages = [...uniqueOlder, ...workingMessages];
          setMessages(workingMessages);
        }

        setCurrentMessagesPage(payload.pagination?.page || nextPage);
        setHasOlderMessages(Boolean(payload.pagination?.has_next));

        candidateId = findFirstUnreadMessageId(
          workingMessages,
          unreadCount,
          currentUserIdRef.current
        );
        nextPage = (payload.pagination?.page || nextPage) + 1;
        hasMore = Boolean(payload.pagination?.has_next);
      }

      return candidateId;
    },
    [conversation?.id, fetchMessagesPage, findFirstUnreadMessageId]
  );

  const jumpToPinnedMessage = useCallback(
    async (messageId) => {
      if (!conversation?.id || !messageId) return;

      const foundInCurrentMessages = await scrollToMessage(messageId);
      if (foundInCurrentMessages) return;

      let nextPage = currentMessagesPageRef.current + 1;
      let hasMore = hasOlderMessagesRef.current;
      if (!hasMore || isFetchingOlderRef.current) return;

      setLoadingOlderMessages(true);
      isFetchingOlderRef.current = true;

      try {
        while (hasMore) {
          const container = messagesContainerRef.current;
          if (container) {
            scrollAdjustmentHeightRef.current = container.scrollHeight;
          }

          const payload = await fetchMessagesPage(conversation.id, nextPage, { force: true });
          const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];

          setMessages((prev) => {
            const seen = new Set(prev.map((msg) => msg.id));
            const uniqueOlder = nextMessages.filter((msg) => !seen.has(msg.id));
            return [...uniqueOlder, ...prev];
          });
          setCurrentMessagesPage(payload.pagination?.page || nextPage);
          setHasOlderMessages(Boolean(payload.pagination?.has_next));

          nextPage = (payload.pagination?.page || nextPage) + 1;
          hasMore = Boolean(payload.pagination?.has_next);

          await waitForNextPaint();
          const foundAfterLoad = await scrollToMessage(messageId);
          if (foundAfterLoad) return;
        }
      } catch (error) {
        console.error("Failed to load older messages while jumping to pinned message:", error);
      } finally {
        isFetchingOlderRef.current = false;
        setLoadingOlderMessages(false);
      }
    },
    [conversation?.id, fetchMessagesPage, scrollToMessage, waitForNextPaint]
  );

  const jumpToMessageById = useCallback(
    async (messageId) => {
      if (!conversation?.id || !messageId) return false;

      const foundInCurrentMessages = await scrollToMessage(messageId);
      if (foundInCurrentMessages) return true;

      let nextPage = currentMessagesPageRef.current + 1;
      let hasMore = hasOlderMessagesRef.current;
      if (!hasMore || isFetchingOlderRef.current) return false;

      setLoadingOlderMessages(true);
      isFetchingOlderRef.current = true;

      try {
        while (hasMore) {
          const container = messagesContainerRef.current;
          if (container) {
            scrollAdjustmentHeightRef.current = container.scrollHeight;
          }

          const payload = await fetchMessagesPage(conversation.id, nextPage, { force: true });
          const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];

          setMessages((prev) => {
            const seen = new Set(prev.map((msg) => msg.id));
            const uniqueOlder = nextMessages.filter((msg) => !seen.has(msg.id));
            return [...uniqueOlder, ...prev];
          });
          setCurrentMessagesPage(payload.pagination?.page || nextPage);
          setHasOlderMessages(Boolean(payload.pagination?.has_next));

          nextPage = (payload.pagination?.page || nextPage) + 1;
          hasMore = Boolean(payload.pagination?.has_next);

          await waitForNextPaint();
          const foundAfterLoad = await scrollToMessage(messageId);
          if (foundAfterLoad) return true;
        }
      } catch (error) {
        console.error("Failed to load older messages while jumping to message:", error);
      } finally {
        isFetchingOlderRef.current = false;
        setLoadingOlderMessages(false);
      }

      return false;
    },
    [conversation?.id, fetchMessagesPage, scrollToMessage, waitForNextPaint]
  );

  const invalidateConversationHistoryCache = useCallback(
    (conversationId) => {
      if (!conversationId) return;
      queryClient.invalidateQueries(["conversationMessagesPage", conversationId]);
    },
    [queryClient]
  );

  const performConversationSearch = useCallback(
    async (rawQuery) => {
      const normalizedQuery = String(rawQuery || "").trim().toLowerCase();
      const requestId = Date.now();
      searchRequestRef.current = requestId;

      if (!normalizedQuery) {
        setSearchResultIds([]);
        setActiveSearchIndex(0);
        setIsSearchingMessages(false);
        return;
      }

      setIsSearchingMessages(true);

      try {
        let workingMessages = [...messages];
        let matchedIds = collectSearchMatches(workingMessages, normalizedQuery);
        let nextPage = currentMessagesPageRef.current + 1;
        let hasMore = hasOlderMessagesRef.current;

        while (hasMore) {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          const payload = await fetchMessagesPage(conversation.id, nextPage, { force: true });
          const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];

          if (nextMessages.length) {
            const seen = new Set(workingMessages.map((msg) => msg.id));
            const uniqueOlder = nextMessages.filter((msg) => !seen.has(msg.id));
            workingMessages = [...uniqueOlder, ...workingMessages];
            setMessages(workingMessages);
          }

          setCurrentMessagesPage(payload.pagination?.page || nextPage);
          setHasOlderMessages(Boolean(payload.pagination?.has_next));

          matchedIds = collectSearchMatches(workingMessages, normalizedQuery);

          nextPage = (payload.pagination?.page || nextPage) + 1;
          hasMore = Boolean(payload.pagination?.has_next);
        }

        if (searchRequestRef.current !== requestId) {
          return;
        }

        setSearchResultIds(matchedIds);
        setActiveSearchIndex(0);

        if (matchedIds.length > 0) {
          await waitForNextPaint();
          await jumpToMessageById(matchedIds[0]);
        }
      } catch (error) {
        console.error("Failed to search conversation:", error);
      } finally {
        if (searchRequestRef.current === requestId) {
          setIsSearchingMessages(false);
        }
      }
    },
    [
      collectSearchMatches,
      conversation?.id,
      fetchMessagesPage,
      jumpToMessageById,
      messages,
      waitForNextPaint,
    ]
  );

  const activeSearchMessageId =
    searchResultIds.length > 0 ? searchResultIds[activeSearchIndex] || null : null;

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!isSearchOpen || !trimmedQuery) {
      setSearchResultIds([]);
      setActiveSearchIndex(0);
      setIsSearchingMessages(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      performConversationSearch(trimmedQuery);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [isSearchOpen, performConversationSearch, searchQuery]);

  useEffect(() => {
    if (!activeSearchMessageId) return;
    jumpToMessageById(activeSearchMessageId);
  }, [activeSearchMessageId, jumpToMessageById]);

  const clearCallTimeout = useCallback(() => {
    if (!callTimeoutRef.current) return;
    window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callModeRef.current = callMode;
  }, [callMode]);

  const sendSocketEvent = useCallback((payload) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      setSocketStatus((current) => (current === "connected" ? "reconnecting" : current));
      return false;
    }
    socket.current.send(JSON.stringify(payload));
    return true;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimeoutRef.current) return;
    window.clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }, []);

  const getElapsedCallSeconds = useCallback(() => {
    if (!callStartedAtRef.current) return 0;
    return Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000));
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerIntervalRef.current) {
      window.clearInterval(callTimerIntervalRef.current);
      callTimerIntervalRef.current = null;
    }
  }, []);

  const stopRinging = useCallback(() => {
    if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (ringAudioContextRef.current) {
      ringAudioContextRef.current.close().catch(() => {});
      ringAudioContextRef.current = null;
    }
  }, []);

  const startRinging = useCallback(() => {
    if (ringIntervalRef.current) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const audioContext = new AudioCtx();
      ringAudioContextRef.current = audioContext;

      const playTone = () => {
        if (audioContext.state === "closed") return;
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(780, audioContext.currentTime);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
      };

      playTone();
      ringIntervalRef.current = window.setInterval(playTone, 1600);
    } catch {
      stopRinging();
    }
  }, [stopRinging]);

  useEffect(() => {
    if (callState === "incoming" || callState === "calling") {
      startRinging();
      return;
    }
    stopRinging();
  }, [callState, startRinging, stopRinging]);

  const startCallTimer = useCallback(() => {
    stopCallTimer();
    callStartedAtRef.current = Date.now();
    setCallDurationSeconds(0);
    callTimerIntervalRef.current = window.setInterval(() => {
      setCallDurationSeconds(getElapsedCallSeconds());
    }, 1000);
  }, [getElapsedCallSeconds, stopCallTimer]);

  const appendCallSummary = useCallback((durationSeconds, mode = "audio") => {
    const label = mode === "video" ? "Video call ended" : "Audio call ended";
    const normalizedDuration = Math.max(
      0,
      Number.isFinite(durationSeconds) ? Math.floor(durationSeconds) : 0
    );
    const summaryMessage = {
      id: `call-summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: `${label} (${formatDuration(normalizedDuration)})`,
      sender: { id: 0, username: "system" },
      timestamp: new Date().toISOString(),
      isSystem: true,
      reactions: [],
      current_user_reaction: null,
      can_translate: false,
    };
    setMessages((prev) => [...prev, summaryMessage]);
  }, []);

  const cleanupCallResources = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    incomingOfferRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsMuted(false);
    setIsCameraOn(true);
    setCallDurationSeconds(0);
    callStartedAtRef.current = null;
    stopCallTimer();
    clearCallTimeout();
  }, [clearCallTimeout, stopCallTimer]);

  const resetCallState = useCallback(() => {
    setCallState("idle");
    setCallMode("audio");
    setCallError("");
    cleanupCallResources();
  }, [cleanupCallResources]);

  const endCall = useCallback(
    ({ notifyRemote = true, reason = "" } = {}) => {
      const endedMode = callModeRef.current;
      const durationSeconds = getElapsedCallSeconds();
      if (notifyRemote) {
        sendSocketEvent({
          type: "call_end",
          callMode: endedMode,
          durationSeconds,
        });
      }
      if (reason) {
        setCallError(reason);
      }
      if (callStateRef.current !== "idle") {
        appendCallSummary(durationSeconds, endedMode);
      }
      resetCallState();
    },
    [appendCallSummary, getElapsedCallSeconds, resetCallState, sendSocketEvent]
  );

  const createPeerConnection = useCallback(() => {
    const peerConnection = new RTCPeerConnection({ iceServers: getIceServers() });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSocketEvent({
        type: "webrtc_ice_candidate",
        candidate: event.candidate,
      });
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play?.().catch(() => {});
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        setCallState("in_call");
        clearCallTimeout();
        setCallError("");
        startCallTimer();
      }

      if (["failed", "disconnected", "closed"].includes(state)) {
        resetCallState();
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [clearCallTimeout, resetCallState, sendSocketEvent, startCallTimer]);

  const addLocalTracks = useCallback((stream, peerConnection) => {
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
  }, []);

  const flushPendingIceCandidates = useCallback(async () => {
    if (!peerConnectionRef.current) return;

    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (error) {
        console.error("Failed to flush ICE candidate:", error);
      }
    }

    pendingIceCandidatesRef.current = [];
  }, []);

  const initializeLocalMedia = useCallback(async (mode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video",
    });

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play?.().catch(() => {});
    }

    return stream;
  }, []);

  useEffect(() => {
    const localElement = localVideoRef.current;
    const localStream = localStreamRef.current;
    if (localElement && localStream && localElement.srcObject !== localStream) {
      localElement.srcObject = localStream;
      localElement.play?.().catch(() => {});
    }

    const remoteElement = remoteVideoRef.current;
    const remoteStream = remoteStreamRef.current;
    if (remoteElement && remoteStream && remoteElement.srcObject !== remoteStream) {
      remoteElement.srcObject = remoteStream;
      remoteElement.play?.().catch(() => {});
    }
  }, [callMode, callState]);

  const startCall = useCallback(
    async (mode) => {
      if (callState !== "idle") return;
      if (!otherUser?.id) return;

      setCallError("");
      setCallMode(mode);
      setCallState("calling");

      try {
        const stream = await initializeLocalMedia(mode);
        const peerConnection = createPeerConnection();
        addLocalTracks(stream, peerConnection);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sent = sendSocketEvent({
          type: "webrtc_offer",
          sdp: offer,
          callMode: mode,
        });

        if (!sent) {
          setCallError("Unable to start call right now.");
          resetCallState();
          return;
        }

        clearCallTimeout();
        callTimeoutRef.current = window.setTimeout(() => {
          endCall({ notifyRemote: true, reason: "Call timed out." });
        }, CALL_TIMEOUT_MS);
      } catch (error) {
        console.error("Failed to start call:", error);
        setCallError("Could not access microphone/camera.");
        resetCallState();
      }
    },
    [
      addLocalTracks,
      callState,
      clearCallTimeout,
      createPeerConnection,
      endCall,
      initializeLocalMedia,
      otherUser?.id,
      resetCallState,
      sendSocketEvent,
    ]
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingOfferRef.current || callState !== "incoming") return;

    try {
      setCallError("");
      setCallState("connecting");

      const stream = await initializeLocalMedia(callMode);
      const peerConnection = createPeerConnection();
      addLocalTracks(stream, peerConnection);

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(incomingOfferRef.current)
      );
      await flushPendingIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      sendSocketEvent({
        type: "webrtc_answer",
        sdp: answer,
      });
      sendSocketEvent({
        type: "call_accept",
      });

      clearCallTimeout();
      callTimeoutRef.current = window.setTimeout(() => {
        endCall({ notifyRemote: true, reason: "Call timed out." });
      }, CALL_TIMEOUT_MS);
    } catch (error) {
      console.error("Failed to accept incoming call:", error);
      sendSocketEvent({ type: "call_reject", reason: "Could not join call." });
      setCallError("Could not join the call.");
      resetCallState();
    }
  }, [
    addLocalTracks,
    callMode,
    callState,
    clearCallTimeout,
    createPeerConnection,
    endCall,
    flushPendingIceCandidates,
    initializeLocalMedia,
    resetCallState,
    sendSocketEvent,
  ]);

  const declineIncomingCall = useCallback(() => {
    sendSocketEvent({ type: "call_reject", reason: "Call declined." });
    resetCallState();
  }, [resetCallState, sendSocketEvent]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextCameraOn = !isCameraOn;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = nextCameraOn;
    });
    setIsCameraOn(nextCameraOn);
  }, [isCameraOn]);

  useEffect(() => {
    resetCallState();
  }, [conversation?.id, resetCallState]);

  useEffect(() => {
    if (loading) return;
    if (!conversation?.id) return;
    let isMounted = true;
    const seedMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const seedPinnedMessages = Array.isArray(conversation.pinned_messages)
      ? conversation.pinned_messages
      : [];

    const loadLatestMessages = async () => {
      setMessages(seedMessages);
      setPinnedMessages(seedPinnedMessages);
      setUnreadAnchorMessageId(null);
      setLoadingHistory(true);
      setLoadingOlderMessages(false);
      isFetchingOlderRef.current = false;
      try {
        const payload = await fetchMessagesPage(conversation.id, 1, { force: true });
        if (!isMounted) return;
        setMessages(payload.messages || []);
        setPinnedMessages(payload.pinned_messages || []);
        setCurrentMessagesPage(payload.pagination?.page || 1);
        setHasOlderMessages(Boolean(payload.pagination?.has_next));
        currentMessagesPageRef.current = payload.pagination?.page || 1;
        hasOlderMessagesRef.current = Boolean(payload.pagination?.has_next);

        const unreadCountSnapshot = initialUnreadCountRef.current;
        const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];

        if (unreadCountSnapshot > 0) {
          const firstUnreadMessageId = await resolveFirstUnreadMessageId(
            nextMessages,
            unreadCountSnapshot
          );

          if (!isMounted) return;

          setUnreadAnchorMessageId(firstUnreadMessageId || null);
          await waitForNextPaint();
          if (firstUnreadMessageId) {
            await scrollToMessage(firstUnreadMessageId, "auto");
          } else {
            scrollToBottom("auto");
          }
        } else {
          requestAnimationFrame(() => {
            scrollToBottom("auto");
            requestAnimationFrame(() => scrollToBottom("auto"));
          });
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Failed to load conversation history:", error);
        setCurrentMessagesPage(1);
        setHasOlderMessages(false);
      } finally {
        if (isMounted) {
          setLoadingHistory(false);
        }
      }
    };

    loadLatestMessages();
    return () => {
      isMounted = false;
    };
  }, [
    conversation?.id,
    conversation?.messages,
    conversation?.pinned_messages,
    fetchMessagesPage,
    loading,
    resolveFirstUnreadMessageId,
    scrollToMessage,
    scrollToBottom,
    waitForNextPaint,
  ]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (scrollAdjustmentHeightRef.current === null) return;

    const previousHeight = scrollAdjustmentHeightRef.current;
    scrollAdjustmentHeightRef.current = null;
    requestAnimationFrame(() => {
      const nextHeight = container.scrollHeight;
      container.scrollTop += Math.max(0, nextHeight - previousHeight);
    });
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return undefined;

    updateJumpToLatestVisibility();
    container.addEventListener("scroll", updateJumpToLatestVisibility, { passive: true });
    return () => container.removeEventListener("scroll", updateJumpToLatestVisibility);
  }, [updateJumpToLatestVisibility, conversation?.id]);

  useEffect(() => {
    if (!conversation?.id || !user) return;

    const wsBaseUrl = BASE_URL.replace(/^http/, "ws");
    const legacyAccessToken = getLegacyAccessToken();
    const url = legacyAccessToken
      ? `${wsBaseUrl}/ws/socket-server/${conversation.id}/?token=${encodeURIComponent(legacyAccessToken)}`
      : `${wsBaseUrl}/ws/socket-server/${conversation.id}/`;
    isSocketUnmountingRef.current = false;
    clearReconnectTimer();

    const connectSocket = () => {
      if (isSocketUnmountingRef.current) return;
      setSocketStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

      const nextSocket = new WebSocket(url);
      socket.current = nextSocket;

      nextSocket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setSocketStatus("connected");
      };

      nextSocket.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);

          switch (data.type) {
            case "chat":
              setMessages((prev) => {
                if (data.id && prev.some((message) => message.id === data.id)) {
                  return prev;
                }

                return [
                  ...prev,
                  {
                    id: data.id,
                    text: data.message,
                    sender: { id: data.senderId, username: data.sender },
                    attachmentUrl: data.attachmentUrl || null,
                    reply_to: data.replyTo || null,
                    timestamp: new Date().toISOString(),
                    translated_text: null,
                    translated_source_language: null,
                    can_translate: Boolean((data.message || "").trim()),
                    reactions: [],
                    current_user_reaction: null,
                  },
                ];
              });
              requestAnimationFrame(() => scrollToBottom("smooth"));
              if (data.senderId !== currentUserIdRef.current) {
                markConversationRead(conversation.id).catch(() => {});
              }
              invalidateConversationHistoryCache(conversation.id);
              queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
              break;

            case "deleteMessage":
              setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
              invalidateConversationHistoryCache(conversation.id);
              break;

            case "message_reaction":
              if (data.message?.id) {
                mergeMessageUpdate(data.message);
              }
              invalidateConversationHistoryCache(conversation.id);
              break;

            case "message_status":
              mergeMessageStatusUpdate(data.messageIds, data.status);
              invalidateConversationHistoryCache(conversation.id);
              queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
              break;

            case "message_edited":
              if (data.message?.id) {
                mergeMessageUpdate(data.message);
                setEditingMessage((current) =>
                  current?.id === data.message.id ? null : current
                );
              }
              invalidateConversationHistoryCache(conversation.id);
              queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
              break;

            case "message_pinned":
              if (data.message?.id) {
                mergeMessageUpdate(data.message);
              }
              invalidateConversationHistoryCache(conversation.id);
              queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
              break;

            case "user_typing":
              if (data.senderId === currentUserIdRef.current) {
                break;
              }
              setIsOtherUserTyping(true);
              onConversationTypingChange?.(conversation.id, true);
              break;

            case "user_stopped_typing":
              if (data.senderId === currentUserIdRef.current) {
                break;
              }
              setIsOtherUserTyping(false);
              onConversationTypingChange?.(conversation.id, false);
              break;

            case "webrtc_offer":
              if (callStateRef.current !== "idle") {
                sendSocketEvent({ type: "call_reject", reason: "User is busy." });
                break;
              }

              incomingOfferRef.current = data.sdp;
              setCallMode(data.callMode === "video" ? "video" : "audio");
              setCallState("incoming");
              setCallError("");
              break;

            case "call_accept":
              if (callStateRef.current === "calling") {
                setCallState("connecting");
              }
              break;

            case "webrtc_answer":
              if (!peerConnectionRef.current || !data.sdp) break;
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(data.sdp)
              );
              await flushPendingIceCandidates();
              setCallState("connecting");
              break;

            case "webrtc_ice_candidate":
              if (!data.candidate) break;
              if (
                peerConnectionRef.current &&
                peerConnectionRef.current.remoteDescription
              ) {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(data.candidate)
                );
              } else {
                pendingIceCandidatesRef.current.push(
                  new RTCIceCandidate(data.candidate)
                );
              }
              break;

            case "call_reject":
              setCallError(data.reason || "Call rejected.");
              resetCallState();
              break;

            case "call_end":
              setCallError("Call ended.");
              appendCallSummary(
                Number.isFinite(data.durationSeconds)
                  ? data.durationSeconds
                  : getElapsedCallSeconds(),
                data.callMode || callModeRef.current
              );
              resetCallState();
              break;

            default:
              console.warn("Unknown message type:", data.type);
          }
        } catch (err) {
          console.error("Invalid WebSocket message:", e.data, err);
        }
      };

      nextSocket.onclose = () => {
        if (isSocketUnmountingRef.current) {
          setSocketStatus("offline");
          return;
        }

        setSocketStatus("reconnecting");
        const delay =
          SOCKET_RECONNECT_DELAYS_MS[
            Math.min(reconnectAttemptRef.current, SOCKET_RECONNECT_DELAYS_MS.length - 1)
          ];
        reconnectAttemptRef.current += 1;
        clearReconnectTimer();
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectSocket();
        }, delay);
      };
    };

    connectSocket();

    return () => {
      isSocketUnmountingRef.current = true;
      clearReconnectTimer();
      stopRinging();
      if (isLocalUserTypingRef.current) {
        sendSocketEvent({ type: "user_stopped_typing", sender: user?.username });
        isLocalUserTypingRef.current = false;
      }
      if (callStateRef.current !== "idle") {
        sendSocketEvent({
          type: "call_end",
          callMode: callModeRef.current,
          durationSeconds: getElapsedCallSeconds(),
        });
      }
      cleanupCallResources();
      socket.current?.close();
      socket.current = null;
      setSocketStatus("offline");
      onConversationTypingChange?.(conversation.id, false);
    };
  }, [
    clearReconnectTimer,
    cleanupCallResources,
    conversation?.id,
    flushPendingIceCandidates,
    getElapsedCallSeconds,
    mergeMessageUpdate,
    mergeMessageStatusUpdate,
    onConversationTypingChange,
    queryClient,
    resetCallState,
    scrollToBottom,
    sendSocketEvent,
    appendCallSummary,
    invalidateConversationHistoryCache,
    stopRinging,
    user?.username,
  ]);

  useEffect(() => {
    if (!conversation?.id) return;
    markConversationRead(conversation.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
  }, [conversation?.id, queryClient]);

  useEffect(() => {
    if (!otherUser?.id) return;
    if (onlineUserIds.has(otherUser.id)) return;
    setIsOtherUserTyping(false);
    onConversationTypingChange?.(conversation.id, false);
  }, [conversation?.id, onConversationTypingChange, onlineUserIds, otherUser?.id]);

  if (loading) {
    return <div className="p-4 text-gray-500">Loading user info...</div>;
  }
  if (!user) {
    return <div className="p-4 text-red-500">Failed to load user.</div>;
  }

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    if (!user) {
      console.error("Cannot send message: user is undefined.");
      return;
    }

    if (!newMessage.trim() && !attachedFile) return;

    const formData = new FormData();
    if (newMessage.trim()) formData.append("text", newMessage);
    if (attachedFile) formData.append("attachment", attachedFile);
    if (replyingMessage?.id) formData.append("reply_to", String(replyingMessage.id));

    const localAttachmentUrl =
      previewImage || (attachedFile ? URL.createObjectURL(attachedFile) : null);
    const tempMessageId = Date.now();

    const tempMessage = {
      id: tempMessageId,
      text: newMessage.trim() || null,
      sender: { id: user.user_id, username: user.username },
      timestamp: new Date().toISOString(),
      attachmentUrl: localAttachmentUrl,
      attachment_url: localAttachmentUrl,
      reply_to: replyingMessage || null,
      reactions: [],
      current_user_reaction: null,
    };

    setMessages((prev) => [...prev, tempMessage]);
    requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const response = await axios.post(
        `${BASE_URL}/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          withCredentials: true,
        }
      );

      const savedMessage = response.data;
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
      invalidateConversationHistoryCache(conversation.id);

      setMessages((prev) =>
        prev.map((message) =>
          message.id === tempMessageId
            ? {
                ...message,
                id: savedMessage.id,
                text: savedMessage.text,
                attachmentUrl:
                  savedMessage.attachment_url || savedMessage.attachmentUrl || null,
                attachment_url:
                  savedMessage.attachment_url || savedMessage.attachmentUrl || null,
                timestamp: savedMessage.timestamp || message.timestamp,
                sender: savedMessage.sender || message.sender,
                status: savedMessage.status || message.status,
                reply_to: savedMessage.reply_to || message.reply_to || null,
              }
            : message
        )
      );

      if (localAttachmentUrl && localAttachmentUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localAttachmentUrl);
      }

      const sent = sendSocketEvent({
        type: "chat",
        id: savedMessage.id,
        message: savedMessage.text,
        sender: user.username,
        senderId: user.user_id,
        attachmentUrl:
          savedMessage.attachment_url || savedMessage.attachmentUrl || null,
        replyTo: savedMessage.reply_to || null,
      });
      if (!sent) {
        setTimeout(() => {
          const retrySent = sendSocketEvent({
            type: "chat",
            id: savedMessage.id,
            message: savedMessage.text,
            sender: user.username,
            senderId: user.user_id,
            attachmentUrl:
              savedMessage.attachment_url || savedMessage.attachmentUrl || null,
            replyTo: savedMessage.reply_to || null,
          });
          if (!retrySent) {
            console.error("WebSocket is not open. Unable to send message.");
          }
        }, 250);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      if (localAttachmentUrl && localAttachmentUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localAttachmentUrl);
      }
      return;
    }

    setReplyingMessage(null);
  };

  const handleTyping = () => {
    isLocalUserTypingRef.current = true;
    const sent = sendSocketEvent({ type: "user_typing", sender: user.username });
    if (!sent) {
      setTimeout(() => {
        sendSocketEvent({ type: "user_typing", sender: user.username });
      }, 250);
    }
  };

  const handleStopTyping = () => {
    isLocalUserTypingRef.current = false;
    const sent = sendSocketEvent({ type: "user_stopped_typing", sender: user.username });
    if (!sent) {
      setTimeout(() => {
        sendSocketEvent({ type: "user_stopped_typing", sender: user.username });
      }, 250);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (editingMessage?.id === messageId) {
      setEditingMessage(null);
    }
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    setPinnedMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    try {
      await deleteMessage(messageId);
      sendSocketEvent({ type: "deleteMessage", messageId });
      invalidateConversationHistoryCache(conversation.id);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleMessageReactionChange = (updatedMessage) => {
    mergeMessageUpdate(updatedMessage);
    invalidateConversationHistoryCache(conversation.id);
  };

  const handleStartEditMessage = (message) => {
    if (!message?.id) return;
    setReplyingMessage(null);
    setEditingMessage({
      id: message.id,
      text: message.text || "",
    });
  };

  const handleCancelEditMessage = () => {
    setEditingMessage(null);
  };

  const handleStartCommentMessage = (message) => {
    if (!message?.id) return;
    setEditingMessage(null);
    setReplyingMessage(message);
  };

  const handleCancelCommentMessage = () => {
    setReplyingMessage(null);
  };

  const handleSaveEditedMessage = async (nextText) => {
    if (!editingMessage?.id) return false;

    try {
      const updatedMessage = await editMessage(editingMessage.id, nextText);
      mergeMessageUpdate(updatedMessage);
      setEditingMessage(null);
      invalidateConversationHistoryCache(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
      return true;
    } catch (error) {
      console.error("Failed to edit message:", error);
      return false;
    }
  };

  const handleTogglePinMessage = async (message) => {
    if (!message?.id) return;

    try {
      const updatedMessage = await pinMessage(message.id, !message.is_pinned);
      mergeMessageUpdate(updatedMessage);
      if (message.id === latestPinnedMessage?.id && pinnedMessages.length <= 1) {
        setShowPinnedMenu(false);
      }
      invalidateConversationHistoryCache(conversation.id);
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
    } catch (error) {
      console.error("Failed to update pinned message:", error);
    }
  };

  const latestPinnedMessage = pinnedMessages[0] || null;
  const additionalPinnedCount = Math.max(0, pinnedMessages.length - 1);
  const searchResultLabel = searchQuery.trim()
    ? `${searchResultIds.length ? activeSearchIndex + 1 : 0}/${searchResultIds.length}`
    : "";

  const handleToggleSearch = () => {
    setIsSearchOpen((current) => {
      const next = !current;
      if (!next) {
        setSearchQuery("");
        setSearchResultIds([]);
        setActiveSearchIndex(0);
      }
      return next;
    });
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResultIds([]);
    setActiveSearchIndex(0);
  };

  const handleSearchSubmit = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    if (!searchResultIds.length) {
      await performConversationSearch(trimmedQuery);
      return;
    }

    const targetMessageId = activeSearchMessageId || searchResultIds[0];
    if (targetMessageId) {
      await jumpToMessageById(targetMessageId);
    }
  };

  const handleSearchNext = () => {
    if (!searchResultIds.length) return;
    setActiveSearchIndex((current) => (current + 1) % searchResultIds.length);
  };

  const handleSearchPrevious = () => {
    if (!searchResultIds.length) return;
    setActiveSearchIndex((current) =>
      current === 0 ? searchResultIds.length - 1 : current - 1
    );
  };

  const handleJumpToLatest = () => {
    scrollToBottom("smooth");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-shrink-0">
        <ChatHeader
          conversation={conversation}
          onStartAudioCall={() => startCall("audio")}
          onStartVideoCall={() => startCall("video")}
          callState={callState}
          callDisabled={!socket.current || socket.current.readyState !== WebSocket.OPEN}
          socketStatus={socketStatus}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onToggleSearch={handleToggleSearch}
          onCloseSearch={handleCloseSearch}
          onSearchSubmit={handleSearchSubmit}
          onSearchNext={handleSearchNext}
          onSearchPrevious={handleSearchPrevious}
          searchResultLabel={searchResultLabel}
          searchDisabled={loadingHistory}
          searchHasResults={searchResultIds.length > 0}
          isSearchingMessages={isSearchingMessages}
        />
      </div>

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-24 sm:px-4"
      >
        {loadingHistory ? (
          <div className="p-4 text-center text-sm text-gray-500">Loading chat history...</div>
        ) : (
          <>
            {latestPinnedMessage && (
              <div className="sticky top-0 z-20 mb-2 flex justify-center pt-1">
                <div ref={pinnedMenuRef} className="relative w-full max-w-[30rem]">
                  <div
                    onClick={() => jumpToPinnedMessage(latestPinnedMessage.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        jumpToPinnedMessage(latestPinnedMessage.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-full border border-[rgba(214,206,184,0.7)] bg-[rgba(244,239,228,0.8)] px-3 py-2 text-left shadow-[0_10px_26px_-24px_rgba(91,77,44,0.18)] backdrop-blur-xl transition hover:bg-[rgba(244,239,228,0.9)] supports-[backdrop-filter]:bg-[rgba(239,233,219,0.66)]"
                    role="button"
                    tabIndex={0}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/68 text-[#8a7958]">
                      <PushPinRoundedIcon sx={{ fontSize: 13 }} />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm text-[#6c6353]">
                      {latestPinnedMessage.text?.trim() || "Pinned attachment"}
                    </p>
                    {additionalPinnedCount > 0 && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowPinnedMenu((current) => !current);
                        }}
                        className="shrink-0 rounded-full bg-white/76 px-2 py-0.5 text-xs font-semibold text-[#7a705f] transition hover:bg-white"
                        aria-label="Show all pinned messages"
                      >
                        +{additionalPinnedCount}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleTogglePinMessage(latestPinnedMessage);
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#9b8d74] transition hover:bg-white/75 hover:text-[#6c6353]"
                      aria-label="Unpin message"
                    >
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </button>
                  </div>
                  {showPinnedMenu && (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] rounded-2xl border border-[rgba(214,206,184,0.7)] bg-[rgba(248,244,236,0.94)] p-2 shadow-[0_18px_40px_-26px_rgba(91,77,44,0.18)] backdrop-blur-xl">
                      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8e826e]">
                        All pinned
                      </div>
                      <div className="space-y-1">
                        {pinnedMessages.map((message) => (
                          <div
                            key={`pinned-menu-${message.id}`}
                            onClick={() => {
                              setShowPinnedMenu(false);
                              jumpToPinnedMessage(message.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setShowPinnedMenu(false);
                                jumpToPinnedMessage(message.id);
                              }
                            }}
                            className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/75"
                            role="button"
                            tabIndex={0}
                          >
                            <p className="min-w-0 flex-1 truncate text-sm text-[#6c6353]">
                              {message.text?.trim() || "Pinned attachment"}
                            </p>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleTogglePinMessage(message);
                              }}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#a1937b] transition hover:bg-white hover:text-[#6c6353]"
                              aria-label="Unpin message"
                            >
                              <CloseRoundedIcon sx={{ fontSize: 14 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {loadingOlderMessages && (
              <div className="pb-2 text-center text-xs text-gray-400">Loading older messages...</div>
            )}
            <Conversation
              messages={messages}
              userId={user.user_id}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleStartEditMessage}
              onCommentMessage={handleStartCommentMessage}
              onMessageReactionChange={handleMessageReactionChange}
              onTogglePinMessage={handleTogglePinMessage}
              baseTranslateLanguage={
                user.base_translate_language || user.native_language || "english"
              }
              searchQuery={searchQuery}
              matchedSearchMessageIds={searchResultIds}
              activeSearchMessageId={activeSearchMessageId}
              unreadAnchorMessageId={unreadAnchorMessageId}
            />
          </>
        )}
      </div>

      {isOtherUserTyping && (
        <div className="flex items-center gap-2 px-3 py-1 text-sm text-gray-500 sm:px-4">
          <TypingDots />
          <span>Typing...</span>
        </div>
      )}

      {showJumpToLatest && (
        <button
          type="button"
          onClick={handleJumpToLatest}
          className="absolute bottom-24 right-4 z-20 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)] backdrop-blur transition hover:bg-white hover:text-slate-800"
        >
          Latest
        </button>
      )}

      <div className="sticky bottom-0 z-20 flex-shrink-0 border-t bg-white">
        <MessageInput
          conversationId={conversation.id}
          connectionStatus={socketStatus}
          editingMessage={editingMessage}
          replyingMessage={replyingMessage}
          onCancelEdit={handleCancelEditMessage}
          onCancelReply={handleCancelCommentMessage}
          onSendMessage={handleSendMessage}
          onSaveEdit={handleSaveEditedMessage}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
        />
      </div>

      <CallPanel
        visible={callState !== "idle"}
        callState={callState}
        callMode={callMode}
        callDurationSeconds={callDurationSeconds}
        otherUsername={otherUser?.username || "Unknown user"}
        otherAvatarUrl={otherUserAvatarUrl}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        errorMessage={callError}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onHangup={() => endCall({ notifyRemote: true })}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    </div>
  );
};

export default ChatRoom;
