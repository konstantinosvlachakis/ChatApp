import { BLANK, blankPhrase, formatRelativeTime, languageLabel, reviewPrompt, sourceLabel } from "./phrasebookUtils";

const entry = (overrides: Partial<{ text: string; meaning: string; context: string; note: string }> = {}) => ({
  text: "me gustaría",
  meaning: "",
  context: "",
  note: "",
  ...overrides,
});

describe("reviewPrompt", () => {
  it("prefers the meaning", () => {
    expect(reviewPrompt(entry({ meaning: "I would like", context: "Me gustaría un café" }))).toEqual({
      kind: "meaning",
      text: "I would like",
    });
  });

  it("blanks the phrase in its context when there is no meaning", () => {
    expect(reviewPrompt(entry({ context: "Me gustaría un café, por favor" }))).toEqual({
      kind: "context",
      text: `${BLANK} un café, por favor`,
    });
  });

  it("falls back to the note, then a generic prompt", () => {
    expect(reviewPrompt(entry({ context: "Otra frase", note: "polite request" }))).toEqual({
      kind: "note",
      text: "polite request",
    });
    expect(reviewPrompt(entry())).toEqual({ kind: "recall", text: "Recall this phrase" });
  });
});

describe("blankPhrase", () => {
  it("escapes regex characters and ignores case", () => {
    expect(blankPhrase("What? (really)", "(REALLY)")).toBe(`What? ${BLANK}`);
    expect(blankPhrase("No match here", "zzz")).toBeNull();
    expect(blankPhrase("", "x")).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");

  it("formats future and past times", () => {
    expect(formatRelativeTime("2026-11-07T15:00:00Z", now)).toMatch(/3 hours/);
    expect(formatRelativeTime("2026-11-07T12:00:20Z", now)).toBe("now");
    expect(formatRelativeTime("2026-11-07T11:50:00Z", now)).toMatch(/10 minutes ago/);
    expect(formatRelativeTime("2026-11-21T12:00:00Z", now)).toMatch(/2 weeks/);
  });

  it("returns an empty string for missing or invalid dates", () => {
    expect(formatRelativeTime(null, now)).toBe("");
    expect(formatRelativeTime("not a date", now)).toBe("");
  });
});

describe("labels", () => {
  it("names sources and languages", () => {
    expect(sourceLabel("correction")).toBe("Correction");
    expect(sourceLabel("weird")).toBe("Saved");
    expect(languageLabel("spanish")).toBe("Spanish");
    expect(languageLabel("")).toBe("");
  });
});
