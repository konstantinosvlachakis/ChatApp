import React, { useId, useState } from "react";
import { Link } from "react-router-dom";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import WavingHandRoundedIcon from "@mui/icons-material/WavingHandRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import type { PartnerMatch } from "../../../components/Cards";
import { DEFAULT_AVATAR_URL } from "../../../constants/avatar";
import { avatarImage } from "../../../lib/media";
import { buildConversationStarters, buildMatchFacts } from "../utils/conversationStarters";

export interface ExchangeProfile {
  username: string;
  nativeLanguage: string;
  languagesPracticing: string[];
  practiceLanguageLevels: Record<string, string>;
  learningGoal: string;
  profileImage?: string;
  match?: PartnerMatch;
}

export const languageLabel = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not specified";

export const languageLevel = (levels: Record<string, string>, language: string) => {
  const key = Object.keys(levels).find((entry) => entry.toLowerCase() === language.toLowerCase());
  return key ? languageLabel(levels[key]) : "";
};

const FEATURED_PORTRAIT_PX = 176;
const COMPACT_PORTRAIT_PX = 64;

interface Props {
  profile: ExchangeProfile;
  featured?: boolean;
  viewerLanguage?: string;
  busy: boolean;
  starting: boolean;
  onSayHello: (username: string) => void;
}

export default function ExchangeProfileCard({
  profile,
  featured = false,
  viewerLanguage,
  busy,
  starting,
  onSayHello,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const panelId = useId();
  // Largest rendered portrait (community.css): featured 176px on desktop, compact 64px.
  const portrait = avatarImage(profile.profileImage, featured ? FEATURED_PORTRAIT_PX : COMPACT_PORTRAIT_PX);
  const learning = profile.languagesPracticing.find((language) => language.toLowerCase() === viewerLanguage?.toLowerCase()) || profile.languagesPracticing[0];
  const level = learning ? languageLevel(profile.practiceLanguageLevels, learning) : "";
  const badge = profile.match?.reciprocal ? "Perfect exchange" : profile.match?.teachesMe ? "Native speaker for you" : "Meet someone new";
  const relationship = profile.match?.reciprocal
    ? "Perfect exchange"
    : profile.match?.teachesMe
      ? "Native speaker for you"
      : profile.match?.learnsMine
        ? "Learning your language"
        : "Open to exchange";
  const profilePath = `/people/${encodeURIComponent(profile.username)}`;
  const profileLabel = `View ${profile.username}'s profile`;
  const starters = featured ? buildConversationStarters(profile, viewerLanguage) : [];
  const facts = featured ? buildMatchFacts(profile, viewerLanguage) : [];

  return (
    <article className={`exchange-card ${featured ? "exchange-card-featured" : "exchange-card-compact"}`}>
      {featured && <span className="exchange-match-label">{badge}</span>}
      <Link to={profilePath} state={{ profile }} className="exchange-portrait" aria-label={profileLabel}>
        <img
          src={portrait && !imageFailed ? portrait : DEFAULT_AVATAR_URL}
          alt=""
          loading={featured ? "eager" : "lazy"}
          decoding="async"
          onError={() => {
            if (portrait && !imageFailed) setImageFailed(true);
          }}
        />
      </Link>
      <div className="exchange-card-content">
        <div className="exchange-card-title">
          <h2>{profile.username}</h2>
          {featured && <span className="exchange-native-badge">{languageLabel(profile.nativeLanguage)} native</span>}
        </div>
        {!featured && (
          <span className={`exchange-inline-match ${profile.match?.reciprocal ? "is-reciprocal" : ""}`}>
            <span aria-hidden="true">{profile.match?.reciprocal ? "↔" : "•"}</span>
            {relationship}
          </span>
        )}
        <div className="exchange-languages">
          <p className="exchange-native">
            <span>{featured ? (profile.match?.teachesMe ? "You can practice" : "Speaks") : "Native language"}</span>
            <strong>{languageLabel(profile.nativeLanguage)}</strong>
          </p>
          {learning && (
            <p className="exchange-learning">
              <span>{profile.match?.learnsMine && viewerLanguage && learning.toLowerCase() === viewerLanguage.toLowerCase() ? (featured ? "They practice your" : "Learning your language") : "Practicing"}</span>
              <strong>{languageLabel(learning)}{level && <span className="exchange-level">{featured ? " · " : ""}{level}</span>}</strong>
            </p>
          )}
        </div>
        <p className="exchange-bio">{profile.learningGoal || (profile.match?.reciprocal ? "You speak the language they’re learning. They speak one of yours. A great place to start." : "Get to know each other through a new language and everyday conversation.")}</p>
        <div className="exchange-card-actions">
          <Link
            className="people-button people-button-primary"
            to={profilePath}
            state={{ profile }}
            aria-label={profileLabel}
          >
            <PersonOutlineRoundedIcon className="people-button-icon" aria-hidden="true" />
            View profile
          </Link>
          <button
            className="people-button people-button-secondary"
            type="button"
            disabled={busy}
            onClick={() => onSayHello(profile.username)}
            aria-label={`Say hello to ${profile.username}`}
          >
            <WavingHandRoundedIcon className="people-button-icon" aria-hidden="true" />
            {starting ? "Opening…" : "Say hello"}
          </button>
        </div>
      </div>
      {featured && (
        // Wide screens only (community.css, >= 1100px): fills the card's right side.
        <aside className="exchange-panel" aria-labelledby={`${panelId}-why`}>
          {facts.length > 0 && (
            <>
              <h3 id={`${panelId}-why`}>Why you'll click</h3>
              <dl className="exchange-panel-facts">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <h3 id={facts.length ? `${panelId}-try` : `${panelId}-why`}>Try opening with</h3>
          <p id={`${panelId}-hint`} className="exchange-panel-hint">Tap one to start a chat with {profile.username}.</p>
          <ul className="exchange-starters">
            {starters.map((starter) => (
              <li key={starter}>
                <button type="button" disabled={busy} aria-describedby={`${panelId}-hint`} onClick={() => onSayHello(profile.username)}>
                  <ChatBubbleOutlineRoundedIcon aria-hidden="true" />
                  <span>{starter}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
