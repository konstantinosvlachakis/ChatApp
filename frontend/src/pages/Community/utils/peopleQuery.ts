// People feed query state and the `GET /api/profile/data` params built from it
// (backend `profile_data_view` + `chatapp/people_filters.py`, system-map api-contract).
// Two feeds share every filter: `section=perfect` (the carousel, always best fit) and
// `section=others` ("More people to meet", with the include switches and sort).

export type LevelFilter = "" | "beginner" | "intermediate" | "advanced_plus";
export type SortOrder = "best" | "active" | "newest";
export type IncludeGroup = "native" | "learners" | "rest";

export interface PanelFilters {
  /** Languages the viewer is learning that they must speak natively; null = all. */
  theySpeak: string[] | null;
  /** Languages the viewer speaks that they must be learning; null = all. */
  theyLearn: string[] | null;
  level: LevelFilter;
  include: Record<IncludeGroup, boolean>;
  sort: SortOrder;
}

export interface QuickFilters {
  near: boolean;
  active: boolean;
  newMembers: boolean;
  myLevel: boolean;
}

/** Server-reported filter context (`filters` in the people payload). */
export interface FilterMeta {
  theySpeakOptions: string[];
  theyLearnOptions: string[];
  nearAvailable: boolean;
  nearCity: string;
  nearScope: "city" | "country" | "";
  myLevelAvailable: boolean;
}

export const INCLUDE_GROUPS: IncludeGroup[] = ["native", "learners", "rest"];

export const DEFAULT_PANEL_FILTERS: PanelFilters = {
  theySpeak: null,
  theyLearn: null,
  level: "",
  include: { native: true, learners: true, rest: true },
  sort: "best",
};

export const DEFAULT_QUICK_FILTERS: QuickFilters = { near: false, active: false, newMembers: false, myLevel: false };

export const LEVEL_FILTER_OPTIONS: Array<{ value: LevelFilter; label: string }> = [
  { value: "", label: "Any" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced_plus", label: "Advanced+" },
];

export const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "best", label: "Best fit" },
  { value: "active", label: "Recently active" },
  { value: "newest", label: "Newest" },
];

export const INCLUDE_LABELS: Record<IncludeGroup, string> = {
  native: "Native speakers who aren't learning your languages",
  learners: "People learning your languages",
  rest: "Everyone else",
};

const sameSet = (subset: string[], options: string[]) =>
  subset.length === options.length && options.every((option) => subset.includes(option));

/** Toggle one language chip. The last selected chip can't be switched off; all on = null. */
export function toggleLanguage(selected: string[] | null, language: string, options: string[]): string[] | null {
  const current = selected ?? options;
  const next = current.includes(language) ? current.filter((entry) => entry !== language) : [...current, language];
  if (!next.length) return selected;
  const ordered = options.filter((option) => next.includes(option));
  return sameSet(ordered, options) ? null : ordered;
}

export const isLanguageOn = (selected: string[] | null, language: string) => !selected || selected.includes(language);

export const includesEverything = (include: PanelFilters["include"]) => INCLUDE_GROUPS.every((group) => include[group]);
export const includesNothing = (include: PanelFilters["include"]) => INCLUDE_GROUPS.every((group) => !include[group]);

/** Panel filters that differ from the defaults (the filter button's badge). */
export function activePanelFilterCount(filters: PanelFilters) {
  return (
    Number(Boolean(filters.theySpeak)) +
    Number(Boolean(filters.theyLearn)) +
    Number(Boolean(filters.level)) +
    Number(!includesEverything(filters.include)) +
    Number(filters.sort !== "best")
  );
}

export type PeopleParams = Record<string, string | number>;

/** Filters both sections share: languages, level and quick filters. */
export function sharedParams(filters: PanelFilters, quick: QuickFilters): PeopleParams {
  const params: PeopleParams = {};
  if (filters.theySpeak) params.they_speak = filters.theySpeak.join(",");
  if (filters.theyLearn) params.they_learn = filters.theyLearn.join(",");
  if (filters.level) params.level = filters.level;
  if (quick.near) params.near = 1;
  if (quick.active) params.active = 1;
  if (quick.newMembers) params.new = 1;
  if (quick.myLevel) params.my_level = 1;
  return params;
}

/** Perfect exchanges: always best fit, include switches don't apply. */
export function perfectParams(filters: PanelFilters, quick: QuickFilters, page: number, pageSize: number): PeopleParams {
  return { page, page_size: pageSize, section: "perfect", ...sharedParams(filters, quick) };
}

/** "More people to meet": everyone who isn't a perfect exchange. */
export function othersParams(filters: PanelFilters, quick: QuickFilters, page: number, pageSize: number): PeopleParams {
  const params: PeopleParams = { page, page_size: pageSize, section: "others", ...sharedParams(filters, quick) };
  if (!includesEverything(filters.include)) params.include = INCLUDE_GROUPS.filter((group) => filters.include[group]).join(",");
  if (filters.sort !== "best") params.sort = filters.sort;
  return params;
}

/** "Show N people" preview: one small request whose `counts` cover both sections. */
export function countParams(filters: PanelFilters, quick: QuickFilters): PeopleParams {
  return { ...othersParams(filters, quick, 1, 1), counts: 1 };
}

/** Total for the preview; the include switches all off means More people is hidden. */
export function previewTotal(counts: { perfect?: number; others?: number } | undefined, filters: PanelFilters) {
  if (!counts) return null;
  return (counts.perfect || 0) + (includesNothing(filters.include) ? 0 : counts.others || 0);
}

export function parseFilterMeta(raw: any): FilterMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)) : []);
  return {
    theySpeakOptions: strings(raw.they_speak_options),
    theyLearnOptions: strings(raw.they_learn_options),
    nearAvailable: Boolean(raw.near_available),
    nearCity: typeof raw.near_city === "string" ? raw.near_city : "",
    nearScope: raw.near_scope === "city" || raw.near_scope === "country" ? raw.near_scope : "",
    myLevelAvailable: Boolean(raw.my_level_available),
  };
}

/** City from the viewer's own "City, Country" location (before the server reports it). */
export const cityFromLocation = (location?: string | null) => String(location || "").split(",")[0]?.trim() || "";

const label = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "");

/** "Greek or English" / "Greek, English or Spanish". */
export function joinOr(values: string[]) {
  const labels = values.map(label);
  if (labels.length <= 1) return labels[0] || "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** Header subtitle naming the matching rule, e.g. "They speak Russian and are learning Greek or English". */
export function exchangeRule(learning: string[], spoken: string[]) {
  if (!learning.length && !spoken.length) return "Add your languages to find people to practise with.";
  if (!learning.length) return `They're learning ${joinOr(spoken)}.`;
  if (!spoken.length) return `They speak ${joinOr(learning)}.`;
  return `They speak ${joinOr(learning)} and are learning ${joinOr(spoken)}.`;
}
