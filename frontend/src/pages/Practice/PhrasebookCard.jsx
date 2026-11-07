import React from "react";
import { Link } from "react-router-dom";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { usePhrasebookSummary } from "../Phrasebook/api/phrasebook";

/** "Phrasebook · N due" on Practice: review link when cards are due, else open the phrasebook. */
export default function PhrasebookCard() {
  const { data, isLoading, isError } = usePhrasebookSummary();
  if (isLoading || isError || !data) return null;
  const { dueCount, totalCount } = data;
  const summary = dueCount
    ? `${dueCount} ${dueCount === 1 ? "phrase" : "phrases"} due for review`
    : totalCount
      ? `${totalCount} saved · all caught up`
      : "Save phrases and corrections from your chats";

  return (
    <section className="pr-phrasebook" aria-label="Phrasebook">
      <div className="pr-phrasebook-text">
        <MenuBookOutlinedIcon aria-hidden="true" />
        <div>
          <strong>Phrasebook{dueCount ? ` · ${dueCount} due` : ""}</strong>
          <span>{summary}</span>
        </div>
      </div>
      {dueCount ? (
        <Link to="/phrasebook/review" className="st-btn is-small is-teal">
          Review now
        </Link>
      ) : (
        <Link to="/phrasebook" className="st-btn is-small">
          Open phrasebook
        </Link>
      )}
    </section>
  );
}
