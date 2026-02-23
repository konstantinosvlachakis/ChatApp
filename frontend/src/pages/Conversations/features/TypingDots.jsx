import React from "react";

const DOT_DELAYS = ["0ms", "150ms", "300ms"];

function TypingDots({ className = "", dotClassName = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          className={`w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce ${dotClassName}`}
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}

export default TypingDots;
