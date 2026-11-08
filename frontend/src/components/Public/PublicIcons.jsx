import React from "react";
import { flagUrl, titleCase } from "../../constants/languages";

// Small icons and flag avatars for the public pages (main bundle: home + footers).
// Decorative: the language or feature name is always given by nearby text.

export const ICON_PATHS = {
  match: "M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3",
  chat: "M4 5h16v10H9l-5 4V5z",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  correct: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  lumi: "M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z",
  practice: "M5 12l4 4L19 6",
  safety: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
  languages: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
};

export const LineIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={ICON_PATHS[name] || ICON_PATHS.chat} />
  </svg>
);

/** Round flag avatar; the language name is given by nearby text. */
export const Flag = ({ language, small = false }) => {
  const src = flagUrl(language, 80);
  return (
    <span className={`lp-flag${small ? " lp-flag-sm" : ""}`} aria-hidden="true">
      {src ? <img src={src} alt="" width="48" height="48" loading="lazy" decoding="async" /> : titleCase(language).slice(0, 2)}
    </span>
  );
};

export const FlagPair = ({ languages, small = false }) => (
  <span className="lp-flags">
    {languages.map((language) => (
      <Flag key={language} language={language} small={small} />
    ))}
  </span>
);
