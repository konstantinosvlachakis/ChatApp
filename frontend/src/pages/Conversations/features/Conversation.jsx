import React, { useState } from "react";

const Conversation = ({ messages, userId, onDeleteMessage }) => {
  const [dropdownIndex, setDropdownIndex] = useState(null);

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

  return (
    <div className="p-4 bg-gray-50 flex flex-col">
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
                className={`relative px-4 py-2 rounded-2xl max-w-xs break-words shadow-sm ${
                  isSentByUser
                    ? "bg-blue-100 text-gray-900"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                {/* Dropdown for delete */}
                {isSentByUser && (
                  <div className="absolute -left-6 top-1/2 transform -translate-y-1/2 z-20 group">
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
                      className="rounded-lg max-w-full h-60"
                    />
                  ) : isLikelyAudio(attachmentUrl) ? (
                    <audio controls src={attachmentUrl} className="w-60" />
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
                  <p>{msg.text}</p>
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
    </div>
  );
};

export default Conversation;
