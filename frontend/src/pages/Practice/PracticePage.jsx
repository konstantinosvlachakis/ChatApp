import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import api, { getErrorMessage } from "../../lib/api";
import { useUser } from "../../context/UserContext";
import { toastApiError } from "../../components/Toast";
import PracticeHeader from "./PracticeHeader";
import StatsStrip from "./StatsStrip";
import ChallengeCard from "./ChallengeCard";
import VoiceRepeat from "./VoiceRepeat";
import Leaderboard from "./Leaderboard";
import { DAILY_SET_STEPS, buildLanguageOptions, translateWithFallback, translationTargets } from "./practiceUtils";
import "../Profile/features/profile.css";
import "../Settings/settings.css";
import "./practice.css";

const languageParams = (language) => (language ? { language } : undefined);
const fetchState = (language) => api.get("/api/practice/state/", { params: languageParams(language) });
const fetchChallenge = (language) => api.get("/api/practice/challenge/", { params: languageParams(language) });

const PracticeSkeleton = () => (
  <div className="pr-layout" aria-busy="true">
    <span className="lv-visually-hidden" role="status">
      Loading practice...
    </span>
    <div className="pr-main" aria-hidden="true">
      <div className="pr-skel pr-skel-strip" />
      <div className="pr-skel pr-skel-card" />
    </div>
    <div className="pr-skel pr-skel-board" aria-hidden="true" />
  </div>
);

const PracticePage = () => {
  const { user } = useUser();
  const [language, setLanguage] = useState("");
  const [mode, setMode] = useState("drill");
  const [voiceOpened, setVoiceOpened] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error (first load only)
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentRank, setCurrentRank] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  // Synchronous guard: a double click must not submit (and score) the same answer twice.
  const isSubmittingRef = useRef(false);
  // Bumped on every load so a late response for an older language/challenge is ignored.
  const requestSeqRef = useRef(0);
  const hasDataRef = useRef(false);

  const languageOptions = useMemo(
    () => buildLanguageOptions(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.languages_practicing, user?.base_translate_language, user?.native_language]
  );

  const resetChallengeState = () => {
    setSelected("");
    setResult(null);
  };

  const bootstrapPractice = useCallback(async (preferredLanguage = "") => {
    const seq = ++requestSeqRef.current;
    // Skeletons on the first load only; later loads (language change, retry) keep the page in place.
    if (hasDataRef.current) setRefreshing(true);
    else setStatus("loading");
    setLoadError("");
    try {
      const [statePayload, challengePayload] = await Promise.all([
        fetchState(preferredLanguage),
        fetchChallenge(preferredLanguage),
      ]);
      if (seq !== requestSeqRef.current) return;
      setLanguage(statePayload.language || challengePayload.language || preferredLanguage || "english");
      setStats(statePayload.stats || challengePayload.stats || null);
      setLeaderboard(statePayload.leaderboard || []);
      setCurrentRank(statePayload.current_rank ?? null);
      setChallenge(challengePayload.challenge || null);
      resetChallengeState();
      setTodayCount(0);
      hasDataRef.current = true;
      setStatus("ready");
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (hasDataRef.current) {
        toastApiError(err, "Couldn't load practice");
      } else {
        setLoadError(getErrorMessage(err, "Could not load practice."));
        setStatus("error");
      }
    } finally {
      if (seq === requestSeqRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    bootstrapPractice(languageOptions[0] || "english");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, languageOptions.length]);

  const loadNextChallenge = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setIsLoadingNext(true);
    try {
      const payload = await fetchChallenge(language);
      if (seq !== requestSeqRef.current) return;
      setChallenge(payload.challenge || null);
      if (payload.stats) setStats(payload.stats);
      resetChallengeState();
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      toastApiError(err, "Couldn't load the next challenge");
    } finally {
      if (seq === requestSeqRef.current) setIsLoadingNext(false);
    }
  }, [language]);

  const handleSelect = useCallback(
    (word) => {
      if (result || isSubmittingRef.current) return;
      setSelected(word);
    },
    [result]
  );

  const handleSubmitAnswer = useCallback(async () => {
    if (!challenge?.id || !selected || result || refreshing) return false;
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const seq = requestSeqRef.current;
    try {
      const payload = await api.post("/api/practice/submit/", {
        challenge_id: challenge.id,
        selected_word: selected,
        language,
      });
      if (seq !== requestSeqRef.current) return false;
      setStats(payload.stats || null);
      setLeaderboard(payload.leaderboard || []);
      setCurrentRank(payload.current_rank ?? null);
      const alreadyScored = Boolean(payload.already_scored);
      if (payload.correct && !alreadyScored) {
        setTodayCount((count) => Math.min(DAILY_SET_STEPS, count + 1));
      }
      setResult({
        correct: Boolean(payload.correct),
        correctAnswer: payload.correct_answer || "",
        awardedXp: payload.awarded_xp || 0,
        awardedPoints: payload.awarded_points || 0,
        alreadyScored,
      });
      return true;
    } catch (err) {
      toastApiError(err, "Couldn't check your answer");
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [challenge?.id, selected, result, refreshing, language]);

  const handleTranslate = useCallback(
    (text) => translateWithFallback(text, translationTargets(user, language)),
    [user, language]
  );

  const onLanguageChange = (nextLanguage) => {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    bootstrapPractice(nextLanguage);
  };

  const onModeChange = (nextMode) => {
    setMode(nextMode);
    if (nextMode === "voice") setVoiceOpened(true);
  };

  let body;
  if (status === "loading") {
    body = <PracticeSkeleton />;
  } else if (status === "error") {
    body = (
      <div className="pf-card pr-error" role="alert">
        <h2 className="pf-card-title">We couldn't load your practice</h2>
        <p className="pr-muted">{loadError} Check your connection and try again.</p>
        <div>
          <button
            type="button"
            className="st-btn is-teal"
            onClick={() => bootstrapPractice(language || languageOptions[0] || "english")}
          >
            <RefreshRoundedIcon aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={`pr-layout${refreshing ? " is-refreshing" : ""}`} aria-busy={refreshing || undefined}>
        <div className="pr-main">
          <StatsStrip stats={stats} todayCount={todayCount} />
          {mode === "drill" ? (
            <ChallengeCard
              challenge={challenge}
              selected={selected}
              onSelect={handleSelect}
              onCheck={handleSubmitAnswer}
              onNext={loadNextChallenge}
              onRetry={loadNextChallenge}
              onTranslate={handleTranslate}
              isSubmitting={isSubmitting}
              isLoadingNext={isLoadingNext}
              result={result}
            />
          ) : null}
          {/* Mounted on first open and kept (hidden) so its state survives mode switches. */}
          {voiceOpened ? (
            <div hidden={mode !== "voice"}>
              <VoiceRepeat key={language} language={language} user={user} />
            </div>
          ) : null}
        </div>
        <Leaderboard entries={leaderboard} currentRank={currentRank} />
      </div>
    );
  }

  return (
    <div className="pf-page pr-page">
      <PracticeHeader
        language={language || languageOptions[0] || ""}
        languageOptions={languageOptions}
        onLanguageChange={onLanguageChange}
        mode={mode}
        onModeChange={onModeChange}
      />
      {body}
    </div>
  );
};

export default PracticePage;
