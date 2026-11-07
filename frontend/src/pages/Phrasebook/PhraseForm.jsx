import React, { useEffect, useId, useRef, useState } from "react";
import { LANGUAGE_KEYS, describeLanguage } from "../Profile/features/profileUtils";

// Backend limits (chatapp/phrasebook.py): text, meaning and context 500; note 1000.
export const PHRASE_TEXT_MAX = 500;
export const PHRASE_NOTE_MAX = 1000;

const languageOptions = (current, extra = []) => {
  const keys = new Set([...extra, ...LANGUAGE_KEYS].map((key) => String(key || "").toLowerCase()).filter(Boolean));
  if (current) keys.add(current);
  return [...keys].sort();
};

/**
 * Fields for adding (manual: text, meaning, context, note, language) or editing an entry
 * (text, meaning, note, language — context comes from the chat and stays read-only).
 */
export default function PhraseForm({
  initial = {},
  showContext = false,
  languages = [],
  submitLabel,
  busyLabel,
  busy = false,
  onSubmit,
  onCancel,
  autoFocus = true,
}) {
  const id = useId();
  const textRef = useRef(null);
  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);
  const [values, setValues] = useState({
    text: initial.text || "",
    meaning: initial.meaning || "",
    context: initial.context || "",
    note: initial.note || "",
    language: initial.language || "",
  });
  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const canSubmit = !busy && values.text.trim().length > 0;

  return (
    <form
      className="pb-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          text: values.text.trim(),
          meaning: values.meaning.trim(),
          note: values.note.trim(),
          language: values.language,
          ...(showContext ? { context: values.context.trim() } : {}),
        });
      }}
    >
      <div className="pb-form-grid">
        <label className="pb-field" htmlFor={`${id}-text`}>
          <span>Phrase</span>
          <input
            id={`${id}-text`}
            className="st-select"
            value={values.text}
            onChange={set("text")}
            maxLength={PHRASE_TEXT_MAX}
            required
            dir="auto"
            ref={textRef}
            disabled={busy}
          />
        </label>
        <label className="pb-field" htmlFor={`${id}-meaning`}>
          <span>
            Meaning <small>(optional)</small>
          </span>
          <input
            id={`${id}-meaning`}
            className="st-select"
            value={values.meaning}
            onChange={set("meaning")}
            maxLength={PHRASE_TEXT_MAX}
            dir="auto"
            disabled={busy}
          />
        </label>
        {showContext && (
          <label className="pb-field is-wide" htmlFor={`${id}-context`}>
            <span>
              Example sentence <small>(optional)</small>
            </span>
            <input
              id={`${id}-context`}
              className="st-select"
              value={values.context}
              onChange={set("context")}
              maxLength={PHRASE_TEXT_MAX}
              dir="auto"
              disabled={busy}
            />
          </label>
        )}
        <label className="pb-field is-wide" htmlFor={`${id}-note`}>
          <span>
            Note <small>(optional)</small>
          </span>
          <textarea
            id={`${id}-note`}
            className="st-select pb-textarea"
            value={values.note}
            onChange={set("note")}
            maxLength={PHRASE_NOTE_MAX}
            rows={2}
            dir="auto"
            disabled={busy}
          />
        </label>
        <label className="pb-field" htmlFor={`${id}-language`}>
          <span>Language</span>
          <select
            id={`${id}-language`}
            className="st-select"
            value={values.language}
            onChange={set("language")}
            disabled={busy}
          >
            <option value="">Not set</option>
            {languageOptions(values.language, languages).map((key) => (
              <option key={key} value={key}>
                {describeLanguage(key).name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pb-form-actions">
        {onCancel && (
          <button type="button" className="st-btn is-small" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="st-btn is-small is-teal" disabled={!canSubmit}>
          {busy ? busyLabel || submitLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
