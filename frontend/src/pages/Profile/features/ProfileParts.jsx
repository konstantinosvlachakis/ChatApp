import React from "react";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { DEFAULT_AVATAR_URL, handleAvatarError } from "../../../constants/avatar";
import { LEVELS, describeLanguage, learningLanguages, levelFor } from "./profileUtils";
import "./profile.css";

export const ProfileCard = ({ icon: Icon, title, className = "", children, ...rest }) => (
  <section className={`pf-card ${className}`} {...rest}>
    {title && (
      <h2 className="pf-card-title">
        {Icon && <Icon aria-hidden="true" />}
        {title}
      </h2>
    )}
    {children}
  </section>
);

// Dotted "voyage route" from the native language to the ones being learned. Decorative only.
const HeroBanner = ({ fromLabel, toLabel }) => (
  // The route stretches with the banner (any width); the pins are HTML so they stay round and in view.
  <div className="pf-banner" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <path className="pf-banner-route" d="M6 72 C 22 10, 38 100, 52 50 S 80 12, 94 48" />
    </svg>
    <span className="pf-banner-pin is-from">{fromLabel && <span>{fromLabel}</span>}</span>
    <span className="pf-banner-pin is-to">{toLabel && <span>{toLabel}</span>}</span>
  </div>
);

export const ProfileHero = ({
  profile,
  avatarUrl,
  ringColor,
  isOnline = false,
  statusItems = [],
  badge = null,
  onOpenAvatar,
  avatarLabel,
  onAvatarError,
  children,
}) => {
  const learning = learningLanguages(profile).map((lang) => describeLanguage(lang).name);
  const native = profile?.native_language ? describeLanguage(profile.native_language).name : "";
  const avatar = (
    <img
      src={avatarUrl || DEFAULT_AVATAR_URL}
      alt={onOpenAvatar ? "" : `${profile?.username || "Profile"} photo`}
      onError={(event) => {
        handleAvatarError(event);
        onAvatarError?.();
      }}
    />
  );

  return (
    <header className="pf-hero">
      <HeroBanner fromLabel={native} toLabel={learning.join(" · ")} />
      <div className="pf-hero-body">
        <div className="pf-avatar" style={{ background: ringColor }}>
          <div className="pf-avatar-inner">
            {onOpenAvatar ? (
              <button type="button" className="lv-photo-thumb" onClick={onOpenAvatar} aria-label={avatarLabel}>
                {avatar}
              </button>
            ) : (
              avatar
            )}
          </div>
          {isOnline && <span className="pf-avatar-online" role="img" aria-label="Online" />}
        </div>
        <h1 className="pf-name">
          {profile?.username}
          {profile?.age ? `, ${profile.age}` : ""}
        </h1>
        {statusItems.length > 0 && (
          <p className="pf-status">
            {statusItems.map((item) => (
              <span key={item.key}>
                {item.dot && <span className="pf-status-dot" aria-hidden="true" />}
                {item.icon === "place" && <PlaceOutlinedIcon aria-hidden="true" />}
                {item.icon === "time" && <ScheduleRoundedIcon aria-hidden="true" />}
                {item.text}
              </span>
            ))}
          </p>
        )}
        {badge}
        {native && learning.length > 0 && (
          <p className="pf-exchange-pill">
            {native} <span aria-label="exchanging with">⇄</span> {learning.join(", ")}
          </p>
        )}
        {children && <div className="pf-hero-actions">{children}</div>}
      </div>
    </header>
  );
};

const LevelBars = ({ level }) => {
  const step = LEVELS.indexOf(level) + 1;
  if (!step) return null;
  return (
    <span className="pf-level-bars" role="img" aria-label={`Level ${step} of ${LEVELS.length}`}>
      {LEVELS.map((name, index) => (
        <span key={name} className={index < step ? "is-on" : ""} />
      ))}
    </span>
  );
};

const LanguageRow = ({ language, level, tone }) => {
  const info = describeLanguage(language);
  const detail = [level ? level.charAt(0).toUpperCase() + level.slice(1) : "", info.endonym]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="pf-lang">
      <span className={`pf-lang-code is-${tone}`} aria-hidden="true">
        {info.code}
      </span>
      <span className="pf-lang-text">
        <strong>{info.name}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <LevelBars level={level} />
    </li>
  );
};

export const LanguagesCard = ({ profile, emptyText = "Not added yet." }) => {
  const learning = learningLanguages(profile);
  return (
    <ProfileCard icon={PublicRoundedIcon} title="Languages">
      <p className="pf-eyebrow">Native</p>
      {profile?.native_language ? (
        <ul className="pf-lang-list">
          <LanguageRow language={profile.native_language} tone="native" />
        </ul>
      ) : (
        <p className="pf-muted">{emptyText}</p>
      )}
      <div className="pf-divider" />
      <p className="pf-eyebrow">Learning</p>
      {learning.length ? (
        <ul className="pf-lang-list">
          {learning.map((lang) => (
            <LanguageRow
              key={lang}
              language={lang}
              level={levelFor(profile.practice_language_levels, lang)}
              tone="learning"
            />
          ))}
        </ul>
      ) : (
        <p className="pf-muted">{emptyText}</p>
      )}
    </ProfileCard>
  );
};

export const AboutCard = ({ profile, emptyBio, emptyGoal }) => (
  <ProfileCard icon={PersonOutlineRoundedIcon} title={`About ${profile?.username || ""}`.trim()}>
    {profile?.bio?.trim() ? <p className="pf-body">{profile.bio}</p> : <p className="pf-muted">{emptyBio}</p>}
    <div className="pf-goal">
      <p className="pf-eyebrow">
        <FlagOutlinedIcon aria-hidden="true" />
        Learning goal
      </p>
      {profile?.learning_goal?.trim() ? (
        <p className="pf-body">{profile.learning_goal}</p>
      ) : (
        <p className="pf-muted">{emptyGoal}</p>
      )}
    </div>
  </ProfileCard>
);

/**
 * Three photo slots. Filled slots open the shared PhotoViewer; on your own profile, empty slots
 * are upload buttons and filled ones get a "Change" control (renderChange).
 */
export const PhotosCard = ({ slots, galleryIndex, onOpen, viewLabel, onPhotoError, renderAdd, renderChange, hint }) => (
  <ProfileCard icon={PhotoLibraryOutlinedIcon} title="Photos">
    <ul className="pf-photos">
      {slots.map((slot) => {
        const index = galleryIndex(slot.key);
        return (
          <li key={slot.key} className="pf-photo">
            {index >= 0 ? (
              <>
                <button
                  type="button"
                  className="lv-photo-thumb"
                  onClick={(event) => onOpen(index, event)}
                  aria-label={viewLabel(slot.key)}
                >
                  <img src={slot.image} loading="lazy" decoding="async" alt="" onError={() => onPhotoError?.(slot.key)} />
                </button>
                {renderChange?.(slot)}
              </>
            ) : renderAdd ? (
              renderAdd(slot)
            ) : (
              <span className="pf-photo-empty">No photo</span>
            )}
            {slot.uploading && (
              <span className="pf-photo-busy" role="status">
                Uploading…
              </span>
            )}
          </li>
        );
      })}
    </ul>
    {hint && <p className="pf-muted pf-small">{hint}</p>}
  </ProfileCard>
);

export const AddPhotoIcon = AddRoundedIcon;
