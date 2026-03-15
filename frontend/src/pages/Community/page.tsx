import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileCard from "../../components/Cards/ProfileCard";
import { BASE_URL } from "../../constants/constants";

interface RawProfile {
  username: string;
  nativeLanguage: string;
  learningLanguage?: string;
  languagesPracticing?: string[];
  bio?: string;
  profileImage?: string;
}

const PAGE_SIZE = 24;

const segmentOptions = [
  { key: "all", label: "All members" },
  { key: "nearby", label: "Nearby", icon: true },
  { key: "travel", label: "Travel", icon: true },
];

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
        const response = await fetch(
          `${BASE_URL}/api/profile/data?page=${page}&page_size=${PAGE_SIZE}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
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

  const languageOptions = useMemo(() => {
    const langs = Array.from(new Set(profiles.map((p) => p.nativeLanguage)));
    return ["All", ...langs];
  }, [profiles]);

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
    <div className="min-h-screen bg-[var(--lv-background)] py-5 sm:py-6">
      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-5 md:px-8">
        <section className="rounded-[34px] border border-[var(--lv-border)] bg-[linear-gradient(180deg,#f9fbfd_0%,#f3f7fb_100%)] px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--lv-link)]">
                LangVoyage Community
              </p>
              <h1 className="mt-3 font-['Sora'] text-3xl font-bold tracking-tight text-[var(--lv-text)] sm:text-4xl">
                Meet people who make practice feel natural.
              </h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--lv-muted-text)] sm:text-base">
                Browse thoughtful profiles, discover compatible speakers, and move into
                conversations with a calmer, more curated feeling.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px] lg:w-[520px]">
              <div className="relative w-full">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lv-muted-text)]"
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
                  className="h-12 w-full rounded-full border border-[var(--lv-border)] bg-white pl-11 pr-4 text-sm text-[var(--lv-text)] outline-none transition focus:border-[var(--lv-primary)]"
                />
              </div>
              <select
                value={filterLang}
                onChange={(e) => setFilterLang(e.target.value)}
                className="h-12 w-full rounded-full border border-[var(--lv-border)] bg-white px-4 text-sm text-[var(--lv-text)] outline-none transition focus:border-[var(--lv-primary)]"
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

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {segmentOptions.map((segment) => (
              <button
                key={segment.key}
                type="button"
                onClick={() => setActiveSegment(segment.key)}
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition ${
                  activeSegment === segment.key
                    ? "border border-[var(--lv-navy)] bg-[var(--lv-navy)] text-white"
                    : "border border-[var(--lv-border)] bg-white text-[var(--lv-text)] hover:border-[rgba(20,49,74,0.22)]"
                }`}
              >
                {segment.icon ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                  </svg>
                ) : null}
                {segment.label}
              </button>
            ))}
            <div className="ml-auto hidden items-center gap-2 rounded-full border border-[var(--lv-border)] bg-white px-3 py-2 text-sm text-[var(--lv-muted-text)] xl:inline-flex">
              <span className="font-semibold text-[var(--lv-text)]">{filteredProfiles.length}</span>
              visible members
            </div>
          </div>
        </section>

        <div className="mt-6">
          {loading ? (
            <p className="py-16 text-center text-[var(--lv-muted-text)]">Loading profiles…</p>
          ) : filteredProfiles.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                <div className="mt-8 flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-full bg-[var(--lv-navy)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMore ? "Loading..." : "Load more members"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-10 rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] px-6 py-12 text-center">
              <p className="text-lg font-semibold text-[var(--lv-text)]">No matches yet.</p>
              <p className="mt-2 text-sm text-[var(--lv-muted-text)]">
                Try adjusting your search or choosing a different language filter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;
