import React from "react";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import RecordVoiceOverRoundedIcon from "@mui/icons-material/RecordVoiceOverRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import { formatLanguageName } from "./practiceUtils";

const MODES = [
  { id: "drill", label: "Daily drill", Icon: QuizRoundedIcon },
  { id: "voice", label: "Voice repeat", Icon: RecordVoiceOverRoundedIcon },
];

const SUBTITLES = {
  drill: "Fill the gap, keep your streak warm, climb the board.",
  voice: "Listen to a sentence, then say it back out loud.",
};

const PracticeHeader = ({ language, languageOptions, onLanguageChange, mode, onModeChange, disabled }) => (
  <header className="pr-head">
    <div className="pr-head-text">
      <h1>Practice</h1>
      <p>{SUBTITLES[mode] || SUBTITLES.drill}</p>
    </div>
    <div className="pr-head-controls">
      <label className="pr-lang">
        <TranslateRoundedIcon aria-hidden="true" />
        <span className="lv-visually-hidden">Practice language</span>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={disabled}>
          {languageOptions.map((option) => (
            <option key={option} value={option}>
              {formatLanguageName(option)}
            </option>
          ))}
        </select>
      </label>
      <div className="pr-segment" role="group" aria-label="Practice mode">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`pr-segment-btn${mode === id ? " is-active" : ""}`}
            aria-pressed={mode === id}
            onClick={() => onModeChange(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  </header>
);

export default PracticeHeader;
