import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { DEFAULT_AVATAR_URL, handleAvatarError } from "../../constants/avatar";
import { useUser } from "../../context/UserContext";
import { getUserLocation } from "./utils/getUserLocation";
import api, { getErrorMessage } from "../../lib/api";
import { showToast, toast, toastApiError } from "../../components/Toast";
import {
  LANGUAGE_KEYS,
  LEVELS,
  describeLanguage,
  levelFor,
  normalizeLanguage,
  profileStrength,
  resolveMediaUrl,
  titleCase,
} from "./features/profileUtils";
import "./features/profile.css";
import "./features/editProfile.css";

const AVATAR_RING_OPTIONS = [
  { value: "#1b7f79", label: "Teal" },
  { value: "#ecb1d0", label: "Blush" },
  { value: "#d7b054", label: "Gold" },
  { value: "#a499e4", label: "Lavender" },
  { value: "#6b7a90", label: "Slate" },
];

// Quick starts for the learning goal; each appends a sentence.
const GOAL_SUGGESTIONS = [
  { label: "Travel", text: "Get by confidently when I travel." },
  { label: "Work", text: "Use the language at work." },
  { label: "Exams", text: "Pass my language exam." },
  { label: "Friends and family", text: "Talk with friends and family." },
  { label: "Moving abroad", text: "Settle in after moving abroad." },
];

const SECTIONS = [
  { id: "edit-about", label: "About you" },
  { id: "edit-languages", label: "Languages" },
  { id: "edit-details", label: "Personal details" },
  { id: "edit-appearance", label: "Avatar accent" },
];

const TEXT_LIMIT = 2000;

const isValidHexColor = (value = "") => /^#[0-9a-fA-F]{6}$/.test(String(value).trim());

const ageFrom = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
};

const formFromUser = (user) => {
  const practicing = (user?.languages_practicing || []).map(normalizeLanguage).filter(Boolean);
  return {
    username: user?.username || "",
    email: user?.email || "",
    date_of_birth: user?.date_of_birth || "",
    native_language: normalizeLanguage(user?.native_language || "english"),
    base_translate_language: normalizeLanguage(user?.base_translate_language || user?.native_language || "english"),
    location: user?.location || "",
    languages_practicing: practicing,
    levels: Object.fromEntries(practicing.map((lang) => [lang, levelFor(user?.practice_language_levels, lang)])),
    bio: user?.bio || "",
    learning_goal: user?.learning_goal || "",
    avatar_ring_color: user?.avatar_ring_color || "#1b7f79",
  };
};

const FIELD_KEYS = [
  "username",
  "email",
  "date_of_birth",
  "native_language",
  "base_translate_language",
  "location",
  "languages_practicing",
  "levels",
  "bio",
  "learning_goal",
  "avatar_ring_color",
];

const countChanges = (form, initial) =>
  FIELD_KEYS.filter((key) => JSON.stringify(form[key]) !== JSON.stringify(initial[key])).length;

const Visibility = ({ kind, children }) => (
  <span className={`pe-tag ${kind === "private" ? "is-private" : ""}`}>{children}</span>
);

const LevelPicker = ({ language, value, onChange }) => {
  const name = describeLanguage(language).name;
  return (
    <fieldset className="pe-seg">
      <legend className="sr-only">{name} level</legend>
      {LEVELS.map((level) => (
        <label key={level} className={value === level ? "is-on" : ""}>
          <input
            type="radio"
            name={`level-${language}`}
            value={level}
            checked={value === level}
            onChange={() => onChange(level)}
            className="sr-only"
          />
          {titleCase(level)}
        </label>
      ))}
    </fieldset>
  );
};

