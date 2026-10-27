import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import PushPinRoundedIcon from "@mui/icons-material/PushPinRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import api, { getErrorMessage, isApiError } from "../../../lib/api";
import { logger } from "../../../lib/logger";
import { toast, toastApiError } from "../../../components/Toast";
import CoachAvatar from "../../../components/CoachAvatar";
import ChatAvatar from "./ChatAvatar";
import { COACH_BOT_ID } from "./coachConversation";
import { getMessageGroupFlags } from "../utils/messageGroups";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 450;
const MOBILE_BREAKPOINT = 640;
const MESSAGE_ACTIONS_MENU_HEIGHT = 320;
const LANGUAGE_SPEECH_CODE = {
  english: "en-US",
  en: "en-US",
  spanish: "es-ES",
  es: "es-ES",
  french: "fr-FR",
  fr: "fr-FR",
  greek: "el-GR",
  el: "el-GR",
  russian: "ru-RU",
  ru: "ru-RU",
};
const LANGUAGE_SPEECH_SETTINGS = {
  english: { rate: 0.84, pitch: 0.68 },
  spanish: { rate: 0.92, pitch: 1.0 },
  french: { rate: 0.9, pitch: 0.98 },
  greek: { rate: 0.9, pitch: 1.0 },
  russian: { rate: 0.9, pitch: 0.97 },
};

// Intl.DateTimeFormat construction is expensive; build the formatters once per module.
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const DAY_SEPARATOR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const DAY_SEPARATOR_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";

  try {
    return MESSAGE_TIME_FORMATTER
      .format(new Date(timestamp))
      .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
  } catch {
    return "";
  }
};

const formatDaySeparator = (timestamp) => {
  if (!timestamp) return "";

  try {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (left, right) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();

    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";

    return (
      date.getFullYear() === today.getFullYear()
        ? DAY_SEPARATOR_FORMATTER
        : DAY_SEPARATOR_WITH_YEAR_FORMATTER
    ).format(date);
  } catch {
    return "";
  }
};

const MessageStatusMeta = ({ status = "sent" }) => {
  const label = status === "read" ? "Seen" : status === "delivered" ? "Delivered" : "Sent";
  return (
    <span className={`cv-ticks ${status === "read" ? "is-read" : ""}`} title={label}>
      <span aria-hidden="true">{status === "sent" ? "✓" : "✓✓"}</span>
      <span className="lv-visually-hidden">{label}</span>
    </span>
  );
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderHighlightedText = (text, query, isActiveMatch = false) => {
  const value = String(text || "");
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return value;

  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig");
  const parts = value.split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;
    const isMatch = part.toLowerCase() === normalizedQuery.toLowerCase();
    if (!isMatch) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;

    return (
      <mark key={`${part}-${index}`} className={isActiveMatch ? "is-active" : ""}>
        {part}
      </mark>
    );
  });
};

// Attachment URLs can arrive from other clients over the websocket, so only allow
// safe schemes (never javascript:/data:text/html etc.) before using them in src/href.
const normalizeUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("blob:")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

const isLikelyAudio = (url) =>
  /\.(mp3|wav|ogg|webm)$/i.test(url) ||
  url.includes("/media/attachments/blob_") ||
  url.includes("/media/audio/");

const groupedReactions = (reactions = []) => {
  const counts = {};
  reactions.forEach((reaction) => {
    counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
  });
  return Object.entries(counts);
};

const MessageAvatar = ({ sender }) =>
  sender?.id === COACH_BOT_ID ? (
    <CoachAvatar size={32} hideBadge />
  ) : (
    <ChatAvatar name={sender?.username} imagePath={sender?.profile_image_url} size={32} />
  );

