import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { DEFAULT_AVATAR_URL, handleAvatarError } from "../../constants/avatar";
import { useUser } from "../../context/UserContext";
import api, { isAbortError } from "../../lib/api";
import { avatarImage } from "../../lib/media";
import { toast, toastApiError } from "../../components/Toast";
import { clearClientSessionData } from "../../utils/auth";
import { getNotificationPermission, requestNotificationPermission } from "../../utils/notifications";
import {
  LANGUAGE_KEYS,
  describeLanguage,
  learningLanguages,
  levelFor,
  normalizeLanguage,
  resolveMediaUrl,
  titleCase,
  validRingColor,
} from "../Profile/features/profileUtils";
import ConfirmDialog from "./ConfirmDialog";
import "../Profile/features/profile.css";
import "./settings.css";

// Rendered sizes from settings.css.
const ACCOUNT_AVATAR_PX = 72;
const LIST_AVATAR_PX = 44;

const SECTIONS = [
  { id: "st-account", label: "Account", icon: PersonOutlineRoundedIcon },
  { id: "st-language", label: "Language & translation", icon: TranslateRoundedIcon },
  { id: "st-notifications", label: "Notifications", icon: NotificationsNoneRoundedIcon },
  { id: "st-privacy", label: "Privacy & safety", icon: ShieldOutlinedIcon },
  { id: "st-danger", label: "Danger zone", icon: WarningAmberRoundedIcon },
];

// "Want to practise tomorrow?" in every language the app offers, for the live translation example.
const EXAMPLE_LINES = {
  english: "Want to practise tomorrow?",
  spanish: "¿Quieres practicar mañana?",
  french: "Tu veux pratiquer demain ?",
  german: "Willst du morgen üben?",
  italian: "Vuoi fare pratica domani?",
  portuguese: "Quer praticar amanhã?",
  greek: "Θέλεις να εξασκηθούμε αύριο;",
  japanese: "明日練習しませんか？",
  korean: "내일 연습할래요?",
  chinese: "明天想练习吗？",
  arabic: "هل تريد أن تتدرب غدًا؟",
  russian: "Хочешь попрактиковаться завтра?",
  turkish: "Yarın pratik yapmak ister misin?",
  hindi: "क्या आप कल अभ्यास करना चाहेंगे?",
};

const NOTIFICATION_STATES = {
  granted: { label: "On", text: "You'll get a desktop notification for new messages while LangVoyage is open." },
  default: { label: "Off", text: "Allow notifications to hear about new messages while you're in another tab." },
  denied: {
    label: "Blocked",
    text: "Your browser is blocking notifications for this site. Allow them in the site settings, then reload.",
  },
  unsupported: { label: "Unavailable", text: "This browser doesn't support desktop notifications." },
};

const savedTranslateLanguage = (user) =>
  normalizeLanguage(user?.base_translate_language || user?.native_language || "english") || "english";

const formatHistoryDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

