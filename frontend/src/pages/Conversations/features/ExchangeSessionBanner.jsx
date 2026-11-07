import React, { useEffect, useId, useRef, useState } from "react";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  canSwitchNow,
  currentLanguageAt,
  formatCountdown,
  formatCountdownLabel,
  formatMinutes,
  languageBalance,
  languageLabel,
  parseTime,
  remainingMs,
  sessionPhase,
  sessionProgress,
  switchPointMs,
} from "../utils/exchangeSessionTiming";

const COLLAPSED_KEY = "lv:xs-collapsed";
const dismissedKey = (id) => `lv:xs-dismissed:${id}`;
const switchNoticeKey = (id) => `lv:xs-switch-notice:${id}`;
const SWITCH_NOTICE_MS = 30000;
// Opening a chat shortly after the switch point still shows the prompt (once per session).
const SWITCH_NOTICE_RECENT_MS = 60000;

const readFlag = (key) => {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (key, on = true) => {
  try {
    if (on) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode): the flag lasts for this render tree only.
  }
};

/** Re-render every second while a countdown is visible. */
const useNow = (ticking) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return now;
};

const TOPIC_SOURCE_LABEL = {
  ai: "Suggested by Lumi",
  library: "From the topic library",
  custom: "Your own topic",
};

const CLOSED_NOTE = {
  declined: (other, isStarter) => (isStarter ? `${other} declined the exchange.` : "You declined the exchange."),
  cancelled: (other, isStarter) => (isStarter ? "You cancelled the invite." : `${other} cancelled the invite.`),
  expired: () => "The exchange invite expired.",
};

/**
 * Guided exchange banner pinned under the chat header: pending invite (starter / partner),
 * active session (timer, current language, progress with the switch marker, topic, actions),
 * end card (language balance, messages, corrections) and short closed notes.
 * Collapsible to a slim bar; the end card and notes are dismissed locally (sessionStorage).
 */
