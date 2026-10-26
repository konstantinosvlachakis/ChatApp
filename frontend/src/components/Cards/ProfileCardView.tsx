import React from "react";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import { BASE_URL_IMG } from "../../constants/constants";

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

const ProfileCardView: React.FC<ProfileCardProps> = ({
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
  const profileSrc = profileImage?.startsWith("http")
    ? profileImage
    : `${BASE_URL_IMG}/media/${profileImage || "media/profile_images/MainAfter.jpg"}`;

  const cardTone = isPremium
    ? {
        border:
          "border-[rgba(217,119,6,0.26)] bg-[linear-gradient(155deg,rgba(255,251,245,0.98)_0%,rgba(255,244,226,0.96)_42%,rgba(255,252,247,0.98)_100%)] shadow-[0_24px_60px_rgba(176,102,14,0.14)] hover:shadow-[0_34px_72px_rgba(176,102,14,0.18)]",
        panel: "border-amber-100/90 bg-white/72",
        halo: "from-[rgba(251,191,36,0.26)] via-[rgba(245,158,11,0.16)] to-transparent",
        tag: "bg-[rgba(217,119,6,0.1)] text-amber-700",
        stat: "bg-[rgba(255,255,255,0.78)] text-amber-800",
        primaryChip: "bg-[rgba(255,243,220,0.95)] text-amber-900",
      }
    : {
        border:
          "border-[rgba(196,214,228,0.88)] bg-[linear-gradient(155deg,rgba(255,255,255,0.98)_0%,rgba(244,249,253,0.98)_40%,rgba(251,253,255,0.98)_100%)] shadow-[0_24px_60px_rgba(20,49,74,0.1)] hover:shadow-[0_34px_72px_rgba(20,49,74,0.14)]",
        panel: "border-[rgba(215,226,234,0.9)] bg-white/76",
        halo: "from-[rgba(27,127,121,0.18)] via-[rgba(23,127,141,0.14)] to-transparent",
        tag: "bg-[rgba(20,49,74,0.07)] text-[var(--lv-muted-text)]",
        stat: "bg-[rgba(255,255,255,0.82)] text-[var(--lv-primary)]",
        primaryChip: "bg-[rgba(231,241,248,0.96)] text-[var(--lv-text)]",
      };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-full min-h-[360px] w-full flex-col overflow-hidden rounded-[34px] border p-5 text-left transition duration-300 hover:-translate-y-1.5 ${cardTone.border}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.86),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.58),transparent_28%)]"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -left-8 top-0 h-40 w-40 rounded-full bg-gradient-to-br blur-3xl ${cardTone.halo}`}
      />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border border-white/60 shadow-[0_16px_30px_rgba(8,19,32,0.14)]">
              <img
                src={profileSrc}
                alt={username}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.onerror = null;
                  img.src = defaultImage;
                }}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(8,19,32,0.16)_100%)]" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="max-w-[11ch] truncate font-['Georgia'] text-[2.15rem] font-semibold leading-none tracking-[-0.04em] text-[var(--lv-text)]">
                  {username}
                </h3>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.28em] ${cardTone.tag}`}>
                  {isPremium ? "Premium" : "Member"}
                </span>
              </div>

              <p className="mt-3 max-w-[30ch] text-[15px] leading-7 text-[var(--lv-muted-text)]">
                {bio || "Open to language exchange, easy conversation, and thoughtful daily practice."}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isPremium ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/88 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 shadow-[0_12px_24px_rgba(176,102,14,0.12)]">
                <WorkspacePremiumRoundedIcon sx={{ fontSize: 16 }} />
                Gold
              </span>
            ) : null}

            {typeof score === "number" && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold shadow-[0_12px_24px_rgba(20,49,74,0.08)] ${cardTone.stat}`}>
                {score}
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 3c-4.97 0-9 3.58-9 8 0 2.21 1.01 4.21 2.64 5.66L4 21l4.8-2.19c1 .3 2.07.46 3.2.46 4.97 0 9-3.58 9-8s-4.03-8-9-8z" />
                </svg>
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-[24px] border p-4 backdrop-blur ${cardTone.panel}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-[var(--lv-muted-text)]">
              Fluent In
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[15px] font-medium ${cardTone.primaryChip}`}>
                {nativeLanguage}
                <img
                  src={`https://flagcdn.com/w20/${getFlagIcon(nativeLanguage)}.png`}
                  alt={nativeLanguage}
                  className="h-4 w-4 rounded-full"
                />
              </span>
            </div>
          </div>

          <div className={`rounded-[24px] border p-4 backdrop-blur ${cardTone.panel}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-[var(--lv-muted-text)]">
              Learning
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {learningLanguage ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(27,127,121,0.12)] px-3.5 py-2 text-[15px] font-medium text-[var(--lv-primary)]">
                  {learningLanguage}
                  <img
                    src={`https://flagcdn.com/w20/${getFlagIcon(learningLanguage)}.png`}
                    alt={learningLanguage}
                    className="h-4 w-4 rounded-full"
                  />
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[rgba(20,49,74,0.06)] px-3.5 py-2 text-[14px] text-[var(--lv-muted-text)]">
                  Open to suggestions
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className={`flex items-center justify-between rounded-[24px] border px-4 py-3.5 backdrop-blur ${cardTone.panel}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--lv-muted-text)]">
                Match Mood
              </p>
              <p className="mt-1 text-sm text-[var(--lv-text)]">
                {isPremium ? "High-intent practice partner" : "Easygoing conversation starter"}
              </p>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lv-navy)] text-white transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              <ArrowOutwardRoundedIcon sx={{ fontSize: 20 }} />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export type { ProfileCardProps };
export default ProfileCardView;
