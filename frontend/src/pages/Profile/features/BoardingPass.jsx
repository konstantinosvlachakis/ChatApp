import React from "react";
import { Link } from "react-router-dom";
import FlightRoundedIcon from "@mui/icons-material/FlightRounded";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import { barcodeBars, compactCount, flagUrl, passLevel, passProgress, routeCode } from "./boardingPassUtils";
import { describeLanguage } from "./profileUtils";
import "./boardingPass.css";

const Flag = ({ language }) => {
  const src = flagUrl(language);
  return src ? <img className="bp-flag" src={src} alt="" loading="lazy" decoding="async" width="20" height="14" /> : null;
};

// Travel class from how many languages someone is learning.
const travelClass = (count) => (count >= 3 ? "Polyglot" : count === 2 ? "Voyager" : "Explorer");

// The plane and dashed route share these SVG coordinates at every screen size.
const FLIGHT_PATH = "M45 239C132 58 365 19 495 107";
// MUI FlightRounded's 24-unit glyph, drawn directly to share the atlas coordinate system.
const FLIGHT_ICON_PATH = "M21 14.58c0-.36-.19-.69-.49-.89L13 9V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-7.51 4.69c-.3.19-.49.53-.49.89 0 .7.68 1.21 1.36 1L10 13.5V19l-1.8 1.35c-.13.09-.2.24-.2.4v.59c0 .33.32.57.64.48L11.5 21l2.86.82c.32.09.64-.15.64-.48v-.59c0-.16-.07-.31-.2-.4L13 19v-5.5l6.64 2.08c.68.21 1.36-.3 1.36-1";
const FlightPlane = () => (
  <g className="bp-plane-icon" transform="rotate(90) scale(1.333333) translate(-12 -12)">
    <path d={FLIGHT_ICON_PATH} />
  </g>
);

const JourneyArtwork = () => (
  <div className="bp-atlas" aria-hidden="true">
    <svg viewBox="0 0 540 320" fill="none">
      <circle className="bp-globe-halo" cx="270" cy="166" r="139" />
      <g className="bp-globe">
        <circle cx="270" cy="166" r="112" />
        <ellipse cx="270" cy="166" rx="57" ry="112" />
        <ellipse cx="270" cy="166" rx="94" ry="112" />
        <ellipse cx="270" cy="166" rx="112" ry="43" />
        <ellipse cx="270" cy="166" rx="112" ry="81" />
        <path d="M158 166h224M270 54v224" />
      </g>
      <g className="bp-continents">
        <path d="m196 94 21-10 18 7 9 17-13 14 4 17-15 8-8 22-16-5-4-24-14-12 5-20Zm31 80 24 3 13 20-8 27-17 26-10-15 3-25-14-19Z" />
        <path d="m282 89 22-5 14 12 25-3 21 18-10 18-25-1-10 17-19-5-4-19-20-10Zm-5 52 25 7 14 22-11 34-17 15-16-25-8-29Zm58 68 20-7 16 16-5 13-25-3Z" />
      </g>
      <path className="bp-orbit" d={FLIGHT_PATH} />
      <path className="bp-orbit-fine" d="M75 267C198 288 385 250 476 142" />
      <circle className="bp-orbit-point" cx="45" cy="239" r="5" />
      <circle className="bp-orbit-point" cx="495" cy="107" r="5" />
      <g className="bp-flight-motion">
        <FlightPlane />
        <animateMotion path={FLIGHT_PATH} dur="1.8s" rotate="auto" fill="freeze" />
      </g>
      <g className="bp-flight-rest" transform="translate(495 107) rotate(34.095)">
        <FlightPlane />
      </g>
    </svg>
  </div>
);

