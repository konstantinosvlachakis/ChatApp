import { diffWords, hasWordChanges, tokenize } from "./wordDiff";

// Rebuild either side of the diff from its segments.
const side = (segments: ReturnType<typeof diffWords>, drop: "removed" | "added") =>
  segments
    .filter((segment) => segment.type !== drop)
    .map((segment) => segment.space + segment.text)
    .join("");

describe("tokenize", () => {
  it("splits words and punctuation and keeps the leading spaces", () => {
    expect(tokenize("Hola, ¿qué tal?")).toEqual([
      { space: "", text: "Hola" },
      { space: "", text: "," },
      { space: " ", text: "¿" },
      { space: "", text: "qué" },
      { space: " ", text: "tal" },
      { space: "", text: "?" },
    ]);
  });

  it("keeps contractions and hyphenated words whole", () => {
    expect(tokenize("I don't well-known").map((token) => token.text)).toEqual(["I", "don't", "well-known"]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks a replaced word as removed then added", () => {
    expect(diffWords("I goed home", "I went home")).toEqual([
      { type: "equal", space: "", text: "I" },
      { type: "removed", space: " ", text: "goed" },
      { type: "added", space: " ", text: "went" },
      { type: "equal", space: " ", text: "home" },
    ]);
  });

  it("returns a single equal segment for identical text", () => {
    const segments = diffWords("Same text.", "Same text.");
    expect(segments).toEqual([{ type: "equal", space: "", text: "Same text." }]);
    expect(hasWordChanges(segments)).toBe(false);
  });

  it("diffs punctuation without touching neighbouring words", () => {
    const segments = diffWords("Hello world", "Hello, world!");
    expect(segments).toEqual([
      { type: "equal", space: "", text: "Hello" },
      { type: "added", space: "", text: "," },
      { type: "equal", space: " ", text: "world" },
      { type: "added", space: "", text: "!" },
    ]);
  });

  it("groups runs of changes and rebuilds both sentences", () => {
    const original = "Yesterday I have go to the cinema with my friends";
    const corrected = "Yesterday I went to the cinema with friends";
    const segments = diffWords(original, corrected);
    expect(side(segments, "added")).toBe(original);
    expect(side(segments, "removed")).toBe(corrected);
    expect(segments.filter((segment) => segment.type === "removed").map((segment) => segment.text)).toEqual([
      "have go",
      "my",
    ]);
    expect(segments.filter((segment) => segment.type === "added").map((segment) => segment.text)).toEqual(["went"]);
  });

  it("treats a case change as a change", () => {
    const segments = diffWords("i am here", "I am here");
    expect(segments[0]).toEqual({ type: "removed", space: "", text: "i" });
    expect(segments[1]).toEqual({ type: "added", space: "", text: "I" });
    expect(segments[2]).toEqual({ type: "equal", space: " ", text: "am here" });
  });

  it("handles empty sides", () => {
    expect(diffWords("", "New text")).toEqual([{ type: "added", space: "", text: "New text" }]);
    expect(diffWords("Old text", "")).toEqual([{ type: "removed", space: "", text: "Old text" }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("works with non-Latin scripts", () => {
    const segments = diffWords("Θέλω πάω σπίτι", "Θέλω να πάω σπίτι");
    expect(segments).toEqual([
      { type: "equal", space: "", text: "Θέλω" },
      { type: "added", space: " ", text: "να" },
      { type: "equal", space: " ", text: "πάω σπίτι" },
    ]);
  });
});
