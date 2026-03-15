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
      className="group relative flex w-full cursor-pointer gap-5 rounded-[28px] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-6 transition hover:border-[rgba(27,127,121,0.34)] hover:bg-[#fbfdff]"
    >
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-[26px] border border-[var(--lv-border)] bg-[var(--lv-surface-muted)]">
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

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="pr-12">
          <h3 className="truncate text-[2rem] font-semibold leading-none text-[var(--lv-text)]">
            {username}
          </h3>
          <p className="mt-3 line-clamp-2 text-[15px] leading-7 text-[var(--lv-muted-text)]">
            {bio || "Open to language exchange and meaningful chats."}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-slate-700">
          <span className="font-semibold tracking-[0.18em] text-[var(--lv-muted-text)]">FLUENT</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lv-surface-muted)] px-3 py-1.5 text-[15px] text-[var(--lv-text)]">
            {nativeLanguage}
            <img
              src={`https://flagcdn.com/w20/${getFlagIcon(nativeLanguage)}.png`}
              alt={nativeLanguage}
              className="h-4 w-4 rounded-full"
            />
          </span>
          {learningLanguage && (
            <>
              <span className="font-semibold tracking-[0.18em] text-[var(--lv-muted-text)]">LEARNS</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(27,127,121,0.1)] px-3 py-1.5 text-[15px] text-[var(--lv-primary)]">
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
        <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-[rgba(27,127,121,0.1)] px-3 py-1.5 text-sm font-semibold text-[var(--lv-primary)]">
          {score}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
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
