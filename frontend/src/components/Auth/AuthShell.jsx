import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../CoachAvatar";

const defaultHighlights = [
  "Private one-to-one conversations",
  "Real speaking practice and feedback",
  "A calmer path to everyday confidence",
];

const AuthShell = ({
  eyebrow = "LangVoyage",
  title,
  description,
  children,
  footer,
  accentLabel = "Designed for real language confidence",
  highlights = defaultHighlights,
  leftTitle = "Learn a language by talking to real people.",
  leftDescription = "Meet people who speak the language you're learning and want to learn yours. Chat, practise with Lumi, and build the confidence to speak.",
}) => {
  return (
    // Same warm ivory surface as the public pages (styles/public.css `.lp-auth`).
    <div className="lp-auth lv-font-body relative min-h-[100dvh] overflow-hidden text-[var(--lv-ink)]">
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-start lg:gap-10 lg:px-8 lg:py-6 xl:gap-12 xl:py-8">
        <div className="flex flex-col items-center pb-4 text-center lg:hidden">
          <Link
            to="/"
            className="lp-auth-brand inline-flex items-center gap-3 text-[var(--lv-ink)]"
          >
            <CoachAvatar size={36} hideBadge />
            <span className="font-semibold tracking-tight">LangVoyage</span>
          </Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--lv-teal-strong)]">
            {accentLabel}
          </p>
        </div>
        <div
          style={{ "--lv-rise-y": "18px", "--lv-rise-duration": "0.55s" }}
          className="lv-rise hidden flex-1 px-1 py-4 text-center sm:px-2 sm:py-5 lg:sticky lg:top-6 lg:block lg:px-4 lg:pb-3 lg:pt-10 lg:text-left"
        >
          <Link
            to="/"
            className="lp-auth-brand inline-flex items-center gap-3 text-[var(--lv-ink)]"
          >
            <CoachAvatar size={40} hideBadge />
            <span className="font-semibold tracking-tight">LangVoyage</span>
          </Link>

          <div className="mx-auto mt-5 max-w-xl lg:mx-0 lg:mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--lv-teal-strong)] sm:text-xs sm:tracking-[0.28em]">
              {accentLabel}
            </p>
            <h1 className="lv-font-display mt-3 text-[2.2rem] font-bold leading-[1.04] text-[var(--lv-ink)] sm:text-[2.8rem] lg:text-[3.3rem] xl:text-[3.75rem]">
              {leftTitle}
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-6 text-[var(--lv-muted-ink)] sm:text-lg sm:leading-7 lg:mt-3 lg:text-[1.02rem] lg:leading-7">
              {leftDescription}
            </p>
          </div>

          <div className="mt-5 hidden max-w-2xl gap-3 sm:grid sm:grid-cols-3 lg:mt-5">
            {highlights.map((item) => (
              <div
                key={item}
                className="lp-hero-point rounded-3xl px-4 py-3.5"
              >
                <div aria-hidden="true" className="lp-hero-dot mb-2.5 h-2.5 w-2.5 rounded-full" />
                <p className="text-sm leading-6 text-[var(--lv-ink)]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            "--lv-rise-y": "24px",
            "--lv-rise-duration": "0.6s",
            "--lv-rise-delay": "0.08s",
          }}
          className="lv-rise w-full max-w-2xl flex-1 lg:max-w-[42rem]"
        >
          <div className="lp-auth-card flex flex-col rounded-[1.75rem] p-4 sm:p-7 lg:min-h-[46rem] lg:justify-center lg:rounded-[2rem] lg:p-7 xl:p-8">
            <div className="mb-4 text-center sm:mb-5 lg:mb-4 lg:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1b7f79] sm:text-xs sm:tracking-[0.28em]">
                {eyebrow}
              </p>
              <h2 className="lv-font-display mt-2 text-[1.75rem] font-bold leading-[1.1] text-[#14314a] sm:text-[2.1rem] lg:text-[2.35rem]">
                {title}
              </h2>
              <p className="mx-auto mt-2.5 max-w-xl text-sm leading-6 text-[#5f7085] sm:text-base lg:mx-0">
                {description}
              </p>
            </div>
            {children}
            {footer ? <div className="mt-5 lg:mt-4">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthShell;
