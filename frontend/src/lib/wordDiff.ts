/**
 * Dependency-free word diff for partner corrections: LCS over word / punctuation tokens.
 *
 * `diffWords(original, corrected)` returns segments in reading order. Each segment carries
 * the whitespace that precedes it (`space`, rendered outside any <del>/<ins> mark so spaces
 * are never struck through) and its `text`. Unchanged text keeps the corrected sentence's
 * spacing; removed text keeps the original's. Removals come before additions at a change.
 */
export type DiffSegmentType = "equal" | "removed" | "added";

export type DiffSegment = {
  type: DiffSegmentType;
  /** Whitespace before the segment (outside the mark). */
  space: string;
  text: string;
};

type Token = { text: string; space: string };

// Words (letters, digits, marks, inner apostrophes/hyphens) or a single other character.
// Built with the RegExp constructor so the `u` flag works with every TS target.
const TOKEN_PATTERN = "(\\s*)([\\p{L}\\p{N}\\p{M}]+(?:['’\\-][\\p{L}\\p{N}\\p{M}]+)*|[^\\s])";

/** Split text into tokens with their leading whitespace (trailing whitespace is dropped). */
export const tokenize = (value: string): Token[] => {
  const text = String(value ?? "");
  const pattern = new RegExp(TOKEN_PATTERN, "gu");
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ space: match[1], text: match[2] });
  }
  return tokens;
};

// Above this many LCS cells, fall back to "all removed, all added" (keeps the UI responsive).
const MAX_CELLS = 2_000_000;

const pushSegment = (segments: DiffSegment[], type: DiffSegmentType, token: Token) => {
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    last.text += token.space + token.text;
  } else {
    segments.push({ type, space: token.space, text: token.text });
  }
};

/** Word-level diff of `original` → `corrected`. */
export const diffWords = (original: string, corrected: string): DiffSegment[] => {
  const before = tokenize(original);
  const after = tokenize(corrected);
  const segments: DiffSegment[] = [];

  // Common prefix / suffix first: most corrections touch a few words.
  let start = 0;
  while (start < before.length && start < after.length && before[start].text === after[start].text) {
    start += 1;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1].text === after[endAfter - 1].text) {
    endBefore -= 1;
    endAfter -= 1;
  }

  for (let i = 0; i < start; i += 1) pushSegment(segments, "equal", after[i]);

  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const n = a.length;
  const m = b.length;

  if (n && m && (n + 1) * (m + 1) <= MAX_CELLS) {
    // lengths[i][j] = LCS of a[i:] and b[j:]
    const width = m + 1;
    const lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lengths[i * width + j] =
          a[i].text === b[j].text
            ? lengths[(i + 1) * width + j + 1] + 1
            : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i].text === b[j].text) {
        pushSegment(segments, "equal", b[j]);
        i += 1;
        j += 1;
      } else if (j >= m || (i < n && lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
        pushSegment(segments, "removed", a[i]);
        i += 1;
      } else {
        pushSegment(segments, "added", b[j]);
        j += 1;
      }
    }
  } else {
    a.forEach((token) => pushSegment(segments, "removed", token));
    b.forEach((token) => pushSegment(segments, "added", token));
  }

  for (let k = endAfter; k < after.length; k += 1) pushSegment(segments, "equal", after[k]);

  // A run that starts the text has no space to keep before it.
  if (segments[0]) segments[0].space = "";
  return segments;
};

/** True when the diff has at least one removed or added segment. */
export const hasWordChanges = (segments: DiffSegment[]) => segments.some((segment) => segment.type !== "equal");
