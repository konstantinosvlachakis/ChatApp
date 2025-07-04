import React from "react";
import { BASE_URL_IMG } from "../../constants/constants";

interface ProfileCardProps {
  username: string;
  bio?: string;
  nativeLanguage: string;
  learningLanguage?: string;
  profileImage?: string;
  onClick?: () => void;
}

// Map a language to a country‐code for flagcdn.com
const getFlagIcon = (language: string) => {
  const map: Record<string, string> = {
    English: "gb",
    Greek: "gr",
    Spanish: "es",
    German: "de",
    French: "fr",
    Italian: "it",
    Portuguese: "pt",
  };
  return map[language] || "un";
};

const ProfileCard: React.FC<ProfileCardProps> = ({
  username,
  bio,
  nativeLanguage,
  learningLanguage,
  profileImage,
  onClick,
}) => {
  const defaultImage = `${BASE_URL_IMG}/media/profile_images/MainAfter.jpg`;

  // base URL for the image
  const profileSrc = profileImage?.startsWith("http")
    ? profileImage
    : `${BASE_URL_IMG}/media/${profileImage || "media/profile_images/MainAfter.jpg"}`;

  // small and large versions (assumes you have a @2x suffix available)
  const smallSrc = profileSrc;
  const largeSrc = smallSrc;
  return (
    <div
      onClick={onClick}
      className="group flex max-w-lg w-full bg-white rounded-2xl shadow-md hover:shadow-lg transition p-6 cursor-pointer"
    >
      {/* Avatar Wrapper (clips overflow) */}
      <div className="w-28 h-28 flex-shrink-0 rounded-full overflow-hidden border-2 border-gray-200">
        <img
          src={smallSrc}
          srcSet={`${largeSrc} 2x`}           // only 2×, no “1x” needed
          alt={username}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;               // 1️⃣ prevent further loops
            img.removeAttribute("srcset");    // 2️⃣ clear the srcSet
            img.src = defaultImage;           // 3️⃣ fallback
          }}
            className="
              w-full h-full object-cover
              transform transition-transform duration-300 ease-in-out
              will-change-transform backface-hidden
              group-hover:scale-105
              origin-center
            "
          />
        </div>


      {/* Content */}
      <div className="ml-6 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-gray-800">{username}</h3>
          <p className="mt-1 text-gray-600">{bio || "Let's connect!"}</p>
        </div>

        {/* Language Flags */}
        <div className="mt-4 flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full border border-gray-300 text-sm text-gray-700">
            Fluent
            <img
              src={`https://flagcdn.com/w20/${getFlagIcon(nativeLanguage)}.png`}
              alt={nativeLanguage}
              title={nativeLanguage}
              className="w-5 h-5 rounded-full ml-2"
            />
          </span>
          {learningLanguage && (
            <span className="inline-flex items-center px-3 py-1 bg-blue-50 rounded-full border border-blue-200 text-sm text-blue-700">
              Learning
              <img
                src={`https://flagcdn.com/w20/${getFlagIcon(learningLanguage)}.png`}
                alt={learningLanguage}
                title={learningLanguage}
                className="w-5 h-5 rounded-full ml-2"
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;
