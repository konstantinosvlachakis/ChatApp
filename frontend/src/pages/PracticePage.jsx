import React, { useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../constants/constants";
import { useUser } from "../context/UserContext";

const getAuthToken = () =>
  sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken") || "";

const levelProgressPercent = (xp) => Math.min(100, Math.max(0, xp % 100));
const TREASURE_MILESTONES = 10;
const TREASURE_MAP_IMAGE_URL =
  "https://www.foundmyself.com/gallery/albums/userpics/26339/treasure_map.jpg";
const TREASURE_POINTS = [
  { x: 20, y: 88 },
  { x: 36, y: 80 },
  { x: 55, y: 72 },
  { x: 67, y: 61 },
  { x: 58, y: 50 },
  { x: 42, y: 41 },
  { x: 29, y: 32 },
  { x: 38, y: 23 },
  { x: 56, y: 15 },
  { x: 72, y: 10 },
];

const PracticePage = () => {
  const { user } = useUser();
  const [language, setLanguage] = useState("");
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentRank, setCurrentRank] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [droppedWord, setDroppedWord] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("neutral");
  const [submitted, setSubmitted] = useState(false);
  const [successfulMilestones, setSuccessfulMilestones] = useState(0);
  const [showTreasureAnimation, setShowTreasureAnimation] = useState(false);
  const [animationResult, setAnimationResult] = useState("success");
  const [animationFromMilestone, setAnimationFromMilestone] = useState(0);
  const [animationToMilestone, setAnimationToMilestone] = useState(0);
  const [animatedMilestone, setAnimatedMilestone] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const languageOptions = useMemo(() => {
    const set = new Set();
    (user?.languages_practicing || []).forEach((lang) => {
      if (lang && String(lang).trim()) set.add(String(lang).trim().toLowerCase());
    });
    if (user?.base_translate_language) {
      set.add(String(user.base_translate_language).trim().toLowerCase());
    }
    if (user?.native_language) {
      set.add(String(user.native_language).trim().toLowerCase());
    }
    if (!set.size) set.add("english");
    return [...set];
  }, [user?.languages_practicing, user?.base_translate_language, user?.native_language]);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    }),
    []
  );

  const fetchState = async (nextLanguage = "") => {
    const suffix = nextLanguage ? `?language=${encodeURIComponent(nextLanguage)}` : "";
    const response = await fetch(`${BASE_URL}/api/practice/state/${suffix}`, {
      headers: authHeaders,
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to fetch practice state.");
    }
    return response.json();
  };

  const fetchChallenge = async (nextLanguage = "") => {
    const suffix = nextLanguage ? `?language=${encodeURIComponent(nextLanguage)}` : "";
    const response = await fetch(`${BASE_URL}/api/practice/challenge/${suffix}`, {
      headers: authHeaders,
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to fetch a challenge.");
    }
    return response.json();
  };

  const bootstrapPractice = async (preferredLanguage = "") => {
    setLoading(true);
    setError("");
    try {
      const [statePayload, challengePayload] = await Promise.all([
        fetchState(preferredLanguage),
        fetchChallenge(preferredLanguage),
      ]);
      setLanguage(statePayload.language || challengePayload.language || preferredLanguage || "english");
      setStats(statePayload.stats || challengePayload.stats || null);
      setLeaderboard(statePayload.leaderboard || []);
      setCurrentRank(statePayload.current_rank ?? null);
      setChallenge(challengePayload.challenge || null);
      setDroppedWord("");
      setFeedback("");
      setFeedbackTone("neutral");
      setSubmitted(false);
      setSuccessfulMilestones(0);
    } catch (err) {
      setError(err.message || "Could not load practice.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const preferred = languageOptions[0] || "english";
    bootstrapPractice(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, languageOptions.length]);

  useEffect(() => {
    if (!showTreasureAnimation) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeTreasureOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showTreasureAnimation]);

  const handleDropWord = (event) => {
    event.preventDefault();
    if (submitted) return;
    const word = event.dataTransfer.getData("text/plain");
    if (word) setDroppedWord(word);
  };

  const handleSubmitAnswer = async () => {
    if (!challenge?.id || !droppedWord || submitted || showTreasureAnimation) return false;
    setError("");
    try {
      const response = await fetch(`${BASE_URL}/api/practice/submit/`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          challenge_id: challenge.id,
          selected_word: droppedWord,
          language,
        }),
      });
      if (!response.ok) {
        throw new Error("Could not submit answer.");
      }
      const payload = await response.json();
      setStats(payload.stats || null);
      setLeaderboard(payload.leaderboard || []);
      setCurrentRank(payload.current_rank ?? null);
      setSubmitted(true);

      if (payload.correct) {
        const nextMilestone = Math.min(TREASURE_MILESTONES, successfulMilestones + 1);
        setSuccessfulMilestones(nextMilestone);
        setAnimationResult("success");
        setAnimationFromMilestone(successfulMilestones);
        setAnimationToMilestone(nextMilestone);
        setAnimatedMilestone(successfulMilestones);
        setShowTreasureAnimation(true);
        window.setTimeout(() => setAnimatedMilestone(nextMilestone), 80);
        setFeedback(`Correct! +${payload.awarded_xp} XP / +${payload.awarded_points} points`);
        setFeedbackTone("success");
      } else {
        setAnimationResult("error");
        setAnimationFromMilestone(successfulMilestones);
        setAnimationToMilestone(successfulMilestones);
        setAnimatedMilestone(successfulMilestones);
        setShowTreasureAnimation(true);
        setFeedback(
          `Not quite. Correct answer: "${payload.correct_answer}" (+${payload.awarded_xp} XP)`
        );
        setFeedbackTone("error");
      }
      return true;
    } catch (err) {
      setError(err.message || "Could not submit answer.");
      return false;
    }
  };

  const handleNext = async () => {
    if (showTreasureAnimation) return;
    if (!submitted && !droppedWord) {
      setError("Choose an answer before moving to the next challenge.");
      return;
    }

    if (!submitted) {
      const didSubmit = await handleSubmitAnswer();
      if (!didSubmit) return;
    }

    setError("");
    try {
      const payload = await fetchChallenge(language);
      setChallenge(payload.challenge || null);
      if (payload.stats) setStats(payload.stats);
      setDroppedWord("");
      setFeedback("");
      setFeedbackTone("neutral");
      setSubmitted(false);
    } catch (err) {
      setError(err.message || "Could not load next challenge.");
    }
  };

  const onLanguageChange = async (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    await bootstrapPractice(nextLanguage);
  };
  
  const closeTreasureOverlay = () => {
    setShowTreasureAnimation(false);
  };

  const progress = levelProgressPercent(stats?.xp || 0);
  const mapProgress = Math.min(
    100,
    Math.round((successfulMilestones / TREASURE_MILESTONES) * 100)
  );
  const animationPathPoints = TREASURE_POINTS.slice(0, animationToMilestone + 1);
  const animatedPoint =
    TREASURE_POINTS[Math.max(0, Math.min(animatedMilestone, TREASURE_MILESTONES - 1))];

  return (
    <section className="py-5 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Practice Arena
            </p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Fill the missing word
            </h1>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Language
            <select
              value={language}
              onChange={onLanguageChange}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {languageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Loading practice...
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Points</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stats?.points || 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Level</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600">{stats?.level || 1}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Accuracy</p>
                  <p className="mt-1 text-2xl font-bold text-cyan-600">{stats?.accuracy || 0}%</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-500">XP Progress</p>
                  <p className="text-xs text-slate-500">{stats?.xp || 0} XP</p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Treasure Hunt</p>
                  <p className="text-xs text-slate-500">
                    {successfulMilestones}/{TREASURE_MILESTONES} milestones
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  The full map appears during answer check animation.
                </p>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${mapProgress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {challenge?.hint || "Drop the correct word in the blank."}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {challenge?.source === "generator" ? "AI Generated" : "Template"}
                  </span>
                </div>
                <p className="mt-3 text-lg leading-relaxed text-slate-900 sm:text-2xl">
                  {challenge?.sentence_parts?.[0] || ""}
                  <span
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropWord}
                    className={`mx-1 inline-flex min-w-[110px] items-center justify-center rounded-lg border-2 px-3 py-1 text-base sm:min-w-[150px] ${
                      droppedWord
                        ? "border-cyan-500 bg-cyan-50 text-cyan-900"
                        : "border-dashed border-slate-300 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {droppedWord || "drop word"}
                  </span>
                  {challenge?.sentence_parts?.[2] || ""}
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {(challenge?.options || []).map((option) => (
                    <button
                      key={`${challenge?.id}-${option}`}
                      type="button"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", option)}
                      onClick={() => !submitted && setDroppedWord(option)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-cyan-300 hover:bg-cyan-50"
                    >
                      {option}
                    </button>
                  ))}
                </div>

                {feedback && (
                  <div
                    className={`mt-4 rounded-xl px-3 py-2 text-sm ${
                      feedbackTone === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {feedback}
                  </div>
                )}

                {error && (
                  <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={!droppedWord || submitted}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Check Answer
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!submitted && !droppedWord}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {!submitted && droppedWord ? "Check & Next" : "Next Challenge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDroppedWord("")}
                    disabled={submitted}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Leaderboard</h2>
                <span className="text-xs text-slate-500">Rank #{currentRank || "-"}</span>
              </div>
              <div className="space-y-2">
                {leaderboard.length ? (
                  leaderboard.map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.username}`}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                        entry.is_current_user
                          ? "border-cyan-300 bg-cyan-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          #{entry.rank} {entry.username}
                        </p>
                        <p className="text-xs text-slate-500">Level {entry.level}</p>
                      </div>
                      <p className="font-semibold text-slate-800">{entry.points} pts</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No leaderboard entries yet.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
      {showTreasureAnimation && (
        <div
          className="fixed inset-0 z-[100]"
          onClick={closeTreasureOverlay}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              closeTreasureOverlay();
            }
          }}
          aria-label="Close treasure map overlay"
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
          <div
            className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#fef3c7,transparent_42%),radial-gradient(circle_at_80%_15%,#fcd34d66,transparent_38%),linear-gradient(180deg,#fff7ed_0%,#fffbeb_100%)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeTreasureOverlay}
              onTouchEnd={closeTreasureOverlay}
              className="absolute right-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300 bg-white/95 text-lg font-bold text-amber-900 shadow-sm hover:bg-white"
              aria-label="Close treasure map"
            >
              ×
            </button>
            <div className="relative h-[88dvh] w-[94vw] max-w-[520px] overflow-hidden rounded-3xl border-4 border-amber-900/60 shadow-2xl">
              <img
                src={TREASURE_MAP_IMAGE_URL}
                alt="Treasure map"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-amber-950/10" />
              <div className="absolute left-3 right-3 top-3 z-10 rounded-xl border border-amber-300/70 bg-white/80 px-3 py-2 text-center text-xs font-semibold text-amber-900 shadow-md">
                {animationResult === "success"
                  ? "Great! Moving to the next milestone..."
                  : "Wrong answer. Stay on current milestone and try again."}
              </div>
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  points={TREASURE_POINTS.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="#1f2937"
                  strokeOpacity="0.55"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1 2.2"
                />
                {animationPathPoints.length > 1 && (
                  <polyline
                    points={animationPathPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="1.2 1.8"
                  />
                )}
              </svg>
              {TREASURE_POINTS.map((point, index) => {
                const isCompleted = index < animationToMilestone;
                const isTreasure = index === TREASURE_MILESTONES - 1;
                const isAnimatedTarget = index === animationToMilestone && animationResult === "success";
                return (
                  <div
                    key={`overlay-${point.x}-${point.y}-${index}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] font-bold ${
                      isCompleted
                        ? "border-amber-700 bg-amber-300 text-amber-950"
                        : "border-amber-900/50 bg-amber-50/90 text-amber-900"
                    } ${isAnimatedTarget ? "animate-pulse ring-4 ring-amber-300/70" : ""}`}
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                      width: 24,
                      height: 24,
                      lineHeight: "22px",
                      textAlign: "center",
                    }}
                  >
                    {isTreasure ? "🏆" : index + 1}
                  </div>
                );
              })}
              <div
                className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[30px] transition-all duration-700 ${
                  animationResult === "success" ? "scale-110" : "animate-pulse"
                }`}
                style={{ left: `${animatedPoint.x}%`, top: `${animatedPoint.y}%` }}
                aria-hidden="true"
              >
                {animationToMilestone >= TREASURE_MILESTONES ? "💰" : "🧭"}
              </div>
              <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-amber-300/70 bg-white/85 px-3 py-2 text-center text-xs font-medium text-amber-900 shadow-md">
                Progress: {animationFromMilestone} → {animationToMilestone} / {TREASURE_MILESTONES}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PracticePage;
