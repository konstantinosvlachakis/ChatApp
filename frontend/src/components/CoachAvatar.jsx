import React from "react";
import { LOGO_COLORS, LOGO_SHAPES, LOGO_SIZE } from "../brand/logoMark";

// The LangVoyage mark (also Lumi's avatar). Shapes live in src/brand/logoMark.js so the
// app, favicon and app icons always match. Larger sizes can show a language badge.
const CoachAvatar = ({ language, size = 48, hideBadge = false, className = "" }) => {
  const showBadge = size >= 54 && !hideBadge;
  const borderRadius = Math.max(8, Math.round(size * 0.27));
  const accent = String(language || "").trim().toUpperCase().slice(0, 10);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius, backgroundColor: LOGO_COLORS.tile }}
    >
      <svg
        viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block" }}
      >
        {LOGO_SHAPES.map(({ tag: Tag, attrs }, index) => (
          <Tag key={index} {...attrs} />
        ))}
      </svg>

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
