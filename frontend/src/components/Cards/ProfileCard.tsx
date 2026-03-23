import React from "react";
import { BASE_URL_IMG } from "../../constants/constants";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";

interface ProfileCardProps {
  username: string;
  bio?: string;
  nativeLanguage: string;
  learningLanguage?: string;
  profileImage?: string;
  score?: number;
  isPremium?: boolean;
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
  isPremium = false,
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
      className={`group relative flex h-full min-h-[260px] w-full cursor-pointer flex-col overflow-hidden rounded-[32px] border p-6 transition ${
        isPremium
          ? "border-[rgba(217,119,6,0.24)] bg-[linear-gradient(180deg,#fffdfa_0%,#fff6ea_100%)] shadow-[0_24px_50px_rgba(217,119,6,0.12)] hover:-translate-y-1 hover:border-[rgba(217,119,6,0.4)] hover:shadow-[0_28px_60px_rgba(217,119,6,0.18)]"
          : "border-[var(--lv-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_18px_40px_rgba(20,49,74,0.08)] hover:-translate-y-1 hover:border-[rgba(27,127,121,0.28)] hover:shadow-[0_24px_52px_rgba(20,49,74,0.12)]"
      }`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-12 top-0 h-20 rounded-full blur-2xl ${
          isPremium
            ? "bg-[radial-gradient(circle,rgba(251,191,36,0.34),transparent_72%)]"
            : "bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_72%)]"
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
          isPremium
            ? "bg-[linear-gradient(90deg,#f59e0b,#fbbf24,#fcd34d)]"
            : "bg-[linear-gradient(90deg,rgba(27,127,121,0.12),rgba(23,127,141,0.34),rgba(27,127,121,0.12))]"
        }`}
      />

      {isPremium && (
        <div className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 shadow-[0_10px_20px_rgba(217,119,6,0.12)]">
          <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <WorkspacePremiumRoundedIcon sx={{ fontSize: 16 }} />
          </span>
          Premium
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className={`h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border ${
              isPremium
                ? "border-amber-200/70 shadow-[0_10px_24px_rgba(217,119,6,0.14)]"
                : "border-[var(--lv-border)]"
            } bg-[var(--lv-surface-muted)]`}>
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

            <div className={`min-w-0 ${isPremium ? "pr-12" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="max-w-full truncate font-['Sora'] text-[2rem] font-semibold leading-none tracking-tight text-[var(--lv-text)]">
                  {username}
                </h3>
                {!isPremium && (
                  <span className="rounded-full bg-[var(--lv-surface-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lv-muted-text)]">
                    Member
                  </span>
                )}
              </div>

              <p
                className={`mt-3 max-w-[28ch] text-[15px] leading-7 ${
                  isPremium
                    ? "line-clamp-3 text-[rgba(96,73,24,0.82)]"
                    : "line-clamp-3 text-[var(--lv-muted-text)]"
                }`}
              >
                {bio || (isPremium
                  ? "Premium member open to deeper practice, better conversations, and serious language exchange."
                  : "Open to language exchange and meaningful chats.")}
              </p>
            </div>
          </div>

          {typeof score === "number" && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                isPremium
                  ? "bg-[rgba(217,119,6,0.12)] text-amber-700"
                  : "bg-[rgba(27,127,121,0.1)] text-[var(--lv-primary)]"
              }`}
            >
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

        <div className="mt-auto pt-6">
          <div
            className={`rounded-[24px] border px-4 py-4 ${
              isPremium
                ? "border-amber-100 bg-white/78"
                : "border-[rgba(215,226,234,0.8)] bg-white/78"
            }`}
          >
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--lv-muted-text)]">
                  Fluent
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lv-surface-muted)] px-3 py-1.5 text-[15px] text-[var(--lv-text)]">
                  {nativeLanguage}
                  <img
                    src={`https://flagcdn.com/w20/${getFlagIcon(nativeLanguage)}.png`}
                    alt={nativeLanguage}
                    className="h-4 w-4 rounded-full"
                  />
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--lv-muted-text)]">
                  Learns
                </span>
                {learningLanguage ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(27,127,121,0.1)] px-3 py-1.5 text-[15px] text-[var(--lv-primary)]">
                    {learningLanguage}
                    <img
                      src={`https://flagcdn.com/w20/${getFlagIcon(learningLanguage)}.png`}
                      alt={learningLanguage}
                      className="h-4 w-4 rounded-full"
                    />
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--lv-surface-muted)] px-3 py-1.5 text-[13px] text-[var(--lv-muted-text)]">
                    Open to suggestions
                  </span>
                )}
              </div>

              {isPremium && (
                <div className="flex items-center justify-between gap-3 rounded-[18px] bg-[linear-gradient(90deg,rgba(251,191,36,0.12),rgba(245,158,11,0.06))] px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                    Spotlight
                  </span>
                  <span className="text-[13px] font-medium text-amber-900">
                    Prioritized visibility
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 ${
          isPremium
            ? "bg-[linear-gradient(135deg,transparent,rgba(251,191,36,0.05))]"
            : "bg-[linear-gradient(135deg,transparent,rgba(23,127,141,0.04))]"
        }`}
      />
    </div>
  );
};

export default ProfileCard;
