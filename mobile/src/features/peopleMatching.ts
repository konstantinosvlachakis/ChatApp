// Pure helpers for the People (partner matching) screen. Mirrors the web People page
// (`frontend/src/pages/Community/page.tsx`, `components/ExchangeProfileCard.tsx`,
// `components/FilterSheet.tsx`). No React Native imports so it stays trivially reviewable
// and runnable under plain Node (type stripping).

import type { PeopleCard, PeopleMatch } from "../types";

export const PEOPLE_PAGE_SIZE = 24;

/** Server match modes for `GET /api/profile/data?match=` (same keys and labels as web). */
export type PeopleSegment = "all" | "reciprocal" | "teaches_me";
export const PEOPLE_SEGMENTS: ReadonlyArray<{ key: PeopleSegment; label: string }> = [
  { key: "all", label: "Best matches" },
  { key: "reciprocal", label: "Perfect exchange" },
  { key: "teaches_me", label: "Native speakers" },
];

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

/** Compact card inline label (web `relationship`); the icon is "↔" only for reciprocal. */
export function matchRelationship(match?: PeopleMatch | null) {
  if (match?.reciprocal) return { icon: "↔", label: "Perfect exchange", reciprocal: true };
  if (match?.teaches_me) return { icon: "•", label: "Native speaker for you", reciprocal: false };
  if (match?.learns_mine) return { icon: "•", label: "Learning your language", reciprocal: false };
  return { icon: "•", label: "Open to exchange", reciprocal: false };
}

/** The practice language to show: the viewer's native language if they learn it, else their first. */
export function pickLearningLanguage(profile: PeopleCard, viewerLanguage?: string | null) {
  const practicing = profile.languages_practicing || [];
  return practicing.find((language) => sameLanguage(language, viewerLanguage)) || practicing[0] || "";
}

/** Card copy for the native/learning rows and the goal line (web ExchangeProfileCard). */
export function describeExchange(profile: PeopleCard, viewerLanguage?: string | null, featured = false) {
  const learning = pickLearningLanguage(profile, viewerLanguage);
  const level = learning ? languageLevel(profile.practice_language_levels, learning) : "";
  const learnsViewerLanguage = Boolean(profile.match?.learns_mine && learning && sameLanguage(learning, viewerLanguage));
  return {
    nativeCaption: featured ? (profile.match?.teaches_me ? "You can practice" : "Speaks") : "Native language",
    native: languageLabel(profile.native_language),
    learningCaption: learnsViewerLanguage ? (featured ? "They practice your" : "Learning your language") : "Practicing",
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
