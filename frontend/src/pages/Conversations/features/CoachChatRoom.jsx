import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../../../constants/constants";
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
  const activeMode = COACH_MODES.find((mode) => mode.id === selectedMode) || COACH_MODES[0];
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label || selectedLanguage;

  if (collapsed) {
    return (
      <div className="rounded-[18px] border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-[0_14px_35px_-28px_rgba(15,23,42,0.35)] backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <CoachAvatar
            language={selectedLanguage}
            size={44}
            hideBadge
            className="rounded-[16px] border border-slate-200 shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Lumi</h2>
              <span className="inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Online
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200/80">
                {activeMode.label}
              </span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200/80">
                {selectedLanguageLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white sm:w-auto"
          >
            Show coach tools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_34%),linear-gradient(135deg,_rgba(247,250,252,0.98),_rgba(236,253,245,0.95)_48%,_rgba(255,251,235,0.95))] p-3 text-slate-800 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.28)] sm:rounded-[22px]">
      <div className="absolute -right-8 top-4 h-20 w-20 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="absolute -bottom-8 left-8 h-16 w-16 rounded-full bg-amber-300/10 blur-2xl" />
      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <CoachAvatar
            language={selectedLanguage}
            size={56}
            hideBadge
            className="rounded-[18px] border border-slate-200/80 shadow-md"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">
                Lumi
              </h2>
              <span className="inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Online
              </span>
            </div>
            <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">
              Adaptive language coach for real conversation, corrections, travel roleplay,
              vocabulary drills, and short quizzes. Switch modes whenever you want.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                Active mode: {activeMode.label}
              </span>
              <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                Target language:{" "}
                {languageOptions.find((option) => option.value === selectedLanguage)?.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 xl:min-w-[44%] xl:max-w-[46rem]">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Language
            </span>
            <select
              value={selectedLanguage}
              onChange={(event) => onLanguageChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-0 transition focus:border-teal-400"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value} className="text-slate-900">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Practice Mode
            </span>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {COACH_MODES.map((mode) => {
                const isActive = mode.id === selectedMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onModeChange(mode.id)}
                    className={`min-w-0 rounded-2xl border px-2.5 py-2 text-left transition sm:px-3 ${
                      isActive
                        ? "border-teal-300 bg-teal-50 text-slate-800 shadow-sm"
                        : "border-slate-200 bg-white/90 text-slate-600 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="text-[13px] font-semibold sm:text-sm">{mode.shortLabel}</div>
                    <div className="mt-1 text-[11px] leading-4 text-inherit/90 sm:text-xs">
                      {mode.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onStartNewConversation}
              className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white hover:border-slate-300"
            >
              New conversation
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-2xl border border-transparent bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Hide coach tools
            </button>
          </div>
        </div>
      </div>
    </div>
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
    return <div className="p-4 text-gray-500">Loading coach...</div>;
  }

  if (!user) {
    return <div className="p-4 text-red-500">Failed to load coach.</div>;
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
      const { data } = await axios.post(
        `${BASE_URL}/api/coach/chat/`,
        {
          message: attachedFile
            ? `${trimmed}\n\n[The user attached a file. Ask them to describe it or use it for language practice.]`.trim()
            : trimmed,
          target_language: selectedLanguage,
          mode: selectedMode,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
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
      const fallbackMessage =
        error?.response?.data?.detail ||
        "The coach is unavailable right now. Check the Gemini configuration and try again.";
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef6f6_42%,_#fff8ef_100%)]">
      <div className="flex-shrink-0 px-2 pb-2 pt-2 sm:px-4 sm:pt-4">
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
        <div className="flex-shrink-0 px-2 pb-2 sm:px-4">
          <div className="rounded-[20px] border border-slate-200/80 bg-white/80 px-3 py-2.5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur sm:rounded-[24px]">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Quick Starts
              </p>
              <p className="text-xs text-slate-400">
                Tap one to send a guided opener
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {COACH_QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickPrompt(prompt)}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[13px] leading-5 text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 sm:text-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-24 sm:px-4"
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
        <div className="mx-2 mb-2 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 text-sm text-slate-600 shadow-sm sm:mx-4">
          <TypingDots />
          <span>Lumi is thinking through the next response...</span>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex-shrink-0 border-t border-slate-200/80 bg-white/90 backdrop-blur">
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