export default function ExchangeSessionBanner({
  session,
  offsetMs = 0,
  currentUserId,
  busyAction = "",
  onAction,
  onStartAnother,
  onJumpToMessage,
}) {
  const bodyId = useId();
  const status = session?.status;
  const ticking = status === "pending" || status === "active";
  const now = useNow(ticking);
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY));
  const [dismissedId, setDismissedId] = useState(null);
  const [notice, setNotice] = useState("");
  const [correctionIndex, setCorrectionIndex] = useState(0);
  const prevPhaseRef = useRef(null);

  const phase = session ? sessionPhase(session, now, offsetMs) : null;

  // "Time to switch" once per session, when the switch point passes while the chat is open
  // (or it passed less than a minute ago).
  useEffect(() => {
    if (!session) return undefined;
    const previous = prevPhaseRef.current;
    prevPhaseRef.current = { id: session.id, phase };
    if (phase !== "second" || readFlag(switchNoticeKey(session.id))) return undefined;
    const crossedLive = previous?.id === session.id && previous.phase === "first";
    const point = switchPointMs(session);
    const recent = point !== null && Date.now() + offsetMs - point < SWITCH_NOTICE_RECENT_MS;
    if (!crossedLive && !recent) return undefined;
    writeFlag(switchNoticeKey(session.id));
    const switchedEarly =
      parseTime(session.switched_at) !== null &&
      parseTime(session.halfway_at) !== null &&
      parseTime(session.switched_at) < parseTime(session.halfway_at);
    const language = languageLabel(session.second_language);
    setNotice(switchedEarly ? `Switched to ${language}. Keep going in ${language}!` : `Time to switch to ${language}`);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), SWITCH_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setCorrectionIndex(0);
    if (status !== "active") setNotice("");
  }, [session?.id, status]);

  if (!session) return null;
  const isClosed = !ticking;
  if (isClosed && (dismissedId === session.id || readFlag(dismissedKey(session.id)))) return null;

  const isStarter = currentUserId === session.created_by?.id;
  const other = (isStarter ? session.partner?.username : session.created_by?.username) || "Your partner";
  const nameFor = (userId) =>
    String(userId) === String(currentUserId)
      ? "You"
      : String(userId) === String(session.created_by?.id)
        ? session.created_by?.username
        : String(userId) === String(session.partner?.id)
          ? session.partner?.username
          : "Someone";
  const first = languageLabel(session.first_language);
  const second = languageLabel(session.second_language);
  const busy = Boolean(busyAction);

  const dismiss = () => {
    writeFlag(dismissedKey(session.id));
    setDismissedId(session.id);
  };
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      writeFlag(COLLAPSED_KEY, !value);
      return !value;
    });
  };

  // Short closed notes (declined / cancelled / expired).
  if (CLOSED_NOTE[status]) {
    return (
      <section className="cv-xs is-note" aria-label="Guided exchange">
        <p className="cv-xs-note">{CLOSED_NOTE[status](other, isStarter)}</p>
        <button type="button" className="cv-xs-icon" onClick={dismiss} aria-label="Dismiss">
          <CloseRoundedIcon aria-hidden="true" />
        </button>
      </section>
    );
  }

  const pendingLeft = remainingMs(session.expires_at, now, offsetMs);
  const activeLeft = remainingMs(session.ends_at, now, offsetMs);
  const current = currentLanguageAt(session, now, offsetMs);
  const summary = session.summary;

  let headline;
  let timer = null;
  if (status === "pending") {
    headline = isStarter
      ? `Waiting for ${other}…`
      : `${other} invites you to a ${session.duration_minutes}-minute exchange`;
    timer = (
      <span className="cv-xs-bar-time">
        expires in <span className="cv-xs-mono">{formatCountdown(pendingLeft)}</span>
      </span>
    );
  } else if (status === "active") {
    headline = phase === "ending" ? "Wrapping up…" : `Now: ${languageLabel(current)}`;
    timer = (
      <span className="cv-xs-bar-time">
        <span className="cv-xs-mono">{formatCountdown(activeLeft)}</span> left
      </span>
    );
  } else {
    headline = `Nice exchange! ${formatMinutes(summary?.total_minutes ?? session.duration_minutes)}`;
  }

  const action = (name, label, busyLabel, className = "") => (
    <button
      type="button"
      className={`cv-xs-btn ${className}`}
      onClick={() => onAction?.(name)}
      disabled={busy}
      aria-busy={busyAction === name || undefined}
    >
      {busyAction === name ? busyLabel : label}
    </button>
  );

  let body = null;
  if (status === "pending" && isStarter) {
    body = (
      <>
        <p className="cv-xs-line">
          {session.duration_minutes} min · {first} → {second}. {other} has{" "}
          <span className="cv-xs-mono">{formatCountdown(pendingLeft)}</span> to accept.
        </p>
        <div className="cv-xs-actions">{action("cancel", "Cancel invite", "Cancelling…")}</div>
      </>
    );
  } else if (status === "pending") {
    body = (
      <>
        <p className="cv-xs-line">
          {session.duration_minutes} min · <strong>{first} → {second}</strong>. Half the time each, with a topic to
          talk about.
        </p>
        <div className="cv-xs-actions">
          {action("decline", "Decline", "Declining…")}
          {action("accept", "Accept", "Starting…", "is-teal")}
        </div>
      </>
    );
  } else if (status === "active") {
    const { elapsed, switchAt } = sessionProgress(session, now, offsetMs);
    const showSwitch = canSwitchNow(session, now, offsetMs);
    const topic = session.topic;
    body = (
      <>
        <div className="cv-xs-live">
          <div
            className="cv-xs-timer"
            role="timer"
            aria-label={`${formatCountdownLabel(activeLeft)} left`}
          >
            {formatCountdown(activeLeft)}
          </div>
          <div className="cv-xs-live-text">
            <span className="cv-xs-chip">Now: {languageLabel(current)}</span>
            {phase === "first" && <span className="cv-xs-next">Then {second}</span>}
          </div>
        </div>
        <div
          className="cv-xs-progress"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(elapsed * 100)}
          aria-valuetext={`${Math.round(elapsed * 100)}%, switch to ${second} at ${Math.round(switchAt * 100)}%`}
        >
          <span className="cv-xs-progress-fill" style={{ width: `${elapsed * 100}%` }} />
          <span className="cv-xs-progress-marker" style={{ left: `${switchAt * 100}%` }} aria-hidden="true" />
        </div>
        <div className="cv-xs-progress-labels" aria-hidden="true">
          <span>{first}</span>
          <span>{second}</span>
        </div>
        {topic && (
          <div className="cv-xs-topic">
            <div className="cv-xs-topic-head">
              <h3>{topic.title}</h3>
              {session.topic_source && TOPIC_SOURCE_LABEL[session.topic_source] && (
                <span className="cv-xs-source">{TOPIC_SOURCE_LABEL[session.topic_source]}</span>
              )}
            </div>
            {Array.isArray(topic.prompts) && topic.prompts.length > 0 && (
              <ul>
                {topic.prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {phase !== "ending" && (
          <div className="cv-xs-actions">
            {action("topic", topic ? "Another topic" : "Suggest a topic", "Finding a topic…")}
            {showSwitch && action("switch", `Switch to ${second} now`, "Switching…")}
            {action("end", "End", "Ending…", "is-quiet")}
          </div>
        )}
      </>
    );
  } else if (status === "ended") {
    const balance = languageBalance(summary);
    const correctionIds = Array.from(
      new Set((summary?.corrections || []).map((row) => row.message_id).filter(Boolean))
    );
    const correctionCount = summary?.correction_count || 0;
    const endedEarly = session.ended_by_id != null;
    body = (
      <>
        {endedEarly && (
          <p className="cv-xs-line">
            {String(session.ended_by_id) === String(currentUserId) ? "You ended it early." : `${other} ended it early.`}
          </p>
        )}
        {balance.length > 0 && (
          <>
            <div className="cv-xs-balance" aria-hidden="true">
              {balance.map((row, index) => (
                <span
                  key={row.language}
                  className={`cv-xs-balance-seg is-${index === 0 ? "first" : "second"}`}
                  style={{ flexGrow: row.share || 0.0001 }}
                />
              ))}
            </div>
            <ul className="cv-xs-balance-legend">
              {balance.map((row, index) => (
                <li key={row.language}>
                  <span className={`cv-xs-swatch is-${index === 0 ? "first" : "second"}`} aria-hidden="true" />
                  <strong>{languageLabel(row.language)}</strong> {formatMinutes(row.minutes)}
                  <span className="cv-xs-msgs">
                    {" · "}
                    {Object.keys(row.messages).length
                      ? Object.entries(row.messages)
                          .map(([userId, count]) => `${nameFor(userId)} ${count}`)
                          .join(", ")
                      : "no messages"}
                    {Object.keys(row.messages).length ? ` message${row.messageCount === 1 ? "" : "s"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="cv-xs-line">
          {correctionCount === 1 ? "1 correction" : `${correctionCount} corrections`} during this session
          {correctionIds.length > 0 && onJumpToMessage && (
            <>
              {" "}
              <button
                type="button"
                className="cv-xs-link"
                onClick={() => {
                  onJumpToMessage(correctionIds[correctionIndex % correctionIds.length]);
                  setCorrectionIndex((index) => (index + 1) % correctionIds.length);
                }}
              >
                {correctionIds.length > 1
                  ? `Show correction ${(correctionIndex % correctionIds.length) + 1} of ${correctionIds.length}`
                  : "Show it"}
              </button>
            </>
          )}
        </p>
        <div className="cv-xs-actions">
          <button type="button" className="cv-xs-btn" onClick={dismiss}>
            Dismiss
          </button>
          {onStartAnother && (
            <button type="button" className="cv-xs-btn is-teal" onClick={onStartAnother}>
              Start another
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className={`cv-xs is-${status} ${collapsed ? "is-collapsed" : ""}`} aria-label="Guided exchange">
      <div className="cv-xs-bar">
        <TimerRoundedIcon className="cv-xs-bar-icon" aria-hidden="true" />
        <p className="cv-xs-headline">
          <span>{headline}</span>
          {timer}
        </p>
        <button
          type="button"
          className="cv-xs-icon"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? "Show exchange details" : "Hide exchange details"}
        >
          {collapsed ? <KeyboardArrowDownRoundedIcon aria-hidden="true" /> : <KeyboardArrowUpRoundedIcon aria-hidden="true" />}
        </button>
      </div>
      <div id={bodyId} className="cv-xs-body" hidden={collapsed}>
        {body}
      </div>
      <div className="cv-xs-notice-region" role="status">
        {notice && (
          <p className="cv-xs-notice">
            <span>{notice}</span>
            <button type="button" className="cv-xs-icon" onClick={() => setNotice("")} aria-label="Dismiss switch reminder">
              <CloseRoundedIcon aria-hidden="true" />
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
