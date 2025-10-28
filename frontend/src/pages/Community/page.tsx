// src/pages/Community/page.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileCard from "../../components/Cards/ProfileCard";
import { createOrGetConversation } from "./api/conversation";
import { useUser } from "../../context/UserContext";
import profilesData from "../../datasets/dummyProfiles.json" // optional assert if needed

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
  const { user } = useUser();

  // Load local dummy data instead of calling API
  useEffect(() => {
    setLoading(true);
    try {
      // The dummy JSON can either be an array or wrapped in { profiles: [...] }
      const data = profilesData as RawProfile[];


      const mapped: RawProfile[] = data.map((p: any) => ({
        username: p.username,
        nativeLanguage: p.nativeLanguage,
        learningLanguage: p.learningLanguage,
        bio: p.bio,
        profileImage: p.profileImage,
      }));

      setProfiles(mapped);
    } catch (err) {
      console.error("Error loading dummy profiles:", err);
    } finally {
      setLoading(false);
    }
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

  const handleCardClick = async (username: string) => {
    if (!user) {
      console.warn("User not loaded yet, cannot start conversation.");
      return;
    }
    try {
      const conv = await createOrGetConversation(username);
      if (conv?.id) navigate(`/conversations/${conv.id}`);
    } catch (err) {
      console.error("Could not start conversation:", err);
    }
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
                onClick={() => handleCardClick(profile.username)}
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
