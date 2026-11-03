import { useCallback, useEffect, useRef, useState } from "react";
import { mergePeoplePages, parseFilterMeta, type FilterMeta, type PeopleParams } from "../../features/peopleMatching";
import { fetchPeople } from "../../services/api/auth";
import { getErrorMessage, toApiError } from "../../services/api/client";
import { toastApiError } from "../../services/toast";
import type { PeopleCard } from "../../types";

type RequestKind = "first" | "more" | "refresh";

export type PeopleFeed = {
  profiles: PeopleCard[];
  total: number;
  hasNext: boolean;
  /** True until the first page of the current query settles. */
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string;
  moreError: string;
  meta: FilterMeta | null;
  loadMore: () => void;
  retryMore: () => void;
  refresh: () => Promise<void>;
  retry: () => void;
};

/**
 * One paginated `GET /api/profile/data` feed (`base` = every param except page; null = off).
 * One request at a time: a new query or refresh aborts the previous one, and results apply
 * only while their controller is current.
 */
export function usePeopleFeed(base: PeopleParams | null, pageSize: number): PeopleFeed {
  const key = base ? JSON.stringify(base) : "";
  const [profiles, setProfiles] = useState<PeopleCard[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(Boolean(base));
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [meta, setMeta] = useState<FilterMeta | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const keyRef = useRef(key);
  const pageRef = useRef(1);
  const hasProfilesRef = useRef(false);
  hasProfilesRef.current = profiles.length > 0;

  const start = useCallback(
    async (kind: RequestKind) => {
      const currentKey = keyRef.current;
      if (!currentKey) return;
      const page = kind === "more" ? pageRef.current + 1 : 1;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(kind === "first");
      setLoadingMore(kind === "more");
      setRefreshing(kind === "refresh");
      if (kind === "more") setMoreError("");
      else if (kind === "first") setError("");
      try {
        const payload = await fetchPeople({ ...JSON.parse(currentKey), page, page_size: pageSize }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const next = payload.profiles || [];
        setProfiles((previous) => mergePeoplePages(previous, next, page === 1));
        pageRef.current = page;
        setHasNext(Boolean(payload.pagination?.has_next));
        setTotal(payload.total ?? payload.pagination?.total_count ?? next.length);
        const nextMeta = parseFilterMeta(payload.filters);
        if (nextMeta) setMeta(nextMeta);
        if (page === 1) setError("");
        setMoreError("");
      } catch (failure) {
        if (controller.signal.aborted || toApiError(failure).isAborted) return;
        const message = getErrorMessage(failure, "Could not load people. Please try again.");
        if (kind === "more") setMoreError(message);
        else if (kind === "refresh" && hasProfilesRef.current) toastApiError(failure, message, "Couldn't refresh");
        else setError(message);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [pageSize]
  );

  useEffect(() => {
    keyRef.current = key;
    pageRef.current = 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setProfiles([]);
    setHasNext(false);
    setTotal(0);
    setMoreError("");
    if (!key) {
      setLoading(false);
      setError("");
      return;
    }
    start("first");
  }, [key, reloadKey, start]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (requestRef.current || loading || refreshing || !hasNext || error || moreError) return;
    start("more");
  }, [loading, refreshing, hasNext, error, moreError, start]);

  const retryMore = useCallback(() => {
    start("more");
  }, [start]);

  const refresh = useCallback(async () => {
    if (!keyRef.current) return;
    await start("refresh");
  }, [start]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  return { profiles, total, hasNext, loading, loadingMore, refreshing, error, moreError, meta, loadMore, retryMore, refresh, retry };
}
