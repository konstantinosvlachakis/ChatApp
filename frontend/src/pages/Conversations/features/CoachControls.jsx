import { useEffect, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { COACH_MODES } from "./coachConversation";

export const COACH_DETAILS_ID = "cv-coach-details";
const DOCK_STORAGE_KEY = "chat:coach:details-docked";

/** One-line summaries for the header subtitle (the full descriptions live in COACH_MODES). */
export const COACH_MODE_TAGLINES = {
  casual_chat: "natural conversation, light corrections",
  correct_me: "answers, then rewrites your mistakes",
  roleplay: "act out cafés, travel and work",
  quiz_me: "short questions for you to answer",
  vocabulary_drill: "targeted words, phrases and recall",
};

export const useMediaQuery = (query) => {
  const read = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [query]);

  return matches;
};

/** Docked (≥1280px) details panel: open by default, remembered per browser. */
export const readDockedPreference = () => {
  try {
    const stored = window.localStorage.getItem(DOCK_STORAGE_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
};

export const writeDockedPreference = (docked) => {
  try {
    window.localStorage.setItem(DOCK_STORAGE_KEY, docked ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); the panel still toggles for this visit.
  }
};

/** Compact, always-visible bar under the header: language chip + single-select mode pills. */
export const CoachModeBar = ({ languageOptions, selectedLanguage, selectedMode, onLanguageChange, onModeChange }) => (
  <div className="cv-coach-modebar">
    <label className="cv-coach-lang">
      <span className="cv-sr-only">Practice language</span>
      <select value={selectedLanguage} onChange={(event) => onLanguageChange(event.target.value)}>
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ExpandMoreRoundedIcon aria-hidden="true" />
    </label>
    <div className="cv-coach-pills" role="group" aria-label="Practice mode">
      {COACH_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={mode.id === selectedMode}
          title={mode.description}
          onClick={() => onModeChange(mode.id)}
        >
          {mode.shortLabel}
        </button>
      ))}
    </div>
  </div>
);

/** Full coach settings, shared by the popover, the phone sheet and the docked panel. */
export const CoachDetails = ({
  titleId,
  docked = false,
  languageOptions,
  selectedLanguage,
  selectedMode,
  onLanguageChange,
  onModeChange,
  onStartNewConversation,
  onClose,
}) => (
  <div className="cv-coach-details">
    <div className="cv-coach-details-head">
      <h2 id={titleId}>Coach settings</h2>
      <button
        type="button"
        className="cv-icon-button is-plain"
        onClick={() => onClose()}
        aria-label={docked ? "Hide coach settings" : "Close coach settings"}
      >
        <CloseRoundedIcon />
      </button>
    </div>
    <p className="cv-coach-intro">
      Adaptive language coach for real conversation, corrections, travel roleplay, vocabulary
      drills and short quizzes. Switch modes whenever you want.
    </p>
    <p id={`${titleId}-modes`} className="cv-coach-details-label">Practice mode</p>
    <div className="cv-coach-modes" role="group" aria-labelledby={`${titleId}-modes`}>
      {COACH_MODES.map((mode) => (
        <button key={mode.id} type="button" aria-pressed={mode.id === selectedMode} onClick={() => onModeChange(mode.id)}>
          <strong>{mode.label}</strong>
          <span>{mode.description}</span>
        </button>
      ))}
    </div>
    <p id={`${titleId}-languages`} className="cv-coach-details-label">Language</p>
    <div className="cv-coach-languages" role="group" aria-labelledby={`${titleId}-languages`}>
      {languageOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === selectedLanguage}
          onClick={() => onLanguageChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
    <button type="button" className="cv-pill-button cv-coach-details-new" onClick={onStartNewConversation}>
      <RestartAltRoundedIcon aria-hidden="true" />
      New conversation
    </button>
  </div>
);

/** Desktop popover anchored under the settings button. Escape / outside click close it. */
export const CoachPopover = ({ anchorRef, onClose, children }) => {
  const panelRef = useRef(null);

  useEffect(() => {
    panelRef.current?.focus();
    const handlePointerDown = (event) => {
      const target = event.target;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={panelRef}
      id={COACH_DETAILS_ID}
      className="cv-coach-popover"
      role="dialog"
      aria-labelledby="cv-coach-details-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose(true);
        }
      }}
    >
      {children}
    </div>
  );
};

/**
 * Phone bottom sheet, same pattern as Community's FilterSheet: a native <dialog> opened with
 * showModal() (inert background, focus contained), Escape and backdrop close it.
 */
export const CoachSheet = ({ onClose, children }) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector("[aria-pressed='true']")?.focus?.();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id={COACH_DETAILS_ID}
      className="cv-coach-sheet"
      aria-labelledby="cv-coach-details-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose(true);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(true);
      }}
    >
      <div className="cv-coach-sheet-body">
        <span className="cv-coach-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </dialog>
  );
};
