import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { BoardingPass } from "./BoardingPass";
import { flagUrl } from "./boardingPassUtils";
import { describeLanguage, LANGUAGE_KEYS, normalizeLanguage } from "./profileUtils";

const initialFocus = (storageKey, languages) => {
  try {
    const saved = storageKey ? normalizeLanguage(window.localStorage.getItem(storageKey)) : "";
    if (languages.includes(saved)) return saved;
  } catch {
    // A blocked preference store must not prevent practising or switching languages.
  }
  return languages[0] || "";
};

const LanguageJourney = ({ profileKey, passenger, native, languages, levels, stats = {}, interactive = false }) => {
  const storageKey = interactive && profileKey != null ? `lv:boarding-focus:v1:${profileKey}` : null;
  const [selected, setSelected] = useState(() => initialFocus(storageKey, languages));
  const language = languages.includes(selected) ? selected : languages[0];
  const canAddLanguage = interactive && LANGUAGE_KEYS.some((key) => key !== normalizeLanguage(native) && !languages.includes(key));

  useEffect(() => {
    if (!language) return;
    // A removed language falls back immediately and cannot reappear as a stale focus.
    setSelected(language);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, language);
    } catch {
      // Selection still works when browser storage is unavailable.
    }
  }, [language, storageKey]);

  if (!language) return null;

  return (
    <div className="bp-focus">
      <div className="bp-focus-controls">
        <span className="bp-focus-title">{interactive ? "Current focus" : "Learning journeys"}</span>
        <div className="bp-focus-options" role="group" aria-label="Boarding pass language">
          {languages.map((key) => {
            const info = describeLanguage(key);
            const flag = flagUrl(key);
            return (
              <button
                key={key}
                type="button"
                className="bp-focus-language"
                aria-label={interactive ? `Focus on ${info.name}` : `View ${info.name} journey`}
                aria-pressed={language === key}
                onClick={() => setSelected(key)}
              >
                {flag && <img src={flag} alt="" width="20" height="14" decoding="async" />}
                {info.name}
              </button>
            );
          })}
          {canAddLanguage && (
            <Link className="bp-focus-add" to="/profile/edit#edit-languages">
              <AddRoundedIcon aria-hidden="true" />
              Add language
            </Link>
          )}
        </div>
      </div>
      <BoardingPass
        passenger={passenger}
        native={native}
        language={language}
        level={levels?.[language]}
        stats={stats[language]}
        learningCount={languages.length}
        interactive={interactive}
      />
    </div>
  );
};

// Reset selection before rendering a different account or public profile.
export const ProfileBoardingPass = (props) => (
  <LanguageJourney key={`${props.interactive ? "own" : "public"}:${props.profileKey ?? props.passenger}`} {...props} />
);
