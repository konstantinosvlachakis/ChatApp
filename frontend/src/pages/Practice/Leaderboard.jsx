import React from "react";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { DEFAULT_AVATAR_URL, handleAvatarError } from "../../constants/avatar";
import { avatarImage } from "../../lib/media";

const AVATAR_SIZE = 40;

// Leaderboard entries are {rank, username, points, level, xp, is_current_user}; they carry no image
// today, so the default avatar is used unless a future payload adds profile_image_url.
const entryAvatar = (entry) =>
  entry.profile_image_url ? avatarImage(entry.profile_image_url, AVATAR_SIZE) : DEFAULT_AVATAR_URL;

const Leaderboard = ({ entries, currentRank }) => (
  <aside className="pf-card pr-board" aria-labelledby="pr-board-title">
    <div className="pr-board-head">
      <h2 id="pr-board-title" className="pf-card-title">
        <EmojiEventsRoundedIcon aria-hidden="true" />
        Leaderboard
      </h2>
      {currentRank ? <span className="pr-rank">You're #{currentRank}</span> : null}
    </div>
    {entries.length ? (
      <ol className="pr-board-list">
        {entries.map((entry) => (
          <li
            key={`${entry.rank}-${entry.username}`}
            className={`pr-board-row${entry.is_current_user ? " is-you" : ""}`}
            aria-current={entry.is_current_user ? "true" : undefined}
          >
            <span className={`pr-board-place${entry.rank <= 3 ? ` is-top-${entry.rank}` : ""}`}>
              <span className="lv-visually-hidden">Rank </span>
              {entry.rank}
            </span>
            <img
              className="pr-board-avatar"
              src={entryAvatar(entry)}
              alt=""
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              loading="lazy"
              onError={handleAvatarError}
            />
            <span className="pr-board-name">
              <strong>{entry.username}</strong>
              <small>Level {entry.level}</small>
            </span>
            {entry.is_current_user ? <span className="pr-you">You</span> : null}
            <span className="pr-board-points">
              {entry.points}
              <small> pts</small>
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="pr-empty">No scores yet. Answer a challenge to get on the board.</p>
    )}
  </aside>
);

export default Leaderboard;
