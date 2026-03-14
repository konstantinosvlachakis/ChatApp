import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  fetchPracticeChallenge,
  fetchPracticeState,
  submitPracticeAnswer,
  translatePracticeSentence,
  type PracticeChallenge,
  type PracticeLeaderboardEntry,
  type PracticeStats,
} from "../services/api/practice";
import type { ThemeColors } from "../theme/colors";
import { fontFamilies } from "../theme/typography";

const DAILY_SET_STEPS = 10;
const SPEECH_MATCH_THRESHOLD = 0.72;

const LANGUAGE_SPEECH_CODE: Record<string, string> = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  greek: "el-GR",
  russian: "ru-RU",
};

const VOICE_SENTENCE_LIBRARY: Record<string, string[]> = {
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

const getChallengeSourceLabel = (source?: string) => {
  if (source === "generator_daily") return "Today's AI Set";
  if (source === "generator") return "AI Generated";
  return "Core Library";
};

const levelProgressPercent = (xp?: number) => Math.min(100, Math.max(0, (xp || 0) % 100));

const normalizeSpeechText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[.,!?;:()'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const calculateSpeechMatch = (target: string, actual: string) => {
  const t = normalizeSpeechText(target).split(" ").filter(Boolean);
  const a = normalizeSpeechText(actual).split(" ").filter(Boolean);
  if (!t.length || !a.length) return 0;
  const targetCounts: Record<string, number> = {};
  const actualCounts: Record<string, number> = {};
  t.forEach((word) => {
    targetCounts[word] = (targetCounts[word] || 0) + 1;
  });
  a.forEach((word) => {
    actualCounts[word] = (actualCounts[word] || 0) + 1;
  });
  let overlap = 0;
  Object.keys(targetCounts).forEach((word) => {
    overlap += Math.min(targetCounts[word], actualCounts[word] || 0);
  });
  return overlap / Math.max(t.length, 1);
};

const requiredSpeechMatchThreshold = (sentence: string) => {
  const wordCount = normalizeSpeechText(sentence).split(" ").filter(Boolean).length;
  if (wordCount <= 4) return 0.62;
  if (wordCount <= 7) return 0.68;
  return SPEECH_MATCH_THRESHOLD;
};

let speechRecognitionModule: any = null;
try {
  speechRecognitionModule = require("expo-speech-recognition").ExpoSpeechRecognitionModule;
} catch {
  speechRecognitionModule = null;
}

export function PracticeScreen() {
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTranscriptRef = useRef("");
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | "neutral">("neutral");
  const [submitted, setSubmitted] = useState(false);
  const [successfulMilestones, setSuccessfulMilestones] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [lastResultCorrect, setLastResultCorrect] = useState(false);
  const [error, setError] = useState("");

  const [voiceSentence, setVoiceSentence] = useState("");
  const [voiceTranslation, setVoiceTranslation] = useState("");
  const [voiceTranslationTarget, setVoiceTranslationTarget] = useState("");
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceScore, setVoiceScore] = useState<number | null>(null);
  const [voiceAttemptReady, setVoiceAttemptReady] = useState(false);
  const [voiceAttemptSubmitted, setVoiceAttemptSubmitted] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);

  const progress = levelProgressPercent(stats?.xp);
  const dailyProgress = Math.min(
    100,
    Math.round((successfulMilestones / DAILY_SET_STEPS) * 100)
  );

  const pickVoiceSentence = (nextLanguage: string) => {
    const pool = VOICE_SENTENCE_LIBRARY[nextLanguage] || VOICE_SENTENCE_LIBRARY.english;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const resetVoiceState = (sentence?: string) => {
    const nextSentence = sentence || pickVoiceSentence(language);
    voiceTranscriptRef.current = "";
    setVoiceSentence(nextSentence);
    setVoiceTranslation("");
    setVoiceTranslationTarget("");
    setVoiceTranslationLoading(false);
    setVoiceTranscript("");
    setVoiceScore(null);
    setVoiceAttemptReady(false);
    setVoiceAttemptSubmitted(false);
    setVoiceListening(false);
    setVoiceResult("");
  };

  const bootstrapPractice = async (preferredLanguage: string, isRefresh = false) => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [statePayload, challengePayload] = await Promise.all([
        fetchPracticeState(preferredLanguage),
        fetchPracticeChallenge(preferredLanguage),
      ]);
      setLanguage(statePayload.language || challengePayload.language || preferredLanguage);
      setStats(statePayload.stats || challengePayload.stats || null);
      setLeaderboard(statePayload.leaderboard || []);
      setCurrentRank(statePayload.current_rank ?? null);
      setChallenge(challengePayload.challenge || null);
      setSelectedWord("");
      setFeedback("");
      setFeedbackTone("neutral");
      setSubmitted(false);
      setOverlayVisible(false);
      resetVoiceState(pickVoiceSentence(preferredLanguage));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Could not load practice.");
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
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
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
      setVoiceResult("Listening...");
      setVoiceAttemptReady(false);
      setVoiceAttemptSubmitted(false);
      setVoiceScore(null);
      setVoiceTranscript("");
      voiceTranscriptRef.current = "";
    });

    const resultListener = speechRecognitionModule.addListener("result", (event: any) => {
      const transcript = event?.results?.[0]?.transcript?.trim() || "";
      if (!transcript) return;
      voiceTranscriptRef.current = transcript;
      setVoiceTranscript(transcript);
    });

    const errorListener = speechRecognitionModule.addListener("error", (event: any) => {
      setVoiceListening(false);
      setVoiceAttemptReady(false);
      setVoiceResult(event?.message || "Could not capture speech. Please try again.");
    });

    const endListener = speechRecognitionModule.addListener("end", () => {
      setVoiceListening(false);
      if (!voiceTranscriptRef.current.trim()) {
        setVoiceResult("No speech captured. Try again.");
        return;
      }
      setVoiceAttemptReady(true);
      setVoiceAttemptSubmitted(false);
      setVoiceResult("Recording captured. Submit or re-record.");
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
    setError("");
    setOverlayVisible(false);
    try {
      const payload = await fetchPracticeChallenge(nextLanguage);
      setChallenge(payload.challenge || null);
      if (payload.stats) setStats(payload.stats);
      setSelectedWord("");
      setFeedback("");
      setFeedbackTone("neutral");
      setSubmitted(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Could not load next challenge.");
    }
  };

  const handleSubmitAnswer = async () => {
    if (!challenge?.id || !selectedWord || submitted || submitting) return false;
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = await submitPracticeAnswer({
        challenge_id: challenge.id,
        selected_word: selectedWord,
        language,
      });
      setStats(payload.stats || null);
      setLeaderboard(payload.leaderboard || []);
      setCurrentRank(payload.current_rank ?? null);
      setSubmitted(true);
      setLastResultCorrect(Boolean(payload.correct));
      setOverlayVisible(true);

      if (payload.correct) {
        setSuccessfulMilestones((prev) => Math.min(DAILY_SET_STEPS, prev + 1));
        setFeedback(`Correct! +${payload.awarded_xp} XP / +${payload.awarded_points} points`);
        setFeedbackTone("success");
      } else {
        setFeedback(
          `Not quite. Correct answer: "${payload.correct_answer}" (+${payload.awarded_xp} XP)`
        );
        setFeedbackTone("error");
      }
      autoNextTimerRef.current = setTimeout(() => {
        autoNextTimerRef.current = null;
        loadNextChallenge(language);
      }, 2000);
      return true;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Could not submit answer.");
      return false;
    } finally {
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
      setVoiceTranscript("");
      setVoiceResult("Listening...");
      speechRecognitionModule.start({
        lang: LANGUAGE_SPEECH_CODE[language] || "en-US",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch {
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

  const nextVoiceSentence = () => {
    resetVoiceState(pickVoiceSentence(language));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerStateText}>Loading practice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
            <Text style={styles.dailyMeta}>Rank #{currentRank || "-"}</Text>
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

            <Text style={styles.challengeSentence}>
              {challenge?.sentence_parts?.[0] || ""}
              <Text style={selectedWord ? styles.filledBlank : styles.emptyBlank}>
                {selectedWord || "  choose word  "}
              </Text>
              {challenge?.sentence_parts?.[2] || ""}
            </Text>

            <View style={styles.optionsGrid}>
              {(challenge?.options || []).map((option) => {
                const isActive = option === selectedWord;
                return (
                  <Pressable
                    key={`${challenge?.id}-${option}`}
                    style={[
                      styles.optionButton,
                      isActive ? styles.optionButtonActive : undefined,
                    ]}
                    onPress={() => {
                      if (!submitted) setSelectedWord(option);
                    }}
                    disabled={submitted}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        isActive ? styles.optionButtonTextActive : undefined,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {feedback ? (
              <View
                style={[
                  styles.feedbackCard,
                  feedbackTone === "success" ? styles.feedbackSuccess : styles.feedbackError,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackText,
                    feedbackTone === "success"
                      ? styles.feedbackSuccessText
                      : styles.feedbackErrorText,
                  ]}
                >
                  {feedback}
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.primaryButton,
                  (!selectedWord || submitted || submitting) ? styles.buttonDisabled : undefined,
                ]}
                onPress={handleSubmitAnswer}
                disabled={!selectedWord || submitted || submitting}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? "Checking..." : "Check Answer"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.voiceCard}>
            <Text style={styles.challengeHint}>
              Hear the sentence, then repeat it using your microphone.
            </Text>
            <View style={styles.voiceSentenceCard}>
              <Text style={styles.voiceSentenceText}>
                {voiceSentence || "Loading sentence..."}
              </Text>
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
              <Pressable style={styles.primaryButton} onPress={playPronunciation}>
                <Text style={styles.primaryButtonText}>Hear pronunciation</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryButton,
                  !voiceSupported ? styles.buttonDisabled : undefined,
                ]}
                onPress={voiceListening ? stopVoiceRecognition : startVoiceRecognition}
                disabled={!voiceSupported}
              >
                <Text style={styles.secondaryButtonText}>
                  {voiceListening ? "Stop recording" : "Record & Verify"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={nextVoiceSentence}>
                <Text style={styles.secondaryButtonText}>Next sentence</Text>
              </Pressable>
            </View>

            {voiceAttemptReady && !voiceListening ? (
              <View style={styles.voiceButtonGrid}>
                <Pressable style={styles.successButton} onPress={submitVoiceAttempt}>
                  <Text style={styles.successButtonText}>Submit recording</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={startVoiceRecognition}>
                  <Text style={styles.secondaryButtonText}>Re-record</Text>
                </Pressable>
              </View>
            ) : null}

            {!voiceSupported ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>
                  Speech recognition is not available on this device yet. Rebuild the app after
                  installing native speech support if needed.
                </Text>
              </View>
            ) : null}

            {voiceTranscript ? (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>You said</Text>
                <Text style={styles.transcriptText}>{voiceTranscript}</Text>
              </View>
            ) : null}

            {voiceScore !== null && voiceAttemptSubmitted ? (
              <View
                style={[
                  styles.feedbackCard,
                  voiceScore >= requiredSpeechMatchThreshold(voiceSentence)
                    ? styles.feedbackSuccess
                    : styles.feedbackError,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackText,
                    voiceScore >= requiredSpeechMatchThreshold(voiceSentence)
                      ? styles.feedbackSuccessText
                      : styles.feedbackErrorText,
                  ]}
                >
                  Match score: {Math.round(voiceScore * 100)}%
                </Text>
              </View>
            ) : null}

            {voiceResult ? (
              <View style={styles.voiceResultCard}>
                <Text style={styles.voiceResultText}>{voiceResult}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.leaderboardCard}>
          <View style={styles.leaderboardHeader}>
            <Text style={styles.leaderboardTitle}>Leaderboard</Text>
            <Text style={styles.leaderboardMeta}>Rank #{currentRank || "-"}</Text>
          </View>
          {leaderboard.length ? (
            leaderboard.map((entry) => (
              <View
                key={`${entry.rank}-${entry.username}`}
                style={[
                  styles.leaderboardRow,
                  entry.is_current_user ? styles.leaderboardRowCurrent : undefined,
                ]}
              >
                <View>
                  <Text style={styles.leaderboardName}>
                    #{entry.rank} {entry.username}
                  </Text>
                  <Text style={styles.leaderboardLevel}>Level {entry.level}</Text>
                </View>
                <Text style={styles.leaderboardPoints}>{entry.points} pts</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyLeaderboard}>
              <Text style={styles.emptyLeaderboardText}>No leaderboard entries yet.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={overlayVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOverlayVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setOverlayVisible(false)} />
          <View style={styles.overlayCard}>
            <View
              style={[
                styles.overlayIconWrap,
                lastResultCorrect ? styles.overlaySuccessIcon : styles.overlayErrorIcon,
              ]}
            >
              <Ionicons
                name={lastResultCorrect ? "checkmark" : "close"}
                size={26}
                color="#fff"
              />
            </View>
            <Text style={styles.overlayEyebrow}>
              {lastResultCorrect ? "Nice Work" : "Try Again"}
            </Text>
            <Text style={styles.overlayTitle}>
              {lastResultCorrect ? "You cleared the next step." : "That answer did not land."}
            </Text>
            <Text style={styles.overlayText}>
              {lastResultCorrect
                ? "Your daily practice run keeps moving forward."
                : "Stay on the current step and take another shot."}
            </Text>
            <Text style={styles.overlayCountdown}>Next challenge in 2 seconds</Text>
            <View style={styles.overlayProgressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Run progress</Text>
                <Text style={styles.progressMeta}>
                  {successfulMilestones}/{DAILY_SET_STEPS}
                </Text>
              </View>
              <View style={styles.dailyTrack}>
                <View style={[styles.dailyFill, { width: `${dailyProgress}%` }]} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
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
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    leaderboardRowCurrent: {
      borderColor: "#7dd3fc",
      backgroundColor: "#ecfeff",
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
    overlay: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    overlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(15, 23, 42, 0.55)",
    },
    overlayCard: {
      backgroundColor: colors.surface,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      alignItems: "center",
    },
    overlayIconWrap: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
    },
    overlaySuccessIcon: { backgroundColor: "#10b981" },
    overlayErrorIcon: { backgroundColor: "#f43f5e" },
    overlayEyebrow: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 14,
    },
    overlayTitle: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "800",
      marginTop: 8,
      textAlign: "center",
    },
    overlayText: {
      color: colors.mutedText,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 8,
    },
    overlayCountdown: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 10,
    },
    overlayProgressCard: {
      width: "100%",
      marginTop: 18,
      borderRadius: 20,
      backgroundColor: colors.surfaceMuted,
      padding: 14,
    },
  });
