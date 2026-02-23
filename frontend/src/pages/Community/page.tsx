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

const CommunityPage: React.FC = () => {
  const [profiles, setProfiles] = useState<RawProfile[]>([]);
  const [search, setSearch] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Load local dummy data instead of calling API
  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);
      try {
        const data = profilesData as RawProfile[];
        const dummyProfiles: RawProfile[] = data.map((p: any) => ({
          username: p.username,
          nativeLanguage: p.nativeLanguage,
          learningLanguage: p.learningLanguage,
          bio: p.bio,
          profileImage: p.profileImage,
        }));

        const token = sessionStorage.getItem("accessToken");
        let registeredProfiles: RawProfile[] = [];

        if (token) {
          const response = await fetch(`${BASE_URL}/api/profile/data`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          });

          if (response.ok) {
            const payload = await response.json();
            registeredProfiles = (payload?.profiles || []).map((p: any) => ({
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
          } else {
            console.error("Failed to fetch registered profiles:", response.status);
          }
        }

        const mergedByUsername = new Map<string, RawProfile>();
        [...dummyProfiles, ...registeredProfiles].forEach((profile) => {
          mergedByUsername.set(profile.username, profile);
        });

        setProfiles(Array.from(mergedByUsername.values()));
      } catch (err) {
        console.error("Error loading profiles:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProfiles();
  }, []);

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
    <div className="bg-gray-50 min-h-screen py-10">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          Discover Language Partners
        </h1>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or bio..."
            className="w-full sm:w-1/2 p-3 rounded-full border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="w-full sm:w-1/4 p-3 rounded-full border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
