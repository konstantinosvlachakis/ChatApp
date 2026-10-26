import React, { useEffect, useMemo, useRef, useState } from "react";
import { BASE_URL } from "../constants/constants";
import { useUser } from "../context/UserContext";
import MonetizationOnRoundedIcon from "@mui/icons-material/MonetizationOnRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";

const levelProgressPercent = (xp) => Math.min(100, Math.max(0, xp % 100));
const SPEECH_MATCH_THRESHOLD = 0.72;
const DAILY_SET_STEPS = 10;

const LANGUAGE_SPEECH_CODE = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  greek: "el-GR",
  russian: "ru-RU",
};

const VOICE_SENTENCE_LIBRARY = {
  english: [
    "I practice English every day.",
    "The weather is beautiful today.",
    "Please repeat this sentence clearly.",
  ],
  spanish: [
    "Practico espanol todos los dias.",
    "Hoy hace muy buen tiempo.",
    "Por favor repite esta frase claramente.",
  ],
  french: [
    "Je pratique le francais chaque jour.",
    "Il fait tres beau aujourd hui.",
    "Repete cette phrase avec une bonne prononciation.",
  ],
  greek: [
    "Εξασκούμαι στα ελληνικά κάθε μέρα.",
    "Σήμερα ο καιρός είναι υπέροχος.",
    "Παρακαλώ επανάλαβε αυτή την πρόταση καθαρά.",
  ],
  russian: [
    "Я практикую русский язык каждый день.",
    "Сегодня очень хорошая погода.",
    "Пожалуйста повтори это предложение четко.",
  ],
};

