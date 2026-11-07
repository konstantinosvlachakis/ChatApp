// Profile "boarding passes": one per language being learnt. Mirrors mobile
// src/features/boardingPass.ts (same codes, progress wording and level titles).
import { normalizeLanguage } from "./profileUtils";

/** Self-reported level -> seat (CEFR), gate title and the next title. Same as the mobile app. */
export const PASS_LEVELS = {
  beginner: { seat: "A2", gate: "Brave Beginner", next: "Conversation Surfer" },
  intermediate: { seat: "B1", gate: "Conversation Surfer", next: "Accent Adventurer" },
  advanced: { seat: "C1", gate: "Accent Adventurer", next: "Fluency Chaser" },
  fluent: { seat: "C2", gate: "Fluency Chaser", next: "Linguistic Master" },
};

export const passLevel = (level) => {
  const key = PASS_LEVELS[normalizeLanguage(level)] ? normalizeLanguage(level) : "beginner";
  return { key, ...PASS_LEVELS[key] };
};

/** Airport-style code: the language's first three letters ("spanish" -> "SPA"). */
export const routeCode = (language) => {
  const letters = String(language || "").replace(/[^A-Za-zÀ-ÿ]/g, "");
  return (letters.slice(0, 3) || "---").toUpperCase();
};

/**
 * Route progress from `/api/practice/state/` `progress`: drills toward the next practice level,
 * or the accuracy still needed, or the top level. null without progress.
 */
export const passProgress = (progress) => {
  if (!progress) return null;
  const stage = progress.bucket_label || `Level ${progress.bucket}`;
  const need = progress.needed_for_promotion;
  if (!need || progress.bucket >= progress.max_bucket) {
    return { fraction: 1, caption: "Top practice level reached", stage };
  }
  const total = Math.max(1, need.min_attempts);
  const done = Math.min(total, Math.max(0, progress.attempts_in_bucket));
  const accuracy = progress.window_accuracy;
  if (done >= total && accuracy !== null && accuracy !== undefined && accuracy < need.accuracy_target) {
    return {
      fraction: 0.9,
      caption: `Accuracy ${Math.round(accuracy * 100)}% · need ${Math.round(need.accuracy_target * 100)}%`,
      stage,
    };
  }
  return { fraction: done / total, caption: `${done}/${total} drills to the next level`, stage };
};

export const compactCount = (value) => {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
};

export const boardLabel = (partners) => {
  if (!partners || partners < 1) return "Find partners";
  return `Board · ${compactCount(partners)} ${partners === 1 ? "partner" : "partners"}`;
};

/** Stable pseudo-random bar widths (1-3px) so every pass has its own barcode. */
export const barcodeBars = (seed, count = 22) => {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bars = [];
  for (let index = 0; index < count; index += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    bars.push(1 + (Math.abs(hash) % 3));
  }
  return bars;
};

// Flags live with the language catalogue (asset-free, so sign-up can use them too).
export { flagUrl } from "../../../constants/languages";
