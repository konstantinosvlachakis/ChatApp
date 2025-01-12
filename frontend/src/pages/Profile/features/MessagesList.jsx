import React, { useState } from "react";

const MessagesList = ({ messages, userId, onDeleteMessage }) => {
  const [dropdownIndex, setDropdownIndex] = useState(null); // Tracks which message's dropdown is open
  const toggleDropdown = (index) => {
    setDropdownIndex((prevIndex) => (prevIndex === index ? null : index));
  };

  return (
    <div className="flex-1 p-4 bg-gray-50 flex flex-col overflow-y-auto scroll-container">
      {messages.length > 0 ? (
        messages.map((msg, index) => {
          const isImageMessage = !!msg.attachment_url; // Check if this is an image message
          const isSentByUser = msg.sender?.id === userId; // Check if the message was sent by the user

          return (
            <div
              key={index}
              className={`relative max-w-fit ${
                !isImageMessage && isSentByUser
                  ? "bg-blue-100" // Apply bg-blue-100 for text messages sent by the user
                  : ""
              } ${isImageMessage ? "" : "px-4 py-2"} mb-2 rounded-full ${
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
                        onClick={() => {
                          onDeleteMessage(msg.id);
                          setDropdownIndex(null); // Close the dropdown after deleting
                        }}
                        className="block px-4 py-2 text-sm text-red-500 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isImageMessage ? (
                /\.(jpeg|jpg|png|gif|mp4|webm)$/i.test(msg.attachment_url) ? (
                  <div className="w-40 h-40 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                    <img
                      src={msg.attachment_url}
                      alt="Attachment"
                      className="object-cover w-40 h-40"
                    />
                  </div>
                ) : (
                  <a
                    href={msg.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📎 View Attachment
                  </a>
                )
              ) : (
                <p>{msg.text}</p>
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
