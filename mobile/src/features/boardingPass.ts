// Pure helpers for the profile's language "boarding passes" (no RN imports; tested with node).

/** Airport-style code for a language: its first three letters, upper-cased ("spanish" -> "SPA"). */
export function routeCode(language?: string | null): string {
  const letters = String(language || "").replace(/[^A-Za-zÀ-ÿ]/g, "");
  return (letters.slice(0, 3) || "---").toUpperCase();
}

type ProgressLike = {
  bucket: number;
  max_bucket: number;
  bucket_label: string;
  attempts_in_bucket: number;
  window_accuracy: number | null;
  needed_for_promotion: { attempts_remaining: number; min_attempts: number; accuracy_target: number } | null;
};

export type PassProgress = {
  /** 0-1, how far along the route to the next practice level the plane is. */
  fraction: number;
  /** Short line under the route, e.g. "9/15 drills to the next level". */
  caption: string;
  /** Current practice level name, e.g. "Everyday grammar". */
  stage: string;
};

/**
 * Route progress from the per-language practice state. Promotion needs both enough drills and
 * enough accuracy, so a full bar with low accuracy says what's missing instead of "almost there".
 */
export function passProgress(progress: ProgressLike | null | undefined): PassProgress | null {
  if (!progress) return null;
  const stage = progress.bucket_label || `Level ${progress.bucket}`;
  const need = progress.needed_for_promotion;
  if (!need || progress.bucket >= progress.max_bucket) {
    return { fraction: 1, caption: "Top practice level reached", stage };
  }
  const total = Math.max(1, need.min_attempts);
  const done = Math.min(total, Math.max(0, progress.attempts_in_bucket));
  const accuracy = progress.window_accuracy;
  if (done >= total && accuracy !== null && accuracy < need.accuracy_target) {
    return {
      fraction: 0.9,
      caption: `Accuracy ${Math.round(accuracy * 100)}% · need ${Math.round(need.accuracy_target * 100)}%`,
      stage,
    };
  }
  return { fraction: done / total, caption: `${done}/${total} drills to the next level`, stage };
}

/** "1.2k" style count for the Board button. */
export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

/** Label of the main action: the partner count once known. */
export function boardLabel(partners: number | null | undefined): string {
  if (!partners || partners < 1) return "Find partners";
  return `Board · ${compactCount(partners)} ${partners === 1 ? "partner" : "partners"}`;
}

/**
 * Barcode bar widths for the stub, derived from the language so each pass looks different but
 * stays the same between renders.
 */
export function barcodeBars(seed: string, count = 18): number[] {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    bars.push(1 + (Math.abs(hash) % 3));
  }
  return bars;
}
