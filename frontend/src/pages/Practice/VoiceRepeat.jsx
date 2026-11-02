import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RecordVoiceOverRoundedIcon from "@mui/icons-material/RecordVoiceOverRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { getErrorMessage } from "../../lib/api";
import {
  LANGUAGE_SPEECH_CODE,
  VOICE_ROUND_COMPLETE_MESSAGE,
  calculateSpeechMatch,
  completeVoiceSentence,
  fetchVoiceSentence,
  formatLanguageName,
  markSpeechWords,
  pickBestVoiceForLanguage,
  requiredSpeechMatchThreshold,
  translateWithFallback,
  translationTargets,
  voiceRewardLabel,
} from "./practiceUtils";

const SILENCE_STOP_MS = 1300;
const MAX_LISTEN_MS = 9000;

const safeStop = (recognition) => {
  try {
    recognition?.stop();
  } catch (_e) {
    // no-op
  }
};

/** Result of one attempt: big match %, the sentence with matched/missed words, pass/fail. */
const VoiceResult = ({ result, lang, reward }) => {
  const percent = Math.round(result.score * 100);
  const missed = result.words.filter((item) => !item.matched).length;
  return (
    <div className={`pr-voice-result ${result.passed ? "is-pass" : "is-fail"}`}>
      <div className="pr-voice-score">
        <span className="pr-voice-percent">{percent}%</span>
        <span className="pr-voice-score-label">match</span>
      </div>
      <div className="pr-voice-result-body">
        <strong>
          {result.passed ? (
            <>
              <CheckCircleRoundedIcon aria-hidden="true" />
              Great pronunciation!
            </>
          ) : (
            "Almost — try again"
          )}
        </strong>
        <p className="pr-voice-words" lang={lang}>
          {result.words.map((item, index) => (
            <React.Fragment key={`${index}-${item.word}`}>
              {index ? " " : null}
              <span className={`pr-voice-word ${item.matched ? "is-matched" : "is-missed"}`}>
                {item.word}
                {item.matched ? null : <span className="lv-visually-hidden"> (missed)</span>}
              </span>
            </React.Fragment>
          ))}
        </p>
        <span className="pr-voice-legend">
          {missed ? `${missed} word${missed === 1 ? "" : "s"} to work on (underlined)` : "Every word recognised"}
        </span>
        {result.passed && reward ? (
          <span className={reward.awardedXp > 0 ? "pr-xp-chip" : "pr-result-note"}>{voiceRewardLabel(reward)}</span>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Voice repeat: hear a sentence (speechSynthesis), repeat it (SpeechRecognition). Sentences come
 * from the server library (GET /api/practice/voice/next/, no repeats per round). When recognition
 * ends with a transcript the attempt is scored straight away (client-side word overlap); a pass
 * claims XP once per sentence (POST /api/practice/voice/complete/, capped server-side) and
 * `onProgress(payload)` hands the updated stats/leaderboard to the page.
 * The parent remounts this component (key = language) when the practice language changes.
 */
const VoiceRepeat = ({ language, user, onProgress }) => {
  // { id, text, round_complete, translation_hint?, ... } from the server.
  const [sentence, setSentence] = useState(null);
  const [sentenceStatus, setSentenceStatus] = useState("loading"); // loading | ready | error
  const [sentenceError, setSentenceError] = useState("");
  // XP claim for the current sentence: { status: "pending" | "done", awardedXp, alreadyScored, ... }.
  const [reward, setReward] = useState(null);
  const voiceSentence = sentence?.text || "";
  const [voiceTranslation, setVoiceTranslation] = useState("");
  const [voiceTranslationTarget, setVoiceTranslationTarget] = useState("");
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [attempt, setAttempt] = useState(null); // { score, passed, words }
  const [notice, setNotice] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechVoicesReady, setSpeechVoicesReady] = useState(false);
  const recognitionRef = useRef(null);
  const listenSilenceTimerRef = useRef(null);
  const listenMaxTimerRef = useRef(null);
  const nextRef = useRef(null);
  const tryAgainRef = useRef(null);
  // Bumped on every sentence load so a late response is ignored.
  const sentenceSeqRef = useRef(0);
  // Sentence id whose XP claim was sent (synchronous guard against double posts).
  const claimedIdRef = useRef(null);
  const mountedRef = useRef(true);
  const sentenceLang = (LANGUAGE_SPEECH_CODE[language] || "").split("-")[0] || undefined;

  useEffect(() => {
    const hasRecognition =
      typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
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
    synth.addEventListener?.("voiceschanged", primeVoices);
    return () => synth.removeEventListener?.("voiceschanged", primeVoices);
  }, []);

  const clearTimers = () => {
    if (listenSilenceTimerRef.current) window.clearTimeout(listenSilenceTimerRef.current);
    if (listenMaxTimerRef.current) window.clearTimeout(listenMaxTimerRef.current);
    listenSilenceTimerRef.current = null;
    listenMaxTimerRef.current = null;
  };

  // Detach the current recognition (its late events are ignored) and stop it.
  const abandonRecognition = () => {
    const current = recognitionRef.current;
    recognitionRef.current = null;
    clearTimers();
    safeStop(current);
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      abandonRecognition();
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadSentence = async () => {
    const seq = ++sentenceSeqRef.current;
    setSentenceStatus("loading");
    setSentenceError("");
    try {
      const payload = await fetchVoiceSentence(language);
      if (!mountedRef.current || seq !== sentenceSeqRef.current) return;
      setSentence(payload && payload.text ? payload : null);
      setSentenceStatus(payload && payload.text ? "ready" : "error");
      if (!payload?.text) setSentenceError("No sentence available right now.");
    } catch (err) {
      if (!mountedRef.current || seq !== sentenceSeqRef.current) return;
      setSentence(null);
      setSentenceError(getErrorMessage(err, "Could not load a sentence."));
      setSentenceStatus("error");
    }
  };

  useEffect(() => {
    if (language) loadSentence();
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    const translateVoiceSentence = async () => {
      if (!voiceSentence) return;
      const targets = translationTargets(user, language);
      if (!targets.length) {
        setVoiceTranslation("");
        setVoiceTranslationTarget("");
        return;
      }
      // The library ships an English gloss: no translate call when English is the first target.
      if (sentence?.translation_hint && targets[0] === "english") {
        setVoiceTranslation(sentence.translation_hint);
        setVoiceTranslationTarget("english");
        setVoiceTranslationLoading(false);
        return;
      }
      setVoiceTranslationLoading(true);
      try {
        const { text, target } = await translateWithFallback(voiceSentence, targets);
        if (cancelled) return;
        setVoiceTranslation(text);
        setVoiceTranslationTarget(target);
      } catch (_e) {
        if (cancelled) return;
        setVoiceTranslation("");
        setVoiceTranslationTarget("");
      } finally {
        if (!cancelled) setVoiceTranslationLoading(false);
      }
    };
    translateVoiceSentence();
    return () => {
      cancelled = true;
    };
  }, [voiceSentence, language, user?.base_translate_language, user?.native_language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus: the result's main action once an attempt is scored.
  useLayoutEffect(() => {
    if (!attempt) return;
    (attempt.passed ? nextRef.current : tryAgainRef.current)?.focus();
  }, [attempt]);

  // One XP claim per sentence: later passes (Try again) reuse the first claim's result.
  const claimReward = async (sentenceId, score) => {
    if (!sentenceId || claimedIdRef.current === sentenceId) return;
    claimedIdRef.current = sentenceId;
    setReward({ status: "pending", awardedXp: 0 });
    try {
      const payload = await completeVoiceSentence(sentenceId, Math.round(score * 1000) / 1000);
      if (!mountedRef.current || claimedIdRef.current !== sentenceId) return;
      setReward({
        status: "done",
        awardedXp: payload?.awarded_xp || 0,
        alreadyScored: Boolean(payload?.already_scored),
        voiceLimit: Boolean(payload?.daily_voice_limit_reached),
        xpLimit: Boolean(payload?.daily_xp_limit_reached) && !(payload?.awarded_xp > 0),
      });
      onProgress?.(payload);
    } catch (_err) {
      if (!mountedRef.current || claimedIdRef.current !== sentenceId) return;
      // Let the next passing attempt try again.
      claimedIdRef.current = null;
      setReward({ status: "done", awardedXp: 0 });
    }
  };

  const evaluateAttempt = (transcript) => {
    const score = calculateSpeechMatch(voiceSentence, transcript);
    const passed = score >= requiredSpeechMatchThreshold(voiceSentence);
    setAttempt({
      score,
      passed,
      words: markSpeechWords(voiceSentence, transcript),
    });
    if (passed) claimReward(sentence?.id, score);
  };

  const loadNextVoiceSentence = () => {
    abandonRecognition();
    setVoiceListening(false);
    claimedIdRef.current = null;
    setReward(null);
    loadSentence();
    setVoiceTranslation("");
    setVoiceTranslationTarget("");
    setVoiceTranslationLoading(false);
    setVoiceTranscript("");
    setAttempt(null);
    setNotice("");
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

  const stopListening = () => {
    // Ends the recording early; onend then scores what was heard.
    clearTimers();
    safeStop(recognitionRef.current);
  };

  const startVoiceRecognition = () => {
    if (!voiceSupported || typeof window === "undefined") {
      setNotice("Speech recognition is not supported on this device/browser.");
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("Speech recognition is not available.");
      return;
    }
    abandonRecognition();

    const recognition = new Recognition();
    recognition.lang = LANGUAGE_SPEECH_CODE[language] || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    const isCurrent = () => recognitionRef.current === recognition;

    setVoiceListening(true);
    setVoiceTranscript("");
    setAttempt(null);
    setNotice("");
    let finalTranscript = "";
    let interimTranscript = "";
    let failed = false;

    const scheduleSilenceStop = () => {
      if (listenSilenceTimerRef.current) window.clearTimeout(listenSilenceTimerRef.current);
      listenSilenceTimerRef.current = window.setTimeout(() => safeStop(recognition), SILENCE_STOP_MS);
    };
    listenMaxTimerRef.current = window.setTimeout(() => safeStop(recognition), MAX_LISTEN_MS);

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = event.results[i]?.[0]?.transcript || "";
        if (!phrase) continue;
        if (event.results[i].isFinal) finalTranscript = `${finalTranscript} ${phrase}`.trim();
        else interimTranscript = `${interimTranscript} ${phrase}`.trim();
      }
      const combined = `${finalTranscript} ${interimTranscript}`.trim();
      if (combined) setVoiceTranscript(combined);
      scheduleSilenceStop();
    };
    recognition.onerror = () => {
      if (!isCurrent()) return;
      failed = true;
      clearTimers();
    };
    recognition.onend = () => {
      if (!isCurrent()) return;
      recognitionRef.current = null;
      clearTimers();
      setVoiceListening(false);
      const transcript = `${finalTranscript} ${interimTranscript}`.trim();
      if (!transcript) {
        setNotice(
          failed
            ? "Could not capture speech. Please try again."
            : "We didn't catch that. Tap Record and say the sentence."
        );
        return;
      }
      setVoiceTranscript(transcript);
      evaluateAttempt(transcript);
    };
    recognition.start();
  };

  const sentenceLoading = sentenceStatus === "loading";
  const recordDisabled = !voiceSentence || !voiceSupported || sentenceLoading;

  if (sentenceStatus === "error" && !voiceSentence) {
    return (
      <section className="pf-card pr-card pr-voice" aria-labelledby="pr-voice-title">
        <div className="pr-card-top">
          <h2 id="pr-voice-title" className="pr-voice-title">
            Hear it, then say it
          </h2>
        </div>
        <div className="pr-voice-error" role="alert">
          <p className="pr-notice is-warn">{sentenceError || "Could not load a sentence."}</p>
          <div>
            <button type="button" className="st-btn is-teal" onClick={loadSentence}>
              <RefreshRoundedIcon aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pf-card pr-card pr-voice" aria-labelledby="pr-voice-title" aria-busy={sentenceLoading || undefined}>
      <div className="pr-card-top">
        <h2 id="pr-voice-title" className="pr-voice-title">
          Hear it, then say it
        </h2>
      </div>

      {sentence?.round_complete && !sentenceLoading ? (
        <p className="pr-round-chip" role="status">
          <CelebrationRoundedIcon aria-hidden="true" />
          {VOICE_ROUND_COMPLETE_MESSAGE}
        </p>
      ) : null}

      <div className="pr-voice-pair">
        {sentenceLoading ? (
          <div className="pr-voice-sentence pr-skel pr-skel-voice" aria-hidden="true" />
        ) : (
          <p className="pr-voice-sentence" lang={sentenceLang}>
            {voiceSentence}
          </p>
        )}
        {sentenceLoading ? <span className="lv-visually-hidden" role="status">Loading sentence...</span> : null}
        <p className="pr-translation">
          <span>
            Translation{voiceTranslationTarget ? ` (${formatLanguageName(voiceTranslationTarget)})` : ""}
          </span>
          {voiceTranslationLoading ? "Translating..." : voiceTranslation || "No translation available."}
        </p>
      </div>

      <div className="pr-voice-actions">
        <button type="button" className="st-btn" onClick={playPronunciation} disabled={!speechVoicesReady}>
          <VolumeUpRoundedIcon aria-hidden="true" />
          {speechVoicesReady ? "Hear pronunciation" : "Loading native voice..."}
        </button>
        {voiceListening ? (
          <button
            type="button"
            className="st-btn is-listening"
            onClick={stopListening}
            aria-label="Listening… stop recording"
          >
            <StopRoundedIcon aria-hidden="true" />
            Listening… tap to stop
          </button>
        ) : attempt ? (
          <>
            <button
              ref={tryAgainRef}
              type="button"
              className={`st-btn${attempt.passed ? "" : " is-teal"}`}
              onClick={startVoiceRecognition}
              disabled={recordDisabled}
            >
              <ReplayRoundedIcon aria-hidden="true" />
              Try again
            </button>
            <button
              ref={nextRef}
              type="button"
              className={`st-btn${attempt.passed ? " is-teal" : ""}`}
              onClick={loadNextVoiceSentence}
            >
              Next sentence
              <ArrowForwardRoundedIcon aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="st-btn is-teal" onClick={startVoiceRecognition} disabled={recordDisabled}>
              <MicRoundedIcon aria-hidden="true" />
              Record
            </button>
            <button type="button" className="st-btn" onClick={loadNextVoiceSentence} disabled={sentenceLoading}>
              <SkipNextRoundedIcon aria-hidden="true" />
              Skip
            </button>
          </>
        )}
      </div>

      {!voiceSupported ? (
        <p className="pr-notice is-warn">Your browser does not support speech recognition/synthesis.</p>
      ) : null}

      {voiceListening && voiceTranscript ? (
        <div className="pr-transcript">
          <span>
            <RecordVoiceOverRoundedIcon aria-hidden="true" /> Hearing
          </span>
          <p>{voiceTranscript}</p>
        </div>
      ) : null}

      <div aria-live="polite" role="status" className="pr-live">
        {voiceListening ? <span className="lv-visually-hidden">Listening…</span> : null}
        {attempt ? <VoiceResult result={attempt} lang={sentenceLang} reward={reward} /> : null}
        {attempt && voiceTranscript ? (
          <div className="pr-transcript">
            <span>You said</span>
            <p>{voiceTranscript}</p>
          </div>
        ) : null}
        {notice ? <p className="pr-notice is-warn">{notice}</p> : null}
      </div>
    </section>
  );
};

export default VoiceRepeat;
