// Client-side helpers for the featured People card's "Why you'll click" panel.
// Built only from fields the People list already returns (no extra API calls).

import type { PartnerMatch } from "../../../components/Cards";
import { youSpeakPhrase } from "./exchangeLanguages";

export interface StarterProfile {
  username: string;
  nativeLanguage: string;
  languagesPracticing: string[];
  practiceLanguageLevels: Record<string, string>;
  learningGoal: string;
  match?: PartnerMatch;
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

/**
 * The viewer's language that they practise, and how the viewer speaks it: the server's
 * `match.they_learn`/`you_speak` when present, else the viewer's native language.
 */
export function languageTheyLearnFromViewer(profile: StarterProfile, viewerLanguage = "") {
  const practicing = profile.languagesPracticing || [];
  const theyLearn = profile.match?.theyLearn;
  const fromServer = theyLearn ? practicing.find((language) => same(language, theyLearn)) || theyLearn : "";
  if (fromServer) return { language: fromServer, youSpeak: profile.match?.youSpeak || "" };
  const native = practicing.find((language) => same(language, viewerLanguage));
  return native ? { language: native, youSpeak: "native" } : { language: "", youSpeak: "" };
}

/** 2–3 friendly English opening lines tailored to the profile. */
export function buildConversationStarters(profile: StarterProfile, viewerLanguage = ""): string[] {
  const native = label(profile.nativeLanguage);
  const practicing = profile.languagesPracticing || [];
  const mine = languageTheyLearnFromViewer(profile, viewerLanguage);
  const learning = mine.language || practicing[0];
  const starters: string[] = [];

  if (profile.learningGoal?.trim()) {
    starters.push(`I saw your goal: “${goalPreview(profile.learningGoal)}”. How can I help?`);
  }
  if (mine.language && mine.youSpeak === "native") {
    starters.push(`I'm a native ${label(mine.language)} speaker. Want to practice together?`);
  } else if (mine.language && mine.youSpeak === "fluent") {
    starters.push(`I speak fluent ${label(mine.language)}. Want to practice together?`);
  } else if (mine.language && mine.youSpeak === "advanced") {
    starters.push(`I speak ${label(mine.language)} well. Want to practice together?`);
  } else if (learning) {
    starters.push(`How long have you been learning ${label(learning)}?`);
  }
  if (native) {
    starters.push(`What's a ${native} phrase you use every day?`);
  }
  starters.push("What got you into language exchange?");

  return Array.from(new Set(starters)).slice(0, MAX_STARTERS);
}

/**
 * Compact facts for the panel: the match type, what they speak, which language of the
 * viewer's they're learning (and how the viewer speaks it), and their level in it.
 */
export function buildMatchFacts(profile: StarterProfile, viewerLanguage = ""): MatchFact[] {
  const facts: MatchFact[] = [];
  const match = profile.match;
  const mine = languageTheyLearnFromViewer(profile, viewerLanguage);
  const type = match?.reciprocal
    ? "Perfect exchange"
    : match?.teachesMe
      ? "Native speaker for you"
      : match?.learnsMine
        ? "Learning your language"
        : "";
  if (type) facts.push({ label: "Match", value: type });
  const native = match?.theyTeach || profile.nativeLanguage;
  if (native) facts.push({ label: "They speak", value: `${label(native)} (native)` });
  if (mine.language) {
    const how = youSpeakPhrase(mine.youSpeak);
    facts.push({ label: "They're learning", value: how ? `${label(mine.language)}, ${how}` : label(mine.language) });
    const theirLevel = levelOf(profile.practiceLanguageLevels, mine.language);
    if (theirLevel) facts.push({ label: `Their ${label(mine.language)}`, value: theirLevel });
  }
  return facts;
}
