import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
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
  getCoachLanguageOptions,
  persistCoachMessages,
  persistCoachPreferences,
  readCoachMessages,
  readCoachPreferences,
  resetCoachConversation,
} from "./coachConversation";
import {
  COACH_DETAILS_ID,
  COACH_MODE_TAGLINES,
  CoachDetails,
  CoachModeBar,
  CoachPopover,
  CoachSheet,
  readDockedPreference,
  useMediaQuery,
  writeDockedPreference,
} from "./CoachControls";

const PHONE_QUERY = "(max-width: 767px)";
const WIDE_QUERY = "(min-width: 1280px)";

const CoachHeader = ({
  languageOptions,
  selectedLanguage,
  selectedMode,
  detailsVisible,
  detailsVariant,
  settingsButtonRef,
  onToggleDetails,
  onStartNewConversation,
}) => {
  const navigate = useNavigate();
  const activeMode = COACH_MODES.find((mode) => mode.id === selectedMode) || COACH_MODES[0];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label || selectedLanguage;

  return (
    <header className="cv-chat-header cv-coach-header">
      <button
        type="button"
        className="cv-icon-button is-plain cv-chat-back"
        onClick={() => navigate("/conversations")}
        aria-label="Back to conversations"
      >
        <ArrowBackRoundedIcon />
      </button>
      <div className="cv-chat-identity">
        <CoachAvatar language={selectedLanguage} size={44} hideBadge />
        <span className="cv-chat-identity-text">
          <span className="cv-chat-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Lumi <span className="cv-ai-tag" style={{ background: "var(--lv-sage)" }}>AI</span>
          </span>
          <span className="cv-chat-presence is-online">
            <span className="cv-presence-dot" aria-hidden="true" />
            {activeMode.shortLabel} · {selectedLanguageLabel}
          </span>
          <span className="cv-coach-tagline">{COACH_MODE_TAGLINES[activeMode.id] || activeMode.description}</span>
        </span>
      </div>
      <div className="cv-chat-actions">
        <button
          type="button"
          className="cv-pill-button cv-coach-new"
          onClick={onStartNewConversation}
          aria-label="New conversation"
        >
          <RestartAltRoundedIcon aria-hidden="true" />
          <span className="cv-coach-new-label">New conversation</span>
        </button>
        <button
          ref={settingsButtonRef}
          type="button"
          className={`cv-icon-button ${detailsVisible ? "is-on" : ""}`}
          onClick={onToggleDetails}
          aria-expanded={detailsVisible}
          aria-controls={detailsVisible ? COACH_DETAILS_ID : undefined}
          aria-haspopup={detailsVariant === "docked" ? undefined : "dialog"}
          aria-label="Coach settings"
          title="Coach settings"
        >
          <TuneRoundedIcon />
        </button>
      </div>
    </header>
  );
};

