import React from "react";
import CoachAvatar from "../CoachAvatar";
import { titleCase } from "../../constants/languages";
import { FlagPair, ICON_PATHS } from "./PublicIcons";

// Simple decorative illustrations for the public pages, built from CSS and inline SVG
// (no image assets). Everything here is aria-hidden: the text next to it says the same.
// Only the lazy pages (/how-it-works, /exchange/<pair>) import this module.

const WAVE_HEIGHTS = [6, 12, 18, 10, 16, 8, 14, 20, 9, 13, 7, 11];

const SwapArrows = () => (
  <svg className="lp-ill-swap" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={ICON_PATHS.match} />
  </svg>
);

/** `kind`: languages | match | chat | timer | correct | lumi | practice | safety. */
const Illustration = ({ kind, languages = ["english", "spanish"] }) => {
  const [first, second] = languages.map(titleCase);
  let body = null;
  let warm = false;

  switch (kind) {
    case "languages":
      body = (
        <>
          <div className="lp-ill-row">
            <FlagPair languages={languages} />
          </div>
          <p className="lp-ill-caption">I speak {first} · I'm learning {second}</p>
        </>
      );
      break;
    case "match":
      warm = true;
      body = (
        <>
          <div className="lp-ill-row">
            <span className="lp-ill-portrait">A</span>
            <SwapArrows />
            <span className="lp-ill-portrait lp-ill-portrait-alt">M</span>
          </div>
          <p className="lp-ill-caption">
            Speaks {first}, learning {second} ⇄ speaks {second}, learning {first}
          </p>
        </>
      );
      break;
    case "chat":
      body = (
        <>
          <span className="lp-ill-bubble">How was your weekend?</span>
          <span className="lp-ill-bubble lp-ill-bubble-out">
            <span className="lp-ill-wave">
              {WAVE_HEIGHTS.map((height, index) => (
                <i key={index} style={{ height }} />
              ))}
            </span>
          </span>
          <span className="lp-ill-bubble">Great voice note! One small tip…</span>
        </>
      );
      break;
    case "timer":
      warm = true;
      body = (
        <div className="lp-ill-timer">
          <div className="lp-ill-timer-top">
            <span>Guided exchange</span>
            <span>20 min</span>
          </div>
          <div className="lp-ill-track">
            <span />
            <span />
          </div>
          <div className="lp-ill-switch">
            <span>{first}</span>
            <span>Switch at 10:00</span>
            <span>{second}</span>
          </div>
        </div>
      );
      break;
    case "correct":
      body = (
        <div className="lp-correction" style={{ marginTop: 0 }}>
          <span className="lp-correction-label">Correction</span>
          <del>I am agree with you.</del>
          <ins>I agree with you.</ins>
        </div>
      );
      break;
    case "lumi":
      warm = true;
      body = (
        <>
          <div className="lp-ill-row">
            <CoachAvatar size={64} hideBadge />
          </div>
          <div className="lp-ill-chips">
            {["Casual chat", "Correct me", "Role-play", "Quiz me", "Vocabulary"].map((mode) => (
              <span key={mode} className="lp-ill-chip">
                {mode}
              </span>
            ))}
          </div>
        </>
      );
      break;
    case "practice":
      body = (
        <div className="lp-ill-chips">
          {["Daily drill", "Voice repeat", "Phrasebook review"].map((item) => (
            <span key={item} className="lp-ill-chip">
              {item}
            </span>
          ))}
        </div>
      );
      break;
    case "safety":
      warm = true;
      body = (
        <>
          <svg className="lp-ill-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={ICON_PATHS.safety} />
            <path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" />
          </svg>
          <div className="lp-ill-chips">
            <span className="lp-ill-chip">Block</span>
            <span className="lp-ill-chip">Report</span>
          </div>
        </>
      );
      break;
    default:
      return null;
  }

  return (
    <div className={`lp-illustration${warm ? " lp-illustration-warm" : ""}`} aria-hidden="true">
      {body}
    </div>
  );
};

export default Illustration;
