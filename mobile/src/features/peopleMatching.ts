// Pure helpers for the People screen. Mirrors the web People page
// (`frontend/src/pages/Community/page.tsx`, `utils/peopleQuery.ts`,
// `components/{ExchangeProfileCard,PhotoExchangeCard,PeopleFilterPanel}.tsx`). No React Native
// imports so it stays reviewable and runnable under plain Node (type stripping).
//
// Two feeds share every filter (backend `profile_data_view` + `chatapp/people_filters.py`):
// `section=perfect` (the rail, always best fit) and `section=others` ("More people to meet",
// with the include switches and sort).

import type { PeopleCard, PeopleMatch } from "../types";

export const PEOPLE_PAGE_SIZE = 24;

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

// ---------------------------------------------------------------------------------------------
// Query state and params (same as web `utils/peopleQuery.ts`).

export type LevelFilter = "" | "beginner" | "intermediate" | "advanced_plus";
export type SortOrder = "best" | "active" | "newest";
export type IncludeGroup = "native" | "learners" | "rest";

export type PanelFilters = {
  /** Languages the viewer is learning that they must speak natively; null = all. */
  theySpeak: string[] | null;
  /** Languages the viewer speaks that they must be learning; null = all. */
  theyLearn: string[] | null;
  level: LevelFilter;
  include: Record<IncludeGroup, boolean>;
  sort: SortOrder;
};

export type QuickFilters = { near: boolean; active: boolean; newMembers: boolean; myLevel: boolean; following: boolean };

export type FilterMeta = {
  theySpeakOptions: string[];
  theyLearnOptions: string[];
  nearAvailable: boolean;
  nearCity: string;
  nearScope: "city" | "country" | "";
  myLevelAvailable: boolean;
};

export const INCLUDE_GROUPS: IncludeGroup[] = ["native", "learners", "rest"];
export const DEFAULT_PANEL_FILTERS: PanelFilters = {
  theySpeak: null,
  theyLearn: null,
  level: "",
  include: { native: true, learners: true, rest: true },
  sort: "best",
};
export const DEFAULT_QUICK_FILTERS: QuickFilters = { near: false, active: false, newMembers: false, myLevel: false, following: false };

export const LEVEL_FILTER_OPTIONS: ReadonlyArray<{ value: LevelFilter; label: string }> = [
  { value: "", label: "Any" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced_plus", label: "Advanced+" },
];
export const SORT_OPTIONS: ReadonlyArray<{ value: SortOrder; label: string }> = [
  { value: "best", label: "Best fit" },
  { value: "active", label: "Recently active" },
  { value: "newest", label: "Newest" },
];
export const INCLUDE_LABELS: Record<IncludeGroup, string> = {
  native: "Native speakers who aren't learning your languages",
  learners: "People learning your languages",
  rest: "Everyone else",
};
export const QUICK_FILTER_KEYS: ReadonlyArray<keyof QuickFilters> = ["near", "active", "newMembers", "myLevel", "following"];

/** "Near you · Athens" when the viewer has a city. */
export function quickFilterLabel(key: keyof QuickFilters, city?: string) {
  if (key === "following") return "Following";
  if (key === "near") return city ? `Near you · ${city}` : "Near you";
  if (key === "active") return "Active today";
  if (key === "newMembers") return "New members";
  return "Your level";
}

/** Toggle one language chip. The last selected chip can't be switched off; all on = null. */
export function toggleLanguage(selected: string[] | null, language: string, options: string[]): string[] | null {
  const current = selected ?? options;
  const next = current.includes(language) ? current.filter((entry) => entry !== language) : [...current, language];
  if (!next.length) return selected;
  const ordered = options.filter((option) => next.includes(option));
  return ordered.length === options.length ? null : ordered;
}

export const isLanguageOn = (selected: string[] | null, language: string) => !selected || selected.includes(language);
export const includesEverything = (include: PanelFilters["include"]) => INCLUDE_GROUPS.every((group) => include[group]);
export const includesNothing = (include: PanelFilters["include"]) => INCLUDE_GROUPS.every((group) => !include[group]);

/** Panel filters that differ from the defaults (the filter button's badge). */
export const activePanelFilterCount = (filters: PanelFilters) =>
  Number(Boolean(filters.theySpeak)) +
  Number(Boolean(filters.theyLearn)) +
  Number(Boolean(filters.level)) +
  Number(!includesEverything(filters.include)) +
  Number(filters.sort !== "best");

export type PeopleParams = Record<string, string | number>;

export function sharedParams(filters: PanelFilters, quick: QuickFilters): PeopleParams {
  const params: PeopleParams = {};
  if (filters.theySpeak) params.they_speak = filters.theySpeak.join(",");
  if (filters.theyLearn) params.they_learn = filters.theyLearn.join(",");
  if (filters.level) params.level = filters.level;
  if (quick.near) params.near = 1;
  if (quick.active) params.active = 1;
  if (quick.newMembers) params.new = 1;
  if (quick.myLevel) params.my_level = 1;
  if (quick.following) params.following = 1;
  return params;
}

/** Perfect exchanges: always best fit, the include switches don't apply. */
export const perfectParams = (filters: PanelFilters, quick: QuickFilters, page: number, pageSize = PEOPLE_PAGE_SIZE): PeopleParams => ({
  page,
  page_size: pageSize,
  section: "perfect",
  ...sharedParams(filters, quick),
});

/** "More people to meet": everyone who isn't a perfect exchange. */
export function othersParams(filters: PanelFilters, quick: QuickFilters, page: number, pageSize = PEOPLE_PAGE_SIZE): PeopleParams {
  const params: PeopleParams = { page, page_size: pageSize, section: "others", ...sharedParams(filters, quick) };
  if (!includesEverything(filters.include)) params.include = INCLUDE_GROUPS.filter((group) => filters.include[group]).join(",");
  if (filters.sort !== "best") params.sort = filters.sort;
  return params;
}

/** "Show N people" preview: one small request whose `counts` cover both sections. */
export const countParams = (filters: PanelFilters, quick: QuickFilters): PeopleParams => ({ ...othersParams(filters, quick, 1, 1), counts: 1 });

export function previewTotal(counts: { perfect?: number; others?: number } | undefined, filters: PanelFilters) {
  if (!counts) return null;
  return (counts.perfect || 0) + (includesNothing(filters.include) ? 0 : counts.others || 0);
}

export function parseFilterMeta(raw: unknown): FilterMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const strings = (entry: unknown) => (Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string" && Boolean(item)) : []);
  return {
    theySpeakOptions: strings(value.they_speak_options),
    theyLearnOptions: strings(value.they_learn_options),
    nearAvailable: Boolean(value.near_available),
    nearCity: typeof value.near_city === "string" ? value.near_city : "",
    nearScope: value.near_scope === "city" || value.near_scope === "country" ? value.near_scope : "",
    myLevelAvailable: Boolean(value.my_level_available),
  };
}

export const cityFromLocation = (location?: string | null) => String(location || "").split(",")[0]?.trim() || "";

export const languageLabel = (value?: string | null) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Not specified";
};

