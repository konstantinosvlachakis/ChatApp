import React from "react";
import { BASE_URL_IMG } from "../../constants/constants";

interface ProfileCardProps {
  username: string;
  bio?: string;
  nativeLanguage: string;
  learningLanguage?: string;
  profileImage?: string;
  score?: number;
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
    Russian: "ru",
    Turkish: "tr",
    Arabic: "sa",
    Japanese: "jp",
    Korean: "kr",
    Chinese: "cn",
    Hindi: "in",
  };
  return map[language] || "un";
};

const ProfileCard: React.FC<ProfileCardProps> = ({
  username,
  bio,
  nativeLanguage,
  learningLanguage,
  profileImage,
  score,
  onClick,
}) => {
  const defaultImage = `${BASE_URL_IMG}/media/profile_images/MainAfter.jpg`;

  // base URL for the image
  const profileSrc = profileImage?.startsWith("http")
    ? profileImage
    : `${BASE_URL_IMG}/media/${profileImage || "media/profile_images/MainAfter.jpg"}`;

  const smallSrc = profileSrc;
  const largeSrc = smallSrc;

  return (
    <div
      onClick={onClick}
      className="group relative flex w-full max-w-lg cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="h-28 w-28 flex-shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100">
        <img
          src={smallSrc}
          srcSet={`${largeSrc} 2x`}
          alt={username}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.removeAttribute("srcset");
            img.src = defaultImage;
          }}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="ml-6 flex min-w-0 flex-1 flex-col justify-between">
        <div className="pr-10">
          <h3 className="truncate text-xl font-semibold text-slate-900">{username}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
            {bio || "Open to language exchange and meaningful chats."}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="font-semibold tracking-wide text-slate-500">FLUENT</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
            {nativeLanguage}
            <img
              src={`https://flagcdn.com/w20/${getFlagIcon(nativeLanguage)}.png`}
              alt={nativeLanguage}
              className="h-4 w-4 rounded-full"
            />
          </span>
          {learningLanguage && (
            <>
              <span className="font-semibold tracking-wide text-slate-500">LEARNS</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-cyan-800">
                {learningLanguage}
                <img
                  src={`https://flagcdn.com/w20/${getFlagIcon(learningLanguage)}.png`}
                  alt={learningLanguage}
                  className="h-4 w-4 rounded-full"
                />
              </span>
            </>
          )}
        </div>
      </div>

      {typeof score === "number" && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700">
          {score}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M12 3c-4.97 0-9 3.58-9 8 0 2.21 1.01 4.21 2.64 5.66L4 21l4.8-2.19c1 .3 2.07.46 3.2.46 4.97 0 9-3.58 9-8s-4.03-8-9-8z" />
          </svg>
        </span>
      )}
    </div>
  );
};

export default ProfileCard;
