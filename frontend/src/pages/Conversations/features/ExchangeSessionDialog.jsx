import React, { useEffect, useId, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { getErrorMessage } from "../../../lib/api";
import {
  EXCHANGE_DEFAULT_DURATION,
  EXCHANGE_DURATIONS,
  EXCHANGE_TOPIC_MAX_LENGTH,
} from "../api/exchangeSessions";
import { languageLabel } from "../utils/exchangeSessionTiming";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Default order: the server's [partner native, my native] when usable, else the first two languages. */
export const initialLanguagePair = (options) => {
  const languages = options?.languages || [];
  const [first, second] = options?.default_languages || [];
  if (first && second && first !== second) return [first, second];
  const pick = languages.find((language) => language && language !== (first || second));
  if (first || second) return [first || second, pick || ""];
  return [languages[0] || "", languages[1] || ""];
};

/**
 * "Guided exchange" start dialog (native <dialog> like CorrectionDialog: showModal, Escape /
 * backdrop close, Tab trap, focus returns to the opener). Submitting can take a few seconds
 * while the server prepares topics, so the form stays open with a pending label.
 */
export default function ExchangeSessionDialog({ options, partnerName, onSubmit, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const languages = options?.languages || [];
  const durations = options?.durations?.length ? options.durations : EXCHANGE_DURATIONS;
  const [duration, setDuration] = useState(
    durations.includes(EXCHANGE_DEFAULT_DURATION) ? EXCHANGE_DEFAULT_DURATION : durations[0]
  );
  const [[first, second], setPair] = useState(() => initialLanguagePair(options));
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const returnTarget = document.activeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector("input[type='radio']:checked")?.focus();
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (returnTarget && typeof returnTarget.focus === "function" && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
  }, []);

  const sameLanguage = Boolean(first) && first === second;
  const canSubmit = !busy && Boolean(first) && Boolean(second) && !sameLanguage;

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const trimmed = topic.trim();
      await onSubmit({
        duration_minutes: duration,
        first_language: first,
        second_language: second,
        ...(trimmed ? { topic: trimmed } : {}),
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send the invite."));
      setBusy(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || []).filter(
        (node) => !(node.type === "radio" && !node.checked)
      );
      if (!focusable.length) return;
      const firstNode = focusable[0];
      const lastNode = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }
  };

  const languageOptions = (selected) => {
    const list = languages.includes(selected) || !selected ? languages : [selected, ...languages];
    return list.map((language) => (
      <option key={language} value={language}>
        {languageLabel(language)}
      </option>
    ));
  };

  return (
    <dialog
      ref={dialogRef}
      className="cv-correct-dialog cv-xs-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <form className="cv-correct-body" onSubmit={submit}>
        <div className="cv-correct-head">
          <h2 id={titleId}>Guided exchange</h2>
          <button type="button" className="cv-correct-close" onClick={close} aria-label="Close" disabled={busy}>
            <CloseRoundedIcon aria-hidden="true" />
          </button>
        </div>
        <p className="cv-xs-dialog-intro">
          Practise together{partnerName ? ` with ${partnerName}` : ""}: half the time in one language, then switch.
          A timer, a topic and a summary at the end.
        </p>

        <fieldset className="cv-xs-fieldset" disabled={busy}>
          <legend className="cv-correct-label">How long?</legend>
          <div className="cv-xs-pills">
            {durations.map((minutes) => (
              <label key={minutes} className={`cv-xs-pill ${duration === minutes ? "is-on" : ""}`}>
                <input
                  type="radio"
                  name={`${titleId}-duration`}
                  value={minutes}
                  checked={duration === minutes}
                  onChange={() => setDuration(minutes)}
                />
                {minutes} min
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="cv-xs-fieldset" disabled={busy}>
          <legend className="cv-correct-label">Start with</legend>
          <div className="cv-xs-order">
            <label className="cv-xs-select">
              <span className="cv-sr-only">First language</span>
              <select value={first} onChange={(event) => setPair([event.target.value, second])}>
                {!first && <option value="">Choose…</option>}
                {languageOptions(first)}
              </select>
            </label>
            <button
              type="button"
              className="cv-icon-button cv-xs-swap"
              onClick={() => setPair([second, first])}
              aria-label="Swap the language order"
              title="Swap"
            >
              <SwapHorizRoundedIcon aria-hidden="true" />
            </button>
            <label className="cv-xs-select">
              <span className="cv-sr-only">Then switch to</span>
              <select value={second} onChange={(event) => setPair([first, event.target.value])}>
                {!second && <option value="">Choose…</option>}
                {languageOptions(second)}
              </select>
            </label>
          </div>
          {first && second && !sameLanguage && (
            <p className="cv-xs-hint">
              {duration / 2} min {languageLabel(first)}, then {duration / 2} min {languageLabel(second)}.
            </p>
          )}
          {sameLanguage && <p className="cv-correct-error">Pick two different languages.</p>}
          {languages.length < 2 && (
            <p className="cv-xs-hint">Add the languages you speak and learn to your profile to start an exchange.</p>
          )}
        </fieldset>

        <label className="cv-correct-label" htmlFor={`${titleId}-topic`}>
          Your own topic <span className="cv-correct-optional">(optional, otherwise Lumi suggests one)</span>
        </label>
        <input
          id={`${titleId}-topic`}
          className="cv-correct-input cv-xs-topic-input"
          value={topic}
          maxLength={EXCHANGE_TOPIC_MAX_LENGTH}
          placeholder="e.g. Favourite street food"
          onChange={(event) => {
            setTopic(event.target.value);
            setError("");
          }}
          disabled={busy}
        />

        {error && (
          <p className="cv-correct-error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p className="cv-xs-hint" role="status">
            Preparing topics and sending the invite…
          </p>
        )}

        <div className="cv-correct-actions">
          <span className="cv-correct-spacer" />
          <button type="button" className="cv-correct-btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="cv-correct-btn is-teal" disabled={!canSubmit}>
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
