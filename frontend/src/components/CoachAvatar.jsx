import React from "react";

const CoachAvatar = ({ language, size = 48, hideBadge = false, className = "" }) => {
  const compact = size <= 36;
  const showBadge = size >= 54 && !hideBadge;
  const borderRadius = Math.max(12, Math.round(size * 0.3));
  const initialSize = compact ? Math.max(16, Math.round(size * 0.52)) : Math.max(20, Math.round(size * 0.48));
  const accent = String(language || "").trim().toUpperCase().slice(0, 10);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: "#0d1c2b",
        borderColor: "rgba(20,49,74,0.12)",
      }}
    >
      <div
        className="absolute"
        style={{
          width: compact ? "84%" : "78%",
          height: compact ? "88%" : "86%",
          left: compact ? "-10%" : "-6%",
          top: compact ? "-8%" : "-10%",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 28,
          borderBottomRightRadius: 42,
          borderBottomLeftRadius: 26,
          backgroundColor: "#17324a",
          transform: "rotate(-8deg)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: compact ? "82%" : "76%",
          height: compact ? "46%" : "50%",
          left: compact ? "4%" : "8%",
          bottom: compact ? "-8%" : "-6%",
          borderTopLeftRadius: 34,
          borderTopRightRadius: 22,
          borderBottomRightRadius: 18,
          borderBottomLeftRadius: 40,
          backgroundColor: "#1b7f79",
          transform: "rotate(7deg)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: compact ? "44%" : "46%",
          height: compact ? "44%" : "46%",
          right: compact ? "-6%" : "-4%",
          top: compact ? "-4%" : "-2%",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 28,
          borderBottomLeftRadius: 18,
          backgroundColor: "#ecb1d0",
          transform: "rotate(9deg)",
        }}
      />

      <div
        className="relative z-10 flex items-center justify-center text-white"
        style={{
          minWidth: compact ? "44%" : "50%",
          minHeight: compact ? "44%" : "50%",
          fontFamily: "Sora, sans-serif",
          fontWeight: 700,
          fontSize: initialSize,
          letterSpacing: -0.5,
          textShadow: compact ? "0 1px 3px rgba(8,19,32,0.16)" : "none",
        }}
      >
        L
      </div>

      {showBadge ? (
        <div
          className="absolute"
          style={{
            bottom: "8%",
            padding: "3px 7px",
            borderRadius: 999,
            backgroundColor: "rgba(248,251,255,0.92)",
          }}
        >
          <span
            style={{
              color: "#14314a",
              fontSize: 7,
              fontWeight: 800,
              letterSpacing: 0.4,
            }}
          >
            {accent || "L3"}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default CoachAvatar;
