import React, { useCallback, useState } from "react";
import { LANGUAGE_KEYS } from "../../constants/languages";
import { LanguageSelect, LevelPicker, RouteTicket } from "./LanguageVoyagePicker";

// Onboarding language steps shared by sign-up (/register) and /finish-profile:
// step 1 "I speak…" (native language), step 2 "I want to practise…" (one or more
// languages other than the native one, each with a level).

export const LANGUAGE_ERRORS = {
  nativeRequired: "Choose the language you speak.",
  practiceRequired: "Choose the language you want to practise.",
  practiceIsNative: "Choose a language other than your native one.",
};

/** State for both language steps; kept by the page so going back never loses choices. */
export function useLanguageChoices(initialNative = "") {
  const [nativeLanguage, setNativeLanguageState] = useState(initialNative);
  const [practiceLanguages, setPracticeLanguages] = useState([]);
  const [practiceLanguageLevels, setPracticeLanguageLevels] = useState({});
  const [initialPracticeLevel, setInitialPracticeLevel] = useState("beginner");
  const [errors, setErrors] = useState({ native: "", practice: "" });

  const setError = useCallback((field, message) => {
    setErrors((previous) => ({ ...previous, [field]: message }));
  }, []);

  const updatePracticeLanguages = (languages) => {
    setPracticeLanguages(languages);
    setPracticeLanguageLevels((previous) =>
      Object.fromEntries(
        languages.map((language, index) => [
          language,
          previous[language] || (index === 0 ? initialPracticeLevel : "beginner"),
        ])
      )
    );
    setError("practice", "");
  };

  const setNativeLanguage = (language) => {
    setNativeLanguageState(language);
    updatePracticeLanguages(practiceLanguages.filter((key) => key !== language));
    setError("native", "");
  };

  const setLevel = (language, level) => {
    if (!language) setInitialPracticeLevel(level);
    else setPracticeLanguageLevels((previous) => ({ ...previous, [language]: level }));
  };

  const validateNative = () => {
    const message = nativeLanguage ? "" : LANGUAGE_ERRORS.nativeRequired;
    setError("native", message);
    return !message;
  };

  const validatePractice = () => {
    let message = "";
    if (!practiceLanguages.length) message = LANGUAGE_ERRORS.practiceRequired;
    else if (practiceLanguages.includes(nativeLanguage)) message = LANGUAGE_ERRORS.practiceIsNative;
    setError("practice", message);
    return !message;
  };

  /** Body fields for /api/register/, /api/auth/google/ `profile` and /api/auth/complete-profile/. */
  const toPayload = () => ({
    nativeLanguage,
    practiceLanguages,
    practiceLanguageLevels: Object.fromEntries(
      practiceLanguages.map((language) => [language, practiceLanguageLevels[language] || "beginner"])
    ),
  });

  return {
    nativeLanguage,
    practiceLanguages,
    practiceLanguageLevels,
    initialPracticeLevel,
    errors,
    setError,
    setNativeLanguage,
    updatePracticeLanguages,
    setLevel,
    validateNative,
    validatePractice,
    toPayload,
  };
}

