import React, { useEffect, useId, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { languageLabel } from "./ExchangeProfileCard";

export const LEVEL_OPTIONS = ["", "beginner", "intermediate", "advanced", "fluent"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Applied filters; the sheet edits a draft and only applies on "Show people". */
  nativeFilter: string;
  level: string;
  languageOptions: string[];
  /** Viewer's native language: the level filter is "their <viewer language> level". */
  viewerLanguage: string;
  onApply: (next: { nativeFilter: string; level: string }) => void;
  onReset: () => void;
}

/**
 * Phone filter sheet ("Find your exchange"). Uses a native <dialog> opened with showModal(),
 * which makes the rest of the page inert (focus stays inside) and closes on Escape.
 */
export default function FilterSheet({ open, onClose, nativeFilter, level, languageOptions, viewerLanguage, onApply, onReset }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draftNative, setDraftNative] = useState(nativeFilter);
  const [draftLevel, setDraftLevel] = useState(level);
  const titleId = useId();
  const selectId = useId();
  const levelLabelId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setDraftNative(nativeFilter);
      setDraftLevel(level);
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    // Only re-sync the draft when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const levelLabel = viewerLanguage ? `Their ${languageLabel(viewerLanguage)} level` : "Their practice level";

  return (
    <dialog
      ref={dialogRef}
      className="people-sheet"
      aria-labelledby={titleId}
      // Escape fires "cancel"; keep React state in sync instead of letting the dialog close itself.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="people-sheet-body">
        <span className="people-sheet-handle" aria-hidden="true" />
        <div className="people-sheet-heading">
          <h2 id={titleId}>Find your exchange</h2>
          <button type="button" className="people-sheet-close" onClick={onClose} aria-label="Close filters">
            <CloseRoundedIcon />
          </button>
        </div>
        <label htmlFor={selectId} className="people-sheet-label">Their native language</label>
        <select id={selectId} className="people-sheet-select" value={draftNative} onChange={(event) => setDraftNative(event.target.value)}>
          <option value="">All languages</option>
          {languageOptions.map((language) => <option key={language} value={language}>{languageLabel(language)}</option>)}
        </select>
        <p id={levelLabelId} className="people-sheet-label">{levelLabel}</p>
        <div className="people-sheet-levels" role="group" aria-labelledby={levelLabelId}>
          {LEVEL_OPTIONS.map((entry) => (
            <button
              key={entry || "any"}
              type="button"
              aria-pressed={draftLevel === entry}
              disabled={!viewerLanguage && entry !== ""}
              onClick={() => setDraftLevel(entry)}
            >
              {entry ? languageLabel(entry) : "Any"}
            </button>
          ))}
        </div>
        {!viewerLanguage && <p className="people-sheet-note">Add your native language to filter by level.</p>}
        <button type="button" className="people-button people-button-primary people-sheet-apply" onClick={() => onApply({ nativeFilter: draftNative, level: draftLevel })}>
          Show people <ArrowForwardRoundedIcon fontSize="small" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="people-text-button people-sheet-reset"
          onClick={() => {
            setDraftNative("");
            setDraftLevel("");
            onReset();
          }}
        >
          Reset filters
        </button>
      </div>
    </dialog>
  );
}
