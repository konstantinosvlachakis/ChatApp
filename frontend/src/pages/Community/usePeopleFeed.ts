import { useCallback, useEffect, useState } from "react";
import { BASE_URL } from "../../constants/constants";
import api, { getErrorMessage, isAbortError } from "../../lib/api";
import type { ExchangeProfile } from "./components/ExchangeProfileCard";
import { FilterMeta, PeopleParams, parseFilterMeta } from "./utils/peopleQuery";

export const PEOPLE_PAGE_SIZE = 24;

// Accept API media paths and HTTP(S) URLs, never executable URL schemes.
export const mediaUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const path = /^(https?:\/\/|\/)/i.test(value) ? value : `/media/${value.replace(/^media\//, "")}`;
    const url = new URL(path, BASE_URL || window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const toPartnerMatch = (match: any): ExchangeProfile["match"] => {
  if (!match) return undefined;
  const youSpeak = ["native", "advanced", "fluent"].includes(match.you_speak) ? match.you_speak : undefined;
  return {
    teachesMe: Boolean(match.teaches_me),
    learnsMine: Boolean(match.learns_mine),
    reciprocal: Boolean(match.reciprocal),
    ...(typeof match.they_teach === "string" && match.they_teach ? { theyTeach: match.they_teach } : {}),
    ...(typeof match.they_learn === "string" && match.they_learn ? { theyLearn: match.they_learn } : {}),
    ...(youSpeak ? { youSpeak } : {}),
  };
};

export const toExchangeProfile = (profile: any): ExchangeProfile => ({
  username: profile.username,
  nativeLanguage: profile.native_language || "",
  languagesPracticing: profile.languages_practicing || [],
  practiceLanguageLevels: profile.practice_language_levels || {},
  learningGoal: profile.learning_goal || "",
  profileImage: mediaUrl(profile.profile_image_url),
  match: toPartnerMatch(profile.match),
  ...(typeof profile.city === "string" && profile.city ? { city: profile.city } : {}),
  ...(typeof profile.active_label === "string" && profile.active_label ? { activeLabel: profile.active_label } : {}),
  isNew: Boolean(profile.is_new),
});

export interface PeopleFeed {
  profiles: ExchangeProfile[];
  total: number;
  hasNext: boolean;
  loading: boolean;
  error: string;
  meta: FilterMeta | null;
  loadMore: () => void;
  retry: () => void;
}

/**
 * One paginated `GET /api/profile/data` feed. `base` = every param except the page
 * (null = feed off). A new `base` starts again at page 1 and aborts the old request;
 * pages are merged by username.
 */
export function usePeopleFeed(base: PeopleParams | null): PeopleFeed {
  const key = base ? JSON.stringify(base) : "";
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;
  const [profiles, setProfiles] = useState<ExchangeProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(Boolean(base));
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<FilterMeta | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) {
      setProfiles([]);
      setTotal(0);
      setHasNext(false);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const params = { ...JSON.parse(key), page, page_size: PEOPLE_PAGE_SIZE };
    setLoading(true);
    setError("");
    if (page === 1) {
      setProfiles([]);
      setHasNext(false);
    }
    // No trailing slash: profile/data is the one API path without it.
    api
      .get<any>("/api/profile/data", { params, signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const next: ExchangeProfile[] = (payload?.profiles || []).map(toExchangeProfile);
        setProfiles((previous) => Array.from(new Map((page === 1 ? next : [...previous, ...next]).map((profile) => [profile.username, profile])).values()));
        setTotal(payload?.total ?? payload?.pagination?.total_count ?? next.length);
        setHasNext(Boolean(payload?.pagination?.has_next));
        const nextMeta = parseFilterMeta(payload?.filters);
        if (nextMeta) setMeta(nextMeta);
      })
      .catch((failure) => {
        if (!controller.signal.aborted && !isAbortError(failure)) {
          setError(getErrorMessage(failure, "Could not load people. Please try again."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, page, attempt]);

  const loadMore = useCallback(() => {
    if (loading || !hasNext || error) return;
    setPageState({ key, page: page + 1 });
  }, [loading, hasNext, error, key, page]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { profiles, total, hasNext, loading, error, meta, loadMore, retry };
}