const EditProfilePage = () => {
  const { user, refreshUserProfile } = useUser();
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [error, setError] = useState("");
  const initial = useMemo(() => formFromUser(user), [user]);
  const [form, setForm] = useState(initial);

  // Re-hydrate when the user loads or after a save refreshes it.
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const changes = countChanges(form, initial);
  const ringValid = isValidHexColor(form.avatar_ring_color);
  const usernameValid = Boolean(form.username.trim());
  const canSave = changes > 0 && ringValid && usernameValid && !saving;

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addLanguage = (language) => {
    setForm((prev) =>
      prev.languages_practicing.includes(language)
        ? prev
        : {
            ...prev,
            languages_practicing: [...prev.languages_practicing, language],
            levels: { ...prev.levels, [language]: prev.levels[language] || "" },
          }
    );
  };

  const removeLanguage = (language) => {
    setForm((prev) => {
      const { [language]: _removed, ...levels } = prev.levels;
      return {
        ...prev,
        languages_practicing: prev.languages_practicing.filter((entry) => entry !== language),
        levels,
      };
    });
  };

  const setLevel = (language, level) => {
    setForm((prev) => ({ ...prev, levels: { ...prev.levels, [language]: level } }));
  };

  const addGoalSuggestion = (text) => {
    setForm((prev) => {
      const current = prev.learning_goal.trim();
      if (current.includes(text)) return prev;
      const joined = current ? `${current.replace(/[.\s]+$/, "")}. ${text}` : text;
      return { ...prev, learning_goal: joined.slice(0, TEXT_LIMIT) };
    });
  };

  const detectLocation = async () => {
    try {
      setDetectingLocation(true);
      const { city, country } = await getUserLocation();
      updateField("location", [city, country].filter(Boolean).join(", "));
      setError("");
    } catch (err) {
      toast.error(String(err?.message || err || "Unable to detect location."));
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSave = async (event) => {
    event?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    // The API stores language labels title-cased; level keys must match those labels exactly.
    const practicing = form.languages_practicing.map(titleCase);
    const levels = Object.fromEntries(
      form.languages_practicing
        .filter((lang) => LEVELS.includes(form.levels[lang]))
        .map((lang) => [titleCase(lang), form.levels[lang]])
    );
    try {
      await api.patch("/api/profile/edit/", {
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        date_of_birth: form.date_of_birth || null,
        native_language: normalizeLanguage(form.native_language),
        base_translate_language: normalizeLanguage(form.base_translate_language),
        location: form.location.trim(),
        languages_practicing: practicing,
        practice_language_levels: levels,
        bio: form.bio.trim(),
        learning_goal: form.learning_goal.trim(),
        avatar_ring_color: form.avatar_ring_color.toLowerCase(),
      });
      await refreshUserProfile();
      showToast("Your profile changes were saved.", { variant: "success", placement: "top" });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save profile."));
      toastApiError(err, "Couldn't save your profile");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="pf-state">Loading profile editor…</div>;
  }

  const age = ageFrom(form.date_of_birth);
  const ringColor = ringValid ? form.avatar_ring_color : "#1b7f79";
  const nativeName = describeLanguage(form.native_language).name;
  const learningNames = form.languages_practicing.map((lang) => describeLanguage(lang).name);
  const strength = profileStrength({
    ...user,
    bio: form.bio,
    learning_goal: form.learning_goal,
    languages_practicing: form.languages_practicing,
    practice_language_levels: form.levels,
  });
  const languagesToAdd = LANGUAGE_KEYS.filter(
    (lang) => lang !== form.native_language && !form.languages_practicing.includes(lang)
  );

  const statusText = error
    ? error
    : changes
      ? `${changes} unsaved ${changes === 1 ? "change" : "changes"}`
      : "No unsaved changes";
  // Rendered in the header and again after the last section, so saving never needs a scroll.
  const saveActions = (
    <div className="pe-actions">
      <span className={`pe-status ${changes ? "is-dirty" : ""} ${error ? "is-error" : ""}`}>{statusText}</span>
      <div className="pe-actions-buttons">
        <button type="button" className="pf-btn" onClick={() => setForm(initial)} disabled={!changes || saving}>
          Discard
        </button>
        <button type="submit" className="pf-btn is-primary" disabled={!canSave}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );

  return (
    <form className="pf-page pe-page" onSubmit={handleSave} noValidate>
      <div className="pe-head">
        <Link to="/profile" className="pf-link pe-back">
          <ArrowBackRoundedIcon aria-hidden="true" />
          Back to profile
        </Link>
        <div className="pe-head-row">
          <div className="pe-head-text">
            <h1>Edit profile</h1>
            <p>The preview updates as you type. Nothing changes for others until you save.</p>
          </div>
          {saveActions}
        </div>
      </div>

      <div className="pe-layout">
        <aside className="pe-aside">
          <section className="pf-card pe-preview" aria-label="Live preview">
            <div className="pe-preview-body">
              <span className="pf-eyebrow">Preview</span>
              <div className="pe-preview-avatar" style={{ background: ringColor }}>
                <img
                  src={resolveMediaUrl(user.profile_image_url) || DEFAULT_AVATAR_URL}
                  alt=""
                  onError={handleAvatarError}
                />
              </div>
              <strong className="pe-preview-name">
                {form.username.trim() || "Your name"}
                {age != null ? `, ${age}` : ""}
              </strong>
              {form.location.trim() && <span className="pe-preview-meta">{form.location.trim()}</span>}
              {learningNames.length > 0 && (
                <span className="pf-exchange-pill">
                  {nativeName} <span aria-label="exchanging with">⇄</span> {learningNames.join(", ")}
                </span>
              )}
              {form.bio.trim() && <p className="pe-preview-bio">{form.bio.trim()}</p>}
            </div>
          </section>

          <section className="pf-card pe-strength" aria-label="Profile strength">
            <div className="pe-strength-head">
              <strong>Profile strength</strong>
              <strong>{strength.percent}%</strong>
            </div>
            <div
              className="pf-meter"
              role="progressbar"
              aria-label="Profile strength"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={strength.percent}
            >
              <span style={{ width: `${strength.percent}%` }} />
            </div>
            <ul className="pe-checklist">
              {strength.steps.map((step) => (
                <li key={step.key} className={step.done ? "is-done" : ""}>
                  {step.done ? (
                    <CheckRoundedIcon aria-hidden="true" />
                  ) : (
                    <span className="pe-check-empty" aria-hidden="true" />
                  )}
                  {step.key === "photo" || step.key === "photos" ? (
                    step.done ? (
                      <span>{step.label}</span>
                    ) : (
                      <Link to="/profile">{step.label} (on your profile)</Link>
                    )
                  ) : (
                    <span>{step.label}</span>
                  )}
                  {step.done && <span className="sr-only"> (done)</span>}
                </li>
              ))}
            </ul>
          </section>

          <nav className="pf-card pe-nav" aria-label="Sections">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="pe-main">
          <section className="pf-card pe-section" id="edit-about" aria-labelledby="edit-about-title">
            <div className="pe-section-head">
              <h2 id="edit-about-title">About you</h2>
              <p>This is what partners read before saying hello.</p>
            </div>
            <div className="pe-field">
              <div className="pe-field-top">
                <label htmlFor="edit-username">Username</label>
                <Visibility>Shown on your profile</Visibility>
              </div>
              <input
                id="edit-username"
                className="pe-input"
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                autoComplete="username"
                maxLength={30}
                aria-invalid={!usernameValid}
                aria-describedby={!usernameValid ? "edit-username-error" : undefined}
              />
              {!usernameValid && (
                <p id="edit-username-error" className="pe-error">
                  Username can't be empty.
                </p>
              )}
            </div>
            <div className="pe-field">
              <div className="pe-field-top">
                <label htmlFor="edit-bio">Bio</label>
                <span className="pe-count" aria-live="polite">
                  {form.bio.length} / {TEXT_LIMIT}
                </span>
              </div>
              <textarea
                id="edit-bio"
                className="pe-input"
                rows={4}
                value={form.bio}
                maxLength={TEXT_LIMIT}
                onChange={(event) => updateField("bio", event.target.value)}
                aria-describedby="edit-bio-help"
              />
              <p id="edit-bio-help" className="pe-help">
                Ideas: what you like to talk about, your job or studies, your favourite places.
              </p>
            </div>
            <div className="pe-field">
              <label htmlFor="edit-goal">Learning goal</label>
              <input
                id="edit-goal"
                className="pe-input"
                value={form.learning_goal}
                maxLength={TEXT_LIMIT}
                onChange={(event) => updateField("learning_goal", event.target.value)}
                placeholder="e.g. Hold a 10-minute conversation by summer"
              />
              <div className="pe-chips" aria-label="Goal ideas">
                {GOAL_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="pe-chip"
                    onClick={() => addGoalSuggestion(suggestion.text)}
                  >
                    + {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="pf-card pe-section" id="edit-languages" aria-labelledby="edit-languages-title">
            <div className="pe-section-head">
              <h2 id="edit-languages-title">Languages</h2>
              <p>Levels help People find you the right partners.</p>
            </div>
            <div className="pe-row2">
              <div className="pe-field">
                <label htmlFor="edit-native">Native language</label>
                <select
                  id="edit-native"
                  className="pe-input"
                  value={form.native_language}
                  onChange={(event) => updateField("native_language", event.target.value)}
                >
                  {LANGUAGE_KEYS.map((language) => (
                    <option key={language} value={language}>
                      {titleCase(language)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pe-field">
                <label htmlFor="edit-translate">Translate messages into</label>
                <select
                  id="edit-translate"
                  className="pe-input"
                  value={form.base_translate_language}
                  onChange={(event) => updateField("base_translate_language", event.target.value)}
                >
                  {LANGUAGE_KEYS.map((language) => (
                    <option key={language} value={language}>
                      {titleCase(language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pe-field">
              <span className="pe-label">Languages you're learning</span>
              {form.languages_practicing.length ? (
                <ul className="pe-lang-list">
                  {form.languages_practicing.map((language) => {
                    const info = describeLanguage(language);
                    return (
                      <li key={language} className="pe-lang">
                        <span className="pf-lang-code is-learning" aria-hidden="true">
                          {info.code}
                        </span>
                        <span className="pf-lang-text pe-lang-name">
                          <strong>{info.name}</strong>
                          {info.endonym && <span>{info.endonym}</span>}
                        </span>
                        <LevelPicker
                          language={language}
                          value={form.levels[language] || ""}
                          onChange={(level) => setLevel(language, level)}
                        />
                        <button
                          type="button"
                          className="pe-icon-btn"
                          onClick={() => removeLanguage(language)}
                          aria-label={`Remove ${info.name}`}
                        >
                          <CloseRoundedIcon aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="pe-help">Add the languages you want to practise.</p>
              )}
              {languagesToAdd.length > 0 && (
                <div className="pe-chips" aria-label="Add a language">
                  <span className="pe-chips-label">Add:</span>
                  {languagesToAdd.map((language) => (
                    <button key={language} type="button" className="pe-chip" onClick={() => addLanguage(language)}>
                      + {titleCase(language)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="pf-card pe-section" id="edit-details" aria-labelledby="edit-details-title">
            <div className="pe-section-head">
              <h2 id="edit-details-title">Personal details</h2>
              <p>Your birthday and email are never shown to anyone.</p>
            </div>
            <div className="pe-row2">
              <div className="pe-field">
                <div className="pe-field-top">
                  <label htmlFor="edit-dob">Date of birth</label>
                  <Visibility>Only your age is shown</Visibility>
                </div>
                <input
                  id="edit-dob"
                  className="pe-input"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => updateField("date_of_birth", event.target.value)}
                />
              </div>
              <div className="pe-field">
                <div className="pe-field-top">
                  <label htmlFor="edit-email">Email</label>
                  <Visibility kind="private">Private</Visibility>
                </div>
                <input
                  id="edit-email"
                  className="pe-input"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </div>
            </div>
            <div className="pe-field">
              <div className="pe-field-top">
                <label htmlFor="edit-location">Location</label>
                <Visibility>Shown on your profile</Visibility>
              </div>
              <div className="pe-inline">
                <input
                  id="edit-location"
                  className="pe-input"
                  value={form.location}
                  placeholder="City, Country"
                  onChange={(event) => updateField("location", event.target.value)}
                />
                <button type="button" className="pf-btn" onClick={detectLocation} disabled={detectingLocation}>
                  <MyLocationOutlinedIcon aria-hidden="true" />
                  {detectingLocation ? "Detecting…" : "Use my location"}
                </button>
              </div>
            </div>
          </section>

          <section className="pf-card pe-section" id="edit-appearance" aria-labelledby="edit-appearance-title">
            <div className="pe-section-head">
              <h2 id="edit-appearance-title">Avatar accent</h2>
              <p>The ring colour around your photo. Check it in the preview.</p>
            </div>
            <fieldset className="pe-swatches">
              <legend className="sr-only">Quick palettes</legend>
              {AVATAR_RING_OPTIONS.map((option) => {
                const selected = form.avatar_ring_color.toLowerCase() === option.value;
                return (
                  <label key={option.value} className={`pe-swatch ${selected ? "is-on" : ""}`}>
                    <input
                      type="radio"
                      name="ring-color"
                      className="sr-only"
                      checked={selected}
                      onChange={() => updateField("avatar_ring_color", option.value)}
                    />
                    <span className="pe-swatch-dot" style={{ background: option.value }} aria-hidden="true" />
                    {option.label}
                  </label>
                );
              })}
            </fieldset>
            <div className="pe-custom-color">
              <label htmlFor="edit-ring-picker">Custom colour</label>
              <input
                id="edit-ring-picker"
                type="color"
                className="pe-color"
                value={ringColor}
                onChange={(event) => updateField("avatar_ring_color", event.target.value.toLowerCase())}
              />
              <label htmlFor="edit-ring-hex" className="sr-only">
                Hex value
              </label>
              <input
                id="edit-ring-hex"
                className="pe-input pe-hex"
                value={form.avatar_ring_color}
                onChange={(event) => updateField("avatar_ring_color", event.target.value.trim())}
                placeholder="#1b7f79"
                aria-invalid={!ringValid}
                aria-describedby={!ringValid ? "edit-ring-error" : undefined}
              />
            </div>
            {!ringValid && (
              <p id="edit-ring-error" className="pe-error">
                Enter a 6-digit hex colour like #1b7f79.
              </p>
            )}
          </section>

          <div className="pf-card pe-footer-actions">{saveActions}</div>
        </div>
      </div>

    </form>
  );
};

export default EditProfilePage;
