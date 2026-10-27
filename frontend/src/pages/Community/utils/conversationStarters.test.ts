import { buildConversationStarters, buildMatchFacts, StarterProfile } from "./conversationStarters";

const base: StarterProfile = {
  username: "lucia",
  nativeLanguage: "spanish",
  languagesPracticing: ["English", "french"],
  practiceLanguageLevels: { English: "intermediate" },
  learningGoal: "",
  match: { teachesMe: true, learnsMine: true, reciprocal: true },
};

describe("buildConversationStarters", () => {
  test("uses the goal, the viewer's language and their native language (max 3)", () => {
    const starters = buildConversationStarters({ ...base, learningGoal: "Order coffee in London without panicking." }, "english");
    expect(starters).toEqual([
      "I saw your goal: “Order coffee in London without panicking”. How can I help?",
      "I'm a native English speaker. Want to practice together?",
      "What's a Spanish phrase you use every day?",
    ]);
  });

  test("falls back to the language they practice and a general opener", () => {
    const starters = buildConversationStarters({ ...base, match: undefined }, "german");
    expect(starters).toEqual([
      "How long have you been learning English?",
      "What's a Spanish phrase you use every day?",
      "What got you into language exchange?",
    ]);
  });

  test("shortens long goals on a word boundary and still returns at least two starters", () => {
    const goal = "Prepare for a job interview in Madrid and talk confidently about my work in software engineering";
    const [first] = buildConversationStarters({ ...base, learningGoal: goal }, "english");
    expect(first).toBe("I saw your goal: “Prepare for a job interview in Madrid and talk confidently…”. How can I help?");
    expect(buildConversationStarters({ ...base, nativeLanguage: "", languagesPracticing: [] }).length).toBeGreaterThanOrEqual(1);
    expect(buildConversationStarters({ ...base, learningGoal: "" }, "english")).toHaveLength(3);
  });
});

describe("buildMatchFacts", () => {
  test("lists match type, native language and their level in the viewer's language", () => {
    expect(buildMatchFacts(base, "english")).toEqual([
      { label: "Match", value: "Perfect exchange" },
      { label: "Speaks", value: "Spanish (native)" },
      { label: "Their English", value: "Intermediate" },
    ]);
  });

  test("omits unknown match types and levels", () => {
    expect(buildMatchFacts({ ...base, match: undefined, practiceLanguageLevels: {} }, "english")).toEqual([
      { label: "Speaks", value: "Spanish (native)" },
    ]);
  });
});
