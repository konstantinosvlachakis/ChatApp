import React, { useEffect, useRef, useState } from "react";
import { BASE_URL } from "../../../constants/constants";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 450;
const MOBILE_BREAKPOINT = 640;

const Conversation = ({
  messages,
  userId,
  onDeleteMessage,
  onMessageReactionChange,
  baseTranslateLanguage = "english",
}) => {
  const [dropdownIndex, setDropdownIndex] = useState(null);
  const [menuState, setMenuState] = useState(null);
  const [translationsByMessageId, setTranslationsByMessageId] = useState({});
  const [blockedTranslateByMessageId, setBlockedTranslateByMessageId] =
    useState({});
  const [translatingMessageId, setTranslatingMessageId] = useState(null);
  const longPressTimerRef = useRef(null);

  const toggleDropdown = (index) => {
    setDropdownIndex((prevIndex) => (prevIndex === index ? null : index));
  };

  const normalizeUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${window.location.origin}${url}`;
  };

  const isLikelyAudio = (url) =>
    /\.(mp3|wav|ogg|webm)$/i.test(url) ||
    url.includes("/media/attachments/blob_") ||
    url.includes("/media/audio/");

  const closeMenu = () => setMenuState(null);

  useEffect(() => {
    const closeMenus = () => closeMenu();
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    const handleResize = () => closeMenu();
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

  const openMessageMenu = (x, y, messageId) => {
    setDropdownIndex(null);
    setMenuState({ x, y, messageId });
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
      openMessageMenu(touch.clientX, touch.clientY, messageId);
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleTranslate = async (msg) => {
    if (!msg?.text?.trim()) return;

    try {
      setTranslatingMessageId(msg.id);
      const token =
        sessionStorage.getItem("accessToken") ||
        localStorage.getItem("accessToken");

      const res = await fetch(`${BASE_URL}/api/messages/translate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      closeMenu();
    }
  };

  const handleReact = async (messageId, emoji) => {
    try {
      const token =
        sessionStorage.getItem("accessToken") ||
        localStorage.getItem("accessToken");
      const response = await fetch(`${BASE_URL}/api/messages/${messageId}/react/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      closeMenu();
    }
  };

  const groupedReactions = (reactions = []) => {
    const counts = {};
    reactions.forEach((reaction) => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return Object.entries(counts);
  };

  const getMenuStyle = () => {
    if (!menuState) return {};

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      return {
        left: "0.75rem",
        right: "0.75rem",
        bottom: "0.75rem",
      };
    }

    const menuWidth = 260;
    const menuHeight = 220;
    const padding = 12;
    const clampedLeft = Math.max(
      padding,
      Math.min(menuState.x, window.innerWidth - menuWidth - padding)
    );
    const clampedTop = Math.max(
      padding,
      Math.min(menuState.y, window.innerHeight - menuHeight - padding)
    );

    return { left: `${clampedLeft}px`, top: `${clampedTop}px` };
  };

  return (
    <div className="flex w-full flex-col overflow-x-hidden bg-gray-50 px-1 py-2 sm:px-2 sm:py-3">
      {messages.length > 0 ? (
        messages.map((msg, index) => {
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
              className={`mb-3 flex flex-col ${
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
                  openMessageMenu(e.clientX, e.clientY, msg.id);
                }}
                onTouchStart={(e) => handleTouchStart(e, msg.id)}
                onTouchEnd={clearLongPressTimer}
                onTouchCancel={clearLongPressTimer}
                onTouchMove={clearLongPressTimer}
              >
                {isSentByUser && (
                  <div className="group absolute -left-6 top-1/2 z-20 -translate-y-1/2">
                    <button
                      className="text-gray-500 hover:text-gray-700 focus:outline-none"
                      onClick={() => toggleDropdown(index)}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-500"></span>
                      <span className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-gray-500"></span>
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-500"></span>
                    </button>
                    {dropdownIndex === index && (
                      <div
                        className="absolute right-full top-0 z-50 mr-2 rounded border bg-white shadow-lg"
                        onMouseLeave={() => setDropdownIndex(null)}
                      >
                        <button
                          onClick={() => {
                            onDeleteMessage(msg.id);
                            setDropdownIndex(null);
                          }}
                          className="block px-4 py-2 text-sm text-red-500 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

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

      {menuState && (
        <>
          <div className="fixed inset-0 z-[9998] bg-black/20" onClick={closeMenu} />
          <div
            className="fixed z-[9999] min-w-[220px] rounded-md border border-gray-200 bg-white/95 py-1 shadow-lg backdrop-blur-sm transition-all duration-150 ease-out sm:min-w-[260px]"
            style={getMenuStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-6 gap-1 px-2 py-1">
              {REACTION_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="rounded px-2 py-2 text-xl transition-colors duration-150 hover:bg-gray-100"
                  onClick={() => handleReact(menuState.messageId, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {messages.find((m) => m.id === menuState.messageId)
              ?.current_user_reaction && (
              <button
                className="w-full px-3 py-2 text-left text-sm text-red-600 transition-colors duration-150 hover:bg-gray-100"
                onClick={() => handleReact(menuState.messageId, "")}
              >
                Remove reaction
              </button>
            )}

            {(() => {
              const msg = messages.find((m) => m.id === menuState.messageId);
              const isSentByUser = msg?.sender?.id === userId;
              if (!msg || !canShowTranslate(msg, isSentByUser)) {
                return null;
              }
              return (
                <>
                  <hr className="my-1 border-gray-200" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-gray-100"
                    onClick={() => handleTranslate(msg)}
                  >
                    <span aria-hidden="true">🌐</span>
                    <span>Translate</span>
                  </button>
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
