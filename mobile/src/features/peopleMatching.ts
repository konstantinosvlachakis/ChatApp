// Pure helpers for the People (partner matching) screen. Mirrors the web People page
// (`frontend/src/pages/Community/page.tsx`, `components/ExchangeProfileCard.tsx`,
// `components/FilterSheet.tsx`). No React Native imports so it stays trivially reviewable
// and runnable under plain Node (type stripping).

import type { PeopleCard, PeopleMatch } from "../types";

export const PEOPLE_PAGE_SIZE = 24;

/**
 * Server match modes for `GET /api/profile/data?match=` (same keys and labels as web), no
 * overlap in meaning ("you speak" = your native language or one at Advanced/Fluent):
 * reciprocal = Perfect exchange (default; shown in the rail), teaches_me = native speakers of
 * a language you practise, learns_mine = practising a language you speak, all = everyone.
 */
export type PeopleSegment = "reciprocal" | "teaches_me" | "learns_mine" | "all";
export const DEFAULT_PEOPLE_SEGMENT: PeopleSegment = "reciprocal";
export const PEOPLE_SEGMENTS: ReadonlyArray<{ key: PeopleSegment; label: string }> = [
  { key: "reciprocal", label: "Perfect exchange" },
  { key: "teaches_me", label: "Native speakers" },
  { key: "learns_mine", label: "Learning your language" },
  { key: "all", label: "Everyone" },
];

/** Practised languages at these levels count as languages you speak (backend `partner_language_sets`). */
const SPOKEN_PRACTICE_LEVELS = new Set(["advanced", "fluent"]);
export type SpokenLevel = "native" | "advanced" | "fluent";

/** The viewer's side: languages they speak (native + Advanced/Fluent) and still practise. */
export function viewerExchangeLanguages(user?: {
  native_language?: string | null;
  languages_practicing?: string[] | null;
  practice_language_levels?: Record<string, string> | null;
} | null) {
  const seen = new Set<string>();
  const spoken: Array<{ language: string; level: SpokenLevel }> = [];
  const practising: Array<{ language: string; level: string }> = [];
  const native = String(user?.native_language || "").trim();
  if (native) {
    spoken.push({ language: native, level: "native" });
    seen.add(native.toLowerCase());
  }
  for (const raw of user?.languages_practicing || []) {
    const language = String(raw || "").trim();
    if (!language || seen.has(language.toLowerCase())) continue;
    seen.add(language.toLowerCase());
    const levels = user?.practice_language_levels || {};
    const key = Object.keys(levels).find((entry) => entry.trim().toLowerCase() === language.toLowerCase());
    const level = key ? String(levels[key] || "").trim().toLowerCase() : "";
    if (SPOKEN_PRACTICE_LEVELS.has(level)) spoken.push({ language, level: level as SpokenLevel });
    else practising.push({ language, level });
  }
  return { spoken, practising };
}

/** "" = any level. The server `level` filter is their level in the viewer's native language. */
export type PeopleLevel = "" | "beginner" | "intermediate" | "advanced" | "fluent";
export const LEVEL_OPTIONS: ReadonlyArray<PeopleLevel> = ["", "beginner", "intermediate", "advanced", "fluent"];

export type PeopleQuery = {
  page: number;
  pageSize?: number;
  segment: PeopleSegment;
  level: PeopleLevel;
};

/** Query params for `GET /api/profile/data` (no trailing slash), exactly as web sends them. */
export function buildPeopleParams({ page, pageSize = PEOPLE_PAGE_SIZE, segment, level }: PeopleQuery) {
  const params: { page: number; page_size: number; match: PeopleSegment; level?: PeopleLevel } = {
    page,
    page_size: pageSize,
    match: segment,
  };
  if (level) params.level = level;
  return params;
}

export const languageLabel = (value?: string | null) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Not specified";
};

const sameLanguage = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

/** Case-insensitive lookup in `practice_language_levels`; "" when unknown. */
export function languageLevel(levels: Record<string, string> | undefined, language: string) {
  const key = Object.keys(levels || {}).find((entry) => sameLanguage(entry, language));
  return key && levels ? languageLabel(levels[key]) : "";
}

/** Featured card badge (web `badge`). */
export function matchBadge(match?: PeopleMatch | null) {
  if (match?.reciprocal) return "Perfect exchange";
  if (match?.teaches_me) return "Native speaker for you";
  return "Meet someone new";
}

/** "your native language" / "which you speak fluently" / "which you speak at an advanced level". */
export function youSpeakPhrase(level?: string | null) {
  if (level === "native") return "your native language";
  if (level === "fluent") return "which you speak fluently";
  if (level === "advanced") return "which you speak at an advanced level";
  return "";
}

/** Compact card inline label (web `relationship`); the icon is "↔" only for reciprocal. */
export function matchRelationship(match?: PeopleMatch | null) {
  if (match?.reciprocal) return { icon: "↔", label: "Perfect exchange", reciprocal: true };
  if (match?.teaches_me) return { icon: "•", label: "Native speaker for you", reciprocal: false };
  if (match?.learns_mine) {
    // Same copy as web `learningYourLanguageLabel`.
    const language = match.they_learn ? languageLabel(match.they_learn) : "";
    const how =
      match.you_speak === "native"
        ? "your native language"
        : match.you_speak === "fluent"
          ? "you speak it fluently"
          : match.you_speak === "advanced"
            ? "you speak it well"
            : "";
    const label = !language ? "Learning your language" : how ? `Learning ${language} · ${how}` : `Learning ${language}`;
    return { icon: "•", label, reciprocal: false };
  }
  return { icon: "•", label: "Open to exchange", reciprocal: false };
}

