import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Speech from "expo-speech";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  completeVoiceSentence,
  fetchPracticeChallenge,
  fetchPracticeState,
  fetchVoiceSentence,
  submitPracticeAnswer,
  translatePracticeSentence,
  type PracticeChallenge,
  type PracticeLeaderboardEntry,
  type PracticeStats,
  type VoiceSentence,
} from "../services/api/practice";
import { getErrorMessage } from "../services/api/errors";
import { ChatAvatar } from "../components/chat/ChatAvatar";
import {
  ROUND_COMPLETE_MESSAGE,
  VOICE_ROUND_COMPLETE_MESSAGE,
  evaluateVoiceAttempt,
  voiceRewardLabel,
  type VoiceAttempt,
  type VoiceReward,
} from "../features/practiceVoice";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";

const DAILY_SET_STEPS = 10;
const LEADERBOARD_AVATAR_SIZE = 40;

const LANGUAGE_SPEECH_CODE: Record<string, string> = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  greek: "el-GR",
  russian: "ru-RU",
};

const getChallengeSourceLabel = (source?: string) => {
  if (source === "generator_daily") return "Today's AI Set";
  if (source === "generator") return "AI Generated";
  return "Core Library";
};

const levelProgressPercent = (xp?: number) => Math.min(100, Math.max(0, (xp || 0) % 100));

let speechRecognitionModule: any = null;
try {
  speechRecognitionModule = require("expo-speech-recognition").ExpoSpeechRecognitionModule;
} catch {
  speechRecognitionModule = null;
}

type DrillResult = {
  correct: boolean;
  correctAnswer: string;
  awardedXp: number;
  awardedPoints: number;
  alreadyScored: boolean;
  dailyLimitReached: boolean;
};

