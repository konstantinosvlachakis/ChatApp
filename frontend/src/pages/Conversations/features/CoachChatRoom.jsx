import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../../context/UserContext";
import ChatHeader from "./ChatHeader";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import TypingDots from "./TypingDots";
import {
  buildCoachReply,
  COACH_BOT_ID,
  COACH_CONVERSATION_ID,
  getCoachConversation,
  persistCoachMessages,
  readCoachMessages,
} from "./coachConversation";

const CoachChatRoom = ({ onConversationTypingChange }) => {
  const { user, loading } = useUser();
  const [messages, setMessages] = useState([]);
  const [isCoachTyping, setIsCoachTyping] = useState(false);
  const messagesContainerRef = useRef(null);
  const replyTimeoutRef = useRef(null);

  const coachConversation = useMemo(() => getCoachConversation(user), [user, messages.length]);

  const syncMessages = (nextMessages) => {
    setMessages(nextMessages);
    persistCoachMessages(user, nextMessages);
  };

  useEffect(() => {
    if (!user) return;
    setMessages(readCoachMessages(user));
  }, [user]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isCoachTyping]);

  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current) {
        window.clearTimeout(replyTimeoutRef.current);
      }
      onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
    };
  }, [onConversationTypingChange]);

  if (loading) {
    return <div className="p-4 text-gray-500">Loading coach...</div>;
  }

  if (!user) {
    return <div className="p-4 text-red-500">Failed to load coach.</div>;
  }

  const handleSendMessage = (newMessage, attachedFile, previewImage) => {
    const trimmed = newMessage.trim();
    if (!trimmed && !attachedFile) return;

    const localAttachmentUrl =
      previewImage || (attachedFile ? URL.createObjectURL(attachedFile) : null);
    const outgoingMessage = {
      id: `coach-user-${Date.now()}`,
      text: trimmed || null,
      sender: {
        id: user.user_id,
        username: user.username,
      },
      timestamp: new Date().toISOString(),
      attachmentUrl: localAttachmentUrl,
      attachment_url: localAttachmentUrl,
      reactions: [],
      current_user_reaction: null,
      can_translate: false,
    };

    const nextMessages = [...messages, outgoingMessage];
    syncMessages(nextMessages);
    setIsCoachTyping(true);
    onConversationTypingChange?.(COACH_CONVERSATION_ID, true);

    if (replyTimeoutRef.current) {
      window.clearTimeout(replyTimeoutRef.current);
    }

    replyTimeoutRef.current = window.setTimeout(() => {
      const replyMessage = {
        id: `coach-bot-${Date.now()}`,
        text: attachedFile
          ? "I received your attachment. Describe it or ask me to quiz you on it in your target language."
          : buildCoachReply(user, trimmed),
        sender: {
          id: COACH_BOT_ID,
          username: "LangVoyage Coach",
        },
        timestamp: new Date().toISOString(),
        can_translate: true,
        reactions: [],
        current_user_reaction: null,
      };

      syncMessages([...nextMessages, replyMessage]);
      setIsCoachTyping(false);
      onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
    }, 1200);
  };

  const handleDeleteMessage = (messageId) => {
    syncMessages(messages.filter((message) => message.id !== messageId));
  };

  const handleMessageReactionChange = (updatedMessage) => {
    if (!updatedMessage?.id) return;
    syncMessages(
      messages.map((message) =>
        message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
      )
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <div className="flex-shrink-0">
        <ChatHeader
          conversation={coachConversation}
          onStartAudioCall={() => {}}
          onStartVideoCall={() => {}}
          callState="idle"
          callDisabled
          socketStatus="connected"
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

      {isCoachTyping && (
        <div className="flex items-center gap-2 px-3 py-1 text-sm text-gray-500 sm:px-4">
          <TypingDots />
          <span>LangVoyage Coach is typing...</span>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex-shrink-0 border-t bg-white">
        <MessageInput
          conversationId={COACH_CONVERSATION_ID}
          connectionStatus="connected"
          onSendMessage={handleSendMessage}
          onTyping={() => {}}
          onStopTyping={() => {}}
        />
      </div>
    </div>
  );
};

export default CoachChatRoom;
