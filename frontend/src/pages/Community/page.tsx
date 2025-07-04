// src/pages/Community/page.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfileCard from "../../components/Cards/ProfileCard";
import { getProfileData } from "./api/getProfileData";
import { createOrGetConversation } from "./api/conversation";

interface ProfileData {
  username: string;
  nativeLanguage: string;
  learningLanguage?: string;
  bio?: string;
  profileImage?: string;
}

const CommunityPage: React.FC = () => {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [search, setSearch] = useState("");
  const [filterLang, setFilterLang] = useState(""); // native-language filter
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getProfileData(navigate);
        if (data?.profiles) {
          // map your API response shape to ProfileData
          const mapped: ProfileData[] = data.profiles.map((p: any) => ({
            username: p.username,
            nativeLanguage: p.native_language,
            learningLanguage: p.learning_language,
            bio: p.bio,
            profileImage: p.profile_image_url, // or whatever key you expose
          }));
          setProfiles(mapped);
        }
      } catch (err) {
        console.error("Failed to load profiles:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // derive unique native languages for the filter dropdown
  const languageOptions = useMemo(() => {
    const langs = Array.from(new Set(profiles.map((p) => p.nativeLanguage)));
    return ["All", ...langs];
  }, [profiles]);

  // apply search + filter
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