// One chat bubble. Consecutive messages from one sender form a group: the avatar and the
// time/read ticks are shown once, at the end of the group (other bubbles reveal their time on
// hover/focus). Memoised so typing, search input or a new message only re-renders the rows
// whose props actually changed instead of the whole history.
const MessageRow = React.memo(function MessageRow({
  msg,
  isSentByUser,
  startsGroup,
  endsGroup,
  showDaySeparator,
  showUnreadDivider,
  translatedText,
  isTranslating,
  canTranslate,
  highlightQuery,
  isActiveSearchMatch,
  onOpenActionsMenu,
  onTranslate,
  onTouchStart,
  onClearLongPress,
}) {
  const rawUrl = msg.attachment_url || msg.attachment || msg.attachmentUrl;
  const attachmentUrl = normalizeUrl(rawUrl);
  const messageReactions = groupedReactions(msg.reactions || []);
  const hasText = Boolean(msg.text?.trim());
  const timeLabel = formatMessageTime(msg.timestamp);
  const hasTranslation = Boolean(translatedText);
  const isImageAttachment = attachmentUrl ? /\.(jpeg|jpg|png|gif)$/i.test(attachmentUrl) : false;
  const isVideoAttachment = attachmentUrl ? /\.(mp4|webm)$/i.test(attachmentUrl) : false;
  const isAudioAttachment = attachmentUrl ? isLikelyAudio(attachmentUrl) : false;

  const separators = (
    <>
      {showDaySeparator && (
        <div className="cv-day">
          <span>{formatDaySeparator(msg.timestamp)}</span>
        </div>
      )}
      {showUnreadDivider && <div className="cv-unread-divider">Unread messages</div>}
    </>
  );

  if (msg.isSystem) {
    return (
      <>
        {separators}
        <div className="cv-system">
          <span>{msg.text}</span>
        </div>
      </>
    );
  }

  const openMenuFromButton = (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenActionsMenu(
      msg.id,
      {
        top: rect.bottom + 10,
        anchorTop: rect.top,
        right: Math.max(12, window.innerWidth - rect.right),
      },
      event.currentTarget
    );
  };

  return (
    <>
      {separators}
      <div
        data-message-id={msg.id}
        className={`cv-msg ${isSentByUser ? "is-sent" : ""} ${startsGroup ? "starts-group" : ""} ${
          endsGroup ? "ends-group" : ""
        } ${isActiveSearchMatch ? "is-search-active" : ""}`}
      >
        <span className={`cv-msg-avatar ${endsGroup ? "" : "is-hidden"}`} aria-hidden="true">
          {endsGroup && <MessageAvatar sender={msg.sender} />}
        </span>
        <div className="cv-msg-column">
          {startsGroup && !isSentByUser && msg.sender?.username && (
            <span className="lv-visually-hidden">{msg.sender.username} said:</span>
          )}
          <div className="cv-bubble-line">
            <div
              data-message-bubble="true"
              className="cv-bubble"
              title={timeLabel || undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenActionsMenu(msg.id, {
                  top: e.clientY + 12,
                  anchorTop: e.clientY,
                  right: Math.max(12, window.innerWidth - e.clientX - 12),
                });
              }}
              onTouchStart={(e) => onTouchStart(e, msg.id)}
              onTouchEnd={onClearLongPress}
              onTouchCancel={onClearLongPress}
              onTouchMove={onClearLongPress}
            >
              {msg.reply_to && (
                <div className="cv-bubble-reply">
                  <strong>Replying to {msg.reply_to.sender?.username || "message"}</strong>
                  <span>{msg.reply_to.text || "Attachment"}</span>
                </div>
              )}

              {attachmentUrl &&
                (isImageAttachment ? (
                  <img src={attachmentUrl} loading="lazy" decoding="async" alt="Attachment" />
                ) : isVideoAttachment ? (
                  <video src={attachmentUrl} controls preload="metadata" />
                ) : isAudioAttachment ? (
                  <audio controls preload="metadata" src={attachmentUrl} aria-label="Voice message" />
                ) : (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cv-bubble-file"
                  >
                    <AttachFileRoundedIcon fontSize="small" aria-hidden="true" />
                    View attachment
                  </a>
                ))}

              {hasText && (
                <p className="cv-bubble-text">
                  {renderHighlightedText(msg.text, highlightQuery, isActiveSearchMatch)}
                </p>
              )}

              {(msg.is_pinned || msg.edited_at) && (
                <div className="cv-bubble-tags">
                  {msg.is_pinned && (
                    <span className="cv-bubble-tag">
                      <PushPinRoundedIcon aria-hidden="true" />
                      Pinned
                    </span>
                  )}
                  {msg.edited_at && <span className="cv-bubble-tag">Edited</span>}
                </div>
              )}

              {hasTranslation && (
                <p className="cv-bubble-translation">
                  {renderHighlightedText(translatedText, highlightQuery, isActiveSearchMatch)}
                </p>
              )}

              {!attachmentUrl && !hasText && <p className="cv-bubble-muted">Audio message</p>}
            </div>
            <button
              type="button"
              className="cv-msg-actions-toggle"
              onClick={openMenuFromButton}
              aria-label="Message actions"
              aria-haspopup="true"
            >
              <MoreHorizRoundedIcon />
            </button>
            {!endsGroup && timeLabel && <span className="cv-msg-hover-time">{timeLabel}</span>}
          </div>

          {(canTranslate || isTranslating) && (
            <button
              type="button"
              className="cv-translate-chip"
              onClick={() => onTranslate(msg)}
              disabled={isTranslating}
            >
              <TranslateRoundedIcon aria-hidden="true" />
              {isTranslating ? "Translating…" : "Translate"}
            </button>
          )}

          {messageReactions.length > 0 && (
            <div className="cv-reactions" aria-label="Reactions">
              {messageReactions.map(([emoji, count]) => (
                <span key={`${msg.id}-${emoji}`}>
                  {emoji} {count}
                </span>
              ))}
            </div>
          )}

          {endsGroup && (timeLabel || isSentByUser) && (
            <div className="cv-msg-meta">
              {timeLabel && <time dateTime={msg.timestamp}>{timeLabel}</time>}
              {isSentByUser && <MessageStatusMeta status={msg.status || "sent"} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

const Conversation = ({
  messages,
  userId,
  onDeleteMessage,
  onEditMessage,
  onCommentMessage,
  onMessageReactionChange,
  onTogglePinMessage,
  baseTranslateLanguage = "english",
  searchQuery = "",
  matchedSearchMessageIds = [],
  activeSearchMessageId = null,
  unreadAnchorMessageId = null,
}) => {
  const [messageActionsMenu, setMessageActionsMenu] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [translationsByMessageId, setTranslationsByMessageId] = useState({});
  const [blockedTranslateByMessageId, setBlockedTranslateByMessageId] =
    useState({});
  const [translatingMessageId, setTranslatingMessageId] = useState(null);
  const longPressTimerRef = useRef(null);
  const actionsMenuRef = useRef(null);
  const menuReturnFocusRef = useRef(null);

  const groupFlags = useMemo(
    () => getMessageGroupFlags(messages, { userId, unreadAnchorMessageId }),
    [messages, userId, unreadAnchorMessageId]
  );

  const matchedSearchMessageIdSet = useMemo(
    () => new Set(matchedSearchMessageIds),
    [matchedSearchMessageIds]
  );

  const closeMessageActionsMenu = useCallback((options) => {
    setMessageActionsMenu(null);
    if (options?.restoreFocus) menuReturnFocusRef.current?.focus?.();
  }, []);

  // Move focus into the actions menu when it opens (keyboard users land on the first action).
  const isActionsMenuOpen = Boolean(messageActionsMenu);
  useEffect(() => {
    if (isActionsMenuOpen) actionsMenuRef.current?.querySelector("button")?.focus();
  }, [isActionsMenuOpen]);
  const canEditMessage = (msg) => msg?.sender?.id === userId;

  useEffect(() => {
    window.addEventListener("click", closeMessageActionsMenu);
    return () => window.removeEventListener("click", closeMessageActionsMenu);
  }, [closeMessageActionsMenu]);

  useEffect(() => {
    const handleResize = () => {
      closeMessageActionsMenu();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [closeMessageActionsMenu]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;

    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);

  // translationsByMessageId only holds translations fetched in this session; server-provided
  // ones are read straight from msg.translated_text (fetched ones win), so no state sync needed.

  const canShowTranslate = (msg, isSentByUser) =>
    !isSentByUser &&
    Boolean(msg?.text?.trim()) &&
    Boolean(msg?.can_translate) &&
    !blockedTranslateByMessageId[msg.id] &&
    !translationsByMessageId[msg.id] &&
    !msg.translated_text;

  const handleCopyMessage = async (msg) => {
    const text = (msg?.text || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied to clipboard");
      window.setTimeout(() => {
        setCopyFeedback((current) => (current === "Copied to clipboard" ? "" : current));
      }, 1800);
    } catch (error) {
      logger.error("Copy error:", error);
      setCopyFeedback("Copy failed");
      window.setTimeout(() => {
        setCopyFeedback((current) => (current === "Copy failed" ? "" : current));
      }, 1800);
    } finally {
      closeMessageActionsMenu();
    }
  };

  const speakWithBrowserVoice = (msg, text) => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const preferredLanguage = resolveSpeechLanguage(msg, text, baseTranslateLanguage);
    const utterance = new SpeechSynthesisUtterance(
      prepareTextForSpeech(text, preferredLanguage)
    );
    const preferredVoice = pickBestVoiceForLanguage(preferredLanguage);
    const fallbackLanguageCode =
      LANGUAGE_SPEECH_CODE[preferredLanguage] || LANGUAGE_SPEECH_CODE.english;
    const speechSettings =
      LANGUAGE_SPEECH_SETTINGS[preferredLanguage] || LANGUAGE_SPEECH_SETTINGS.english;

    utterance.lang = preferredVoice?.lang || fallbackLanguageCode;
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.rate = speechSettings.rate;
    utterance.pitch = speechSettings.pitch;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const handleSpeakMessage = async (msg) => {
    const text = (msg?.text || "").trim();
    if (!text) return;

    try {
      speakWithBrowserVoice(msg, text);
    } catch (error) {
      logger.error("Speak error:", error);
    } finally {
      closeMessageActionsMenu();
    }
  };

  const openMessageActionsMenu = useCallback((messageId, position = null, trigger = null) => {
    menuReturnFocusRef.current = trigger;
    const padding = 12;
    const defaultTop = Math.max(padding, window.innerHeight / 2 - 120);
    const defaultRight = padding;
    const preferredTop = position?.top ?? defaultTop;
    const maxTop = Math.max(padding, window.innerHeight - MESSAGE_ACTIONS_MENU_HEIGHT - padding);
    const shouldOpenUpward = preferredTop + MESSAGE_ACTIONS_MENU_HEIGHT > window.innerHeight - padding;
    const adjustedTop = shouldOpenUpward && position?.anchorTop != null
      ? Math.max(padding, position.anchorTop - MESSAGE_ACTIONS_MENU_HEIGHT - 10)
      : Math.min(Math.max(preferredTop, padding), maxTop);

    setMessageActionsMenu({
      messageId,
      top: adjustedTop,
      right: position?.right ?? defaultRight,
    });
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((event, messageId) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageActionsMenu(messageId, {
        top: touch.clientY + 12,
        anchorTop: touch.clientY,
        right: Math.max(12, window.innerWidth - touch.clientX - 12),
      });
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, openMessageActionsMenu]);

  const handleTranslate = useCallback(async (msg) => {
    if (!msg?.text?.trim()) return;

    try {
      setTranslatingMessageId(msg.id);

      const payload = await api.post("/api/messages/translate/", {
        message_id: msg.id,
        target_language: baseTranslateLanguage,
      });

      setTranslationsByMessageId((prev) => ({
        ...prev,
        [msg.id]: payload.translated_text,
      }));
    } catch (error) {
      // 400 bodies flag messages that can't be translated (contract: already_translated /
      // same_language); those are informational, not failures.
      const body = isApiError(error) ? error.data || {} : {};
      if (body.same_language || body.already_translated) {
        setBlockedTranslateByMessageId((prev) => ({ ...prev, [msg.id]: true }));
        toast.info(getErrorMessage(error));
      } else {
        logger.warn("Translate error:", error);
        toastApiError(error, "Couldn't translate the message");
      }
    } finally {
      setTranslatingMessageId(null);
      closeMessageActionsMenu();
    }
  }, [baseTranslateLanguage, closeMessageActionsMenu]);

  const handleReact = async (messageId, emoji) => {
    try {
      const payload = await api.post(`/api/messages/${messageId}/react/`, { emoji });
      onMessageReactionChange?.(payload);
    } catch (error) {
      logger.warn("Reaction error:", error);
      toastApiError(error, "Couldn't add the reaction");
    } finally {
      closeMessageActionsMenu();
    }
  };

  const normalizeLanguageName = (language) => {
    if (!language) return "";
    return String(language).trim().toLowerCase().split("-")[0];
  };

  const inferLanguageFromText = (text) => {
    if (!text) return "";
    if (/[\u0370-\u03FF]/.test(text)) return "greek";
    if (/[\u0400-\u04FF]/.test(text)) return "russian";

    const lowered = text.toLowerCase();
    if (/[¿¡ñáéíóúü]/.test(lowered)) return "spanish";
    if (/[àâçéèêëîïôùûüÿœæ]/.test(lowered)) return "french";
    return "";
  };

  const prepareTextForSpeech = (text, language) => {
    if (!text) return "";

    const normalized = text
      .replace(/\s+/g, " ")
      .replace(/([,;:])(?=\S)/g, "$1 ")
      .replace(/([.!?])(?=\S)/g, "$1 ")
      .replace(/\.\.\./g, ". ")
      .trim();

    // A tiny pause after line breaks tends to sound much more human.
    if (normalizeLanguageName(language) === "french") {
      return normalized.replace(/\n+/g, ". ");
    }
    return normalized.replace(/\n+/g, ", ");
  };

  const resolveSpeechLanguage = (msg, text, fallbackLanguage) => {
    const candidates = [
      msg?.translated_source_language,
      msg?.source_language,
      msg?.language,
      inferLanguageFromText(text),
      fallbackLanguage,
    ];

    return candidates.map(normalizeLanguageName).find(Boolean) || "english";
  };

  const pickBestVoiceForLanguage = (language) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const targetLang =
      (LANGUAGE_SPEECH_CODE[normalizeLanguageName(language)] || LANGUAGE_SPEECH_CODE.english).toLowerCase();
    const baseLang = targetLang.split("-")[0];

    const matchingVoices = voices.filter((voice) => {
      const voiceLang = (voice.lang || "").toLowerCase();
      return (
        voiceLang === targetLang ||
        voiceLang === baseLang ||
        voiceLang.startsWith(`${baseLang}-`)
      );
    });

    const candidates = matchingVoices.length ? matchingVoices : voices;
    const scoreVoice = (voice) => {
      const voiceLang = (voice.lang || "").toLowerCase();
      const voiceName = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
      let score = 0;

      if (voiceLang === targetLang) score += 60;
      else if (voiceLang === baseLang || voiceLang.startsWith(`${baseLang}-`)) score += 40;
      if (voice.localService) score += 20;
      if (voice.default) score += 10;
      if (voiceName.includes("siri")) score += 24;
      if (baseLang === "en" && /male|daniel|david|fred|jorge|oliver|thomas/.test(voiceName)) score += 18;
      if (baseLang === "en" && /female|zira|samantha|victoria|karen|moira|tingting/.test(voiceName)) score -= 10;
      if (voiceName.includes("neural")) score += 16;
      if (voiceName.includes("premium")) score += 14;
      if (voiceName.includes("natural")) score += 12;
      if (voiceName.includes("enhanced")) score += 10;
      if (voiceName.includes("compact")) score -= 10;
      if (voiceName.includes("espeak")) score -= 18;
      if (voiceName.includes("festival")) score -= 18;
      if (voiceName.includes("google")) score += 8;
      if (voiceName.includes("microsoft")) score += 7;
      if (voiceName.includes("apple")) score += 6;

      return score;
    };

    return [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  };

  const getMessageActionsMenuStyle = () => {
    if (!messageActionsMenu) return {};

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      return {
        left: "0.75rem",
        right: "0.75rem",
        bottom: "0.75rem",
      };
    }

    const menuWidth = 260;
    const padding = 12;
    const maxRight = Math.max(padding, window.innerWidth - menuWidth - padding);
    const rightOffset = Math.min(Math.max(messageActionsMenu.right, padding), maxRight);
    const topOffset = Math.max(padding, messageActionsMenu.top);

    return {
      top: `${topOffset}px`,
      right: `${rightOffset}px`,
    };
  };

  return (
    <div className="cv-thread">
      {messages.length > 0 ? (
        messages.map((msg, index) => {
          const flags = groupFlags[index];
          const isSentByUser = flags.isSentByUser;
          return (
            <MessageRow
              key={msg.id || index}
              msg={msg}
              isSentByUser={isSentByUser}
              startsGroup={flags.startsGroup}
              endsGroup={flags.endsGroup}
              showDaySeparator={flags.showDaySeparator}
              showUnreadDivider={flags.showUnreadDivider}
              translatedText={translationsByMessageId[msg.id] || msg.translated_text}
              isTranslating={translatingMessageId === msg.id}
              canTranslate={canShowTranslate(msg, isSentByUser)}
              highlightQuery={matchedSearchMessageIdSet.has(msg.id) ? searchQuery : ""}
              isActiveSearchMatch={activeSearchMessageId === msg.id}
              onOpenActionsMenu={openMessageActionsMenu}
              onTranslate={handleTranslate}
              onTouchStart={handleTouchStart}
              onClearLongPress={clearLongPressTimer}
            />
          );
        })
      ) : (
        <p className="cv-messages-status">No messages yet. Say hello!</p>
      )}

      {messageActionsMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={closeMessageActionsMenu} />
          <div
            ref={actionsMenuRef}
            className="cv-actions-menu"
            style={getMessageActionsMenuStyle()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeMessageActionsMenu({ restoreFocus: true });
              }
            }}
            role="dialog"
            aria-label="Message actions"
          >
            {(() => {
              const msg = messages.find((message) => message.id === messageActionsMenu.messageId);
              if (!msg) {
                return null;
              }
              const isSentByUser = msg.sender?.id === userId;

              return (
                <>
                  <div className="cv-actions-reactions">
                    {REACTION_OPTIONS.map((emoji) => (
                      <button
                        key={`${msg.id}-menu-${emoji}`}
                        type="button"
                        onClick={() => handleReact(msg.id, emoji)}
                        aria-label={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {msg.current_user_reaction && (
                    <button
                      type="button"
                      onClick={() => handleReact(msg.id, "")}
                      className="cv-actions-item is-danger"
                    >
                      <RemoveCircleOutlineRoundedIcon />
                      <span>Remove reaction</span>
                    </button>
                  )}
                  <div className="cv-actions-sep" />
                  {onCommentMessage && (
                    <button
                      type="button"
                      onClick={() => {
                        onCommentMessage(msg);
                        closeMessageActionsMenu();
                      }}
                      className="cv-actions-item"
                    >
                      <ReplyRoundedIcon />
                      <span>Reply</span>
                    </button>
                  )}
                  <button type="button" onClick={() => handleCopyMessage(msg)} className="cv-actions-item">
                    <ContentCopyRoundedIcon />
                    <span>Copy</span>
                  </button>
                  <button type="button" onClick={() => handleSpeakMessage(msg)} className="cv-actions-item">
                    <CampaignRoundedIcon />
                    <span>Speak</span>
                  </button>
                  {onTogglePinMessage && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onTogglePinMessage(msg);
                        closeMessageActionsMenu();
                      }}
                      className="cv-actions-item"
                    >
                      <PushPinRoundedIcon />
                      <span>{msg.is_pinned ? "Unpin message" : "Pin message"}</span>
                    </button>
                  )}
                  {(canShowTranslate(msg, isSentByUser) || canEditMessage(msg)) && (
                    <div className="cv-actions-sep" />
                  )}
                  {canShowTranslate(msg, isSentByUser) && (
                    <button type="button" onClick={() => handleTranslate(msg)} className="cv-actions-item">
                      <TranslateRoundedIcon />
                      <span>Translate</span>
                    </button>
                  )}
                  {canEditMessage(msg) && (
                    <>
                      {onEditMessage && (
                        <button
                          type="button"
                          onClick={() => {
                            onEditMessage(msg);
                            closeMessageActionsMenu();
                          }}
                          className="cv-actions-item"
                        >
                          <EditRoundedIcon />
                          <span>Edit message</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteMessage(msg.id);
                          closeMessageActionsMenu();
                        }}
                        className="cv-actions-item is-danger"
                      >
                        <DeleteOutlineRoundedIcon />
                        <span>Delete message</span>
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {copyFeedback && (
        <div
          className={`cv-copy-feedback ${copyFeedback === "Copy failed" ? "is-error" : ""}`}
          role="status"
        >
          {copyFeedback}
        </div>
      )}
    </div>
  );
};

export default React.memo(Conversation);