const CoachChatRoom = ({ onConversationTypingChange }) => {
  const { user, loading } = useUser();
  const [messages, setMessages] = useState([]);
  const [isCoachTyping, setIsCoachTyping] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("english");
  const [selectedMode, setSelectedMode] = useState(COACH_MODES[0].id);
  // Popover (tablet/desktop) or sheet (phones) open state; the ≥1280px docked panel has its own.
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDocked, setIsDocked] = useState(readDockedPreference);
  const [isIdeasOpen, setIsIdeasOpen] = useState(false);
  const messagesContainerRef = useRef(null);
  const settingsButtonRef = useRef(null);
  // Latest messages (writes go through commitMessages, so concurrent updates compose).
  const messagesRef = useRef([]);
  // Bumped by "New conversation", mode/language changes and user changes: a reply for
  // an older generation is dropped (not shown, not persisted).
  const requestGenerationRef = useRef(0);
  const isReplyPendingRef = useRef(false);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const detailsVariant = isWide ? "docked" : isPhone ? "sheet" : "popover";
  const detailsVisible = detailsVariant === "docked" ? isDocked : isDetailsOpen;

  const languageOptions = useMemo(() => getCoachLanguageOptions(user), [user]);
  const hasActiveConversation = messages.length > 1;
  const showQuickStartChips = !hasActiveConversation || isIdeasOpen;

  const closeDetails = useCallback((returnFocus = true) => {
    setIsDetailsOpen(false);
    if (returnFocus) settingsButtonRef.current?.focus();
  }, []);

  // A popover/sheet doesn't survive a breakpoint change (e.g. rotating a tablet).
  useEffect(() => {
    setIsDetailsOpen(false);
  }, [detailsVariant]);

  const commitMessages = (nextMessages) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  };

  const syncMessages = (update) => {
    const nextMessages = typeof update === "function" ? update(messagesRef.current) : update;
    commitMessages(nextMessages);
    persistCoachMessages(user, nextMessages);
  };

  // Drops any in-flight reply and frees the composer.
  const invalidatePendingReply = () => {
    requestGenerationRef.current += 1;
    if (isReplyPendingRef.current) {
      isReplyPendingRef.current = false;
      setIsCoachTyping(false);
      onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
    }
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
    requestGenerationRef.current += 1;
    isReplyPendingRef.current = false;
    setIsCoachTyping(false);
    messagesRef.current = storedMessages;
    setMessages(storedMessages);
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
    invalidatePendingReply();
    syncPreferences(nextPreferences);
    const nextMessages = resetCoachConversation(user, nextPreferences);
    commitMessages(nextMessages);
  };

  const handleStartNewConversation = () => {
    invalidatePendingReply();
    const nextMessages = resetCoachConversation(user, {
      language: selectedLanguage,
      mode: selectedMode,
    });
    commitMessages(nextMessages);
    setIsIdeasOpen(false);
  };

  const handleToggleDetails = () => {
    if (detailsVariant === "docked") {
      const next = !isDocked;
      setIsDocked(next);
      writeDockedPreference(next);
      return;
    }
    setIsDetailsOpen((open) => !open);
  };

  const handleCloseDetails = (returnFocus = true) => {
    if (detailsVariant === "docked") {
      setIsDocked(false);
      writeDockedPreference(false);
      settingsButtonRef.current?.focus();
      return;
    }
    closeDetails(returnFocus);
  };

  // Re-selecting the current mode/language would wipe the chat, so it's a no-op.
  const handleModeChange = (mode) => {
    if (mode !== selectedMode) handlePreferenceChange({ mode });
  };
  const handleLanguageChange = (language) => {
    if (language !== selectedLanguage) handlePreferenceChange({ language });
  };

  // Choosing an option in the popover/sheet closes it; the docked panel stays open.
  const afterDetailsChoice = (action) => (value) => {
    action(value);
    if (detailsVariant !== "docked") closeDetails(true);
  };

  const handleSendMessage = async (newMessage, attachedFile, previewImage) => {
    const trimmed = newMessage.trim();
    if (!trimmed && !attachedFile) return false;
    // One reply at a time: a second send would race the first one's reply.
    if (isReplyPendingRef.current) return false;
    const generation = requestGenerationRef.current;
    isReplyPendingRef.current = true;

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

    syncMessages((current) => [...current, outgoingMessage]);
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
      if (generation !== requestGenerationRef.current) return true;

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

      syncMessages((current) => [...current, replyMessage]);
    } catch (error) {
      if (generation !== requestGenerationRef.current) return true;
      // The envelope's `error` (legacy `detail`) is user-facing; transport failures get
      // ApiError's friendly text.
      const fallbackMessage = isApiError(error)
        ? getErrorMessage(error)
        : "The coach is unavailable right now. Please try again.";
      syncMessages((current) => [
        ...current,
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
      // A reset already cleared these, and a newer request may own them now.
      if (generation === requestGenerationRef.current) {
        isReplyPendingRef.current = false;
        setIsCoachTyping(false);
        onConversationTypingChange?.(COACH_CONVERSATION_ID, false);
      }
    }
    return true;
  };

  const handleQuickPrompt = (prompt) => {
    if (isCoachTyping) return;
    setIsIdeasOpen(false);
    handleSendMessage(prompt, null, null);
  };

  const handleDeleteMessage = (messageId) => {
    syncMessages((current) => current.filter((message) => message.id !== messageId));
  };

  const handleMessageReactionChange = (updatedMessage) => {
    if (!updatedMessage?.id) return;
    syncMessages((current) =>
      current.map((message) =>
        message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
      )
    );
  };

  const details = (
    <CoachDetails
      titleId="cv-coach-details-title"
      docked={detailsVariant === "docked"}
      languageOptions={languageOptions}
      selectedLanguage={selectedLanguage}
      selectedMode={selectedMode}
      onLanguageChange={afterDetailsChoice(handleLanguageChange)}
      onModeChange={afterDetailsChoice(handleModeChange)}
      onStartNewConversation={afterDetailsChoice(handleStartNewConversation)}
      onClose={handleCloseDetails}
    />
  );

  return (
    <div className="cv-chat cv-coach">
      <div className="cv-coach-top">
        <CoachHeader
          languageOptions={languageOptions}
          selectedLanguage={selectedLanguage}
          selectedMode={selectedMode}
          detailsVisible={detailsVisible}
          detailsVariant={detailsVariant}
          settingsButtonRef={settingsButtonRef}
          onToggleDetails={handleToggleDetails}
          onStartNewConversation={handleStartNewConversation}
        />
        {detailsVariant === "popover" && isDetailsOpen && (
          <CoachPopover anchorRef={settingsButtonRef} onClose={closeDetails}>
            {details}
          </CoachPopover>
        )}
        <CoachModeBar
          languageOptions={languageOptions}
          selectedLanguage={selectedLanguage}
          selectedMode={selectedMode}
          onLanguageChange={handleLanguageChange}
          onModeChange={handleModeChange}
        />
      </div>

      <div className="cv-coach-body">
        <div className="cv-coach-main">
          <div ref={messagesContainerRef} className="cv-messages">
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

          <div className="cv-quick-starts">
            {hasActiveConversation && (
              <button
                type="button"
                className="cv-quick-chip is-ideas"
                aria-expanded={isIdeasOpen}
                aria-controls={isIdeasOpen ? "cv-coach-ideas" : undefined}
                onClick={() => setIsIdeasOpen((open) => !open)}
              >
                <LightbulbOutlinedIcon aria-hidden="true" />
                Ideas
              </button>
            )}
            {showQuickStartChips && (
              <div id="cv-coach-ideas" className="cv-quick-start-chips" role="group" aria-label="Quick starts">
                {COACH_QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="cv-quick-chip" onClick={() => handleQuickPrompt(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cv-composer-wrap">
            <MessageInput
              conversationId={COACH_CONVERSATION_ID}
              connectionStatus="connected"
              onSendMessage={handleSendMessage}
              disabled={isCoachTyping}
              onTyping={() => {}}
              onStopTyping={() => {}}
            />
          </div>
        </div>

        {detailsVariant === "docked" && isDocked && (
          <aside id={COACH_DETAILS_ID} className="cv-coach-dock" aria-labelledby="cv-coach-details-title">
            {details}
          </aside>
        )}
      </div>

      {detailsVariant === "sheet" && isDetailsOpen && <CoachSheet onClose={closeDetails}>{details}</CoachSheet>}
    </div>
  );
};

export default CoachChatRoom;
