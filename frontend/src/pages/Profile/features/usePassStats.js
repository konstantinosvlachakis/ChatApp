import { useEffect, useState } from "react";
import api from "../../../lib/api";

// Per-language practice progress and native-speaker counts for the own profile's boarding passes.
// Cached for the page session (5 min) so returning to the profile doesn't refetch.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const loadStats = async (language, signal) => {
  const params = new URLSearchParams({
    section: "perfect",
    include: "native",
    they_speak: language,
    counts: "1",
    page: "1",
    page_size: "1",
  });
  const [practice, people] = await Promise.allSettled([
    api.get(`/api/practice/state/?language=${encodeURIComponent(language)}`, { signal }),
    api.get(`/api/profile/data?${params}`, { signal }),
  ]);
  return {
    // The server falls back to another language when Practice doesn't cover this one.
    progress:
      practice.status === "fulfilled" && String(practice.value?.language || "").toLowerCase() === language
        ? practice.value.progress || null
        : null,
    partners:
      people.status === "fulfilled" && people.value?.counts
        ? people.value.counts.perfect + people.value.counts.others
        : null,
  };
};

/** `{ [language]: { progress, partners } }`; a language is missing until it has loaded. */
export function usePassStats(languages, enabled = true) {
  const key = enabled ? languages.join("|") : "";
  const [stats, setStats] = useState(() => {
    const initial = {};
    languages.forEach((language) => {
      if (cache.has(language)) initial[language] = cache.get(language).value;
    });
    return initial;
  });

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    key.split("|").forEach((language) => {
      const hit = cache.get(language);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        setStats((current) => (current[language] === hit.value ? current : { ...current, [language]: hit.value }));
        return;
      }
      loadStats(language, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          cache.set(language, { at: Date.now(), value });
          setStats((current) => ({ ...current, [language]: value }));
        })
        .catch(() => {});
    });
    return () => controller.abort();
  }, [key]);

  return stats;
}

export const clearPassStatsCache = () => cache.clear();
