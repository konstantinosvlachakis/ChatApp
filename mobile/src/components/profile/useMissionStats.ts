import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { fetchPeople } from "../../services/api/auth";
import { fetchPracticeState, type PracticeLanguageProgress } from "../../services/api/practice";

export type MissionStats = {
  /** null = Practice doesn't cover this language (the server answered for another one). */
  progress: PracticeLanguageProgress | null;
  /** Native speakers of the language on LangVoyage (people who can teach it to the viewer). */
  partners: number | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: MissionStats }>();

async function loadStats(language: string): Promise<MissionStats> {
  const [practice, people] = await Promise.allSettled([
    fetchPracticeState(language),
    // perfect + "native" others = everyone whose native language is this one.
    fetchPeople({ section: "perfect", include: "native", they_speak: language, counts: 1, page: 1, page_size: 1 }),
  ]);
  const progress =
    practice.status === "fulfilled" && String(practice.value.language || "").toLowerCase() === language
      ? practice.value.progress ?? null
      : null;
  const counts = people.status === "fulfilled" ? people.value.counts : undefined;
  return {
    progress,
    partners: counts ? counts.perfect + counts.others : null,
  };
}

/** Practice progress and partner counts per practising language, refreshed on focus (5 min cache). */
export function useMissionStats(languages: string[]) {
  const key = languages.map((language) => language.toLowerCase()).join("|");
  const [stats, setStats] = useState<Record<string, MissionStats>>(() => {
    const initial: Record<string, MissionStats> = {};
    languages.forEach((language) => {
      const hit = cache.get(language.toLowerCase());
      if (hit) initial[language.toLowerCase()] = hit.value;
    });
    return initial;
  });

  const refresh = useCallback(() => {
    let active = true;
    const wanted = key ? key.split("|") : [];
    wanted.forEach((language) => {
      const hit = cache.get(language);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        setStats((current) => (current[language] === hit.value ? current : { ...current, [language]: hit.value }));
        return;
      }
      loadStats(language)
        .then((value) => {
          cache.set(language, { at: Date.now(), value });
          if (active) setStats((current) => ({ ...current, [language]: value }));
        })
        .catch(() => {});
    });
    return () => {
      active = false;
    };
  }, [key]);

  // Runs on focus and again whenever the language list changes while focused.
  useFocusEffect(refresh);
  return stats;
}

/** Forget cached stats (e.g. after a practice session or a level change). */
export function clearMissionStatsCache() {
  cache.clear();
}
