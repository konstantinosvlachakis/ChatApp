import React, { useEffect, useState } from "react";
import { BASE_URL } from "../../../constants/constants";

const Conversation = ({
  messages,
  userId,
  onDeleteMessage,
  baseTranslateLanguage = "english",
}) => {
  const [dropdownIndex, setDropdownIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [translationsByMessageId, setTranslationsByMessageId] = useState({});
  const [blockedTranslateByMessageId, setBlockedTranslateByMessageId] =
    useState({});
  const [translatingMessageId, setTranslatingMessageId] = useState(null);

  const toggleDropdown = (index) => {
    setDropdownIndex((prevIndex) => (prevIndex === index ? null : index));
  };

  // Normalize any relative or local URLs
  const normalizeUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${window.location.origin}${url}`;
  };

  // Helper to detect audio files even if no extension
  const isLikelyAudio = (url) =>
    /\.(mp3|wav|ogg|webm)$/i.test(url) ||
    url.includes("/media/attachments/blob_") ||
    url.includes("/media/audio/");

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const closeMenus = () => closeContextMenu();
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
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

  const handleTranslate = async (msg) => {
    if (!msg?.text?.trim()) return;

    try {
      setTranslatingMessageId(msg.id);
      const token =
        sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");

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
      closeContextMenu();
    }
  };

  return (
    <div className="flex w-full flex-col overflow-x-hidden bg-gray-50 px-1 py-2 sm:px-2 sm:py-3">
      {messages.length > 0 ? (
        messages.map((msg, index) => {
          const rawUrl =
            msg.attachment_url || msg.attachment || msg.attachmentUrl;
          const attachmentUrl = normalizeUrl(rawUrl);
          const isSentByUser = msg.sender?.id === userId;

          return (
            <div
              key={index}
              className={`flex flex-col ${
                isSentByUser ? "items-end" : "items-start"
              } mb-3`}
            >
              <div
                className={`relative max-w-[calc(100%-2rem)] break-words rounded-2xl px-3 py-2 shadow-sm sm:max-w-md sm:px-4 ${
                  isSentByUser
                    ? "bg-blue-100 text-gray-900"
                    : "bg-gray-200 text-gray-900"
                }`}
                onContextMenu={(e) => {
                  if (
                    isSentByUser ||
                    !msg?.text?.trim() ||
                    !msg?.can_translate ||
                    blockedTranslateByMessageId[msg.id] ||
                    translationsByMessageId[msg.id] ||
                    msg.translated_text
                  ) {
                    return;
                  }
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    messageId: msg.id,
                  });
                }}
              >
                {/* Dropdown for delete */}
                {isSentByUser && (
                  <div className="absolute -left-6 top-1/2 z-20 -translate-y-1/2 group">
                    <button
                      className="text-gray-500 hover:text-gray-700 focus:outline-none"
                      onClick={() => toggleDropdown(index)}
                    >
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full mx-0.5"></span>
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                    </button>
                    {dropdownIndex === index && (
                      <div
                        className="absolute right-full top-0 mr-2 bg-white border shadow-lg rounded z-50"
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

                {/* Message content */}
                {attachmentUrl ? (
                  /\.(jpeg|jpg|png|gif)$/i.test(attachmentUrl) ? (
                    <img
                      src={attachmentUrl}
                      alt="Attachment"
                      className="rounded-lg max-w-full h-auto"
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
                      className="text-blue-500 underline flex items-center space-x-1"
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
                      <p className="text-xs text-gray-600 mt-2">Translating...</p>
                    )}
                  </div>
                ) : (
                  <p className="italic text-gray-500">Audio message</p>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-gray-500">No messages yet!</div>
      )}

      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white/95 backdrop-blur-sm rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px] transition-all duration-150 ease-out"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors duration-150 flex items-center gap-2"
            onClick={() => {
              const msg = messages.find((m) => m.id === contextMenu.messageId);
              if (msg) {
                handleTranslate(msg);
              } else {
                closeContextMenu();
              }
            }}
          >
            <span aria-hidden="true">🌐</span>
            <span>Translate</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Conversation;