/**
 * The practice language to show: the server's `match.they_learn` (a language the viewer
 * speaks), else the viewer's native language if they learn it, else their first.
 */
export function pickLearningLanguage(profile: PeopleCard, viewerLanguage?: string | null) {
  const practicing = profile.languages_practicing || [];
  const theyLearn = profile.match?.they_learn;
  return (
    (theyLearn && practicing.find((language) => sameLanguage(language, theyLearn))) ||
    practicing.find((language) => sameLanguage(language, viewerLanguage)) ||
    practicing[0] ||
    ""
  );
}

/**
 * "Why you'll click" lines for featured cards (web `buildMatchFacts`):
 * "They speak Russian (native)", "They're learning English, which you speak fluently".
 */
export function matchExplanation(profile: PeopleCard): string[] {
  const lines: string[] = [];
  const match = profile.match;
  const teach = match?.they_teach || (match?.teaches_me ? profile.native_language : "");
  if (teach) lines.push(`They speak ${languageLabel(teach)} (native)`);
  if (match?.they_learn) {
    const how = youSpeakPhrase(match.you_speak);
    lines.push(`They're learning ${languageLabel(match.they_learn)}${how ? `, ${how}` : ""}`);
  }
  return lines;
}

/** Card copy for the native/learning rows and the goal line (web ExchangeProfileCard). */
export function describeExchange(profile: PeopleCard, viewerLanguage?: string | null, featured = false) {
  const learning = pickLearningLanguage(profile, viewerLanguage);
  const level = learning ? languageLevel(profile.practice_language_levels, learning) : "";
  const learnsViewerLanguage = Boolean(
    profile.match?.learns_mine && learning && (sameLanguage(learning, profile.match?.they_learn) || sameLanguage(learning, viewerLanguage))
  );
  return {
    nativeCaption: featured ? (profile.match?.teaches_me ? "You can practice" : "Speaks") : "Native language",
    native: languageLabel(profile.native_language),
    learningCaption:
      learnsViewerLanguage && !featured
        ? profile.match?.you_speak && profile.match.you_speak !== "native"
          ? "Learning a language you speak"
          : "Learning your language"
        : "Practicing",
    learning: learning ? languageLabel(learning) : "",
    level,
    goal:
      (profile.learning_goal || "").trim() ||
      (profile.match?.reciprocal
        ? "You speak the language they’re learning. They speak one of yours. A great place to start."
        : "Get to know each other through a new language and everyday conversation."),
  };
}

/** Append (or replace with) a page, deduplicating by username (later pages can shift). */
export function mergePeoplePages(previous: PeopleCard[], next: PeopleCard[], replace: boolean) {
  const byUsername = new Map<string, PeopleCard>();
  for (const profile of replace ? next : [...previous, ...next]) {
    if (profile?.username) byUsername.set(profile.username, profile);
  }
  return Array.from(byUsername.values());
}

export const PERFECT_RAIL_LIMIT = 8;

/** Spotlight actual mutual exchanges, without repeating them in the main feed. */
export function splitPerfectMatches(profiles: PeopleCard[]) {
  const perfect = profiles.filter((profile) => profile.match?.reciprocal).slice(0, PERFECT_RAIL_LIMIT);
  const highlighted = new Set(perfect.map((profile) => profile.username));
  return { perfect, remaining: profiles.filter((profile) => !highlighted.has(profile.username)) };
}

/**
 * What the People screen shows for a segment. Perfect exchange: the rail (first 8 mutual
 * exchanges) plus any further mutual exchanges as a list, never one-way matches. Every other
 * segment: a plain card list, no rail.
 */
export function peopleSections(profiles: PeopleCard[], segment: PeopleSegment) {
  if (segment !== "reciprocal") return { rail: [] as PeopleCard[], list: profiles };
  const { perfect, remaining } = splitPerfectMatches(profiles);
  return { rail: perfect, list: remaining.filter((profile) => profile.match?.reciprocal) };
}

/** Native-language options from the loaded profiles (+ the selected one), sorted. */
export function nativeLanguageOptions(profiles: PeopleCard[], selected: string) {
  const seen = new Map<string, string>();
  for (const value of [selected, ...profiles.map((profile) => profile.native_language || "")]) {
    const key = value.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, value.trim());
  }
  return Array.from(seen.values()).sort((left, right) => languageLabel(left).localeCompare(languageLabel(right)));
}

/** Client-side filters over loaded profiles: search ("Search loaded profiles") + their native language. */
export function filterLoadedPeople(profiles: PeopleCard[], search: string, nativeFilter: string) {
  const query = search.trim().toLowerCase();
  return profiles.filter((profile) => {
    if (nativeFilter && !sameLanguage(profile.native_language, nativeFilter)) return false;
    if (!query) return true;
    return [profile.username, profile.native_language || "", profile.learning_goal || "", ...(profile.languages_practicing || [])].some(
      (value) => value.toLowerCase().includes(query)
    );
  });
}

/** Count shown on the Filters button: their native language + their level (segment excluded, as on web). */
export const activeFilterCount = (nativeFilter: string, level: PeopleLevel) =>
  Number(Boolean(nativeFilter)) + Number(Boolean(level));

/** Portrait fallback when there is no photo (or it fails to load). */
export function initialsFor(username: string) {
  return (Array.from(username.trim()).slice(0, 2).join("") || "?").toUpperCase();
}