const pickBestVoiceForLanguage = (language) => {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const targetLang = (LANGUAGE_SPEECH_CODE[language] || "en-US").toLowerCase();
  const baseLang = targetLang.split("-")[0];

  const languageMatches = voices.filter((voice) => {
    const voiceLang = (voice.lang || "").toLowerCase();
    return voiceLang === targetLang || voiceLang.startsWith(`${baseLang}-`) || voiceLang === baseLang;
  });
  const candidates = languageMatches.length ? languageMatches : voices;

  // Prefer native/local and higher-quality engine labels when available.
  const scoreVoice = (voice) => {
    const name = `${voice.name || ""} ${(voice.voiceURI || "")}`.toLowerCase();
    const lang = (voice.lang || "").toLowerCase();
    let score = 0;
    if (lang === targetLang) score += 60;
    else if (lang.startsWith(`${baseLang}-`) || lang === baseLang) score += 40;
    if (voice.localService) score += 20;
    if (voice.default) score += 10;
    if (name.includes("neural")) score += 16;
    if (name.includes("premium")) score += 14;
    if (name.includes("natural")) score += 12;
    if (name.includes("enhanced")) score += 10;
    if (name.includes("google")) score += 8;
    if (name.includes("microsoft")) score += 7;
    if (name.includes("apple")) score += 6;
    return score;
  };

  const sorted = [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return sorted[0] || null;
};

const getChallengeSourceLabel = (source) => {
  if (source === "generator_daily") return "Today's AI Set";
  if (source === "generator") return "AI Generated";
  return "Core Library";
};

const PracticePage = () => {
  const { user } = useUser();
  const [language, setLanguage] = useState("");
  const [gameMode, setGameMode] = useState("treasure");
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
  const [voiceSentence, setVoiceSentence] = useState("");
  const [voiceTranslation, setVoiceTranslation] = useState("");
  const [voiceTranslationTarget, setVoiceTranslationTarget] = useState("");
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceScore, setVoiceScore] = useState(null);
  const [voiceAttemptReady, setVoiceAttemptReady] = useState(false);
  const [voiceAttemptSubmitted, setVoiceAttemptSubmitted] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechVoicesReady, setSpeechVoicesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const listenSilenceTimerRef = useRef(null);
  const listenMaxTimerRef = useRef(null);
  const autoNextTimerRef = useRef(null);

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
    const hasRecognition =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;
    setVoiceSupported(Boolean(hasRecognition && hasSynthesis));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const synth = window.speechSynthesis;
    const primeVoices = () => {
      const voices = synth.getVoices();
      if (voices && voices.length) setSpeechVoicesReady(true);
    };
    primeVoices();
    synth.addEventListener("voiceschanged", primeVoices);
    return () => synth.removeEventListener("voiceschanged", primeVoices);
  }, []);

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

  useEffect(
    () => () => {
      if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
      if (listenSilenceTimerRef.current) window.clearTimeout(listenSilenceTimerRef.current);
      if (listenMaxTimerRef.current) window.clearTimeout(listenMaxTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_e) {
          // no-op
        }
      }
    },
    []
  );

  const handleDropWord = (event) => {
    event.preventDefault();
    if (submitted) return;
    const word = event.dataTransfer.getData("text/plain");
    if (word) setDroppedWord(word);
  };

  const normalizeSpeechText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[.,!?;:()'"`]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const calculateSpeechMatch = (target, actual) => {
    const t = normalizeSpeechText(target).split(" ").filter(Boolean);
    const a = normalizeSpeechText(actual).split(" ").filter(Boolean);
    if (!t.length || !a.length) return 0;
    const targetCounts = {};
    const actualCounts = {};
    t.forEach((w) => {
      targetCounts[w] = (targetCounts[w] || 0) + 1;
    });
    a.forEach((w) => {
      actualCounts[w] = (actualCounts[w] || 0) + 1;
    });
    let overlap = 0;
    Object.keys(targetCounts).forEach((w) => {
      overlap += Math.min(targetCounts[w], actualCounts[w] || 0);
    });
    return overlap / Math.max(t.length, 1);
  };

  const requiredSpeechMatchThreshold = (sentence) => {
    const wordCount = normalizeSpeechText(sentence).split(" ").filter(Boolean).length;
    if (wordCount <= 4) return 0.62;
    if (wordCount <= 7) return 0.68;
    return SPEECH_MATCH_THRESHOLD;
  };

  const loadNextVoiceSentence = () => {
    const pool = VOICE_SENTENCE_LIBRARY[language] || VOICE_SENTENCE_LIBRARY.english;
    const next = pool[Math.floor(Math.random() * pool.length)];
    setVoiceSentence(next);
    setVoiceTranslation("");
    setVoiceTranslationTarget("");
    setVoiceTranslationLoading(false);
    setVoiceTranscript("");
    setVoiceScore(null);
    setVoiceAttemptReady(false);
    setVoiceAttemptSubmitted(false);
    setVoiceResult("");
  };

  const playPronunciation = () => {
    if (!voiceSentence || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voiceSentence);
    const languageCode = LANGUAGE_SPEECH_CODE[language] || "en-US";
    utterance.lang = languageCode;
    // Slightly slower + stable pitch for clearer pronunciation practice.
    utterance.rate = 0.82;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const preferredVoice = pickBestVoiceForLanguage(language);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang || languageCode;
    }

    window.speechSynthesis.speak(utterance);
  };

  const startVoiceRecognition = () => {
    if (!voiceSupported || typeof window === "undefined") {
      setVoiceResult("Speech recognition is not supported on this device/browser.");
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceResult("Speech recognition is not available.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_e) {
        // no-op
      }
    }

    const recognition = new Recognition();
    recognition.lang = LANGUAGE_SPEECH_CODE[language] || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    setVoiceListening(true);
    setVoiceResult("Listening...");
    setVoiceAttemptReady(false);
    setVoiceAttemptSubmitted(false);
    let finalTranscript = "";
    let interimTranscript = "";

    const clearTimers = () => {
      if (listenSilenceTimerRef.current) window.clearTimeout(listenSilenceTimerRef.current);
      if (listenMaxTimerRef.current) window.clearTimeout(listenMaxTimerRef.current);
    };

    const scheduleSilenceStop = () => {
      if (listenSilenceTimerRef.current) window.clearTimeout(listenSilenceTimerRef.current);
      listenSilenceTimerRef.current = window.setTimeout(() => {
        try {
          recognition.stop();
        } catch (_e) {
          // no-op
        }
      }, 1300);
    };

    listenMaxTimerRef.current = window.setTimeout(() => {
      try {
        recognition.stop();
      } catch (_e) {
        // no-op
      }
    }, 9000);

    recognition.onresult = (event) => {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = event.results[i]?.[0]?.transcript || "";
        if (!phrase) continue;
        if (event.results[i].isFinal) {
          finalTranscript = `${finalTranscript} ${phrase}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${phrase}`.trim();
        }
      }
      const combined = `${finalTranscript} ${interimTranscript}`.trim();
      if (combined) setVoiceTranscript(combined);
      scheduleSilenceStop();
    };

    recognition.onerror = () => {
      setVoiceResult("Could not capture speech. Please try again.");
      clearTimers();
    };

    recognition.onend = () => {
      clearTimers();
      setVoiceListening(false);
      const transcript = `${finalTranscript} ${interimTranscript}`.trim();
      if (!transcript) return;
      setVoiceTranscript(transcript);
      setVoiceScore(null);
      setVoiceAttemptReady(true);
      setVoiceAttemptSubmitted(false);
      setVoiceResult("Recording captured. Submit or re-record.");
      recognitionRef.current = null;
    };

    recognition.start();
  };

  const submitVoiceAttempt = () => {
    if (!voiceTranscript || !voiceSentence) return;
    const score = calculateSpeechMatch(voiceSentence, voiceTranscript);
    const minScore = requiredSpeechMatchThreshold(voiceSentence);
    setVoiceScore(score);
    setVoiceAttemptSubmitted(true);
    if (score >= minScore) {
      setVoiceResult(`Great pronunciation (${Math.round(score * 100)}% match).`);
    } else {
      setVoiceResult(`Try again (${Math.round(score * 100)}% match).`);
    }
  };

  const loadNextChallenge = async (nextLanguage = language) => {
    setError("");
    try {
      const payload = await fetchChallenge(nextLanguage);
      setChallenge(payload.challenge || null);
      if (payload.stats) setStats(payload.stats);
      setDroppedWord("");
      setFeedback("");
      setFeedbackTone("neutral");
      setSubmitted(false);
      setShowTreasureAnimation(false);
    } catch (err) {
      setError(err.message || "Could not load next challenge.");
    }
  };

  const handleSubmitAnswer = async () => {
    if (!challenge?.id || !droppedWord || submitted || showTreasureAnimation) return false;
    setError("");
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
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
        const nextMilestone = Math.min(DAILY_SET_STEPS, successfulMilestones + 1);
        setSuccessfulMilestones(nextMilestone);
        setAnimationResult("success");
        setAnimationFromMilestone(successfulMilestones);
        setAnimationToMilestone(nextMilestone);
        setShowTreasureAnimation(true);
        setFeedback(`Correct! +${payload.awarded_xp} XP / +${payload.awarded_points} points`);
        setFeedbackTone("success");
      } else {
        setAnimationResult("error");
        setAnimationFromMilestone(successfulMilestones);
        setAnimationToMilestone(successfulMilestones);
        setShowTreasureAnimation(true);
        setFeedback(
          `Not quite. Correct answer: "${payload.correct_answer}" (+${payload.awarded_xp} XP)`
        );
        setFeedbackTone("error");
      }
      autoNextTimerRef.current = window.setTimeout(() => {
        autoNextTimerRef.current = null;
        loadNextChallenge(language);
      }, 2000);
      return true;
    } catch (err) {
      setError(err.message || "Could not submit answer.");
      return false;
    }
  };

  const onLanguageChange = async (event) => {
    const nextLanguage = event.target.value;
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setLanguage(nextLanguage);
    await bootstrapPractice(nextLanguage);
    const voicePool = VOICE_SENTENCE_LIBRARY[nextLanguage] || VOICE_SENTENCE_LIBRARY.english;
    setVoiceSentence(voicePool[Math.floor(Math.random() * voicePool.length)]);
    setVoiceTranslation("");
    setVoiceTranslationTarget("");
    setVoiceTranslationLoading(false);
    setVoiceTranscript("");
    setVoiceScore(null);
    setVoiceAttemptReady(false);
    setVoiceAttemptSubmitted(false);
    setVoiceResult("");
  };
  
  const closeTreasureOverlay = () => {
    setShowTreasureAnimation(false);
  };

  useEffect(() => {
    if (!language) return;
    if (!voiceSentence) {
      const voicePool = VOICE_SENTENCE_LIBRARY[language] || VOICE_SENTENCE_LIBRARY.english;
      setVoiceSentence(voicePool[Math.floor(Math.random() * voicePool.length)]);
    }
  }, [language, voiceSentence]);

  useEffect(() => {
    const translateVoiceSentence = async () => {
      if (!voiceSentence) return;
      const baseLanguage = (user?.base_translate_language || "").trim().toLowerCase();
      const nativeLanguage = (user?.native_language || "").trim().toLowerCase();
      const sourceLanguage = (language || "").trim().toLowerCase();
      const fallbackLanguage = "english";
      const targetCandidates = [baseLanguage, nativeLanguage, fallbackLanguage].filter(
        (item, index, arr) => item && arr.indexOf(item) === index && item !== sourceLanguage
      );
      if (!targetCandidates.length) {
        setVoiceTranslation("");
        setVoiceTranslationTarget("");
        return;
      }

      setVoiceTranslationLoading(true);
      try {
        let translated = "";
        let translatedTarget = "";

        for (const targetLanguage of targetCandidates) {
          const response = await fetch(`${BASE_URL}/api/messages/translate/`, {
            method: "POST",
            headers: authHeaders,
            credentials: "include",
            body: JSON.stringify({
              text: voiceSentence,
              target_language: targetLanguage,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (payload?.same_language) {
              continue;
            }
            continue;
          }
          translated = payload?.translated_text || "";
          translatedTarget = targetLanguage;
          if (translated) break;
        }

        setVoiceTranslation(translated);
        setVoiceTranslationTarget(translatedTarget);
      } catch (_e) {
        setVoiceTranslation("");
        setVoiceTranslationTarget("");
      } finally {
        setVoiceTranslationLoading(false);
      }
    };

    translateVoiceSentence();
  }, [voiceSentence, language, user?.base_translate_language, user?.native_language, authHeaders]);

  const progress = levelProgressPercent(stats?.xp || 0);
  const mapProgress = Math.min(100, Math.round((successfulMilestones / DAILY_SET_STEPS) * 100));

  return (
    <section className="py-5 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Practice Arena
            </p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl leading-tight">
              {gameMode === "treasure" ? "Daily Word Practice" : "Speak & Repeat"}
            </h1>
          </div>
          <label className="flex w-full items-center gap-2 text-sm font-medium text-slate-700 sm:w-auto">
            <span className="shrink-0">Language</span>
            <select
              value={language}
              onChange={onLanguageChange}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:min-w-[170px] sm:flex-none"
            >
              {languageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setGameMode("treasure")}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
              gameMode === "treasure"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            Daily Drill
          </button>
          <button
            type="button"
            onClick={() => setGameMode("voice")}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
              gameMode === "voice"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            Voice Repeat
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Loading practice...
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 via-sky-50 to-amber-50 p-4 shadow-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/80 px-3 py-2 text-center shadow-sm">
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <MonetizationOnRoundedIcon sx={{ fontSize: 14, color: "#f59e0b" }} />
                      Points
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-slate-900">{stats?.points || 0}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-3 py-2 text-center shadow-sm">
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <WorkspacePremiumRoundedIcon sx={{ fontSize: 14, color: "#d97706" }} />
                      Level
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-amber-600">{stats?.level || 1}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-3 py-2 text-center shadow-sm">
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <TrackChangesRoundedIcon sx={{ fontSize: 14, color: "#0891b2" }} />
                      Accuracy
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-cyan-600">{stats?.accuracy || 0}%</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-white/75 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <p className="inline-flex items-center gap-1">
                      <BoltRoundedIcon sx={{ fontSize: 15, color: "#0ea5e9" }} />
                      XP Trail
                    </p>
                    <p>{stats?.xp || 0} XP</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#06b6d4,#0ea5e9,#f59e0b)] transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
                  <p className="inline-flex items-center gap-1">
                    <AutoAwesomeRoundedIcon sx={{ fontSize: 14, color: "#d97706" }} />
                    Daily set: {successfulMilestones}/{DAILY_SET_STEPS}
                  </p>
                  <p>Rank #{currentRank || "-"}</p>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#fbbf24,#f59e0b,#d97706)] transition-all duration-500"
                    style={{ width: `${mapProgress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Daily Progress</p>
                  <p className="text-xs text-slate-500">
                    {successfulMilestones}/{DAILY_SET_STEPS} solved in this run
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Fresh daily items stay varied for you before repeating.
                </p>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${mapProgress}%` }}
                  />
                </div>
              </div>

              {gameMode === "treasure" ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {challenge?.hint || "Drop the correct word in the blank."}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {getChallengeSourceLabel(challenge?.source)}
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

                <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={!droppedWord || submitted}
                    className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Check Answer
                  </button>
                </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                  <p className="text-xs text-slate-500">
                    Hear the sentence, then repeat it using your microphone.
                  </p>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900 sm:text-lg">
                      {voiceSentence || "Loading sentence..."}
                    </p>
                    <p className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 sm:text-base">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                        Translation{voiceTranslationTarget ? ` (${voiceTranslationTarget})` : ""}
                      </span>
                      <span className="mt-1 block">
                        {voiceTranslationLoading
                          ? "Translating..."
                          : voiceTranslation || "No translation available."}
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      type="button"
                      onClick={playPronunciation}
                      disabled={!speechVoicesReady}
                      className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {speechVoicesReady ? "Hear pronunciation" : "Loading native voice..."}
                    </button>
                    <button
                      type="button"
                      onClick={startVoiceRecognition}
                      disabled={!voiceSentence || voiceListening || !voiceSupported}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {voiceListening ? "Listening..." : "Record & Verify"}
                    </button>
                    <button
                      type="button"
                      onClick={loadNextVoiceSentence}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:col-span-2 lg:col-span-1"
                    >
                      Next sentence
                    </button>
                  </div>
                  {voiceAttemptReady && !voiceListening && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={submitVoiceAttempt}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Submit recording
                      </button>
                      <button
                        type="button"
                        onClick={startVoiceRecognition}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Re-record
                      </button>
                    </div>
                  )}

                  {!voiceSupported && (
                    <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      Your browser does not support speech recognition/synthesis.
                    </div>
                  )}

                  {voiceTranscript && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You said</p>
                      <p className="mt-1">{voiceTranscript}</p>
                    </div>
                  )}

                  {voiceScore !== null && voiceAttemptSubmitted && (
                    <div
                      className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                        voiceScore >= requiredSpeechMatchThreshold(voiceSentence)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      Match score: {Math.round(voiceScore * 100)}%
                    </div>
                  )}

                  {voiceResult && (
                    <div className="mt-3 rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                      {voiceResult}
                    </div>
                  )}
                </div>
              )}
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
          aria-label="Close practice result overlay"
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
          <div
            className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#dbeafe,transparent_36%),radial-gradient(circle_at_80%_15%,#fde68a66,transparent_30%),linear-gradient(180deg,#f8fafc_0%,#fffdf7_100%)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative w-[92vw] max-w-[520px] rounded-[32px] border border-slate-200 bg-white/95 p-6 shadow-2xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                {animationResult === "success" ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 40, color: "#059669" }} />
                ) : (
                  <CancelRoundedIcon sx={{ fontSize: 40, color: "#dc2626" }} />
                )}
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {animationResult === "success" ? "Nice Work" : "Try Again"}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  {animationResult === "success"
                    ? "You cleared the next step."
                    : "That answer did not land."}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {animationResult === "success"
                    ? "Your daily practice run keeps moving forward."
                    : "Stay on the current step and take another shot."}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Next challenge in 2 seconds
                </p>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Run progress</span>
                  <span className="font-semibold text-slate-900">
                    {animationFromMilestone} → {animationToMilestone} / {DAILY_SET_STEPS}
                  </span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      animationResult === "success" ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((animationToMilestone / DAILY_SET_STEPS) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {Array.from({ length: DAILY_SET_STEPS }).map((_, index) => {
                    const isComplete = index < animationToMilestone;
                    const isCurrent =
                      index === Math.max(0, animationToMilestone - 1) &&
                      animationToMilestone > 0;
                    return (
                      <div
                        key={`daily-step-${index}`}
                        className={`flex h-9 items-center justify-center rounded-xl border text-xs font-bold ${
                          isComplete
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-400"
                        } ${isCurrent && animationResult === "success" ? "ring-2 ring-emerald-200" : ""}`}
                      >
                        {index + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PracticePage;
