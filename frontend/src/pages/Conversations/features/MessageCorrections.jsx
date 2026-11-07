import React, { useMemo, useState } from "react";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { diffWords } from "../../../lib/wordDiff";
import WordDiff from "./WordDiff";

// More than this many suggestions fold behind "Show N more" so busy chats stay quiet.
const VISIBLE_CORRECTIONS = 1;

const CorrectionCard = ({ msg, correction, isMine, correctorName, onSave, onEdit, onRemove }) => {
  const segments = useMemo(
    () => diffWords(msg.text || "", correction.corrected_text || ""),
    [msg.text, correction.corrected_text]
  );
  const [busy, setBusy] = useState("");
  const run = async (kind, action) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy("");
    }
  };
  const note = String(correction.note || "").trim();
  const who = isMine ? "You" : correctorName;

  return (
    <li className="cv-correction">
      <p className="cv-correction-head">
        <span aria-hidden="true">✎</span> <strong>{who}</strong> suggested
      </p>
      <p className="cv-correction-diff" dir="auto">
        <WordDiff segments={segments} />
      </p>
      {note && (
        <details className="cv-correction-why">
          <summary>Why?</summary>
          <p dir="auto">{note}</p>
        </details>
      )}
      <div className="cv-correction-actions">
        <button
          type="button"
          onClick={() => run("save", () => onSave(msg, correction))}
          disabled={Boolean(busy)}
          aria-label={`Save ${isMine ? "your" : `${correctorName}'s`} correction to your phrasebook`}
        >
          <BookmarkAddOutlinedIcon aria-hidden="true" />
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        {isMine && (
          <>
            <button type="button" onClick={() => onEdit(msg)} disabled={Boolean(busy)} aria-label="Edit your correction">
              <EditRoundedIcon aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => run("remove", () => onRemove(msg.id))}
              disabled={Boolean(busy)}
              aria-label="Remove your correction"
            >
              <DeleteOutlineRoundedIcon aria-hidden="true" />
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
      </div>
    </li>
  );
};

/** Compact correction cards under a chat bubble (one per corrector, oldest first). */
export default function MessageCorrections({ msg, userId, groupNicknames, onSave, onEdit, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const corrections = Array.isArray(msg.corrections) ? msg.corrections : [];
  if (!corrections.length) return null;
  const hidden = Math.max(0, corrections.length - VISIBLE_CORRECTIONS);
  const shown = expanded ? corrections : corrections.slice(0, VISIBLE_CORRECTIONS);

  return (
    <div className="cv-corrections">
      <ul aria-label={corrections.length === 1 ? "Correction" : `${corrections.length} corrections`}>
        {shown.map((correction) => (
          <CorrectionCard
            key={correction.id}
            msg={msg}
            correction={correction}
            isMine={correction.corrector?.id === userId}
            correctorName={groupNicknames?.[correction.corrector?.id] || correction.corrector?.username || "Someone"}
            onSave={onSave}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="cv-corrections-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show ${hidden} more ${hidden === 1 ? "suggestion" : "suggestions"}`}
        </button>
      )}
    </div>
  );
}