export function PracticeScreen() {
  // Synchronous guard: a double tap must not submit (and score) the same answer twice.
  const submittingRef = useRef(false);
  // Bumped on every load so a late response for an older language/challenge is ignored.
  const requestSeqRef = useRef(0);
  const voiceTranscriptRef = useRef("");
  const voiceSentenceRef = useRef("");
  const voiceErrorRef = useRef("");
  // Current server sentence (read by the speech listeners, which are registered once).
  const voiceItemRef = useRef<VoiceSentence | null>(null);
  // Bumped on every voice sentence load so a late response is ignored.
  const voiceSeqRef = useRef(0);
  // Sentence id whose XP claim was sent (synchronous guard against double posts).
  const voiceClaimedIdRef = useRef<string | null>(null);
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const warm = useMemo(() => warmColors(isDark), [isDark]);
  const styles = useMemo(() => createStyles(colors, warm), [colors, warm]);
  const languageOptions = useMemo(() => {
    const set = new Set<string>();
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
  }, [user?.base_translate_language, user?.languages_practicing, user?.native_language]);

  const [gameMode, setGameMode] = useState<"treasure" | "voice">("treasure");
  const [language, setLanguage] = useState("english");
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<PracticeLeaderboardEntry[]>([]);
  const [currentRank, setCurrentRank] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<PracticeChallenge | null>(null);
  const [selectedWord, setSelectedWord] = useState("");
  const [result, setResult] = useState<DrillResult | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [successfulMilestones, setSuccessfulMilestones] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [voiceSentence, setVoiceSentence] = useState("");
  const [voiceTranslation, setVoiceTranslation] = useState("");
  const [voiceTranslationTarget, setVoiceTranslationTarget] = useState("");
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceAttempt, setVoiceAttempt] = useState<VoiceAttempt | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceItem, setVoiceItem] = useState<VoiceSentence | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceLoadError, setVoiceLoadError] = useState("");
  // Practice language the current voice sentence was requested for ("" = load on open).
  const [voiceLoadedFor, setVoiceLoadedFor] = useState("");
  const [voiceReward, setVoiceReward] = useState<VoiceReward | null>(null);

  const progress = levelProgressPercent(stats?.xp);
  const dailyProgress = Math.min(
    100,
    Math.round((successfulMilestones / DAILY_SET_STEPS) * 100)
  );

  const resetVoiceState = (item: VoiceSentence | null) => {
    const nextSentence = item?.text || "";
    voiceItemRef.current = item;
    voiceClaimedIdRef.current = null;
    voiceTranscriptRef.current = "";
    voiceSentenceRef.current = nextSentence;
    voiceErrorRef.current = "";
    if (voiceListening && speechRecognitionModule) {
      try {
        speechRecognitionModule.abort();
      } catch {
        // no-op
      }
    }
    setVoiceItem(item);
    setVoiceReward(null);
    setVoiceSentence(nextSentence);
    setVoiceTranslation("");
    setVoiceTranslationTarget("");
    setVoiceTranslationLoading(false);
    setVoiceTranscript("");
    setVoiceAttempt(null);
    setVoiceListening(false);
    setVoiceResult("");
  };

  // Next Voice Repeat sentence from the server library (no repeats per round).
  const loadVoiceSentence = async (nextLanguage: string) => {
    const seq = ++voiceSeqRef.current;
    setVoiceLoadedFor(nextLanguage);
    setVoiceLoading(true);
    setVoiceLoadError("");
    resetVoiceState(null);
    try {
      const item = await fetchVoiceSentence(nextLanguage);
      if (seq !== voiceSeqRef.current) return;
      if (!item?.text) {
        setVoiceLoadError("No sentence available right now.");
        return;
      }
      resetVoiceState(item);
    } catch (err: any) {
      if (seq !== voiceSeqRef.current) return;
      setVoiceLoadError(getErrorMessage(err, "Could not load a sentence."));
    } finally {
      if (seq === voiceSeqRef.current) setVoiceLoading(false);
    }
  };

  // One XP claim per sentence; the server checks it was served, the score and the daily caps.
  const claimVoiceReward = async (score: number) => {
    const item = voiceItemRef.current;
    if (!item?.id || voiceClaimedIdRef.current === item.id) return;
    voiceClaimedIdRef.current = item.id;
    setVoiceReward({ pending: true, awardedXp: 0 });
    try {
      const payload = await completeVoiceSentence(item.id, Math.round(score * 1000) / 1000);
      if (voiceItemRef.current?.id !== item.id) return;
      const awardedXp = payload.awarded_xp || 0;
      setVoiceReward({
        pending: false,
        awardedXp,
        alreadyScored: Boolean(payload.already_scored),
        voiceLimit: Boolean(payload.daily_voice_limit_reached),
        xpLimit: Boolean(payload.daily_xp_limit_reached) && awardedXp <= 0,
      });
      if (payload.stats) setStats(payload.stats);
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (payload.current_rank !== undefined) setCurrentRank(payload.current_rank ?? null);
    } catch {
      if (voiceItemRef.current?.id !== item.id) return;
      // Let the next passing attempt try again.
      voiceClaimedIdRef.current = null;
      setVoiceReward({ pending: false, awardedXp: 0 });
    }
  };

  const bootstrapPractice = async (preferredLanguage: string, isRefresh = false) => {
    const seq = ++requestSeqRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [statePayload, challengePayload] = await Promise.all([
        fetchPracticeState(preferredLanguage),
        fetchPracticeChallenge(preferredLanguage),
      ]);
      if (seq !== requestSeqRef.current) return;
      setLanguage(statePayload.language || challengePayload.language || preferredLanguage);
      setStats(statePayload.stats || challengePayload.stats || null);
      setLeaderboard(statePayload.leaderboard || []);
      setCurrentRank(statePayload.current_rank ?? null);
      setChallenge(challengePayload.challenge || null);
      setSelectedWord("");
      setResult(null);
      // The voice sentence is fetched when Voice Repeat is open (see the effect below).
      voiceSeqRef.current += 1;
      setVoiceLoading(false);
      setVoiceLoadError("");
      resetVoiceState(null);
      setVoiceLoadedFor("");
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return;
      setError(getErrorMessage(err, "Could not load practice."));
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const preferredLanguage = languageOptions[0] || "english";
    setLanguage(preferredLanguage);
    bootstrapPractice(preferredLanguage).catch(() => {});
  }, [languageOptions]);

  useEffect(() => {
    return () => {
      Speech.stop();
      if (voiceListening && speechRecognitionModule) {
        speechRecognitionModule.abort();
      }
    };
  }, [voiceListening]);

  useEffect(() => {
    setVoiceSupported(Boolean(speechRecognitionModule?.isRecognitionAvailable?.()));
  }, []);

  useEffect(() => {
    if (gameMode !== "voice" || loading || refreshing) return;
    if (voiceLoadedFor === language) return;
    loadVoiceSentence(language).catch(() => {});
  }, [gameMode, language, loading, refreshing, voiceLoadedFor]);

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

      // The library ships an English gloss: no translate call when English is the first target.
      const hint = voiceItemRef.current?.translation_hint;
      if (hint && targetCandidates[0] === "english") {
        setVoiceTranslation(hint);
        setVoiceTranslationTarget("english");
        setVoiceTranslationLoading(false);
        return;
      }

      setVoiceTranslationLoading(true);
      try {
        let translated = "";
        let translatedTarget = "";
        for (const targetLanguage of targetCandidates) {
          const payload = await translatePracticeSentence(voiceSentence, targetLanguage);
          if (payload?.same_language) {
            continue;
          }
          translated = payload?.translated_text || "";
          translatedTarget = targetLanguage;
          if (translated) break;
        }
        setVoiceTranslation(translated);
        setVoiceTranslationTarget(translatedTarget);
      } catch {
        setVoiceTranslation("");
        setVoiceTranslationTarget("");
      } finally {
        setVoiceTranslationLoading(false);
      }
    };

    translateVoiceSentence().catch(() => {});
  }, [voiceSentence, language, user?.base_translate_language, user?.native_language]);

  useEffect(() => {
    if (!speechRecognitionModule?.addListener) return;

    const startListener = speechRecognitionModule.addListener("start", () => {
      setVoiceListening(true);
      setVoiceResult("");
      setVoiceAttempt(null);
      setVoiceTranscript("");
      voiceTranscriptRef.current = "";
      voiceErrorRef.current = "";
    });

    const resultListener = speechRecognitionModule.addListener("result", (event: any) => {
      const transcript = event?.results?.[0]?.transcript?.trim() || "";
      if (!transcript) return;
      voiceTranscriptRef.current = transcript;
      setVoiceTranscript(transcript);
    });

    const errorListener = speechRecognitionModule.addListener("error", (event: any) => {
      voiceErrorRef.current = event?.message || "Could not capture speech. Please try again.";
    });

    // Recognition finished: score what was heard straight away (no separate submit step).
    const endListener = speechRecognitionModule.addListener("end", () => {
      setVoiceListening(false);
      const transcript = voiceTranscriptRef.current.trim();
      if (!transcript) {
        setVoiceResult(
          voiceErrorRef.current || "We didn't catch that. Tap Record and say the sentence."
        );
        return;
      }
      setVoiceResult("");
      const attempt = evaluateVoiceAttempt(voiceSentenceRef.current, transcript);
      setVoiceAttempt(attempt);
      if (attempt.passed) claimVoiceReward(attempt.score).catch(() => {});
    });

    return () => {
      startListener?.remove?.();
      resultListener?.remove?.();
      errorListener?.remove?.();
      endListener?.remove?.();
    };
  }, []);

  const handleLanguageChange = async (nextLanguage: string) => {
    setLanguage(nextLanguage);
    await bootstrapPractice(nextLanguage);
  };

  const loadNextChallenge = async (nextLanguage = language) => {
    const seq = ++requestSeqRef.current;
    setError("");
    setLoadingNext(true);
    try {
      const payload = await fetchPracticeChallenge(nextLanguage);
      if (seq !== requestSeqRef.current) return;
      setChallenge(payload.challenge || null);
      if (payload.stats) setStats(payload.stats);
      setSelectedWord("");
      setResult(null);
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return;
      setError(getErrorMessage(err, "Could not load next challenge."));
    } finally {
      if (seq === requestSeqRef.current) setLoadingNext(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!challenge?.id || !selectedWord || result || refreshing) return false;
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    const seq = requestSeqRef.current;
    try {
      const payload = await submitPracticeAnswer({
        challenge_id: challenge.id,
        selected_word: selectedWord,
        language,
      });
      if (seq !== requestSeqRef.current) return false;
      setStats(payload.stats || null);
      setLeaderboard(payload.leaderboard || []);
      setCurrentRank(payload.current_rank ?? null);
      const alreadyScored = Boolean(payload.already_scored);
      if (payload.correct && !alreadyScored) {
        setSuccessfulMilestones((prev) => Math.min(DAILY_SET_STEPS, prev + 1));
      }
      setResult({
        correct: Boolean(payload.correct),
        correctAnswer: payload.correct_answer || "",
        awardedXp: payload.awarded_xp || 0,
        awardedPoints: payload.awarded_points || 0,
        alreadyScored,
        dailyLimitReached: Boolean(payload.daily_xp_limit_reached),
      });
      return true;
    } catch (err: any) {
      setError(getErrorMessage(err, "Could not submit answer."));
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const playPronunciation = async () => {
    if (!voiceSentence) return;
    await Speech.stop();
    Speech.speak(voiceSentence, {
      language: LANGUAGE_SPEECH_CODE[language] || "en-US",
      rate: Platform.OS === "ios" ? 0.42 : 0.9,
      pitch: 1,
    });
  };

  const startVoiceRecognition = async () => {
    if (!voiceSupported || !speechRecognitionModule) {
      setVoiceResult("Speech recognition is not available on this device.");
      return;
    }
    try {
      const permission = await speechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceResult("Microphone and speech permissions are required.");
        return;
      }
      voiceTranscriptRef.current = "";
      voiceSentenceRef.current = voiceSentence;
      voiceErrorRef.current = "";
      setVoiceTranscript("");
      setVoiceAttempt(null);
      setVoiceResult("");
      setVoiceListening(true);
      speechRecognitionModule.start({
        lang: LANGUAGE_SPEECH_CODE[language] || "en-US",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch {
      setVoiceListening(false);
      setVoiceResult("Could not start listening. Please try again.");
    }
  };

  const stopVoiceRecognition = () => {
    if (!speechRecognitionModule) {
      setVoiceListening(false);
      return;
    }
    try {
      speechRecognitionModule.stop();
    } catch {
      setVoiceListening(false);
    }
  };

  const nextVoiceSentence = () => {
    loadVoiceSentence(language).catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerStateText}>Loading practice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => bootstrapPractice(language, true)}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Practice Arena</Text>
            <Text style={styles.title}>
              {gameMode === "treasure" ? "Daily Word Practice" : "Voice Repeat"}
            </Text>
            <Text style={styles.subtitle}>
              {gameMode === "treasure"
                ? "Fresh daily challenges, touch-first on mobile."
                : "Hear the sentence, repeat it, and check how closely it matched."}
            </Text>
          </View>
        </View>

        <View style={styles.modeSwitch}>
          <Pressable
            style={[styles.modeButton, gameMode === "treasure" ? styles.modeButtonActive : undefined]}
            onPress={() => setGameMode("treasure")}
          >
            <Text
              style={[
                styles.modeButtonText,
                gameMode === "treasure" ? styles.modeButtonTextActive : undefined,
              ]}
            >
              Daily Drill
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, gameMode === "voice" ? styles.modeButtonActive : undefined]}
            onPress={() => setGameMode("voice")}
          >
            <Text
              style={[
                styles.modeButtonText,
                gameMode === "voice" ? styles.modeButtonTextActive : undefined,
              ]}
            >
              Voice Repeat
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.languageRow}
        >
          {languageOptions.map((option) => {
            const isActive = option === language;
            return (
              <Pressable
                key={option}
                style={[styles.languageChip, isActive ? styles.languageChipActive : undefined]}
                onPress={() => handleLanguageChange(option)}
              >
                <Text
                  style={[
                    styles.languageChipText,
                    isActive ? styles.languageChipTextActive : undefined,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.statsPanel}>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Points</Text>
              <Text style={styles.statValue}>{stats?.points || 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Level</Text>
              <Text style={[styles.statValue, styles.levelValue]}>{stats?.level || 1}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Accuracy</Text>
              <Text style={[styles.statValue, styles.accuracyValue]}>
                {stats?.accuracy || 0}%
              </Text>
            </View>
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>XP Trail</Text>
              <Text style={styles.progressMeta}>{stats?.xp || 0} XP</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Daily Set</Text>
              <Text style={styles.progressMeta}>
                {successfulMilestones}/{DAILY_SET_STEPS} solved
              </Text>
            </View>
            <View style={styles.dailyTrack}>
              <View style={[styles.dailyFill, { width: `${dailyProgress}%` }]} />
            </View>
          </View>
        </View>

        {gameMode === "treasure" ? (
          <View style={styles.challengeCard}>
            <View style={styles.challengeHeader}>
              <Text style={styles.challengeHint}>
                {challenge?.hint || "Choose the right word for the blank."}
              </Text>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceBadgeText}>
                  {getChallengeSourceLabel(challenge?.source)}
                </Text>
              </View>
            </View>

            {challenge?.round_complete ? (
              <View style={styles.roundChip} accessibilityRole="text" accessibilityLiveRegion="polite">
                <Ionicons name="sparkles" size={16} color={warm.teal} />
                <Text style={styles.roundChipText}>{ROUND_COMPLETE_MESSAGE}</Text>
              </View>
            ) : null}

            <Text style={styles.challengeSentence}>
              {challenge?.sentence_parts?.[0] || ""}
              <Text
                style={
                  result
                    ? styles.answerBlank
                    : selectedWord
                      ? styles.filledBlank
                      : styles.emptyBlank
                }
              >
                {result
                  ? result.correct
                    ? selectedWord
                    : result.correctAnswer || selectedWord
                  : selectedWord || "  choose word  "}
              </Text>
              {challenge?.sentence_parts?.[2] || ""}
            </Text>

            <View style={styles.optionsGrid}>
              {(challenge?.options || []).map((option) => {
                const isActive = option === selectedWord;
                const state = !result
                  ? isActive
                    ? "selected"
                    : "idle"
                  : isActive
                    ? result.correct
                      ? "correct"
                      : "wrong"
                    : !result.correct && option === result.correctAnswer
                      ? "answer"
                      : "idle";
                return (
                  <Pressable
                    key={`${challenge?.id}-${option}`}
                    style={[
                      styles.optionButton,
                      state === "selected" ? styles.optionButtonActive : undefined,
                      state === "correct" || state === "answer" ? styles.optionCorrect : undefined,
                      state === "wrong" ? styles.optionWrong : undefined,
                    ]}
                    onPress={() => {
                      if (!result && !submitting) setSelectedWord(option);
                    }}
                    disabled={Boolean(result) || submitting}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive, disabled: Boolean(result) || submitting }}
                    accessibilityHint={
                      state === "correct" || state === "answer"
                        ? "Correct answer"
                        : state === "wrong"
                          ? "Your answer, wrong"
                          : undefined
                    }
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        state === "selected" ? styles.optionButtonTextActive : undefined,
                      ]}
                    >
                      {option}
                    </Text>
                    {state === "correct" || state === "answer" ? (
                      <Ionicons name="checkmark-circle" size={20} color={warm.teal} />
                    ) : null}
                    {state === "wrong" ? (
                      <Ionicons name="close-circle" size={20} color={warm.badge} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {result ? (
              <View
                style={[styles.resultCard, result.correct ? styles.resultPass : styles.resultFail]}
                accessibilityLiveRegion="polite"
              >
                <View style={styles.resultMain}>
                  <Ionicons
                    name={result.correct ? "checkmark-circle" : "close-circle"}
                    size={28}
                    color={result.correct ? warm.teal : warm.badge}
                  />
                  <View style={styles.resultTextWrap}>
                    <Text style={styles.resultTitle}>
                      {result.correct ? "Nice one! That's right." : "Not quite."}
                    </Text>
                    {!result.correct && result.correctAnswer ? (
                      <Text style={styles.resultText}>
                        The answer is <Text style={styles.resultStrong}>{result.correctAnswer}</Text>.
                      </Text>
                    ) : null}
                    {result.alreadyScored ? (
                      <Text style={styles.resultNote}>
                        Already scored today, so no new XP for this one.
                      </Text>
                    ) : result.awardedXp > 0 ? (
                      <View style={styles.xpChip}>
                        <Text style={styles.xpChipText}>
                          +{result.awardedXp} XP · +{result.awardedPoints} points
                        </Text>
                      </View>
                    ) : result.dailyLimitReached ? (
                      <Text style={styles.resultNote}>
                        Daily XP limit reached. Answers still count toward accuracy.
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  style={[styles.warmPrimaryButton, loadingNext ? styles.buttonDisabled : undefined]}
                  onPress={() => loadNextChallenge(language)}
                  disabled={loadingNext}
                  accessibilityRole="button"
                  accessibilityState={{ busy: loadingNext, disabled: loadingNext }}
                >
                  <Text style={styles.warmPrimaryButtonText}>
                    {loadingNext ? "Loading..." : "Next"}
                  </Text>
                  {loadingNext ? null : (
                    <Ionicons name="arrow-forward" size={18} color={warm.onAction} />
                  )}
                </Pressable>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {!result ? (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.warmPrimaryButton,
                    !selectedWord || submitting ? styles.buttonDisabled : undefined,
                  ]}
                  onPress={handleSubmitAnswer}
                  disabled={!selectedWord || submitting}
                  accessibilityRole="button"
                  accessibilityState={{ busy: submitting, disabled: !selectedWord || submitting }}
                >
                  <Text style={styles.warmPrimaryButtonText}>
                    {submitting ? "Checking..." : "Check answer"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.voiceCard}>
            <Text style={styles.challengeHint}>
              Hear the sentence, then repeat it using your microphone.
            </Text>
            {voiceItem?.round_complete && !voiceLoading ? (
              <View style={styles.roundChip} accessibilityRole="text" accessibilityLiveRegion="polite">
                <Ionicons name="sparkles" size={16} color={warm.teal} />
                <Text style={styles.roundChipText}>{VOICE_ROUND_COMPLETE_MESSAGE}</Text>
              </View>
            ) : null}
            {voiceLoadError && !voiceSentence ? (
              <View style={styles.errorCard} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{voiceLoadError}</Text>
                <Pressable
                  style={styles.warmSecondaryButton}
                  onPress={nextVoiceSentence}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh" size={18} color={warm.ink} />
                  <Text style={styles.warmSecondaryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.voiceSentenceCard} accessibilityState={{ busy: voiceLoading }}>
              {voiceLoading ? (
                <ActivityIndicator color={warm.teal} accessibilityLabel="Loading sentence" />
              ) : (
                <Text style={styles.voiceSentenceText}>
                  {voiceSentence || (voiceLoadError ? "" : "Loading sentence...")}
                </Text>
              )}
            </View>
            <View style={styles.voiceTranslationCard}>
              <Text style={styles.voiceTranslationLabel}>
                Translation
                {voiceTranslationTarget ? ` (${voiceTranslationTarget})` : ""}
              </Text>
              <Text style={styles.voiceTranslationText}>
                {voiceTranslationLoading
                  ? "Translating..."
                  : voiceTranslation || "No translation available."}
              </Text>
            </View>

            <View style={styles.voiceButtonGrid}>
              <Pressable
                style={styles.warmSecondaryButton}
                onPress={playPronunciation}
                accessibilityRole="button"
              >
                <Ionicons name="volume-high" size={18} color={warm.ink} />
                <Text style={styles.warmSecondaryButtonText}>Hear pronunciation</Text>
              </Pressable>
              {voiceListening ? (
                <Pressable
                  style={[styles.warmSecondaryButton, styles.listeningButton]}
                  onPress={stopVoiceRecognition}
                  accessibilityRole="button"
                  accessibilityLabel="Listening. Stop recording"
                >
                  <Ionicons name="stop-circle" size={18} color={warm.peachInk} />
                  <Text style={[styles.warmSecondaryButtonText, { color: warm.peachInk }]}>
                    Listening… tap to stop
                  </Text>
                </Pressable>
              ) : voiceAttempt ? (
                <>
                  <Pressable
                    style={[
                      voiceAttempt.passed ? styles.warmSecondaryButton : styles.warmPrimaryButton,
                      !voiceSupported ? styles.buttonDisabled : undefined,
                    ]}
                    onPress={startVoiceRecognition}
                    disabled={!voiceSupported}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color={voiceAttempt.passed ? warm.ink : warm.onAction}
                    />
                    <Text
                      style={
                        voiceAttempt.passed
                          ? styles.warmSecondaryButtonText
                          : styles.warmPrimaryButtonText
                      }
                    >
                      Try again
                    </Text>
                  </Pressable>
                  <Pressable
                    style={
                      voiceAttempt.passed ? styles.warmPrimaryButton : styles.warmSecondaryButton
                    }
                    onPress={nextVoiceSentence}
                    accessibilityRole="button"
                  >
                    <Text
                      style={
                        voiceAttempt.passed
                          ? styles.warmPrimaryButtonText
                          : styles.warmSecondaryButtonText
                      }
                    >
                      Next sentence
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={voiceAttempt.passed ? warm.onAction : warm.ink}
                    />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={[
                      styles.warmPrimaryButton,
                      !voiceSupported || !voiceSentence ? styles.buttonDisabled : undefined,
                    ]}
                    onPress={startVoiceRecognition}
                    disabled={!voiceSupported || !voiceSentence}
                    accessibilityRole="button"
                  >
                    <Ionicons name="mic" size={18} color={warm.onAction} />
                    <Text style={styles.warmPrimaryButtonText}>Record</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.warmSecondaryButton, voiceLoading ? styles.buttonDisabled : undefined]}
                    onPress={nextVoiceSentence}
                    disabled={voiceLoading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: voiceLoading }}
                  >
                    <Ionicons name="play-skip-forward" size={18} color={warm.ink} />
                    <Text style={styles.warmSecondaryButtonText}>Skip</Text>
                  </Pressable>
                </>
              )}
            </View>

            {!voiceSupported ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>
                  Speech recognition is not available on this device yet. Rebuild the app after
                  installing native speech support if needed.
                </Text>
              </View>
            ) : null}

            {voiceListening && voiceTranscript ? (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>Hearing</Text>
                <Text style={styles.transcriptText}>{voiceTranscript}</Text>
              </View>
            ) : null}

            {voiceAttempt ? (
              <View
                style={[
                  styles.resultCard,
                  voiceAttempt.passed ? styles.resultPass : styles.resultFail,
                ]}
                accessibilityLiveRegion="polite"
              >
                <View style={styles.voiceResultRow}>
                  <View style={styles.voiceScoreCircle}>
                    <Text
                      style={[
                        styles.voiceScorePercent,
                        { color: voiceAttempt.passed ? warm.teal : warm.peachDeep },
                      ]}
                    >
                      {Math.round(voiceAttempt.score * 100)}%
                    </Text>
                    <Text style={styles.voiceScoreLabel}>match</Text>
                  </View>
                  <View style={styles.resultTextWrap}>
                    <Text style={styles.resultTitle}>
                      {voiceAttempt.passed ? "Great pronunciation!" : "Almost — try again"}
                    </Text>
                    <Text style={styles.voiceWords}>
                      {voiceAttempt.words.map((item, index) => (
                        <Text
                          key={`${index}-${item.word}`}
                          style={item.matched ? styles.voiceWordMatched : styles.voiceWordMissed}
                          accessibilityLabel={item.matched ? item.word : `${item.word}, missed`}
                        >
                          {index ? " " : ""}
                          {item.word}
                        </Text>
                      ))}
                    </Text>
                    <Text style={styles.resultNote}>
                      {(() => {
                        const missed = voiceAttempt.words.filter((item) => !item.matched).length;
                        return missed
                          ? `${missed} word${missed === 1 ? "" : "s"} to work on (underlined)`
                          : "Every word recognised";
                      })()}
                    </Text>
                    {voiceAttempt.passed && voiceReward ? (
                      voiceReward.awardedXp > 0 ? (
                        <View style={styles.xpChip}>
                          <Text style={styles.xpChipText}>{voiceRewardLabel(voiceReward)}</Text>
                        </View>
                      ) : (
                        <Text style={styles.resultNote}>{voiceRewardLabel(voiceReward)}</Text>
                      )
                    ) : null}
                  </View>
                </View>
                {voiceTranscript ? (
                  <View style={styles.transcriptCard}>
                    <Text style={styles.transcriptLabel}>You said</Text>
                    <Text style={styles.transcriptText}>{voiceTranscript}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {voiceResult ? (
              <View style={styles.voiceResultCard} accessibilityLiveRegion="polite">
                <Text style={styles.voiceResultText}>{voiceResult}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.leaderboardCard}>
          <View style={styles.leaderboardHeader}>
            <Text style={styles.leaderboardTitle}>Leaderboard</Text>
            {currentRank ? (
              <View style={styles.rankPill}>
                <Text style={styles.rankPillText}>You're #{currentRank}</Text>
              </View>
            ) : null}
          </View>
          {leaderboard.length ? (
            leaderboard.map((entry) => (
              <View
                key={`${entry.rank}-${entry.username}`}
                style={[
                  styles.leaderboardRow,
                  entry.is_current_user ? styles.leaderboardRowCurrent : undefined,
                ]}
                accessible
                accessibilityLabel={`Rank ${entry.rank}, ${entry.username}${
                  entry.is_current_user ? " (you)" : ""
                }, level ${entry.level}, ${entry.points} points`}
              >
                <View
                  style={[styles.leaderboardPlace, entry.rank <= 3 ? styles.leaderboardPlaceTop : undefined]}
                >
                  <Text style={styles.leaderboardPlaceText}>{entry.rank}</Text>
                </View>
                <ChatAvatar
                  name={entry.username}
                  imagePath={entry.profile_image_url}
                  size={LEADERBOARD_AVATAR_SIZE}
                />
                <View style={styles.leaderboardNameWrap}>
                  <Text style={styles.leaderboardName} numberOfLines={1}>
                    {entry.username}
                  </Text>
                  <Text style={styles.leaderboardLevel}>Level {entry.level}</Text>
                </View>
                {entry.is_current_user ? (
                  <View style={styles.youPill}>
                    <Text style={styles.youPillText}>You</Text>
                  </View>
                ) : null}
                <Text style={styles.leaderboardPoints}>{entry.points} pts</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyLeaderboard}>
              <Text style={styles.emptyLeaderboardText}>
                No scores yet. Answer a challenge to get on the board.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, warm: WarmColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 30, gap: 14 },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    centerStateText: { color: colors.mutedText, fontFamily: fontFamilies.bodyMedium },
    header: {
      gap: 8,
      minHeight: 102,
      justifyContent: "flex-start",
    },
    eyebrow: {
      color: colors.link,
      fontSize: 12,
      fontFamily: fontFamilies.displayBold,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    title: { color: colors.text, fontSize: 28, fontFamily: fontFamilies.displayBold, lineHeight: 34 },
    subtitle: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
      minHeight: 40,
      fontFamily: fontFamilies.bodyMedium,
    },
    modeSwitch: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 22,
      padding: 6,
    },
    modeButton: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.surface,
    },
    modeButtonActive: {
      backgroundColor: colors.navy,
    },
    modeButtonText: { color: colors.text, fontSize: 14, fontFamily: fontFamilies.displaySemiBold },
    modeButtonTextActive: { color: "#fff" },
    languageRow: { gap: 8, paddingVertical: 2 },
    languageChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.chipBackground,
    },
    languageChipActive: { backgroundColor: colors.activeChipBackground },
    languageChipText: {
      color: colors.chipText,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "capitalize",
    },
    languageChipTextActive: { color: colors.activeChipText },
    statsPanel: {
      backgroundColor: colors.surface,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 12,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    statsGrid: { flexDirection: "row", gap: 10 },
    statCard: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    statLabel: {
      color: colors.mutedText,
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    statValue: { color: colors.text, fontSize: 22, fontFamily: fontFamilies.displayBold, marginTop: 6 },
    levelValue: { color: "#d97706" },
    accuracyValue: { color: "#0891b2" },
    progressCard: {
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      padding: 12,
    },
    progressHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    progressLabel: { color: colors.text, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    progressMeta: { color: colors.mutedText, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
    progressTrack: {
      height: 10,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: "#0ea5e9",
    },
    dailyTrack: {
      height: 9,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
    dailyFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: "#f59e0b",
    },
    dailyMeta: { color: colors.mutedText, fontSize: 12, marginTop: 8 },
    challengeCard: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    voiceCard: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 14,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    challengeHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    challengeHint: { color: colors.mutedText, fontSize: 13, lineHeight: 18, flex: 1 },
    sourceBadge: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    sourceBadgeText: {
      color: colors.text,
      fontSize: 10,
      fontFamily: fontFamilies.bodyExtraBold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    challengeSentence: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 34,
      fontFamily: fontFamilies.displaySemiBold,
      marginTop: 18,
    },
    emptyBlank: {
      color: colors.mutedText,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
    },
    filledBlank: {
      color: colors.navy,
      backgroundColor: "#d7f2ff",
      borderRadius: 10,
    },
    optionsGrid: { gap: 10, marginTop: 20 },
    optionButton: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    optionButtonActive: {
      borderColor: "#38bdf8",
      backgroundColor: "#e0f2fe",
    },
    optionButtonText: { color: colors.text, fontSize: 15, fontFamily: fontFamilies.bodySemiBold },
    optionButtonTextActive: { color: colors.navy },
    feedbackCard: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4 },
    feedbackSuccess: { backgroundColor: "#ecfdf5" },
    feedbackError: { backgroundColor: "#fff1f2" },
    feedbackText: { fontSize: 14, lineHeight: 19, fontFamily: fontFamilies.bodySemiBold },
    feedbackSuccessText: { color: "#047857" },
    feedbackErrorText: { color: "#be123c" },
    errorCard: {
      borderRadius: 16,
      backgroundColor: "#fff1f2",
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginTop: 4,
    },
    errorText: { color: "#be123c", fontSize: 14, lineHeight: 19 },
    actionRow: { gap: 10, marginTop: 18 },
    primaryButton: {
      backgroundColor: colors.navy,
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: "center",
      paddingHorizontal: 14,
    },
    primaryButtonText: { color: "#fff", fontSize: 15, fontFamily: fontFamilies.displaySemiBold },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: { color: colors.text, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    successButton: {
      backgroundColor: colors.success,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center",
    },
    successButtonText: { color: "#fff", fontSize: 15, fontFamily: fontFamilies.displaySemiBold },
    buttonDisabled: { opacity: 0.45 },
    voiceSentenceCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#fcd34d",
      backgroundColor: "#fffbeb",
      padding: 16,
    },
    voiceSentenceText: {
      color: "#8c4b14",
      fontSize: 21,
      lineHeight: 30,
      fontFamily: fontFamilies.displaySemiBold,
    },
    voiceTranslationCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#7dd3fc",
      backgroundColor: "#ecfeff",
      padding: 16,
    },
    voiceTranslationLabel: {
      color: "#0e7490",
      fontSize: 11,
      fontFamily: fontFamilies.bodyExtraBold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    voiceTranslationText: {
      color: "#155e75",
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      fontFamily: fontFamilies.bodyMedium,
    },
    voiceButtonGrid: {
      gap: 10,
    },
    transcriptCard: {
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      padding: 14,
    },
    transcriptLabel: {
      color: colors.mutedText,
      fontSize: 11,
      fontFamily: fontFamilies.bodyExtraBold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    transcriptText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    voiceResultCard: {
      borderRadius: 18,
      backgroundColor: "#ecfeff",
      padding: 14,
    },
    voiceResultText: {
      color: "#155e75",
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodySemiBold,
    },
    leaderboardCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    leaderboardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    leaderboardTitle: { color: colors.text, fontSize: 20, fontFamily: fontFamilies.displayBold },
    leaderboardMeta: { color: colors.mutedText, fontSize: 12, fontFamily: fontFamilies.bodySemiBold },
    leaderboardRow: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 8,
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    leaderboardRowCurrent: {
      borderColor: warm.teal,
      backgroundColor: warm.sage,
    },
    leaderboardName: { color: colors.text, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    leaderboardLevel: { color: colors.mutedText, fontSize: 12, marginTop: 3 },
    leaderboardPoints: { color: colors.text, fontSize: 14, fontFamily: fontFamilies.displaySemiBold },
    emptyLeaderboard: {
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    emptyLeaderboardText: { color: colors.mutedText, fontSize: 14, fontFamily: fontFamilies.bodyMedium },
    roundChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      borderRadius: 999,
      backgroundColor: warm.sage,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    roundChipText: {
      flexShrink: 1,
      color: warm.teal,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodyBold,
    },
    answerBlank: {
      color: warm.teal,
      backgroundColor: warm.sage,
      fontFamily: fontFamilies.displayBold,
    },
    optionCorrect: { borderColor: warm.teal, backgroundColor: warm.sage },
    optionWrong: { borderColor: warm.badge, backgroundColor: warm.dangerSoft },
    resultCard: { borderRadius: 20, padding: 16, gap: 14, marginTop: 4 },
    resultPass: { backgroundColor: warm.sage },
    resultFail: { backgroundColor: warm.peachSoft, borderWidth: 1, borderColor: warm.lineWarm },
    resultMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    resultTextWrap: { flex: 1, gap: 6, minWidth: 0 },
    resultTitle: { color: warm.ink, fontSize: 18, fontFamily: fontFamilies.displayBold },
    resultText: { color: warm.inkSoft, fontSize: 15, lineHeight: 21, fontFamily: fontFamilies.bodyMedium },
    resultStrong: { color: warm.ink, fontFamily: fontFamilies.bodyBold },
    resultNote: { color: warm.mutedInk, fontSize: 13, lineHeight: 18, fontFamily: fontFamilies.bodySemiBold },
    xpChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      backgroundColor: warm.paper,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    xpChipText: { color: warm.teal, fontSize: 14, fontFamily: fontFamilies.bodyExtraBold },
    warmPrimaryButton: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 999,
      backgroundColor: warm.action,
      paddingHorizontal: 18,
    },
    warmPrimaryButtonText: { color: warm.onAction, fontSize: 15, fontFamily: fontFamilies.displaySemiBold },
    warmSecondaryButton: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 999,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
      paddingHorizontal: 18,
    },
    warmSecondaryButtonText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    listeningButton: { borderColor: warm.peachInk, backgroundColor: warm.peachSoft },
    voiceResultRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    voiceScoreCircle: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
    },
    voiceScorePercent: { fontSize: 26, fontFamily: fontFamilies.displayBold },
    voiceScoreLabel: {
      color: warm.mutedInk,
      fontSize: 11,
      fontFamily: fontFamilies.bodyExtraBold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    voiceWords: { fontSize: 18, lineHeight: 27, fontFamily: fontFamilies.displaySemiBold },
    voiceWordMatched: { color: warm.teal },
    voiceWordMissed: {
      color: warm.peachDeep,
      textDecorationLine: "underline",
      textDecorationColor: warm.peachInk,
    },
    rankPill: { borderRadius: 999, backgroundColor: warm.peach, paddingHorizontal: 12, paddingVertical: 4 },
    rankPillText: { color: warm.peachDeep, fontSize: 13, fontFamily: fontFamilies.bodyExtraBold },
    leaderboardPlace: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14 },
    leaderboardPlaceTop: { backgroundColor: warm.peach },
    leaderboardPlaceText: { color: warm.peachDeep, fontSize: 14, fontFamily: fontFamilies.bodyExtraBold },
    leaderboardNameWrap: { flex: 1, minWidth: 0 },
    youPill: { borderRadius: 999, backgroundColor: warm.teal, paddingHorizontal: 10, paddingVertical: 2 },
    youPillText: { color: warm.onAction, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
  });
