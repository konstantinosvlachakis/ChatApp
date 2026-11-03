import React, { useState } from "react";
import { Link } from "react-router-dom";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import { DEFAULT_AVATAR_URL } from "../../../constants/avatar";
import { cloudinaryImage } from "../../../lib/media";
import { languageTheyLearnFromViewer } from "../utils/conversationStarters";
import { ExchangeProfile, languageLabel, languageLevel } from "./ExchangeProfileCard";

// Largest rendered photo (community.css `.photo-card-media`, square); Cloudinary crops to it.
export const PHOTO_CARD_SIZE = 280;

/** The server's default avatar path means "no photo": show the warm tinted fallback instead. */
export const hasOwnPhoto = (url?: string) => Boolean(url) && !/\/MainAfter\.[a-z0-9]+(\?.*)?$/i.test(url || "");

/** Photo chip: "Active today" / "New member" when they apply, else their level in your language. */
export const photoCardChip = (profile: ExchangeProfile, viewerLanguage?: string) => {
  if (profile.activeLabel === "Active today") return "Active today";
  if (profile.isNew) return "New member";
  const mine = languageTheyLearnFromViewer(profile, viewerLanguage);
  const level = mine.language ? languageLevel(profile.practiceLanguageLevels, mine.language) : "";
  return level ? `${level} ${languageLabel(mine.language)}` : "";
};

interface Props {
  profile: ExchangeProfile;
  viewerLanguage?: string;
  busy: boolean;
  starting: boolean;
  onSayHello: (username: string, starter?: string) => void;
  imageLoading?: "eager" | "lazy";
}

/**
 * Perfect exchange card: square photo with a coral "Perfect" tag and one chip, then (mockup H's
 * footer) the name, a two-line goal, and Speaks | Learning beside the profile button and Say hello.
 */
export default function PhotoExchangeCard({ profile, viewerLanguage, busy, starting, onSayHello, imageLoading = "lazy" }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const ownPhoto = hasOwnPhoto(profile.profileImage) && !imageFailed;
  const photo = ownPhoto ? cloudinaryImage(profile.profileImage, { width: PHOTO_CARD_SIZE, crop: "fill", sharpen: true }) : "";
  const mine = languageTheyLearnFromViewer(profile, viewerLanguage);
  const learning = mine.language || profile.languagesPracticing[0] || "";
  const speaks = profile.match?.theyTeach || profile.nativeLanguage;
  const chip = photoCardChip(profile, viewerLanguage);
  const profilePath = `/people/${encodeURIComponent(profile.username)}`;
  const profileLabel = `View ${profile.username}'s profile`;
  const goal = profile.learningGoal.trim() || "You speak the language they’re learning. They speak one of yours.";

  return (
    <article className="photo-card">
      <Link to={profilePath} state={{ profile }} className={`photo-card-media ${ownPhoto ? "" : "photo-card-media-fallback"}`} tabIndex={-1} aria-hidden="true">
        {ownPhoto ? (
          <img src={photo} alt="" loading={imageLoading} decoding="async" onError={() => setImageFailed(true)} />
        ) : (
          <img className="photo-card-default-avatar" src={DEFAULT_AVATAR_URL} alt="" loading={imageLoading} decoding="async" />
        )}
      </Link>
      <span className="photo-card-tag">
        <SwapHorizRoundedIcon aria-hidden="true" />
        <span aria-hidden="true">Perfect</span>
        <span className="lv-visually-hidden">Perfect exchange</span>
      </span>
      {chip && <span className="photo-card-chip">{chip}</span>}
      <div className="photo-card-body">
        <h3 className="photo-card-name">
          <Link to={profilePath} state={{ profile }}>{profile.username}</Link>
        </h3>
        <p className="photo-card-goal">{goal}</p>
      </div>
      <div className="photo-card-footer">
        <dl className="photo-card-stats">
          <div>
            <dt>Speaks</dt>
            <dd>{languageLabel(speaks)}</dd>
          </div>
          {learning && (
            <div>
              <dt>Learning</dt>
              <dd>{languageLabel(learning)}</dd>
            </div>
          )}
        </dl>
        <div className="photo-card-actions">
          <Link className="people-icon-button" to={profilePath} state={{ profile }} aria-label={profileLabel} title="View profile">
            <PersonOutlineRoundedIcon aria-hidden="true" />
          </Link>
          <button type="button" className="people-button people-button-primary photo-card-hello" disabled={busy} onClick={() => onSayHello(profile.username)} aria-label={`Say hello to ${profile.username}`}>
            <ChatBubbleOutlineRoundedIcon className="people-button-icon" aria-hidden="true" />
            {starting ? "Opening…" : "Say hello"}
          </button>
        </div>
      </div>
    </article>
  );
}
