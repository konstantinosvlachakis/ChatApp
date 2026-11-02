// Per-language practice difficulty copy (server `progress`). Mirrors web
// `frontend/src/pages/Practice/practiceUtils.js` (progressTitle / progressSummary / levelChangeMessage).
import type { PracticeLanguageProgress } from "../services/api/practice";

const titleCase = (value?: string) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

/** "Spanish · Everyday grammar" */
export function progressTitle(progress: PracticeLanguageProgress | null | undefined, language?: string) {
  const name = titleCase(progress?.language || language);
  return [name, progress?.bucket_label || ""].filter(Boolean).join(" · ");
}

/** "12/15 sentences · 85% accuracy · 3 more to level up" (or the top-level / keep-accuracy variants). */
export function progressSummary(progress: PracticeLanguageProgress | null | undefined) {
  if (!progress) return "";
  const accuracy =
    typeof progress.window_accuracy === "number" ? Math.round(progress.window_accuracy * 100) : null;
  const accuracyText = accuracy === null ? null : `${accuracy}% accuracy`;
  const needed = progress.needed_for_promotion;
  if (!progress.can_promote || !needed) {
    return ["Top level", accuracyText].filter(Boolean).join(" · ");
  }
  const minAttempts = needed.min_attempts || 0;
  const attempts = Math.min(progress.attempts_in_bucket || 0, minAttempts);
  const target = Math.round((needed.accuracy_target || 0) * 100);
  const remaining = needed.attempts_remaining || 0;
  const belowTarget = accuracy !== null && accuracy < target;
  let next: string;
  if (remaining > 0) {
    next = belowTarget
      ? `${remaining} more at ≥ ${target}% accuracy to level up`
      : `${remaining} more to level up`;
  } else {
    next = `Keep accuracy ≥ ${target}% to level up`;
  }
  return [`${attempts}/${minAttempts} sentences`, accuracyText, next].filter(Boolean).join(" · ");
}

/** 0-100 of the attempts needed before a promotion can happen (100 at the top level). */
export function progressPercent(progress: PracticeLanguageProgress | null | undefined) {
  const minAttempts = progress?.needed_for_promotion?.min_attempts || 0;
  if (!progress || !minAttempts) return 100;
  return Math.round((Math.min(progress.attempts_in_bucket || 0, minAttempts) / minAttempts) * 100);
}

export type LevelChangeMessage = { tone: "good" | "calm"; title: string; text: string };

/** Banner copy for the submit that moved the bucket; null otherwise. */
export function levelChangeMessage(
  progress: PracticeLanguageProgress | null | undefined
): LevelChangeMessage | null {
  if (!progress?.change) return null;
  const name = titleCase(progress.language);
  if (progress.change === "promoted") {
    return { tone: "good", title: "Level up!", text: `${name} → ${progress.bucket_label}` };
  }
  if (progress.change === "demoted") {
    return {
      tone: "calm",
      title: "Let's build a stronger base",
      text: `Let's practise ${progress.bucket_label} a bit more.`,
    };
  }
  return null;
}
