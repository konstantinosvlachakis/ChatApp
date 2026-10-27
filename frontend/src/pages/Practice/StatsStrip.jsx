import React from "react";
import LocalFireDepartmentRoundedIcon from "@mui/icons-material/LocalFireDepartmentRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import StarsRoundedIcon from "@mui/icons-material/StarsRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import { DAILY_SET_STEPS, XP_PER_LEVEL, levelProgressPercent } from "./practiceUtils";

const RING_RADIUS = 22;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** One compact strip: today's set, level + XP to next, points, accuracy (each shown once). */
const StatsStrip = ({ stats, todayCount }) => {
  const xp = stats?.xp || 0;
  const level = stats?.level || 1;
  const levelPercent = levelProgressPercent(xp);
  const xpToNext = XP_PER_LEVEL - (xp % XP_PER_LEVEL);
  const today = Math.min(DAILY_SET_STEPS, todayCount);
  const todayPercent = Math.round((today / DAILY_SET_STEPS) * 100);

  return (
    <section className="pr-strip" aria-label="Your progress">
      <div className="pr-stat is-today">
        <svg className="pr-ring" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="pr-ring-track" cx="26" cy="26" r={RING_RADIUS} />
          <circle
            className="pr-ring-fill"
            cx="26"
            cy="26"
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - todayPercent / 100)}
          />
        </svg>
        <LocalFireDepartmentRoundedIcon className="pr-ring-icon" aria-hidden="true" />
        <div className="pr-stat-text">
          <span className="pr-stat-label">Today</span>
          <strong className="pr-stat-value" aria-label={`${today} of ${DAILY_SET_STEPS} correct`}>
            {today}/{DAILY_SET_STEPS}
          </strong>
        </div>
      </div>

      <div className="pr-stat is-level">
        <div className="pr-stat-text">
          <span className="pr-stat-label">
            <BoltRoundedIcon aria-hidden="true" />
            Level
          </span>
          <strong className="pr-stat-value">{level}</strong>
        </div>
        <div className="pr-level-bar">
          <div
            className="pr-bar"
            role="progressbar"
            aria-label={`Progress to level ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={XP_PER_LEVEL}
            aria-valuenow={xp % XP_PER_LEVEL}
          >
            <span style={{ width: `${levelPercent}%` }} />
          </div>
          <small>
            {xpToNext} XP to level {level + 1}
          </small>
        </div>
      </div>

      <div className="pr-stat">
        <div className="pr-stat-text">
          <span className="pr-stat-label">
            <StarsRoundedIcon aria-hidden="true" />
            Points
          </span>
          <strong className="pr-stat-value">{stats?.points || 0}</strong>
        </div>
      </div>

      <div className="pr-stat">
        <div className="pr-stat-text">
          <span className="pr-stat-label">
            <TrackChangesRoundedIcon aria-hidden="true" />
            Accuracy
          </span>
          <strong className="pr-stat-value">{stats?.accuracy || 0}%</strong>
        </div>
      </div>
    </section>
  );
};

export default StatsStrip;
