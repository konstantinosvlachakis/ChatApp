import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import api, { API_TIMEOUTS, getErrorMessage, isApiError } from "../../../lib/api";
import { useUser } from "../../../context/UserContext";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import TypingDots from "./TypingDots";
import CoachAvatar from "../../../components/CoachAvatar";
import {
  COACH_BOT_ID,
  COACH_CONVERSATION_ID,
  COACH_MODES,
  COACH_QUICK_PROMPTS,
  getCoachConversation,
  getCoachLanguageOptions,
  persistCoachMessages,
  persistCoachPreferences,
  readCoachMessages,
  readCoachPreferences,
  resetCoachConversation,
} from "./coachConversation";

const CoachHeader = ({
  languageOptions,
  selectedLanguage,
  selectedMode,
  collapsed,
  onToggleCollapsed,
  onLanguageChange,
  onModeChange,
  onStartNewConversation,
}) => {
  const navigate = useNavigate();
  const activeMode = COACH_MODES.find((mode) => mode.id === selectedMode) || COACH_MODES[0];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label || selectedLanguage;

  return (
    <>
      <header className="cv-chat-header">
        <button
          type="button"
          className="cv-icon-button is-plain cv-chat-back"
          onClick={() => navigate("/conversations")}
          aria-label="Back to conversations"
        >
          <ArrowBackRoundedIcon />
        </button>
        <div className="cv-chat-identity">
          <CoachAvatar language={selectedLanguage} size={48} hideBadge />
          <span className="cv-chat-identity-text">
            <span className="cv-chat-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Lumi <span className="cv-ai-tag" style={{ background: "var(--lv-sage)" }}>AI</span>
            </span>
            <span className="cv-chat-presence is-online">
              <span className="cv-presence-dot" aria-hidden="true" />
              {activeMode.label} · {selectedLanguageLabel}
            </span>
          </span>
        </div>
        <div className="cv-chat-actions">
          <button
            type="button"
            className={`cv-icon-button ${collapsed ? "" : "is-on"}`}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="cv-coach-tools"
            aria-label={collapsed ? "Show coach tools" : "Hide coach tools"}
            title="Coach tools"
          >
            <TuneRoundedIcon />
          </button>
        </div>
      </header>

      {!collapsed && (
        <div id="cv-coach-tools" className="cv-coach-tools">
          <p className="cv-coach-intro">
            Adaptive language coach for real conversation, corrections, travel roleplay,
            vocabulary drills, and short quizzes. Switch modes whenever you want.
          </p>
          <label className="cv-coach-field">
            <span>Language</span>
            <select value={selectedLanguage} onChange={(event) => onLanguageChange(event.target.value)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cv-coach-field">
            <span id="cv-coach-mode-label">Practice mode</span>
            <div className="cv-coach-modes" role="group" aria-labelledby="cv-coach-mode-label">
              {COACH_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={mode.id === selectedMode}
                  onClick={() => onModeChange(mode.id)}
                >
                  <strong>{mode.shortLabel}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="cv-coach-tool-actions">
            <button type="button" className="cv-pill-button" onClick={onStartNewConversation}>
              New conversation
            </button>
            <button type="button" className="cv-pill-button is-primary" onClick={onToggleCollapsed}>
              Hide coach tools
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const CoachChatRoom = ({ onConversationTypingChange }) => {
  const { user, loading } = useUser();
  const [messages, setMessages] = useState([]);
  const [isCoachTyping, setIsCoachTyping] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("english");
  const [selectedMode, setSelectedMode] = useState(COACH_MODES[0].id);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const messagesContainerRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  const languageOptions = useMemo(() => getCoachLanguageOptions(user), [user]);
  const coachConversation = useMemo(
    () => getCoachConversation(user),
    [user, messages.length, selectedLanguage, selectedMode]
  );
  const hasActiveConversation = messages.length > 1;
  const shouldShowQuickStarts = !hasActiveConversation;

  const syncMessages = (nextMessages) => {
    setMessages(nextMessages);
    persistCoachMessages(user, nextMessages);
  };

  const syncPreferences = (nextPreferences) => {
    persistCoachPreferences(user, nextPreferences);
    setSelectedLanguage(nextPreferences.language);
    setSelectedMode(nextPreferences.mode);
  };

  useEffect(() => {
    if (!user) return;
    const preferences = readCoachPreferences(user);
    setSelectedLanguage(preferences.language);
    setSelectedMode(preferences.mode);
    const storedMessages = readCoachMessages(user, preferences);
    setMessages(storedMessages);
    previousMessageCountRef.current = storedMessages.length;
    setIsHeaderCollapsed(storedMessages.length > 1);
  }, [user]);

  useEffect(() => {
    if (messages.length > 1 && previousMessageCountRef.current <= 1) {
      setIsHeaderCollapsed(true);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isCoachTyping]);

  useEffect(() => {
    return () => {
      onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
    };
  }, [onConversationTypingChange]);

  if (loading) {
    return <p className="cv-chat-status" role="status">Loading coach…</p>;
  }

  if (!user) {
    return <p className="cv-chat-status is-error" role="alert">Failed to load coach.</p>;
  }

  const handlePreferenceChange = (partialPreferences) => {
    const nextPreferences = {
      language: partialPreferences.language || selectedLanguage,
      mode: partialPreferences.mode || selectedMode,
    };
    syncPreferences(nextPreferences);
    const nextMessages = resetCoachConversation(user, nextPreferences);
    setMessages(nextMessages);
  };

  const handleStartNewConversation = () => {
    const nextMessages = resetCoachConversation(user, {
      language: selectedLanguage,
      mode: selectedMode,
    });
    setMessages(nextMessages);
    setIsHeaderCollapsed(false);
  };

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
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

    try {
      const data = await api.post(
        "/api/coach/chat/",
        {
          message: attachedFile
            ? `${trimmed}\n\n[The user attached a file. Ask them to describe it or use it for language practice.]`.trim()
            : trimmed,
          target_language: selectedLanguage,
          mode: selectedMode,
        },
        { timeoutMs: API_TIMEOUTS.coach }
      );

      const replyMessage = {
        id: `coach-bot-${Date.now()}`,
        text: data?.reply || "I am ready. Send another message and we will keep practising.",
        sender: {
          id: COACH_BOT_ID,
          username: "Lumi",
        },
        timestamp: new Date().toISOString(),
        can_translate: true,
        reactions: [],
        current_user_reaction: null,
      };

      syncMessages([...nextMessages, replyMessage]);
    } catch (error) {
      // The envelope's `error` (legacy `detail`) is user-facing; transport failures get
      // ApiError's friendly text.
      const fallbackMessage = isApiError(error)
        ? getErrorMessage(error)
        : "The coach is unavailable right now. Please try again.";
      syncMessages([
        ...nextMessages,
        {
          id: `coach-error-${Date.now()}`,
          text: fallbackMessage,
          sender: {
            id: COACH_BOT_ID,
            username: "Lumi",
          },
          timestamp: new Date().toISOString(),
          can_translate: false,
          reactions: [],
          current_user_reaction: null,
        },
      ]);
    } finally {
      setIsCoachTyping(false);
      onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
    }
  };

  const handleQuickPrompt = (prompt) => {
    if (isCoachTyping) return;
    handleSendMessage(prompt, null, null);
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
    <div className="cv-chat">
      <div className="flex-shrink-0">
        <CoachHeader
          languageOptions={languageOptions}
          selectedLanguage={selectedLanguage}
          selectedMode={selectedMode}
          collapsed={isHeaderCollapsed}
          onToggleCollapsed={() => setIsHeaderCollapsed((current) => !current)}
          onLanguageChange={(language) => handlePreferenceChange({ language })}
          onModeChange={(mode) => handlePreferenceChange({ mode })}
          onStartNewConversation={handleStartNewConversation}
        />
      </div>

      {shouldShowQuickStarts && (
        <div className="cv-quick-starts">
          <p className="cv-section-label" style={{ margin: "0 0 8px" }}>Quick starts</p>
          <div className="cv-quick-start-grid">
            {COACH_QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => handleQuickPrompt(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className="cv-messages"
      >
        <Conversation
          messages={messages}
          userId={user.user_id}
          onDeleteMessage={handleDeleteMessage}
          onMessageReactionChange={handleMessageReactionChange}
          baseTranslateLanguage={selectedLanguage}
        />
      </div>

      {isCoachTyping && (
        <div className="cv-typing" role="status">
          <TypingDots className="cv-typing-dots" />
          <span>Lumi is thinking through the next response...</span>
        </div>
      )}

      <div className="cv-composer-wrap">
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
