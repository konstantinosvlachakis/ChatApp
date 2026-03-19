import React, { useEffect, useRef, useState } from "react";
import { BASE_URL } from "../../../constants/constants";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 450;
const MOBILE_BREAKPOINT = 640;

const Conversation = ({
  messages,
  userId,
  onDeleteMessage,
  onEditMessage,
  onMessageReactionChange,
  baseTranslateLanguage = "english",
}) => {
  const [messageActionsMenu, setMessageActionsMenu] = useState(null);
  const [translationsByMessageId, setTranslationsByMessageId] = useState({});
  const [blockedTranslateByMessageId, setBlockedTranslateByMessageId] =
    useState({});
  const [translatingMessageId, setTranslatingMessageId] = useState(null);
  const longPressTimerRef = useRef(null);

  const normalizeUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${window.location.origin}${url}`;
  };

  const isLikelyAudio = (url) =>
    /\.(mp3|wav|ogg|webm)$/i.test(url) ||
    url.includes("/media/attachments/blob_") ||
    url.includes("/media/audio/");

  const closeMessageActionsMenu = () => setMessageActionsMenu(null);
  const canEditMessage = (msg) => msg?.sender?.id === userId;

  useEffect(() => {
    window.addEventListener("click", closeMessageActionsMenu);
    return () => window.removeEventListener("click", closeMessageActionsMenu);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      closeMessageActionsMenu();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const initialTranslations = {};
    messages.forEach((msg) => {
      if (msg.translated_text) {
        initialTranslations[msg.id] = msg.translated_text;
      }
    });
    setTranslationsByMessageId((prev) => ({ ...initialTranslations, ...prev }));
  }, [messages]);

  const canShowTranslate = (msg, isSentByUser) =>
    !isSentByUser &&
    Boolean(msg?.text?.trim()) &&
    Boolean(msg?.can_translate) &&
    !blockedTranslateByMessageId[msg.id] &&
    !translationsByMessageId[msg.id] &&
    !msg.translated_text;

  const openMessageActionsMenu = (messageId, position = null) => {
    const padding = 12;
    const defaultTop = Math.max(padding, window.innerHeight / 2 - 120);
    const defaultRight = padding;
    setMessageActionsMenu({
      messageId,
      top: position?.top ?? defaultTop,
      right: position?.right ?? defaultRight,
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (event, messageId) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageActionsMenu(messageId, {
        top: touch.clientY + 12,
        right: Math.max(12, window.innerWidth - touch.clientX - 12),
      });
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleTranslate = async (msg) => {
    if (!msg?.text?.trim()) return;

    try {
      setTranslatingMessageId(msg.id);

      const res = await fetch(`${BASE_URL}/api/messages/translate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message_id: msg.id,
          target_language: baseTranslateLanguage,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        if (payload.same_language || payload.already_translated) {
          setBlockedTranslateByMessageId((prev) => ({ ...prev, [msg.id]: true }));
        }
        throw new Error(payload.error || "Failed to translate message.");
      }

      setTranslationsByMessageId((prev) => ({
        ...prev,
        [msg.id]: payload.translated_text,
      }));
    } catch (error) {
      console.error("Translate error:", error);
    } finally {
      setTranslatingMessageId(null);
      closeMessageActionsMenu();
    }
  };

  const handleReact = async (messageId, emoji) => {
    try {
      const response = await fetch(`${BASE_URL}/api/messages/${messageId}/react/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to react to message.");
      }
      onMessageReactionChange?.(payload);
    } catch (error) {
      console.error("Reaction error:", error);
    } finally {
      closeMessageActionsMenu();
    }
  };

  const groupedReactions = (reactions = []) => {
    const counts = {};
    reactions.forEach((reaction) => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return Object.entries(counts);
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
    <div className="flex w-full flex-col overflow-x-hidden bg-gray-50 px-1 py-2 sm:px-2 sm:py-3">
      {messages.length > 0 ? (
        messages.map((msg, index) => {
          void index;
          const rawUrl = msg.attachment_url || msg.attachment || msg.attachmentUrl;
          const attachmentUrl = normalizeUrl(rawUrl);
          const isSentByUser = msg.sender?.id === userId;
          const messageReactions = groupedReactions(msg.reactions || []);
          const isSystemMessage = Boolean(msg.isSystem);

          if (isSystemMessage) {
            return (
              <div key={msg.id || index} className="mb-3 flex justify-center">
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id || index}
              className={`group mb-3 flex flex-col ${
                isSentByUser ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`relative max-w-[calc(100%-2rem)] break-words rounded-2xl px-3 py-2 shadow-sm sm:max-w-md sm:px-4 ${
                  isSentByUser
                    ? "bg-blue-100 text-gray-900"
                    : "bg-gray-200 text-gray-900"
                }`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMessageActionsMenu(msg.id, {
                    top: e.clientY + 12,
                    right: Math.max(12, window.innerWidth - e.clientX - 12),
                  });
                }}
                onTouchStart={(e) => handleTouchStart(e, msg.id)}
                onTouchEnd={clearLongPressTimer}
                onTouchCancel={clearLongPressTimer}
                onTouchMove={clearLongPressTimer}
              >
                <div
                  className={`absolute top-1/2 z-20 -translate-y-1/2 ${
                    isSentByUser ? "-left-5" : "-right-5"
                  }`}
                >
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/92 text-slate-400 opacity-100 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-600 hover:ring-slate-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openMessageActionsMenu(msg.id, {
                        top: rect.bottom + 10,
                        right: Math.max(12, window.innerWidth - rect.right),
                      });
                    }}
                    aria-label="Open message actions"
                  >
                    <span className="inline-block h-1 w-1 rounded-full bg-current"></span>
                    <span className="mx-[3px] inline-block h-1 w-1 rounded-full bg-current"></span>
                    <span className="inline-block h-1 w-1 rounded-full bg-current"></span>
                  </button>
                </div>

                {attachmentUrl ? (
                  /\.(jpeg|jpg|png|gif)$/i.test(attachmentUrl) ? (
                    <img
                      src={attachmentUrl}
                      alt="Attachment"
                      className="h-auto max-w-full rounded-lg"
                    />
                  ) : /\.(mp4|webm)$/i.test(attachmentUrl) ? (
                    <video
                      src={attachmentUrl}
                      controls
                      className="h-48 max-w-full rounded-lg sm:h-60"
                    />
                  ) : isLikelyAudio(attachmentUrl) ? (
                    <audio controls src={attachmentUrl} className="w-52 sm:w-60" />
                  ) : (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-blue-500 underline"
                    >
                      <span role="img" aria-label="attachment">
                        📎
                      </span>
                      <span>View Attachment</span>
                    </a>
                  )
                ) : msg.text ? (
                  <div>
                    <p>{msg.text}</p>
                    {msg.edited_at && (
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">
                        Edited
                      </p>
                    )}
                    {(translationsByMessageId[msg.id] || msg.translated_text) && (
                      <>
                        <hr className="my-2 border-black" />
                        <p>{translationsByMessageId[msg.id] || msg.translated_text}</p>
                      </>
                    )}
                    {translatingMessageId === msg.id && (
                      <p className="mt-2 text-xs text-gray-600">Translating...</p>
                    )}
                  </div>
                ) : (
                  <p className="italic text-gray-500">Audio message</p>
                )}
              </div>

              {messageReactions.length > 0 && (
                <div className="mt-1 flex max-w-[calc(100%-2rem)] flex-wrap gap-1">
                  {messageReactions.map(([emoji, count]) => (
                    <span
                      key={`${msg.id}-${emoji}`}
                      className="rounded-full border border-gray-300 bg-white px-2 py-1 text-xs leading-none text-gray-700"
                    >
                      {emoji} {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="text-gray-500">No messages yet!</div>
      )}

      {messageActionsMenu && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={closeMessageActionsMenu}
          />
          <div
            className="fixed z-[9999] w-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-white/98 p-1.5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.45)] backdrop-blur-sm"
            style={getMessageActionsMenuStyle()}
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const msg = messages.find((message) => message.id === messageActionsMenu.messageId);
              if (!msg) {
                return null;
              }
              const isSentByUser = msg.sender?.id === userId;

              return (
                <>
                  <div className="grid grid-cols-6 gap-1 px-1 py-1">
                    {REACTION_OPTIONS.map((emoji) => (
                      <button
                        key={`${msg.id}-menu-${emoji}`}
                        type="button"
                        className="rounded-xl px-2 py-2 text-xl transition hover:bg-slate-100"
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
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <RemoveCircleOutlineRoundedIcon sx={{ fontSize: 18 }} />
                      <span>Remove reaction</span>
                    </button>
                  )}
                  {(canEditMessage(msg) || canShowTranslate(msg, isSentByUser)) && (
                    <div className="my-1 border-t border-slate-200" />
                  )}
                  {canShowTranslate(msg, isSentByUser) && (
                    <button
                      type="button"
                      onClick={() => handleTranslate(msg)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      <TranslateRoundedIcon sx={{ fontSize: 18 }} />
                      <span>Translate</span>
                    </button>
                  )}
                  {canEditMessage(msg) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onEditMessage?.(msg);
                          closeMessageActionsMenu();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        <EditRoundedIcon sx={{ fontSize: 18 }} />
                        <span>Edit message</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteMessage(msg.id);
                          closeMessageActionsMenu();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
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
    </div>
  );
};

export default Conversation;
