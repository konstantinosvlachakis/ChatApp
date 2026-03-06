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
import { markConversationRead } from "../api/markConversationRead";
import { useQueryClient } from "react-query";

const CALL_TIMEOUT_MS = 30000;
const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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

const ChatRoom = ({ conversation, onConversationTypingChange }) => {
  const [messages, setMessages] = useState(conversation.messages || []);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [callState, setCallState] = useState("idle");
  const [callMode, setCallMode] = useState("audio");
  const [callError, setCallError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);

  const socket = useRef(null);
  const messagesContainerRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const incomingOfferRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callStateRef = useRef("idle");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const { user, loading } = useUser();
  const queryClient = useQueryClient();

  const otherUser =
    conversation?.sender?.username === user?.username
      ? conversation?.receiver
      : conversation?.sender;

  const scrollToBottom = useCallback((behavior = "auto") => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  const clearCallTimeout = useCallback(() => {
    if (!callTimeoutRef.current) return;
    window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const sendSocketEvent = useCallback((payload) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.current.send(JSON.stringify(payload));
    return true;
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
    clearCallTimeout();
  }, [clearCallTimeout]);

  const resetCallState = useCallback(() => {
    setCallState("idle");
    setCallMode("audio");
    setCallError("");
    cleanupCallResources();
  }, [cleanupCallResources]);

  const endCall = useCallback(
    ({ notifyRemote = true, reason = "" } = {}) => {
      if (notifyRemote) {
        sendSocketEvent({ type: "call_end" });
      }
      if (reason) {
        setCallError(reason);
      }
      resetCallState();
    },
    [resetCallState, sendSocketEvent]
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
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        setCallState("in_call");
        clearCallTimeout();
        setCallError("");
      }

      if (["failed", "disconnected", "closed"].includes(state)) {
        resetCallState();
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [clearCallTimeout, resetCallState, sendSocketEvent]);

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
    }

    return stream;
  }, []);

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
    setMessages(conversation?.messages || []);
  }, [conversation?.id, conversation?.messages]);

  useEffect(() => {
    resetCallState();
  }, [conversation?.id, resetCallState]);

  useEffect(() => {
    if (loading) return;
    if (!messagesContainerRef.current) return;
    scrollToBottom("auto");
  }, [loading, messages, conversation?.id, scrollToBottom]);

  useEffect(() => {
    if (loading) return;
    if (!conversation?.id) return;

    requestAnimationFrame(() => {
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("auto"));
    });
    const timer = setTimeout(() => scrollToBottom("auto"), 120);
    return () => clearTimeout(timer);
  }, [loading, conversation?.id, scrollToBottom]);

  useEffect(() => {
    if (!conversation?.id || !user) return;

    const token =
      sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
    const wsBaseUrl = BASE_URL.replace(/^http/, "ws");
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${wsBaseUrl}/ws/socket-server/${conversation.id}/${query}`;
    socket.current = new WebSocket(url);

    socket.current.onopen = () => console.log("WebSocket connected.");

    socket.current.onmessage = async (e) => {
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
            if (data.senderId !== user.user_id) {
              markConversationRead(conversation.id).catch(() => {});
            }
            queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
            break;

          case "deleteMessage":
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            break;

          case "message_reaction":
            if (data.message?.id) {
              setMessages((prev) =>
                prev.map((m) => (m.id === data.message.id ? { ...m, ...data.message } : m))
              );
            }
            break;

          case "user_typing":
            setIsOtherUserTyping(true);
            onConversationTypingChange?.(conversation.id, true);
            break;

          case "user_stopped_typing":
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
            resetCallState();
            break;

          default:
            console.warn("Unknown message type:", data.type);
        }
      } catch (err) {
        console.error("Invalid WebSocket message:", e.data, err);
      }
    };

    socket.current.onclose = () =>
      console.log("WebSocket disconnected for conversation:", conversation.id);

    return () => {
      sendSocketEvent({ type: "user_stopped_typing", sender: user.username });
      if (callStateRef.current !== "idle") {
        sendSocketEvent({ type: "call_end" });
      }
      cleanupCallResources();
      socket.current?.close();
      onConversationTypingChange?.(conversation.id, false);
    };
  }, [
    cleanupCallResources,
    conversation?.id,
    flushPendingIceCandidates,
    onConversationTypingChange,
    queryClient,
    resetCallState,
    sendSocketEvent,
    user,
  ]);

  useEffect(() => {
    if (!conversation?.id) return;
    markConversationRead(conversation.id).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["conversationsList"] });
  }, [conversation?.id, queryClient]);

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

    try {
      const response = await axios.post(
        `${BASE_URL}/api/conversations/${conversation.id}/messages/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${
              sessionStorage.getItem("accessToken") ||
              localStorage.getItem("accessToken")
            }`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const savedMessage = response.data;
      queryClient.invalidateQueries({ queryKey: ["conversationsList"] });

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
    const sent = sendSocketEvent({ type: "user_typing", sender: user.username });
    if (!sent) {
      setTimeout(() => {
        sendSocketEvent({ type: "user_typing", sender: user.username });
      }, 250);
    }
  };

  const handleStopTyping = () => {
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
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleMessageReactionChange = (updatedMessage) => {
    if (!updatedMessage?.id) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg))
    );
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
        />
      </div>

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-24 sm:px-4"
      >
        <Conversation
          messages={messages}
          userId={user.user_id}
          onDeleteMessage={handleDeleteMessage}
          onMessageReactionChange={handleMessageReactionChange}
          baseTranslateLanguage={
            user.base_translate_language || user.native_language || "english"
          }
        />
      </div>

      {isOtherUserTyping && (
        <div className="flex items-center gap-2 px-3 py-1 text-sm text-gray-500 sm:px-4">
          <TypingDots />
          <span>Typing...</span>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex-shrink-0 border-t bg-white">
        <MessageInput
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
        />
      </div>

      <CallPanel
        visible={callState !== "idle"}
        callState={callState}
        callMode={callMode}
        otherUsername={otherUser?.username || "Unknown user"}
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
