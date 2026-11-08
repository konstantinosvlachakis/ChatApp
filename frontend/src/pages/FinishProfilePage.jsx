import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import api, { getErrorMessage } from "../lib/api";
import { completeProfile, PROFILE_ERROR_FIELDS } from "../lib/authApi";
import { useUser } from "../context/UserContext";
import { browserNativeLanguage, normalizeLanguage, LANGUAGE_KEYS } from "../constants/languages";
import AuthShell from "../components/Auth/AuthShell";
import {
  NativeLanguageStep,
  PracticeLanguagesStep,
  StepActions,
  StepProgress,
  useLanguageChoices,
} from "../components/Auth/LanguageSteps";
import { clearClientSessionData, getLegacyRefreshToken, shouldUseLegacyAuthFallback } from "../utils/auth";

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,30}$/;
export const FINISH_PROFILE_STEPS = ["Your language", "Language to practise"];

const knownLanguage = (value) => {
  const key = normalizeLanguage(value);
  return LANGUAGE_KEYS.includes(key) ? key : "";
};

/**
 * /finish-profile: an account created without languages (Google sign-in from the log in
 * page) picks them here before using the app. Layout redirects every app route here
 * while `profile_complete === false`.
 */
const FinishProfilePage = () => {
  const { user, loading, refreshUserProfile, setUser } = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const choices = useLanguageChoices(knownLanguage(user?.native_language) || browserNativeLanguage());
  const [username, setUsername] = useState(user?.username || "");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const headingRef = useRef(null);
  const stepChangedRef = useRef(false);

  // The user may load after the first render (cold start): fill the generated username once.
  useEffect(() => {
    if (!usernameTouched && user?.username) setUsername(user.username);
  }, [user?.username, usernameTouched]);

  useEffect(() => {
    if (!stepChangedRef.current) {
      stepChangedRef.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const goHome = async () => {
    setDone(true);
    await refreshUserProfile();
    navigate("/profile", { replace: true });
  };

  const handleLogout = async () => {
    const legacyRefresh = shouldUseLegacyAuthFallback() ? getLegacyRefreshToken() : "";
    await api
      .post("/api/logout/", legacyRefresh ? { refresh: legacyRefresh } : undefined, { timeoutMs: 5000 })
      .catch(() => {});
    clearClientSessionData();
    queryClient.clear();
    setUser(null);
    navigate("/login", { replace: true });
  };

  if (!user) {
    if (loading) return <div className="p-6 text-sm text-[var(--lv-muted-ink)]">Loading…</div>;
    return <Navigate to="/login" replace />;
  }
  // Older backends omit the flag: treat a missing field as complete.
  if (user.profile_complete !== false && !done && !submitting) {
    return <Navigate to="/profile" replace />;
  }

  const validateUsername = () => {
    const trimmed = username.trim();
    let message = "";
    if (!trimmed) message = "Username is required.";
    else if (!USERNAME_REGEX.test(trimmed)) message = "Use 3-30 chars: letters, numbers, dot, dash or underscore.";
    setUsernameError(message);
    return !message;
  };

  const handleNativeContinue = (event) => {
    event.preventDefault();
    if (choices.validateNative()) {
      setSubmitError("");
      setStep(1);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    if (!choices.validateNative()) {
      setStep(0);
      return;
    }
    if (!choices.validatePractice() || !validateUsername()) return;

    const trimmed = username.trim();
    const payload = {
      ...choices.toPayload(),
      // Only send a username the user changed (the generated one is already theirs).
      ...(trimmed !== user.username ? { username: trimmed } : {}),
    };
    setSubmitting(true);
    try {
      await completeProfile(payload);
      await goHome();
    } catch (error) {
      if (error?.code === "profile_already_complete") {
        await goHome();
        return;
      }
      const field = PROFILE_ERROR_FIELDS[error?.code];
      const message = getErrorMessage(error, "Couldn't save your languages.");
      if (field === "native") {
        choices.setError("native", message);
        setStep(0);
      } else if (field === "practice") {
        choices.setError("practice", message);
      } else if (field === "username") {
        setUsernameError(message);
      } else {
        setSubmitError(message);
      }
      setDone(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Finish your profile."
      description="Tell us what you speak and what you want to practise, so we can introduce you to the right partners."
      footer={
        <p className="text-center text-sm text-slate-600">
          Not you?{" "}
          <button type="button" onClick={handleLogout} className="font-semibold text-[#1b7f79] underline-offset-2 hover:text-[#14314a] hover:underline">
            Log out
          </button>
          {" · "}
          <Link to="/privacy-policy" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
            Privacy Policy
          </Link>
        </p>
      }
    >
      <StepProgress steps={FINISH_PROFILE_STEPS} current={step} label="Profile progress" />
      {step === 0 ? (
        <form onSubmit={handleNativeContinue} noValidate aria-labelledby="native-language-label">
          <NativeLanguageStep ref={headingRef} choices={choices} />
          <StepActions primaryLabel="Continue" />
        </form>
      ) : (
        <form onSubmit={handleSubmit} noValidate aria-labelledby="practice-language-label">
          <PracticeLanguagesStep ref={headingRef} choices={choices} />
          <div className="mt-4">
            <label htmlFor="finish-username" className="mb-1.5 block text-sm font-semibold text-[var(--lv-ink)]">
              Username <span className="font-normal text-[var(--lv-muted-ink)]">(you can keep this one)</span>
            </label>
            <input
              id="finish-username"
              className="w-full rounded-2xl border border-[#d6e0e8] bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-[#1b7f79] focus:ring-4 focus:ring-[rgba(27,127,121,0.12)]"
              value={username}
              onChange={(event) => {
                setUsernameTouched(true);
                setUsername(event.target.value);
                setUsernameError("");
              }}
              autoComplete="username"
              aria-invalid={usernameError ? "true" : undefined}
              aria-describedby={usernameError ? "finish-username-error" : undefined}
            />
            {usernameError && (
              <p id="finish-username-error" role="alert" className="mt-1 text-xs text-rose-700">
                {usernameError}
              </p>
            )}
          </div>
          {submitError && (
            <div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {submitError}
            </div>
          )}
          <StepActions
            onBack={() => {
              setSubmitError("");
              setStep(0);
            }}
            primaryLabel="Start exchanging"
            busy={submitting}
            busyLabel="Saving…"
          />
        </form>
      )}
    </AuthShell>
  );
};

export default FinishProfilePage;
