import React, { useState } from "react";
import { Link } from "react-router-dom";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import type { PartnerMatch } from "../../../components/Cards";
import { DEFAULT_AVATAR_URL } from "../../../constants/avatar";
import { avatarImage } from "../../../lib/media";
import { languageTheyLearnFromViewer } from "../utils/conversationStarters";

export interface ExchangeProfile {
  username: string;
  nativeLanguage: string;
  languagesPracticing: string[];
  practiceLanguageLevels: Record<string, string>;
  learningGoal: string;
  profileImage?: string;
  match?: PartnerMatch;
  /** City only (server `city`), never the full location. */
  city?: string;
  /** Coarse activity (server `active_label`): "Active today" / "Active this week". */
  activeLabel?: string;
  isNew?: boolean;
}

export const languageLabel = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not specified";

export const languageLevel = (levels: Record<string, string>, language: string) => {
  const key = Object.keys(levels).find((entry) => entry.toLowerCase() === language.toLowerCase());
  return key ? languageLabel(levels[key]) : "";
};

/** Tag at the top of a plain card: why this person is in your feed. */
export const relationshipTag = (profile: ExchangeProfile, viewerLanguage?: string) => {
  const match = profile.match;
  if (match?.reciprocal) return "Perfect exchange";
  if (match?.learnsMine) {
    const mine = languageTheyLearnFromViewer(profile, viewerLanguage);
    return mine.language ? `Learning ${languageLabel(mine.language)}` : "Learning your language";
  }
  if (match?.teachesMe) return `Native ${languageLabel(match.theyTeach || profile.nativeLanguage)} speaker`;
  return "Open to exchange";
};

/** Chips: the languages they practise (with level), then Active today / New member. */
export const profileChips = (profile: ExchangeProfile) => {
  const languages = profile.languagesPracticing.slice(0, 3).map((language) => {
    const level = languageLevel(profile.practiceLanguageLevels, language);
    return level ? `${languageLabel(language)} · ${level}` : languageLabel(language);
  });
  const status = [profile.activeLabel === "Active today" ? "Active today" : "", profile.isNew ? "New member" : ""].filter(Boolean);
  return [...languages, ...status];
};

const PORTRAIT_PX = 76;

interface Props {
  profile: ExchangeProfile;
  viewerLanguage?: string;
  busy: boolean;
  starting: boolean;
  onSayHello: (username: string, starter?: string) => void;
}

/**
 * "More people to meet" card: portrait on the left with Profile and Say hello stacked at the
 * bottom (level with the goal); tag, name, native language and city, practised-language chips
 * and the goal on the right.
 */
export default function ExchangeProfileCard({ profile, viewerLanguage, busy, starting, onSayHello }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const portrait = avatarImage(profile.profileImage, PORTRAIT_PX);
  const profilePath = `/people/${encodeURIComponent(profile.username)}`;
  const tag = relationshipTag(profile, viewerLanguage);
  const chips = profileChips(profile);
  const goal = profile.learningGoal.trim();

  return (
    <article className="exchange-card">
      <div className="exchange-card-side">
        <Link to={profilePath} state={{ profile }} className="exchange-portrait" tabIndex={-1} aria-hidden="true">
          <img
            src={portrait && !imageFailed ? portrait : DEFAULT_AVATAR_URL}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => {
              if (portrait && !imageFailed) setImageFailed(true);
            }}
          />
        </Link>
        <div className="exchange-card-actions">
          <Link to={profilePath} state={{ profile }} className="people-button people-button-secondary exchange-card-button" aria-label={`View ${profile.username}'s profile`}>
            <PersonOutlineRoundedIcon className="people-button-icon" aria-hidden="true" />
            Profile
          </Link>
          <button
            className="people-button people-button-primary exchange-card-button"
            type="button"
            disabled={busy}
            onClick={() => onSayHello(profile.username)}
            aria-label={`Say hello to ${profile.username}`}
          >
            <ChatBubbleOutlineRoundedIcon className="people-button-icon" aria-hidden="true" />
            {starting ? "Opening…" : "Say hello"}
          </button>
        </div>
      </div>
      <div className="exchange-card-main">
        <span className={`exchange-tag${profile.match?.learnsMine ? " is-learns" : ""}`}>{tag}</span>
        <h3 className="exchange-card-name">{profile.username}</h3>
        <p className="exchange-card-facts">
          <span><RecordVoiceOverOutlinedIcon aria-hidden="true" />{languageLabel(profile.nativeLanguage)} native</span>
          {profile.city && <span><PlaceOutlinedIcon aria-hidden="true" />{profile.city}</span>}
        </p>
        {chips.length > 0 && (
          <ul className="exchange-chips" aria-label="Practising">
            {chips.map((chip) => <li key={chip}>{chip}</li>)}
          </ul>
        )}
        {goal && <p className="exchange-card-goal"><span>{goal}</span></p>}
      </div>
    </article>
  );
}