/** "Greek or English" / "Greek, English or Spanish". */
export function joinOr(values: string[]) {
  const labels = values.map((value) => languageLabel(value));
  if (labels.length <= 1) return labels[0] || "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** Header subtitle naming the rule, e.g. "They speak Russian and are learning Greek or English." */
export function exchangeRule(learning: string[], spoken: string[]) {
  if (!learning.length && !spoken.length) return "Add your languages to find people to practise with.";
  if (!learning.length) return `They're learning ${joinOr(spoken)}.`;
  if (!spoken.length) return `They speak ${joinOr(learning)}.`;
  return `They speak ${joinOr(learning)} and are learning ${joinOr(spoken)}.`;
}

// ---------------------------------------------------------------------------------------------
// Card copy.

const sameLanguage = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

/** Case-insensitive lookup in `practice_language_levels`; "" when unknown. */
export function languageLevel(levels: Record<string, string> | undefined, language: string) {
  const key = Object.keys(levels || {}).find((entry) => sameLanguage(entry, language));
  return key && levels ? languageLabel(levels[key]) : "";
}

/** "your native language" / "which you speak fluently" / "which you speak at an advanced level". */
export function youSpeakPhrase(level?: string | null) {
  if (level === "native") return "your native language";
  if (level === "fluent") return "which you speak fluently";
  if (level === "advanced") return "which you speak at an advanced level";
  return "";
}

/** Tag at the top of a plain card: why this person is in your feed (web `relationshipTag`). */
export function relationshipTag(profile: PeopleCard) {
  const match = profile.match;
  if (match?.reciprocal) return "Perfect exchange";
  if (match?.learns_mine) return match.they_learn ? `Learning ${languageLabel(match.they_learn)}` : "Learning your language";
  if (match?.teaches_me) return `Native ${languageLabel(match.they_teach || profile.native_language)} speaker`;
  return "Open to exchange";
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

/** Plain card chips: practised languages with level (max 3), then Active today / New member. */
export function profileChips(profile: PeopleCard) {
  const languages = (profile.languages_practicing || []).slice(0, 3).map((language) => {
    const level = languageLevel(profile.practice_language_levels, language);
    return level ? `${languageLabel(language)} · ${level}` : languageLabel(language);
  });
  const status = [profile.active_label === "Active today" ? "Active today" : "", profile.is_new ? "New member" : ""].filter(Boolean);
  return [...languages, ...status];
}

/** The server's default avatar path means "no photo" (warm tinted fallback). */
export const hasOwnPhoto = (url?: string | null) => Boolean(url) && !/\/MainAfter\.[a-z0-9]+(\?.*)?$/i.test(url || "");

/** Photo card chip: "Active today" / "New member" when they apply, else their level in your language. */
export function photoCardChip(profile: PeopleCard, viewerLanguage?: string | null) {
  if (profile.active_label === "Active today") return "Active today";
  if (profile.is_new) return "New member";
  const theyLearn = profile.match?.they_learn || "";
  const language = theyLearn || (profile.languages_practicing || []).find((entry) => sameLanguage(entry, viewerLanguage)) || "";
  const level = language ? languageLevel(profile.practice_language_levels, language) : "";
  return level ? `${level} ${languageLabel(language)}` : "";
}

/** Photo card stats: "Speaks <native> | Learning <language of yours>". */
export function photoCardStats(profile: PeopleCard, viewerLanguage?: string | null) {
  return {
    speaks: languageLabel(profile.match?.they_teach || profile.native_language),
    learning: pickLearningLanguage(profile, viewerLanguage) ? languageLabel(pickLearningLanguage(profile, viewerLanguage)) : "",
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

/** Text search over loaded profiles ("Search loaded profiles"). */
export function filterLoadedPeople(profiles: PeopleCard[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return profiles;
  return profiles.filter((profile) =>
    [profile.username, profile.native_language || "", profile.learning_goal || "", profile.city || "", ...(profile.languages_practicing || [])].some(
      (value) => value.toLowerCase().includes(query)
    )
  );
}

/** Portrait fallback when there is no photo (or it fails to load). */
export function initialsFor(username: string) {
  return (Array.from(username.trim()).slice(0, 2).join("") || "?").toUpperCase();
}
