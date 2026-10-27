// Client-side helpers for the featured People card's "Why you'll click" panel.
// Built only from fields the People list already returns (no extra API calls).

export interface StarterProfile {
  username: string;
  nativeLanguage: string;
  languagesPracticing: string[];
  practiceLanguageLevels: Record<string, string>;
  learningGoal: string;
  match?: { teachesMe: boolean; learnsMine: boolean; reciprocal: boolean };
}

export interface MatchFact {
  label: string;
  value: string;
}

const MAX_STARTERS = 3;
const GOAL_PREVIEW_CHARS = 60;

const label = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "");
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

const levelOf = (levels: Record<string, string>, language: string) => {
  const key = Object.keys(levels || {}).find((entry) => same(entry, language));
  return key ? label(levels[key]) : "";
};

const goalPreview = (goal: string) => {
  const text = goal.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (text.length <= GOAL_PREVIEW_CHARS) return text;
  const cut = text.slice(0, GOAL_PREVIEW_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** 2–3 friendly English opening lines tailored to the profile. */
export function buildConversationStarters(profile: StarterProfile, viewerLanguage = ""): string[] {
  const native = label(profile.nativeLanguage);
  const practicing = profile.languagesPracticing || [];
  const learningMine = practicing.find((language) => same(language, viewerLanguage));
  const learning = learningMine || practicing[0];
  const starters: string[] = [];

  if (profile.learningGoal?.trim()) {
    starters.push(`I saw your goal: “${goalPreview(profile.learningGoal)}”. How can I help?`);
  }
  if (learningMine && viewerLanguage) {
    starters.push(`I'm a native ${label(viewerLanguage)} speaker. Want to practice together?`);
  } else if (learning) {
    starters.push(`How long have you been learning ${label(learning)}?`);
  }
  if (native) {
    starters.push(`What's a ${native} phrase you use every day?`);
  }
  starters.push("What got you into language exchange?");

  return Array.from(new Set(starters)).slice(0, MAX_STARTERS);
}

/** Compact facts for the panel: the match type and their level in the viewer's language. */
export function buildMatchFacts(profile: StarterProfile, viewerLanguage = ""): MatchFact[] {
  const facts: MatchFact[] = [];
  const match = profile.match;
  const type = match?.reciprocal
    ? "Perfect exchange"
    : match?.teachesMe
      ? "Native speaker for you"
      : match?.learnsMine
        ? "Learning your language"
        : "";
  if (type) facts.push({ label: "Match", value: type });
  if (profile.nativeLanguage) facts.push({ label: "Speaks", value: `${label(profile.nativeLanguage)} (native)` });
  const viewerLevel = viewerLanguage ? levelOf(profile.practiceLanguageLevels, viewerLanguage) : "";
  if (viewerLevel && (profile.languagesPracticing || []).some((language) => same(language, viewerLanguage))) {
    facts.push({ label: `Their ${label(viewerLanguage)}`, value: viewerLevel });
  }
  return facts;
}
