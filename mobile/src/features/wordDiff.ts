// Word-level diff between a message and a suggested correction (no RN imports; tested with node).

export type DiffSegmentType = "same" | "removed" | "added";

/** A run of consecutive words with the same status; words are joined by single spaces. */
export type DiffSegment = { type: DiffSegmentType; text: string };

/** Above this many LCS cells (after trimming the shared start/end) the middle is shown as replaced. */
const MAX_LCS_CELLS = 400_000;

/** Whitespace-separated words; punctuation stays attached ("dog." is one word). */
export function tokenizeWords(text: string | null | undefined): string[] {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function pushToken(segments: DiffSegment[], type: DiffSegmentType, word: string) {
  const last = segments[segments.length - 1];
  if (last && last.type === type) last.text = `${last.text} ${word}`;
  else segments.push({ type, text: word });
}

/**
 * Longest-common-subsequence diff over word tokens (case-sensitive, so capitalisation fixes show).
 * Within a changed region removed words come before added ones.
 */
export function diffWords(original: string | null | undefined, corrected: string | null | undefined): DiffSegment[] {
  const a = tokenizeWords(original);
  const b = tokenizeWords(corrected);
  const segments: DiffSegment[] = [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  for (let i = 0; i < start; i += 1) pushToken(segments, "same", a[i]);

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  if (n && m && (n + 1) * (m + 1) <= MAX_LCS_CELLS) {
    // lcs[i][j] = LCS length of midA[i..] and midB[j..] (flat table, row-major).
    const width = m + 1;
    const lcs = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * width + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * width + j + 1] + 1
            : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    const removed: string[] = [];
    const added: string[] = [];
    const flush = () => {
      removed.forEach((word) => pushToken(segments, "removed", word));
      added.forEach((word) => pushToken(segments, "added", word));
      removed.length = 0;
      added.length = 0;
    };
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        flush();
        pushToken(segments, "same", midA[i]);
        i += 1;
        j += 1;
      } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
        removed.push(midA[i]);
        i += 1;
      } else {
        added.push(midB[j]);
        j += 1;
      }
    }
    while (i < n) removed.push(midA[i++]);
    while (j < m) added.push(midB[j++]);
    flush();
  } else {
    midA.forEach((word) => pushToken(segments, "removed", word));
    midB.forEach((word) => pushToken(segments, "added", word));
  }

  for (let i = endA; i < a.length; i += 1) pushToken(segments, "same", a[i]);
  return segments;
}

/** True when the correction changes at least one word. */
export function hasWordChanges(segments: DiffSegment[]): boolean {
  return segments.some((segment) => segment.type !== "same");
}

/**
 * Screen-reader summary of the changes, e.g. `"goed" changed to "went"; added "the"`.
 * Empty when nothing changed.
 */
export function describeWordDiff(segments: DiffSegment[]): string {
  const parts: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.type === "removed") {
      const next = segments[index + 1];
      if (next && next.type === "added") {
        parts.push(`"${segment.text}" changed to "${next.text}"`);
        index += 1;
      } else {
        parts.push(`removed "${segment.text}"`);
      }
    } else if (segment.type === "added") {
      parts.push(`added "${segment.text}"`);
    }
  }
  return parts.join("; ");
}
