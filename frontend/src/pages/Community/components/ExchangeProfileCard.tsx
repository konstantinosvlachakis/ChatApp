import React, { useState } from "react";
import { Link } from "react-router-dom";
import type { PartnerMatch } from "../../../components/Cards";

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
  const learning = profile.languagesPracticing.find((language) => language.toLowerCase() === viewerLanguage?.toLowerCase()) || profile.languagesPracticing[0];
  const level = learning ? languageLevel(profile.practiceLanguageLevels, learning) : "";
  const badge = profile.match?.reciprocal ? "Perfect exchange" : profile.match?.teachesMe ? "Native speaker for you" : "Meet someone new";
  const initials = profile.username.slice(0, 2).toUpperCase();
  const relationship = profile.match?.reciprocal
    ? "Perfect exchange"
    : profile.match?.teachesMe
      ? "Native speaker for you"
      : profile.match?.learnsMine
        ? "Learning your language"
        : "Open to exchange";
  const profilePath = `/people/${encodeURIComponent(profile.username)}`;
  const profileLabel = `View ${profile.username}'s profile`;

  return (
    <article className={`exchange-card ${featured ? "exchange-card-featured" : "exchange-card-compact"}`}>
      {featured && <span className="exchange-match-label">{badge}</span>}
      <Link to={profilePath} state={{ profile }} className="exchange-portrait" aria-label={profileLabel}>
        {profile.profileImage && !imageFailed ? (
          <img src={profile.profileImage} alt="" loading={featured ? "eager" : "lazy"} decoding="async" onError={() => setImageFailed(true)} />
        ) : <span className="exchange-initials" aria-hidden="true">{initials}</span>}
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
            View profile <span aria-hidden="true">↗</span>
          </Link>
          <button
            className="people-button people-button-secondary"
            type="button"
            disabled={busy}
            onClick={() => onSayHello(profile.username)}
            aria-label={`Say hello to ${profile.username}`}
          >
            {starting ? "Opening…" : "Say hello"}
          </button>
        </div>
      </div>
    </article>
  );
}
