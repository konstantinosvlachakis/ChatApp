import React from "react";

// Delivery ticks for your own messages: one tick = sent, two = delivered, two blue = seen.
const LABELS = { sent: "Sent", delivered: "Delivered", read: "Seen" };

const MessageTicks = ({ status = "sent" }) => {
  const label = LABELS[status] || LABELS.sent;
  const double = status === "delivered" || status === "read";
  return (
    <span className={`cv-ticks${status === "read" ? " is-read" : ""}`} title={label}>
      <svg viewBox="0 0 22 14" width="19" height="12" aria-hidden="true" focusable="false">
        <path d="M1.5 7 5 10.5 12 2.5" />
        {double && <path d="M8.2 9 9.7 10.5 16.7 2.5" />}
      </svg>
      <span className="lv-visually-hidden">{label}</span>
    </span>
  );
};

export default MessageTicks;