const reasonLabel = (reason) => {
  const text = String(reason || "").replace(/_/g, " ").trim();
  return text ? titleCase(text) : "";
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SectionCard = ({ id, title, description, icon: Icon, tone = "", children }) => (
  <section id={id} className={`pf-card st-section ${tone}`} aria-labelledby={`${id}-title`} tabIndex={-1}>
    <div className="st-section-head">
      <h2 id={`${id}-title`} className="pf-card-title">
        {Icon && <Icon aria-hidden="true" />}
        {title}
      </h2>
      {description && <p>{description}</p>}
    </div>
    {children}
  </section>
);

const ListAvatar = ({ entry }) => {
  const src = avatarImage(resolveMediaUrl(entry.profile_image_url), LIST_AVATAR_PX);
  return src ? (
    <img className="st-person-avatar" src={src} alt="" loading="lazy" decoding="async" onError={handleAvatarError} />
  ) : (
    <span className="st-person-avatar is-initial" aria-hidden="true">
      {entry.username?.slice(0, 1)?.toUpperCase() || "?"}
    </span>
  );
};

const SettingsPage = () => {
  const { user, setUser } = useUser();
  const outlet = useOutletContext();
  const onLogout = outlet?.onLogout;
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  // Translate language: a draft only while the user has changed it.
  const savedLanguage = savedTranslateLanguage(user);
  const [draftLanguage, setDraftLanguage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const translateLanguage = draftLanguage ?? savedLanguage;
  const isDirty = draftLanguage !== null && draftLanguage !== savedLanguage;

  const [moderationLoading, setModerationLoading] = useState(true);
  const [moderationError, setModerationError] = useState(false);
  const [moderation, setModeration] = useState({ blocked_profiles: [], reported_profiles: [] });
  const [unblockingUsername, setUnblockingUsername] = useState("");

  const [notificationState, setNotificationState] = useState(() => getNotificationPermission());
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  const [dialog, setDialog] = useState(null); // "password" | "delete" | null
  const [resetSending, setResetSending] = useState(false);
  const [resetSentTo, setResetSentTo] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const deleteInputRef = useRef(null);
  const inFlightRef = useRef({ save: false, reset: false, delete: false, unblock: new Set() });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setModerationLoading(true);
        const payload = await api.get("/api/profile/moderation/", { signal: controller.signal });
        setModeration({
          blocked_profiles: Array.isArray(payload?.blocked_profiles) ? payload.blocked_profiles : [],
          reported_profiles: Array.isArray(payload?.reported_profiles) ? payload.reported_profiles : [],
        });
        setModerationError(false);
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        setModerationError(true);
      } finally {
        if (!controller.signal.aborted) setModerationLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Highlight the section in view in the desktop nav.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") return undefined;
    const observer = new window.IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    SECTIONS.forEach(({ id }) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (event, id) => {
    event.preventDefault();
    const node = document.getElementById(id);
    if (!node) return;
    setActiveSection(id);
    node.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    node.focus({ preventScroll: true });
  };

  const handleSave = async (event) => {
    event?.preventDefault();
    if (!isDirty || inFlightRef.current.save) return;
    inFlightRef.current.save = true;
    setSaving(true);
    const value = draftLanguage;
    try {
      // Only the field this page owns; Edit profile owns languages and levels.
      const payload = await api.patch("/api/profile/edit/", { base_translate_language: value });
      const saved = payload?.updated_profile?.base_translate_language || value;
      setUser((prev) => (prev ? { ...prev, base_translate_language: saved } : prev));
      setDraftLanguage(null);
      setJustSaved(true);
    } catch (err) {
      toastApiError(err, "Couldn't save your settings");
    } finally {
      inFlightRef.current.save = false;
      setSaving(false);
    }
  };

  const handleUnblock = async (username) => {
    const pending = inFlightRef.current.unblock;
    if (pending.has(username)) return;
    pending.add(username);
    setUnblockingUsername(username);
    try {
      await api.delete(`/api/profile/public/${encodeURIComponent(username)}/block/`);
      setModeration((prev) => ({
        ...prev,
        blocked_profiles: prev.blocked_profiles.filter((entry) => entry.username !== username),
      }));
      toast.success(`Unblocked ${username}. You can see each other in People again.`);
    } catch (err) {
      toastApiError(err, `Couldn't unblock ${username}`);
    } finally {
      pending.delete(username);
      setUnblockingUsername((current) => (current === username ? "" : current));
    }
  };

  const handleEnableNotifications = async () => {
    if (requestingNotifications) return;
    setRequestingNotifications(true);
    const result = await requestNotificationPermission();
    setNotificationState(result);
    setRequestingNotifications(false);
  };

  const handleSendReset = async () => {
    const email = String(user?.email || "").trim();
    if (!email || inFlightRef.current.reset) return;
    inFlightRef.current.reset = true;
    setResetSending(true);
    try {
      await api.post("/api/auth/password-reset/", { email });
      setResetSentTo(email);
      setDialog(null);
    } catch (err) {
      toastApiError(err, "Couldn't send the reset link");
    } finally {
      inFlightRef.current.reset = false;
      setResetSending(false);
    }
  };

  const handleLogout = async () => {
    if (!onLogout || loggingOut) return;
    setLoggingOut(true);
    await onLogout();
  };

  const deleteConfirmWord = user?.username || "DELETE";
  const deleteConfirmed = deleteConfirmText.trim() === deleteConfirmWord;

  const handleDeleteAccount = async () => {
    if (!deleteConfirmed || inFlightRef.current.delete) return;
    inFlightRef.current.delete = true;
    setDeleting(true);
    try {
      await api.delete("/api/profile/delete/");
    } catch (err) {
      toastApiError(err, "Couldn't delete your account");
      inFlightRef.current.delete = false;
      setDeleting(false);
      return;
    }
    toast.success("Your account was deleted.");
    if (onLogout) {
      // Same teardown as the header's Log out (sockets, caches, cookies, user), minus presence.
      await onLogout({ accountDeleted: true });
    } else {
      clearClientSessionData();
      setUser(null);
      navigate("/login");
    }
  };

  const openDialog = (name) => {
    if (name === "delete") setDeleteConfirmText("");
    setDialog(name);
  };

  const closeDialog = useCallback(() => setDialog(null), []);

  if (!user) {
    return <div className="pf-state">Loading settings…</div>;
  }

  const email = String(user.email || "").trim();
  const learning = learningLanguages(user);
  const exampleSource = translateLanguage === "spanish" ? "english" : "spanish";
  const notification = NOTIFICATION_STATES[notificationState] || NOTIFICATION_STATES.unsupported;
  const accountAvatar = avatarImage(resolveMediaUrl(user.profile_image_url), ACCOUNT_AVATAR_PX) || DEFAULT_AVATAR_URL;
  const saveStatus = isDirty ? "Unsaved change" : justSaved ? "Saved" : "";

  return (
    <div className="pf-page st-page">
      <header className="st-head">
        <h1>Settings</h1>
        <p>Manage your account, translation language and safety.</p>
      </header>

      <div className="st-layout">
        <nav className="pf-card st-nav" aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeSection === id ? "is-active" : ""}
              aria-current={activeSection === id ? "true" : undefined}
              onClick={(event) => scrollToSection(event, id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>

        <div className="st-main">
          <SectionCard id="st-account" title="Account" icon={PersonOutlineRoundedIcon}>
            <div className="st-account">
              <span className="st-account-avatar" style={{ background: validRingColor(user.avatar_ring_color) }}>
                <img src={accountAvatar} alt="" onError={handleAvatarError} />
              </span>
              <div className="st-account-text">
                <strong>{user.username}</strong>
                {email && <span>{email}</span>}
              </div>
              <div className="st-account-links">
                <Link to="/profile/edit" className="st-btn">
                  <EditOutlinedIcon aria-hidden="true" />
                  Edit profile
                </Link>
                <Link to="/profile" className="st-btn">
                  <VisibilityOutlinedIcon aria-hidden="true" />
                  View my profile
                </Link>
              </div>
            </div>

            <div className="st-row">
              <div className="st-row-text">
                <h3>Password</h3>
                <p>We'll email you a link to choose a new password.</p>
                {resetSentTo && (
                  <p className="st-note is-success" role="status">
                    <CheckRoundedIcon aria-hidden="true" />
                    We sent a link to {resetSentTo}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="st-btn"
                onClick={() => openDialog("password")}
                disabled={!email || resetSending}
              >
                <LockResetRoundedIcon aria-hidden="true" />
                Change password
              </button>
            </div>

            {onLogout && (
              <div className="st-row">
                <div className="st-row-text">
                  <h3>Log out</h3>
                  <p>Sign out of LangVoyage on this browser.</p>
                </div>
                <button type="button" className="st-btn" onClick={handleLogout} disabled={loggingOut}>
                  <LogoutRoundedIcon aria-hidden="true" />
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="st-language"
            title="Language & translation"
            icon={TranslateRoundedIcon}
            description="Translations in chat and in Practice use this language."
          >
            <form className="st-form" onSubmit={handleSave}>
              <div className="st-field">
                <label htmlFor="base-translate-language">Translate messages into</label>
                <select
                  id="base-translate-language"
                  className="st-select"
                  value={translateLanguage}
                  onChange={(event) => {
                    setDraftLanguage(event.target.value);
                    setJustSaved(false);
                  }}
                >
                  {LANGUAGE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {describeLanguage(key).name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="st-example" aria-label="Example translation">
                <span className="st-example-label">Example</span>
                <span className="st-chip is-source" dir="auto">
                  {EXAMPLE_LINES[exampleSource]}
                </span>
                <ArrowForwardRoundedIcon className="st-example-arrow" aria-hidden="true" />
                <span className="st-chip is-target" dir="auto" data-testid="translate-example">
                  {EXAMPLE_LINES[translateLanguage] || EXAMPLE_LINES.english}
                </span>
              </div>
              <div className="st-save">
                <span className={`st-status ${isDirty ? "is-dirty" : ""}`} role="status">
                  {justSaved && !isDirty && <CheckRoundedIcon aria-hidden="true" />}
                  {saveStatus}
                </span>
                <button type="submit" className="st-btn is-teal" disabled={!isDirty || saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>

            <div className="st-divider" />

            <div className="st-subsection">
              <div className="st-row-text">
                <h3>Languages you're learning</h3>
                <p>Change languages and levels in Edit profile.</p>
              </div>
              {learning.length ? (
                <ul className="st-chips" aria-label="Languages you're learning">
                  {learning.map((lang) => {
                    const level = levelFor(user.practice_language_levels, lang);
                    return (
                      <li key={lang} className="st-chip is-learning">
                        <span className="pf-lang-code is-learning" aria-hidden="true">
                          {describeLanguage(lang).code}
                        </span>
                        {describeLanguage(lang).name}
                        {level && <span className="st-chip-level">· {titleCase(level)}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="st-empty">You haven't added a language to learn yet.</p>
              )}
              <Link to="/profile/edit" className="pf-link">
                Edit languages and levels
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            id="st-notifications"
            title="Notifications"
            icon={NotificationsNoneRoundedIcon}
            description="Desktop notifications for new messages on this browser."
          >
            <div className="st-row">
              <div className="st-row-text">
                <h3>
                  Desktop notifications{" "}
                  <span className={`st-pill is-${notificationState}`}>{notification.label}</span>
                </h3>
                <p>{notification.text}</p>
              </div>
              {notificationState === "default" && (
                <button
                  type="button"
                  className="st-btn is-teal"
                  onClick={handleEnableNotifications}
                  disabled={requestingNotifications}
                >
                  Enable desktop notifications
                </button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            id="st-privacy"
            title="Privacy & safety"
            icon={ShieldOutlinedIcon}
            description="People you've blocked can't see you or message you, and you won't see them."
          >
            <div className="st-subsection">
              <h3>Blocked profiles</h3>
              {moderationLoading ? (
                <p className="st-empty">Loading blocked profiles…</p>
              ) : moderationError ? (
                <p className="st-empty">Couldn't load your safety history. Try again later.</p>
              ) : moderation.blocked_profiles.length ? (
                <ul className="st-people">
                  {moderation.blocked_profiles.map((entry) => (
                    <li key={`blocked-${entry.username}`} className="st-person">
                      <ListAvatar entry={entry} />
                      <span className="st-person-text">
                        <Link to={`/people/${encodeURIComponent(entry.username)}`}>{entry.username}</Link>
                        {formatHistoryDate(entry.created_at) && (
                          <small>Blocked {formatHistoryDate(entry.created_at)}</small>
                        )}
                      </span>
                      <button
                        type="button"
                        className="st-btn is-small"
                        onClick={() => handleUnblock(entry.username)}
                        disabled={unblockingUsername === entry.username}
                        aria-label={`Unblock ${entry.username}`}
                      >
                        {unblockingUsername === entry.username ? "Unblocking…" : "Unblock"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="st-empty">You haven't blocked anyone. Nice!</p>
              )}
            </div>

            <div className="st-divider" />

            <div className="st-subsection">
              <h3>Reported profiles</h3>
              {moderationLoading ? (
                <p className="st-empty">Loading reports…</p>
              ) : moderationError ? (
                <p className="st-empty">Couldn't load your reports.</p>
              ) : moderation.reported_profiles.length ? (
                <ul className="st-people">
                  {moderation.reported_profiles.map((entry, index) => (
                    <li key={`reported-${entry.username}-${entry.created_at}-${index}`} className="st-person is-report">
                      <ListAvatar entry={entry} />
                      <span className="st-person-text">
                        <strong>{entry.username}</strong>
                        {formatHistoryDate(entry.created_at) && (
                          <small>Reported {formatHistoryDate(entry.created_at)}</small>
                        )}
                        {entry.details && <span className="st-person-details">{entry.details}</span>}
                      </span>
                      {reasonLabel(entry.reason) && <span className="st-pill is-report">{reasonLabel(entry.reason)}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="st-empty">You haven't reported anyone.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard id="st-danger" title="Danger zone" icon={WarningAmberRoundedIcon} tone="is-danger">
            <div className="st-row">
              <div className="st-row-text">
                <h3>Delete account</h3>
                <p>Permanently removes your profile, conversations and practice progress.</p>
              </div>
              <button type="button" className="st-btn is-danger-outline" onClick={() => openDialog("delete")}>
                <DeleteOutlineRoundedIcon aria-hidden="true" />
                Delete account
              </button>
            </div>
          </SectionCard>

          <footer className="st-footer">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-and-conditions">Terms</Link>
            {user.support_email && <a href={`mailto:${user.support_email}`}>Contact support</a>}
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "password"}
        title="Change password?"
        confirmLabel="Send link"
        busyLabel="Sending…"
        busy={resetSending}
        onConfirm={handleSendReset}
        onClose={closeDialog}
      >
        <p>
          We'll send a password reset link to <strong>{email}</strong>. The link works for one hour.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete your account?"
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        busy={deleting}
        tone="danger"
        confirmDisabled={!deleteConfirmed}
        onConfirm={handleDeleteAccount}
        onClose={closeDialog}
        initialFocusRef={deleteInputRef}
      >
        <p>This can't be undone. Deleting your account permanently removes:</p>
        <ul className="st-dialog-list">
          <li>your profile, languages and profile photos</li>
          <li>all your conversations and messages (for both people in each chat)</li>
          <li>your practice progress, blocks and reports</li>
        </ul>
        <label htmlFor="delete-confirm" className="st-dialog-label">
          Type <strong>{deleteConfirmWord}</strong> to confirm
        </label>
        <input
          id="delete-confirm"
          ref={deleteInputRef}
          className="st-select"
          value={deleteConfirmText}
          onChange={(event) => setDeleteConfirmText(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={deleting}
        />
      </ConfirmDialog>
    </div>
  );
};

export default SettingsPage;
