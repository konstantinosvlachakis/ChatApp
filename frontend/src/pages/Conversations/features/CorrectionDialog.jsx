import React, { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { getErrorMessage } from "../../../lib/api";
import { diffWords, hasWordChanges } from "../../../lib/wordDiff";
import { CORRECTION_MAX_LENGTH, CORRECTION_NOTE_MAX_LENGTH } from "../api/corrections";
import WordDiff from "./WordDiff";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * "Suggest a correction" on a native <dialog> (showModal: page behind inert, Escape/backdrop
 * close, Tab trap, focus returns to the opener), like Settings' ConfirmDialog.
 * `existing` is the caller's own correction (edit mode, offers "Remove my correction").
 */
export default function CorrectionDialog({ message, existing, authorName, returnFocus, onSubmit, onRemove, onClose }) {
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const titleId = useId();
  const original = String(message?.text || "");
  const [text, setText] = useState(existing?.corrected_text || original);
  const [note, setNote] = useState(existing?.note || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    // The menu item that opened it is gone by now; fall back to the message's actions button.
    const returnTarget = returnFocus?.isConnected ? returnFocus : document.activeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const field = textareaRef.current;
    if (field) {
      field.focus();
      field.setSelectionRange?.(field.value.length, field.value.length);
    }
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (returnTarget && typeof returnTarget.focus === "function" && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
    // Mount-only: the dialog opens once per message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deferredText = useDeferredValue(text);
  const segments = useMemo(() => diffWords(original, deferredText), [original, deferredText]);
  const trimmed = text.trim();
  const unchanged = trimmed === original.trim();
  const sameAsSaved = Boolean(existing) && trimmed === (existing.corrected_text || "").trim() && note.trim() === (existing.note || "").trim();
  const tooLong = text.length > CORRECTION_MAX_LENGTH;
  const canSave = !busy && Boolean(trimmed) && !unchanged && !tooLong && !sameAsSaved;

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setBusy("save");
    setError("");
    try {
      await onSubmit(trimmed, note.trim());
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send your correction."));
      setBusy("");
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy("remove");
    setError("");
    try {
      await onRemove();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove your correction."));
      setBusy("");
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const hint = !trimmed
    ? "Write the corrected sentence."
    : unchanged
      ? "Change something to suggest a correction."
      : tooLong
        ? `Keep it under ${CORRECTION_MAX_LENGTH} characters.`
        : "";

  return (
    <dialog
      ref={dialogRef}
      className="cv-correct-dialog"
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
          <h2 id={titleId}>{existing ? "Edit your correction" : "Suggest a correction"}</h2>
          <button type="button" className="cv-correct-close" onClick={close} aria-label="Close" disabled={Boolean(busy)}>
            <CloseRoundedIcon aria-hidden="true" />
          </button>
        </div>

        <div className="cv-correct-original">
          <span className="cv-correct-label">{authorName ? `${authorName} wrote` : "Original"}</span>
          <p dir="auto">{original}</p>
        </div>

        <label className="cv-correct-label" htmlFor={`${titleId}-text`}>
          Corrected sentence
        </label>
        <textarea
          id={`${titleId}-text`}
          ref={textareaRef}
          className="cv-correct-input"
          value={text}
          rows={3}
          dir="auto"
          maxLength={CORRECTION_MAX_LENGTH + 1}
          onChange={(event) => {
            setText(event.target.value);
            setError("");
          }}
          disabled={Boolean(busy)}
          aria-describedby={`${titleId}-preview`}
        />

        <label className="cv-correct-label" htmlFor={`${titleId}-note`}>
          Why? <span className="cv-correct-optional">(optional)</span>
        </label>
        <textarea
          id={`${titleId}-note`}
          className="cv-correct-input is-note"
          value={note}
          rows={2}
          dir="auto"
          maxLength={CORRECTION_NOTE_MAX_LENGTH}
          placeholder="e.g. the past tense of “go” is “went”"
          onChange={(event) => {
            setNote(event.target.value);
            setError("");
          }}
          disabled={Boolean(busy)}
        />
        <span className="cv-correct-count" aria-live="polite">
          {note.length}/{CORRECTION_NOTE_MAX_LENGTH}
        </span>

        <div id={`${titleId}-preview`} className="cv-correct-preview">
          <span className="cv-correct-label">Preview</span>
          {trimmed && hasWordChanges(segments) ? (
            <p dir="auto">
              <WordDiff segments={segments} />
            </p>
          ) : (
            <p className="cv-correct-hint">{hint || "No changes yet."}</p>
          )}
        </div>

        {error && (
          <p className="cv-correct-error" role="alert">
            {error}
          </p>
        )}

        <div className="cv-correct-actions">
          {existing && onRemove && (
            <button type="button" className="cv-correct-btn is-danger" onClick={remove} disabled={Boolean(busy)}>
              {busy === "remove" ? "Removing…" : "Remove my correction"}
            </button>
          )}
          <span className="cv-correct-spacer" />
          <button type="button" className="cv-correct-btn" onClick={close} disabled={Boolean(busy)}>
            Cancel
          </button>
          <button type="submit" className="cv-correct-btn is-teal" disabled={!canSave}>
            {busy === "save" ? "Saving…" : existing ? "Update" : "Send correction"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
