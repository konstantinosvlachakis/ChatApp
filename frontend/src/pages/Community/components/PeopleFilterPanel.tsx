import React, { useEffect, useId, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { languageLabel } from "./ExchangeProfileCard";
import {
  DEFAULT_PANEL_FILTERS,
  INCLUDE_GROUPS,
  INCLUDE_LABELS,
  LEVEL_FILTER_OPTIONS,
  SORT_OPTIONS,
  PanelFilters,
  isLanguageOn,
  toggleLanguage,
} from "../utils/peopleQuery";

const COUNT_DEBOUNCE_MS = 250;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Applied filters; the panel edits a draft and applies it on "Show N people". */
  filters: PanelFilters;
  /** Languages the viewer is learning ("They speak" chips). */
  theySpeakOptions: string[];
  /** Languages the viewer speaks ("They're learning" chips). */
  theyLearnOptions: string[];
  onApply: (next: PanelFilters) => void;
  /** People matching a draft (both sections), or null when unknown. Aborted on change. */
  countFor: (draft: PanelFilters, signal: AbortSignal) => Promise<number | null>;
}

/**
 * People filters (mockup F): a right side sheet on desktop, a bottom sheet on phones
 * (community.css). A native <dialog> opened with showModal() makes the page inert (focus
 * stays inside) and closes on Escape; focus returns to the opener on close.
 */
export default function PeopleFilterPanel({ open, onClose, filters, theySpeakOptions, theyLearnOptions, onApply, countFor }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<PanelFilters>(filters);
  const [count, setCount] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      setDraft(filters);
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      openerRef.current?.focus?.();
    }
    // Only re-sync the draft when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // "Show N people": the API's total for the draft, debounced.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCount(null);
    const timer = window.setTimeout(() => {
      countFor(draft, controller.signal)
        .then((total) => {
          if (!controller.signal.aborted) setCount(total);
        })
        .catch(() => {});
    }, COUNT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, draft, countFor]);

  const update = (patch: Partial<PanelFilters>) => setDraft((current) => ({ ...current, ...patch }));
  const showLabel = count === null ? "Show people" : `Show ${count} ${count === 1 ? "person" : "people"}`;

  return (
    <dialog
      ref={dialogRef}
      className="people-panel"
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
      onKeyDown={(event) => {
        // Tab trap: wrap between the first and last control (showModal already makes the page inert).
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="people-panel-body">
        <span className="people-sheet-handle" aria-hidden="true" />
        <div className="people-panel-heading">
          <h2 id={titleId}>Filters</h2>
          <button type="button" className="people-sheet-close" onClick={onClose} aria-label="Close filters">
            <CloseRoundedIcon />
          </button>
        </div>
        <div className="people-panel-scroll">
          {theySpeakOptions.length > 0 && (
            <fieldset className="people-panel-group">
              <legend>They speak</legend>
              <div className="people-chip-row">
                {theySpeakOptions.map((language) => (
                  <button
                    key={language}
                    type="button"
                    className="people-chip"
                    aria-pressed={isLanguageOn(draft.theySpeak, language)}
                    onClick={() => update({ theySpeak: toggleLanguage(draft.theySpeak, language, theySpeakOptions) })}
                  >
                    {languageLabel(language)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {theyLearnOptions.length > 0 && (
            <fieldset className="people-panel-group">
              <legend>They're learning</legend>
              <div className="people-chip-row">
                {theyLearnOptions.map((language) => (
                  <button
                    key={language}
                    type="button"
                    className="people-chip"
                    aria-pressed={isLanguageOn(draft.theyLearn, language)}
                    onClick={() => update({ theyLearn: toggleLanguage(draft.theyLearn, language, theyLearnOptions) })}
                  >
                    {languageLabel(language)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="people-panel-group">
            <legend>Their level in your language</legend>
            <div className="people-chip-row">
              {LEVEL_FILTER_OPTIONS.map((option) => (
                <button key={option.value || "any"} type="button" className="people-chip" aria-pressed={draft.level === option.value} onClick={() => update({ level: option.value })}>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="people-panel-group">
            <legend>In “More people”, include</legend>
            <div className="people-switch-list">
              {INCLUDE_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="switch"
                  className="people-switch"
                  aria-checked={draft.include[group]}
                  onClick={() => update({ include: { ...draft.include, [group]: !draft.include[group] } })}
                >
                  <span>{INCLUDE_LABELS[group]}</span>
                  <span className="people-switch-track" aria-hidden="true"><span /></span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="people-panel-group">
            <legend>Sort by</legend>
            <div className="people-chip-row">
              {SORT_OPTIONS.map((option) => (
                <button key={option.value} type="button" className="people-chip" aria-pressed={draft.sort === option.value} onClick={() => update({ sort: option.value })}>
                  {option.label}
                </button>
              ))}
            </div>
            <p className="people-panel-note">Perfect exchanges always show your best fit first.</p>
          </fieldset>
        </div>
        <div className="people-panel-footer">
          <button type="button" className="people-button people-button-secondary" onClick={() => setDraft(DEFAULT_PANEL_FILTERS)}>
            Reset
          </button>
          <button type="button" className="people-button people-button-primary people-panel-apply" onClick={() => onApply(draft)}>
            {showLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
