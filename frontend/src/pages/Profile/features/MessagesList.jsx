import React, { useState } from "react";

const MessagesList = ({ messages, userId, onDeleteMessage }) => {
  const [dropdownIndex, setDropdownIndex] = useState(null); // Tracks which message's dropdown is open
  const [deletingMessageIndex, setDeletingMessageIndex] = useState(null); // Tracks the message being deleted

  const toggleDropdown = (index) => {
    setDropdownIndex((prevIndex) => (prevIndex === index ? null : index));
  };

  const handleDelete = (index, messageId) => {
    setDeletingMessageIndex(index); // Trigger animation
    setTimeout(() => {
      onDeleteMessage(messageId); // Remove the message after animation ends
      setDeletingMessageIndex(null); // Reset deleting index
    }, 300); // Match this duration with the CSS animation duration
  };

  return (
    <div className="flex-1 p-4 bg-gray-50 flex flex-col overflow-y-auto scroll-container">
      {messages.length > 0 ? (
        messages
          .filter((msg) => msg.id !== undefined) // Only include messages with an id
          .map((msg, index) => {
            const attachmentUrl = msg.attachment_url || msg.attachment;
            const isImageMessage = !!attachmentUrl;
            const isSentByUser = msg.sender?.id === userId;

            // Check if the message is currently being deleted
            const isDeleting = deletingMessageIndex === index;

            return (
              <div
                key={index}
                className={`relative max-w-fit transition-all duration-300 ${
                  isDeleting ? "opacity-0 translate-y-[-20px] scale-95" : ""
                } ${!isImageMessage && isSentByUser ? "bg-blue-100" : ""} ${
                  isImageMessage ? "" : "px-4 py-2"
                } mb-2 rounded-full ${
                  isSentByUser ? "self-end" : "bg-gray-200 self-start"
                }`}
              >
                {isSentByUser && (
                  <div className="absolute -left-6 top-1/2 transform -translate-y-1/2 z-20 group">
                    {/* Three dots */}
                    <button
                      className="text-gray-500 hover:text-gray-700 focus:outline-none"
                      onClick={() => toggleDropdown(index)}
                    >
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full mx-0.5"></span>
                      <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                    </button>

                    {/* Dropdown */}
                    {dropdownIndex === index && (
                      <div
                        className="absolute right-full top-0 mr-2 mt-0 bg-white border shadow-lg rounded z-50 group-hover:block"
                        onMouseLeave={() => setDropdownIndex(null)}
                        onMouseEnter={() => setDropdownIndex(index)}
                      >
                        <button
                          onClick={() => handleDelete(index, msg.id)}
                          className="block px-4 py-2 text-sm text-red-500 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isImageMessage ? (
                  /\.(jpeg|jpg|png|gif|mp4|webm)$/i.test(attachmentUrl) ? (
                    <div className="w-40 h-40 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                      {attachmentUrl.match(/\.(mp4|webm)$/i) ? (
                        <video
                          src={attachmentUrl}
                          controls
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <img
                          src={attachmentUrl}
                          alt="Attachment"
                          className="object-cover w-full h-full"
                        />
                      )}
                    </div>
                  ) : (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      📎 View Attachment
                    </a>
                  )
                ) : (
                  <p>{msg.text || "No content available"}</p>
                )}
              </div>
            );
          })
      ) : (
        <div className="text-gray-500">No messages yet!</div>
      )}
    </div>
  );
};

export default MessagesList;
