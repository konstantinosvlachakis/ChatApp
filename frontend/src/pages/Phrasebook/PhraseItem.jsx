import React, { useState } from "react";
import { Link } from "react-router-dom";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PhraseForm from "./PhraseForm";
import { formatRelativeTime, languageLabel, sourceLabel } from "./phrasebookUtils";

const dueLabel = (entry, now) => {
  if (!entry.review_count) return "New";
  const due = new Date(entry.due_at).getTime();
  if (Number.isNaN(due)) return "";
  return due <= now ? "Due now" : `Next review ${formatRelativeTime(entry.due_at, now)}`;
};

/** One phrasebook entry with inline edit; Delete asks the page to confirm. */
export default function PhraseItem({ entry, languages, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const language = languageLabel(entry.language);
  const status = dueLabel(entry, Date.now());

  if (editing) {
    return (
      <li className="pf-card pb-entry is-editing">
        <h3 className="lv-visually-hidden">Edit “{entry.text}”</h3>
        <PhraseForm
          initial={entry}
          languages={languages}
          submitLabel="Save changes"
          busyLabel="Saving…"
          busy={saving}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            setSaving(true);
            const ok = await onSave(entry.id, values);
            setSaving(false);
            if (ok) setEditing(false);
          }}
        />
        {entry.context && (
          <p className="pb-context" dir="auto">
            from: “{entry.context}”
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="pf-card pb-entry">
      <div className="pb-entry-top">
        <p className="pb-entry-text" dir="auto">
          {entry.text}
        </p>
        <span className={`pb-badge is-${entry.source}`}>{sourceLabel(entry.source)}</span>
        {language && <span className="pb-lang">{language}</span>}
      </div>
      {entry.meaning && (
        <p className="pb-meaning" dir="auto">
          {entry.meaning}
        </p>
      )}
      {entry.context && (
        <p className="pb-context" dir="auto">
          from: “{entry.context}”
          {entry.source_conversation_id ? (
            <>
              {" "}
              <Link to={`/conversations/${entry.source_conversation_id}`} className="pb-link">
                Open chat
              </Link>
            </>
          ) : null}
        </p>
      )}
      {entry.note && (
        <p className="pb-note" dir="auto">
          {entry.note}
        </p>
      )}
      <div className="pb-entry-foot">
        {status && <span className="pb-due-label">{status}</span>}
        <span className="pb-row">
          <button
            type="button"
            className="st-btn is-small"
            onClick={() => setEditing(true)}
            aria-label={`Edit “${entry.text}”`}
          >
            <EditOutlinedIcon aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            className="st-btn is-small is-danger-outline"
            onClick={() => onDelete(entry)}
            aria-label={`Delete “${entry.text}”`}
          >
            <DeleteOutlineRoundedIcon aria-hidden="true" />
            Delete
          </button>
        </span>
      </div>
    </li>
  );
}
