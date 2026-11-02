import React from "react";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { levelChangeMessage, progressSummary, progressTitle } from "./practiceUtils";

/**
 * Per-language difficulty (server `progress`): "Spanish · Everyday grammar", the CEFR range and
 * how far the learner is from the next level. XP/level in the stats strip stay the score.
 */
export const LanguageLevel = ({ progress, language }) => {
  if (!progress) return null;
  const needed = progress.needed_for_promotion;
  const minAttempts = needed?.min_attempts || 0;
  const attempts = Math.min(progress.attempts_in_bucket || 0, minAttempts);
  const percent = needed && minAttempts ? Math.round((attempts / minAttempts) * 100) : 100;
  const title = progressTitle(progress, language);
  return (
    <section className="pr-level" aria-label="Difficulty for this language">
      <SchoolRoundedIcon className="pr-level-icon" aria-hidden="true" />
      <div className="pr-level-text">
        <div className="pr-level-title">
          <strong>{title}</strong>
          {progress.cefr ? <span className="pr-level-cefr">{progress.cefr}</span> : null}
        </div>
        <p className="pr-level-summary">{progressSummary(progress)}</p>
        {needed ? (
          <div
            className="pr-bar pr-level-meter"
            role="progressbar"
            aria-label="Sentences toward the next difficulty"
            aria-valuemin={0}
            aria-valuemax={minAttempts}
            aria-valuenow={attempts}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
    </section>
  );
};

/** Celebration on "promoted", a kind note on "demoted"; dismissible. */
export const LevelChangeBanner = ({ progress, onDismiss }) => {
  const message = levelChangeMessage(progress);
  if (!message) return null;
  const Icon = message.tone === "good" ? CelebrationRoundedIcon : SpaRoundedIcon;
  return (
    <div className={`pr-level-banner is-${message.tone}`} role="status">
      <Icon className="pr-level-banner-icon" aria-hidden="true" />
      <p>
        <strong>{message.title}</strong> <span>{message.text}</span>
      </p>
      <button type="button" className="pr-level-banner-close" onClick={onDismiss} aria-label="Dismiss">
        <CloseRoundedIcon aria-hidden="true" />
      </button>
    </div>
  );
};

export default LanguageLevel;