const Destination = ({ language, level, stats, interactive }) => {
  const info = describeLanguage(language);
  const meta = passLevel(level);
  const progress = interactive ? passProgress(stats?.progress) : null;
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <li className={`bp-stop is-${meta.key}`}>
      <span className="bp-node" aria-hidden="true" />
      <span className="bp-label">To</span>
      <span className="bp-code">
        {routeCode(info.name)}
        <Flag language={language} />
      </span>
      <span className="bp-city">{info.endonym || info.name}</span>
      <div className="bp-learning">
        <span className="bp-level">
          <span className="bp-seat" aria-label={`Level ${meta.seat}`}>{meta.seat}</span>
          <span className="bp-gate">{meta.gate}</span>
        </span>
        {interactive && (
          <span className="bp-progress">
            <span
              className="bp-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={`Practice progress in ${info.name}`}
            >
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="bp-caption">
              {progress ? progress.caption : stats ? "Practice coming soon" : "Loading…"}
            </span>
          </span>
        )}
      </div>
      {interactive && (
        <span className="bp-links">
          <Link to={`/practice?language=${encodeURIComponent(info.key)}`} aria-label={`Practise ${info.name}`}>
            <SchoolOutlinedIcon aria-hidden="true" />
            Practise
          </Link>
          <Link
            to={`/community?they_speak=${encodeURIComponent(info.key)}`}
            aria-label={
              stats?.partners ? `Find partners: ${stats.partners} native ${info.name} speakers` : `Find partners for ${info.name}`
            }
          >
            <GroupOutlinedIcon aria-hidden="true" />
            {stats?.partners ? `${compactCount(stats.partners)} partners` : "Partners"}
          </Link>
        </span>
      )}
    </li>
  );
};

/**
 * One ticket from the native language to the current learning focus.
 * Own profile (`interactive`): that language's progress and Practise / partners links.
 * The profile-level switcher owns selection; undefined `stats` means still loading.
 */
export const BoardingPass = ({ passenger, native, language, level, stats, learningCount = 1, interactive = false }) => {
  const origin = describeLanguage(native);
  const destination = describeLanguage(language);
  const travel = travelClass(learningCount);
  const route = `${origin.name} to ${destination.name}`;
  return (
    <article className="bp" aria-label={`Boarding pass: ${route}`}>
      <header className="bp-head">
        <span className="bp-brand">
          <FlightRoundedIcon aria-hidden="true" />
          LangVoyage · Boarding pass
        </span>
        {passenger && (
          <span className="bp-passenger">
            Passenger <strong>{passenger}</strong>
          </span>
        )}
      </header>

      <div className="bp-body">
        <div className="bp-journey">
          <JourneyArtwork key={`${origin.key}:${destination.key}`} />
          <div className="bp-origin">
            <span className="bp-node" aria-hidden="true" />
            <span className="bp-label">From</span>
            <span className="bp-code">
              <Flag language={native} />
              {routeCode(origin.name)}
            </span>
            <span className="bp-city">{origin.endonym || origin.name}</span>
            <span className="bp-native">Native</span>
            <span className="bp-origin-note">A language to share.<br />A world to discover.</span>
          </div>
          <div className="bp-voyage" aria-hidden="true">
            <span className="bp-voyage-label">Your language journey</span>
            <span className="bp-voyage-title">Words open<br />{" "}<em>worlds.</em></span>
            <span className="bp-voyage-caption">One conversation at a time</span>
          </div>
          <ol className="bp-stops" aria-label="Learning">
            <Destination language={language} level={level} stats={stats} interactive={interactive} />
          </ol>
        </div>

        <div className="bp-stub">
          <div className="bp-stub-detail">
            <span className="bp-label">Class</span>
            <span className="bp-class">{travel}</span>
          </div>
          <div className="bp-stub-detail">
            <span className="bp-label">Level</span>
            <span className="bp-stub-level">{passLevel(level).seat}</span>
          </div>
          <span className="bp-barcode" aria-hidden="true">
            {barcodeBars(`${passenger || ""}${native}${language}`, 26).map((width, index) => (
              <span key={index} style={{ width }} />
            ))}
          </span>
          <span className="bp-stub-caption">Made for connection</span>
        </div>
      </div>
    </article>
  );
};
