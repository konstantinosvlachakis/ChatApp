import React, { useState, useRef, useEffect, useCallback } from "react";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import TypingDots from "./TypingDots";
import CallPanel from "./CallPanel";
import axios from "axios";
import { deleteMessage } from "../api/deleteMessage";
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

  const { user, loading } = useUser();
  const { onlineUserIds } = usePresence();
  const queryClient = useQueryClient();

  const otherUser =
    conversation?.sender?.username === user?.username
      ? conversation?.receiver
      : conversation?.sender;
  const otherUserAvatarUrl = resolveAvatarUrl(otherUser?.profile_image_url);

  useEffect(() => {
    currentUserIdRef.current = user?.user_id ?? null;
  }, [user?.user_id]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior,
    });
  }, []);

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
        pagination: payload.pagination || null,
      };
      queryClient.setQueryData(cacheKey, normalized);
      return normalized;
    },
    [queryClient]
  );

  const invalidateConversationHistoryCache = useCallback(
    (conversationId) => {
      if (!conversationId) return;
      queryClient.invalidateQueries(["conversationMessagesPage", conversationId]);
    },
    [queryClient]
  );

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

    const loadLatestMessages = async () => {
      setLoadingHistory(true);
      setLoadingOlderMessages(false);
      isFetchingOlderRef.current = false;
      try {
        const payload = await fetchMessagesPage(conversation.id, 1, { force: false });
        if (!isMounted) return;
        setMessages(payload.messages || []);
        setCurrentMessagesPage(payload.pagination?.page || 1);
        setHasOlderMessages(Boolean(payload.pagination?.has_next));
        requestAnimationFrame(() => {
          scrollToBottom("auto");
          requestAnimationFrame(() => scrollToBottom("auto"));
        });
      } catch (error) {
        if (!isMounted) return;
        setMessages([]);
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
  }, [conversation?.id, fetchMessagesPage, loading, scrollToBottom]);

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
              setMessages((prev) => [
                ...prev,
                {
                  id: data.id,
                  text: data.message,
                  sender: { id: data.senderId, username: data.sender },
                  attachmentUrl: data.attachmentUrl || null,
                  timestamp: new Date().toISOString(),
                  translated_text: null,
                  translated_source_language: null,
                  can_translate: Boolean((data.message || "").trim()),
                  reactions: [],
                  current_user_reaction: null,
                },
              ]);
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
                setMessages((prev) =>
                  prev.map((m) => (m.id === data.message.id ? { ...m, ...data.message } : m))
                );
              }
              invalidateConversationHistoryCache(conversation.id);
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
    }
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
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    try {
      await deleteMessage(messageId);
      sendSocketEvent({ type: "deleteMessage", messageId });
      invalidateConversationHistoryCache(conversation.id);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleMessageReactionChange = (updatedMessage) => {
    if (!updatedMessage?.id) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg))
    );
    invalidateConversationHistoryCache(conversation.id);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <div className="flex-shrink-0">
        <ChatHeader
          conversation={conversation}
          onStartAudioCall={() => startCall("audio")}
          onStartVideoCall={() => startCall("video")}
          callState={callState}
          callDisabled={!socket.current || socket.current.readyState !== WebSocket.OPEN}
          socketStatus={socketStatus}
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
            {loadingOlderMessages && (
              <div className="pb-2 text-center text-xs text-gray-400">Loading older messages...</div>
            )}
            <Conversation
              messages={messages}
              userId={user.user_id}
              onDeleteMessage={handleDeleteMessage}
              onMessageReactionChange={handleMessageReactionChange}
              baseTranslateLanguage={
                user.base_translate_language || user.native_language || "english"
              }
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

      <div className="sticky bottom-0 z-20 flex-shrink-0 border-t bg-white">
        <MessageInput
          conversationId={conversation.id}
          connectionStatus={socketStatus}
          onSendMessage={handleSendMessage}
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