/** Thin bar per step plus "Step n of N · label". */
export function StepProgress({ steps, current, label = "Sign-up progress" }) {
  return (
    <div className="mb-4">
      <ol aria-label={label} className="flex gap-2">
        {steps.map((name, index) => (
          <li key={name} aria-current={index === current ? "step" : undefined} className="min-w-0 flex-1">
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full transition-colors motion-reduce:transition-none ${
                index <= current ? "bg-[var(--lv-teal)]" : "bg-[var(--lv-cream-deep)]"
              }`}
            />
            <span
              className={`mt-1.5 hidden truncate text-xs sm:block ${
                index === current ? "font-semibold text-[var(--lv-ink)]" : "text-[var(--lv-muted-ink)]"
              }`}
            >
              <span className="sr-only">{index < current ? "Done: " : index === current ? "Current: " : ""}</span>
              {name}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-xs font-semibold text-[var(--lv-muted-ink)] sm:hidden">
        Step {current + 1} of {steps.length} · {steps[current]}
      </p>
    </div>
  );
}

/** Step title; focused (tabIndex -1) when the step changes so screen readers announce it. */
export const StepHeading = React.forwardRef(function StepHeading({ id, title, description }, ref) {
  return (
    <div className="mb-3">
      <h3
        id={id}
        ref={ref}
        tabIndex={-1}
        className="lv-font-display text-xl font-bold text-[var(--lv-ink)] outline-none sm:text-2xl"
      >
        {title}
      </h3>
      {description ? <p className="mt-1 text-sm leading-6 text-[var(--lv-muted-ink)]">{description}</p> : null}
    </div>
  );
});

const fieldError = (id, message) =>
  message ? (
    <p id={id} className="mt-1 text-xs text-rose-700" role="alert">
      {message}
    </p>
  ) : null;

export const NativeLanguageStep = React.forwardRef(function NativeLanguageStep({ choices }, headingRef) {
  return (
    <div>
      <StepHeading
        id="native-language-label"
        ref={headingRef}
        title="I speak…"
        description="Your native language — partners learning it will find you."
      />
      <LanguageSelect
        id="native-language"
        labelId="native-language-label"
        value={choices.nativeLanguage}
        options={LANGUAGE_KEYS}
        onChange={choices.setNativeLanguage}
        invalid={Boolean(choices.errors.native)}
        describedBy={choices.errors.native ? "native-language-error" : undefined}
      />
      {fieldError("native-language-error", choices.errors.native)}
    </div>
  );
});

export const PracticeLanguagesStep = React.forwardRef(function PracticeLanguagesStep({ choices }, headingRef) {
  const { nativeLanguage, practiceLanguages, practiceLanguageLevels, initialPracticeLevel, errors } = choices;
  // One practice language at sign-up (more can be added later in the profile).
  const practiceLanguage = practiceLanguages[0] || "";

  return (
    <div className="space-y-3.5">
      <StepHeading
        id="practice-language-label"
        ref={headingRef}
        title="I want to practise…"
        description="Pick the language you want to practise and how well you speak it."
      />
      {/* Both columns carry a label row so the two pickers line up. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:gap-3">
        <div>
          <p id="practice-language-field-label" className="mb-1.5 text-sm font-semibold text-[var(--lv-ink)]">
            Language
          </p>
          <LanguageSelect
            id="practice-language"
            labelId="practice-language-field-label"
            value={practiceLanguage}
            placeholder="Choose a language"
            options={LANGUAGE_KEYS.filter((key) => key !== nativeLanguage)}
            onChange={(language) => choices.updatePracticeLanguages(language ? [language] : [])}
            invalid={Boolean(errors.practice)}
            describedBy={errors.practice ? "practice-language-error" : undefined}
          />
          {fieldError("practice-language-error", errors.practice)}
        </div>

        <div>
          <p id="practice-level-label" className="mb-1.5 text-sm font-semibold text-[var(--lv-ink)]">
            My level
          </p>
          <LevelPicker
            value={practiceLanguageLevels[practiceLanguage] || initialPracticeLevel}
            onChange={(level) => choices.setLevel(practiceLanguage || undefined, level)}
          />
        </div>
      </div>
      <RouteTicket nativeLanguage={nativeLanguage} practiceLanguages={practiceLanguages} />
    </div>
  );
});

export const primaryButtonClassName =
  "inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--lv-teal)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,110,101,0.22)] transition hover:bg-[var(--lv-teal-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(23,127,121,0.25)] disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButtonClassName =
  "inline-flex min-h-[48px] items-center justify-center rounded-full border border-[var(--lv-line)] bg-[var(--lv-paper)] px-5 py-3 text-sm font-semibold text-[var(--lv-ink)] transition hover:bg-[var(--lv-cream)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(23,127,121,0.25)] disabled:cursor-not-allowed disabled:opacity-60";

/** Back (optional) + primary action, full width on phones. */
export function StepActions({ onBack, primaryLabel, busy = false, busyLabel }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} disabled={busy} className={secondaryButtonClassName}>
          <span aria-hidden="true" className="mr-1.5">←</span>
          Back
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      <button type="submit" disabled={busy} className={`${primaryButtonClassName} sm:min-w-[11rem]`}>
        {busy && busyLabel ? busyLabel : primaryLabel}
      </button>
    </div>
  );
}
