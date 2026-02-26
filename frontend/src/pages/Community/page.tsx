// src/pages/Community/page.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileCard from "../../components/Cards/ProfileCard";
import profilesData from "../../datasets/dummyProfiles.json" // optional assert if needed
import { BASE_URL } from "../../constants/constants";

// right below your interfaces
interface RawProfile {
  username: string;
  nativeLanguage: string;
  learningLanguage?: string;
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
  const navigate = useNavigate();
  const dummyProfiles = useMemo(
    () =>
      (profilesData as RawProfile[]).map((p: any) => ({
        username: p.username,
        nativeLanguage: p.nativeLanguage,
        learningLanguage: p.learningLanguage,
        bio: p.bio,
        profileImage: p.profileImage,
      })),
    []
  );

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
          learningLanguage: p.learning_language || "",
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
    [...dummyProfiles, ...registeredProfiles].forEach((profile) => {
      mergedByUsername.set(profile.username, profile);
    });
    return Array.from(mergedByUsername.values());
  }, [dummyProfiles, registeredProfiles]);

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
    <div className="bg-gray-50 min-h-screen py-5 sm:py-8 md:py-10">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4 sm:mb-6">
          Discover Language Partners
        </h1>

        {/* Controls */}
        <div className="mb-5 sm:mb-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or bio..."
            className="w-full sm:w-1/2 rounded-full border border-gray-300 p-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="w-full sm:w-1/4 rounded-full border border-gray-300 p-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {languageOptions.map((lang) => (
              <option key={lang} value={lang === "All" ? "" : lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <p className="text-center text-gray-500">Loading profiles…</p>
        ) : filteredProfiles.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {filteredProfiles.map((profile) => (
                <ProfileCard
                  key={profile.username}
                  username={profile.username}
                  bio={profile.bio}
                  nativeLanguage={profile.nativeLanguage}
                  learningLanguage={profile.learningLanguage}
                  profileImage={profile.profileImage}
                  onClick={() => handleCardClick(profile)}
                />
              ))}
            </div>
            {hasNextPage && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-blue-500 px-5 py-2 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-gray-500 mt-12">
            No matches found. Try adjusting your search or filters.
          </p>
        )}
      </div>
    </div>
  );
};

export default CommunityPage;
