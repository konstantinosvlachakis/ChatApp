import React, { useEffect, useRef, useState } from "react";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import {
  LANGUAGE_SPEECH_CODE,
  calculateSpeechMatch,
  formatLanguageName,
  pickBestVoiceForLanguage,
  randomVoiceSentence,
  requiredSpeechMatchThreshold,
  translateWithFallback,
  translationTargets,
} from "./practiceUtils";

/**
 * Voice repeat: hear a sentence (speechSynthesis), repeat it (SpeechRecognition), score the word
 * overlap client-side. Logic is unchanged from the old PracticePage; the parent remounts this
 * component (key = language) when the practice language changes, which resets it.
 */
const VoiceRepeat = ({ language, user }) => {
  const [voiceSentence, setVoiceSentence] = useState(() => (language ? randomVoiceSentence(language) : ""));
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
  const recognitionRef = useRef(null);
  const listenSilenceTimerRef = useRef(null);
  const listenMaxTimerRef = useRef(null);

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
    synth.addEventListener("voiceschanged", primeVoices);
    return () => synth.removeEventListener("voiceschanged", primeVoices);
  }, []);

  useEffect(
    () => () => {
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

  useEffect(() => {
    if (language && !voiceSentence) setVoiceSentence(randomVoiceSentence(language));
  }, [language, voiceSentence]);

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

  const loadNextVoiceSentence = () => {
    setVoiceSentence(randomVoiceSentence(language));
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
        if (event.results[i].isFinal) finalTranscript = `${finalTranscript} ${phrase}`.trim();
        else interimTranscript = `${interimTranscript} ${phrase}`.trim();
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
    if (score >= minScore) setVoiceResult(`Great pronunciation (${Math.round(score * 100)}% match).`);
    else setVoiceResult(`Try again (${Math.round(score * 100)}% match).`);
  };

  const passed = voiceScore !== null && voiceScore >= requiredSpeechMatchThreshold(voiceSentence);

  return (
    <section className="pf-card pr-card pr-voice" aria-labelledby="pr-voice-title">
      <div className="pr-card-top">
        <h2 id="pr-voice-title" className="pr-voice-title">
          Hear it, then say it
        </h2>
      </div>

      <div className="pr-voice-pair">
        <p className="pr-voice-sentence" lang={(LANGUAGE_SPEECH_CODE[language] || "").split("-")[0] || undefined}>
          {voiceSentence || "Loading sentence..."}
        </p>
        <p className="pr-translation">
          <span>
            Translation{voiceTranslationTarget ? ` (${formatLanguageName(voiceTranslationTarget)})` : ""}
          </span>
          {voiceTranslationLoading ? "Translating..." : voiceTranslation || "No translation available."}
        </p>
      </div>

      <div className="pr-voice-actions">
        <button type="button" className="st-btn is-teal" onClick={playPronunciation} disabled={!speechVoicesReady}>
          <VolumeUpRoundedIcon aria-hidden="true" />
          {speechVoicesReady ? "Hear pronunciation" : "Loading native voice..."}
        </button>
        <button
          type="button"
          className={`st-btn${voiceListening ? " is-listening" : ""}`}
          onClick={startVoiceRecognition}
          disabled={!voiceSentence || voiceListening || !voiceSupported}
        >
          <MicRoundedIcon aria-hidden="true" />
          {voiceListening ? "Listening..." : "Record & verify"}
        </button>
        <button type="button" className="st-btn" onClick={loadNextVoiceSentence}>
          <SkipNextRoundedIcon aria-hidden="true" />
          Next sentence
        </button>
      </div>

      {voiceAttemptReady && !voiceListening ? (
        <div className="pr-voice-actions">
          <button type="button" className="st-btn is-teal" onClick={submitVoiceAttempt}>
            <SendRoundedIcon aria-hidden="true" />
            Submit recording
          </button>
          <button type="button" className="st-btn" onClick={startVoiceRecognition}>
            <ReplayRoundedIcon aria-hidden="true" />
            Re-record
          </button>
        </div>
      ) : null}

      {!voiceSupported ? (
        <p className="pr-notice is-warn">Your browser does not support speech recognition/synthesis.</p>
      ) : null}

      {voiceTranscript ? (
        <div className="pr-transcript">
          <span>You said</span>
          <p>{voiceTranscript}</p>
        </div>
      ) : null}

      <div aria-live="polite" role="status" className="pr-live">
        {voiceScore !== null && voiceAttemptSubmitted ? (
          <p className={`pr-notice ${passed ? "is-good" : "is-warn"}`}>Match score: {Math.round(voiceScore * 100)}%</p>
        ) : null}
        {voiceResult ? <p className="pr-notice">{voiceResult}</p> : null}
      </div>
    </section>
  );
};

export default VoiceRepeat;
