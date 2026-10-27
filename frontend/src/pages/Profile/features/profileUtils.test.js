import { describeLanguage, exchangeMatch, formatViewedAt, levelFor, profileStrength } from "./profileUtils";

describe("profile utils", () => {
  test("describes languages with a code and an endonym only when it differs", () => {
    expect(describeLanguage("Greek")).toEqual({ key: "greek", name: "Greek", code: "GR", endonym: "Ελληνικά" });
    expect(describeLanguage("english").endonym).toBe("");
    expect(describeLanguage("Klingon")).toMatchObject({ name: "Klingon", code: "KL", endonym: "" });
  });

  test("reads levels case-insensitively and ignores unknown values", () => {
    const levels = { Spanish: "Intermediate", French: "expert" };
    expect(levelFor(levels, "spanish")).toBe("intermediate");
    expect(levelFor(levels, "French")).toBe("");
    expect(levelFor(undefined, "greek")).toBe("");
  });

  test("matches an exchange in both directions", () => {
    const me = { native_language: "Greek", languages_practicing: ["Spanish", "English"] };
    expect(exchangeMatch(me, { native_language: "spanish", languages_practicing: ["greek"] })).toEqual({
      teachesMe: true,
      learnsMine: true,
      reciprocal: true,
    });
    expect(exchangeMatch(me, { native_language: "French", languages_practicing: ["Greek"] })).toMatchObject({
      teachesMe: false,
      learnsMine: true,
      reciprocal: false,
    });
    expect(exchangeMatch(null, {}).reciprocal).toBe(false);
  });

  test("profile strength lists what is missing", () => {
    const strength = profileStrength({
      profile_image_url: "https://res.cloudinary.com/x/me.jpg",
      complementary_image_1_url: "https://res.cloudinary.com/x/2.jpg",
      bio: "Hi",
      learning_goal: "",
      languages_practicing: ["Spanish", "French"],
      practice_language_levels: { Spanish: "beginner" },
    });
    expect(strength.percent).toBe(50);
    expect(strength.todo.map((step) => step.label)).toEqual([
      "Add 1 more photo",
      "Share your learning goal",
      "Set your French level",
    ]);
    expect(profileStrength({}).todo).toHaveLength(6);
  });

  test("formats visit times relative to now", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(formatViewedAt("2026-10-27T11:59:40Z", now)).toBe("just now");
    expect(formatViewedAt("2026-10-27T10:00:00Z", now)).toBe("2h ago");
    expect(formatViewedAt("2026-10-26T09:00:00Z", now)).toBe("yesterday");
    expect(formatViewedAt("2026-10-23T12:00:00Z", now)).toBe("4 days ago");
    expect(formatViewedAt("nope", now)).toBe("");
  });
});
