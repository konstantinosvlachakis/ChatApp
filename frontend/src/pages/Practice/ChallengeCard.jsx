import React, { useLayoutEffect, useRef, useState } from "react";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { toastApiError } from "../../components/Toast";
import { formatLanguageName, getChallengeSourceLabel } from "./practiceUtils";

const isTypingTarget = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

const isInteractiveTarget = (target) => {
  if (isTypingTarget(target)) return true;
  return Boolean(target?.closest?.("button, a[href], [role='button'], summary, dialog"));
};

const optionState = (option, selected, result) => {
  if (!result) return option === selected ? "selected" : "idle";
  if (option === selected) return result.correct ? "correct" : "wrong";
  if (!result.correct && option === result.correctAnswer) return "answer";
  return "idle";
};

const OPTION_NOTES = { correct: "Correct", wrong: "Your answer, wrong", answer: "Correct answer" };

const ResultPanel = ({ result, sentence, onTranslate, nextRef, onNext, isLoadingNext }) => {
  const [translation, setTranslation] = useState({ status: "idle", text: "", target: "" });

  const showTranslation = async () => {
    if (translation.status === "loading") return;
    setTranslation({ status: "loading", text: "", target: "" });
    try {
      const { text, target } = await onTranslate(sentence);
      setTranslation({ status: "done", text, target });
    } catch (err) {
      setTranslation({ status: "idle", text: "", target: "" });
      toastApiError(err, "Couldn't translate the sentence");
    }
  };

  const tone = result.correct ? "is-correct" : "is-wrong";
  const Icon = result.correct ? CheckCircleRoundedIcon : CancelRoundedIcon;
  return (
    <div className={`pr-result ${tone}`}>
      <div className="pr-result-main">
        <Icon className="pr-result-icon" aria-hidden="true" />
        <div className="pr-result-text">
          <strong>{result.correct ? "Nice one! That's right." : "Not quite."}</strong>
          {!result.correct && result.correctAnswer ? (
            <span>
              The answer is <b>{result.correctAnswer}</b>.
            </span>
          ) : null}
          {result.alreadyScored ? (
            <span className="pr-result-note">Already scored today, so no new XP for this one.</span>
          ) : result.awardedXp > 0 ? (
            <span className="pr-xp-chip">
              +{result.awardedXp} XP · +{result.awardedPoints} points
            </span>
          ) : null}
        </div>
      </div>
      {translation.status === "done" ? (
        <p className="pr-translation">
          <span>Translation{translation.target ? ` (${formatLanguageName(translation.target)})` : ""}</span>
          {translation.text || "No translation available."}
        </p>
      ) : null}
      <div className="pr-result-actions">
        {!result.correct && translation.status !== "done" ? (
          <button
            type="button"
            className="st-btn"
            onClick={showTranslation}
            disabled={translation.status === "loading"}
            aria-busy={translation.status === "loading" || undefined}
          >
            <TranslateRoundedIcon aria-hidden="true" />
            {translation.status === "loading" ? "Translating..." : "Why? Show translation"}
          </button>
        ) : null}
        <button
          ref={nextRef}
          type="button"
          className="st-btn is-teal pr-next"
          onClick={onNext}
          disabled={isLoadingNext}
          aria-busy={isLoadingNext || undefined}
        >
          {isLoadingNext ? "Loading..." : "Next"}
          <ArrowForwardRoundedIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

/** The daily drill hero card: hint, sentence with a blank, 4 option pills, check, result. */
const ChallengeCard = ({
  challenge,
  selected,
  onSelect,
  onCheck,
  onNext,
  onRetry,
  onTranslate,
  isSubmitting,
  isLoadingNext,
  result,
}) => {
  const nextRef = useRef(null);
  const sentenceRef = useRef(null);
  const hadResultRef = useRef(false);
  const options = challenge?.options || [];
  const parts = challenge?.sentence_parts || [];

  // Focus: the result's Next button after checking; the new sentence after moving on.
  // Layout effects so focus and the key handler are in place as soon as the DOM updates.
  useLayoutEffect(() => {
    if (result) {
      hadResultRef.current = true;
      nextRef.current?.focus();
    }
  }, [result]);
  useLayoutEffect(() => {
    if (hadResultRef.current && !result) {
      hadResultRef.current = false;
      sentenceRef.current?.focus();
    }
  }, [challenge?.id, result]);

  // Keyboard: 1-4 pick an option, Enter checks (or moves on once answered). One document
  // listener for the card's lifetime; it reads the latest props through a ref.
  const keyStateRef = useRef(null);
  keyStateRef.current = { options, result, isSubmitting, isLoadingNext, selected, onSelect, onCheck, onNext };
  useLayoutEffect(() => {
    const onKeyDown = (event) => {
      const { options, result, isSubmitting, isLoadingNext, selected, onSelect, onCheck, onNext } =
        keyStateRef.current;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (/^[1-9]$/.test(event.key)) {
        if (isTypingTarget(event.target) || result || isSubmitting) return;
        const option = options[Number(event.key) - 1];
        if (option === undefined) return;
        event.preventDefault();
        onSelect(option);
        return;
      }
      if (event.key === "Enter") {
        if (isInteractiveTarget(event.target)) return;
        if (result) {
          if (isLoadingNext) return;
          event.preventDefault();
          onNext();
        } else if (selected && !isSubmitting) {
          event.preventDefault();
          onCheck();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!challenge) {
    return (
      <section className="pf-card pr-card pr-card-empty" aria-labelledby="pr-card-title">
        <h2 id="pr-card-title" className="pf-card-title">
          No challenge right now
        </h2>
        <p className="pr-muted">We couldn't find a sentence for this language. Try again in a moment.</p>
        <div>
          <button type="button" className="st-btn is-teal" onClick={onRetry} disabled={isLoadingNext}>
            <RefreshRoundedIcon aria-hidden="true" />
            Try again
          </button>
        </div>
      </section>
    );
  }

  const blankWord = result ? (result.correct ? selected : result.correctAnswer || selected) : selected;
  const blankState = result ? (result.correct ? "is-correct" : "is-answer") : selected ? "is-filled" : "";
  const fullSentence = `${parts[0] || ""}${result?.correctAnswer || selected || ""}${parts[2] || ""}`
    .replace(/\s+/g, " ")
    .trim();

  return (
    <section className="pf-card pr-card" aria-labelledby="pr-card-title">
      <div className="pr-card-top">
        <h2 id="pr-card-title" className="lv-visually-hidden">
          Fill the gap
        </h2>
        <span className="pr-hint">
          <LightbulbOutlinedIcon aria-hidden="true" />
          {challenge.hint || "Pick the word that fits the blank."}
        </span>
        <span className="pr-source">
          <AutoAwesomeRoundedIcon aria-hidden="true" />
          {getChallengeSourceLabel(challenge.source)}
        </span>
      </div>

      <p className="pr-sentence" ref={sentenceRef} tabIndex={-1}>
        {parts[0] || ""}
        <span className={`pr-blank ${blankState}`} key={blankWord || "empty"}>
          {blankWord ? blankWord : <span className="lv-visually-hidden">blank</span>}
        </span>
        {parts[2] || ""}
      </p>

      <div className="pr-options" role="group" aria-label="Choose a word">
        {options.map((option, index) => {
          const state = optionState(option, selected, result);
          return (
            <button
              key={`${challenge.id}-${option}`}
              type="button"
              className={`pr-option is-${state}`}
              aria-pressed={option === selected}
              aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              disabled={Boolean(result) || isSubmitting}
              onClick={() => onSelect(option)}
              onKeyDown={(event) => {
                // Enter on the already chosen word checks it (Enter elsewhere is a normal click).
                if (event.key === "Enter" && option === selected && !result) {
                  event.preventDefault();
                  onCheck();
                }
              }}
            >
              <span className="pr-option-key" aria-hidden="true">
                {index + 1}
              </span>
              <span className="pr-option-word">{option}</span>
              {state === "correct" || state === "answer" ? (
                <CheckCircleRoundedIcon className="pr-option-icon" aria-hidden="true" />
              ) : null}
              {state === "wrong" ? <CancelRoundedIcon className="pr-option-icon" aria-hidden="true" /> : null}
              {OPTION_NOTES[state] ? <span className="lv-visually-hidden">, {OPTION_NOTES[state]}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="pr-live" aria-live="polite" role="status">
        {result ? (
          <ResultPanel
            key={challenge.id}
            result={result}
            sentence={fullSentence}
            onTranslate={onTranslate}
            nextRef={nextRef}
            onNext={onNext}
            isLoadingNext={isLoadingNext}
          />
        ) : null}
      </div>

      {!result ? (
        <div className="pr-check">
          <button
            type="button"
            className="st-btn is-teal pr-check-btn"
            onClick={onCheck}
            disabled={!selected || isSubmitting}
            aria-busy={isSubmitting || undefined}
          >
            {isSubmitting ? "Checking..." : "Check answer"}
          </button>
          <span className="pr-keys" aria-hidden="true">
            Press 1–{Math.min(options.length, 9) || 4} to choose, Enter to check
          </span>
        </div>
      ) : null}
    </section>
  );
};

export default ChallengeCard;
