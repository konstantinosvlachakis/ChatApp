// src/pages/Community/page.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileCard from "../../components/Cards/ProfileCard";
import { BASE_URL } from "../../constants/constants";

// right below your interfaces
interface RawProfile {
  username: string;
  nativeLanguage: string;
  learningLanguage?: string;
  languagesPracticing?: string[];
  bio?: string;
  profileImage?: string;
}

const PAGE_SIZE = 24;

const CommunityPage: React.FC = () => {
  const [registeredProfiles, setRegisteredProfiles] = useState<RawProfile[]>([]);
  const [search, setSearch] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [activeSegment, setActiveSegment] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const loadRegisteredProfilesPage = async () => {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
        if (!token) {
          if (isMounted) {
            setHasNextPage(false);
          }
          return;
        }

        const response = await fetch(
          `${BASE_URL}/api/profile/data?page=${page}&page_size=${PAGE_SIZE}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          }
        );

        if (!response.ok) {
          console.error("Failed to fetch registered profiles:", response.status);
          return;
        }

        const payload = await response.json();
        const nextProfiles: RawProfile[] = (payload?.profiles || []).map((p: any) => ({
          username: p.username,
          nativeLanguage: p.native_language || "Unknown",
          learningLanguage:
            (p.languages_practicing && p.languages_practicing[0]) ||
            p.learning_language ||
            "",
          languagesPracticing: p.languages_practicing || [],
          bio: p.bio || "Registered user",
          profileImage: p.profile_image_url
            ? p.profile_image_url.startsWith("http")
              ? p.profile_image_url
              : p.profile_image_url.startsWith("/media/")
                ? `${BASE_URL}${p.profile_image_url}`
                : `${BASE_URL}/media/${p.profile_image_url}`
            : undefined,
        }));

        if (isMounted) {
          setRegisteredProfiles((prev) => {
            const mergedByUsername = new Map<string, RawProfile>();
            [...prev, ...nextProfiles].forEach((profile) => {
              mergedByUsername.set(profile.username, profile);
            });
            return Array.from(mergedByUsername.values());
          });
          setHasNextPage(Boolean(payload?.pagination?.has_next));
        }
      } catch (err) {
        console.error("Error loading profiles:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };

    loadRegisteredProfilesPage();
    return () => {
      isMounted = false;
    };
  }, [page]);

  const profiles = useMemo(() => {
    const mergedByUsername = new Map<string, RawProfile>();
    registeredProfiles.forEach((profile) => {
      mergedByUsername.set(profile.username, profile);
    });
    return Array.from(mergedByUsername.values());
  }, [registeredProfiles]);

  const handleLoadMore = () => {
    if (loadingMore || !hasNextPage) return;
    setPage((prev) => prev + 1);
  };

  // Derive unique languages
  const languageOptions = useMemo(() => {
    const langs = Array.from(new Set(profiles.map((p) => p.nativeLanguage)));
    return ["All", ...langs];
  }, [profiles]);

  // Apply search + filter
  const filteredProfiles = useMemo(
    () =>
      profiles.filter((p) => {
        const matchesSearch =
          p.username.toLowerCase().includes(search.toLowerCase()) ||
          p.bio?.toLowerCase().includes(search.toLowerCase());
        const matchesLang =
          !filterLang || filterLang === "All" || p.nativeLanguage === filterLang;
        return matchesSearch && matchesLang;
      }),
    [profiles, search, filterLang]
  );

  const handleCardClick = (profile: RawProfile) => {
    navigate(`/people/${profile.username}`, { state: { profile } });
  };

  return (
    <div className="min-h-screen bg-[#f7f6f4] py-4 sm:py-6">
      <div className="w-full px-2 sm:px-4 md:px-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSegment("all")}
              className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-medium transition ${
                activeSegment === "all"
                  ? "bg-slate-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              All members
            </button>
            <button
              type="button"
              onClick={() => setActiveSegment("nearby")}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition ${
                activeSegment === "nearby"
                  ? "bg-slate-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
              Nearby
            </button>
            <button
              type="button"
              onClick={() => setActiveSegment("travel")}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition ${
                activeSegment === "travel"
                  ? "bg-slate-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
              Travel
            </button>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative w-full sm:flex-1 lg:w-[360px] lg:flex-none">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find members or topics"
                className="h-11 w-full rounded-full border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-slate-500"
              />
            </div>
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="h-11 w-full rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition hover:bg-slate-50 sm:w-auto"
              aria-label="Filter by language"
            >
              {languageOptions.map((lang) => (
                <option key={lang} value={lang === "All" ? "" : lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-slate-500">Loading profiles…</p>
        ) : filteredProfiles.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProfiles.map((profile, index) => (
                <ProfileCard
                  key={profile.username}
                  username={profile.username}
                  bio={profile.bio}
                  nativeLanguage={profile.nativeLanguage}
                  learningLanguage={profile.learningLanguage}
                  profileImage={profile.profileImage}
                  score={Math.max(1, 14 - (index % 14))}
                  onClick={() => handleCardClick(profile)}
                />
              ))}
            </div>
            {hasNextPage && (
              <div className="mt-6 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-12 text-center text-slate-500">
            No matches found. Try adjusting your search or filters.
          </p>
        )}
      </div>
    </div>
  );
};

export default CommunityPage;
