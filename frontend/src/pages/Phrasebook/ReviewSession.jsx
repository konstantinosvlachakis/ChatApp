import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { getErrorMessage } from "../../lib/api";
import { toastApiError } from "../../components/Toast";
import {
  PHRASEBOOK_QUERY_KEY,
  PHRASEBOOK_REVIEW_KEY,
  PHRASEBOOK_SUMMARY_KEY,
  getReviewBatch,
  reviewPhrase,
} from "./api/phrasebook";
import { REVIEW_RESULTS, formatRelativeTime, languageLabel, reviewPrompt } from "./phrasebookUtils";

const PROMPT_LABELS = {
  meaning: "What's the phrase for…",
  context: "Fill the gap",
  note: "Hint",
  recall: "",
};

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Review mode (/phrasebook/review): one card at a time from GET /api/phrasebook/review/.
 * Space reveals, 1–4 grade (Again / Hard / Good / Easy). When a batch ends and the last
 * review says more are due, the next batch is fetched and the session continues.
 */
export default function ReviewSession() {
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({
    queryKey: PHRASEBOOK_REVIEW_KEY,
    queryFn: getReviewBatch,
    refetchOnMount: "always",
    useErrorBoundary: false,
  });
  // Local copy of the batch so background refetches never reshuffle the card in front of you.
  const [session, setSession] = useState(null); // { cards, index }
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const busyRef = useRef(false);
  const showRef = useRef(null);
  const goodRef = useRef(null);

  useEffect(() => {
    if (session || finished || !reviewQuery.data || reviewQuery.isFetching) return;
    const cards = reviewQuery.data.cards || [];
    if (cards.length) setSession({ cards, index: 0 });
    else setFinished(true);
  }, [finished, reviewQuery.data, reviewQuery.isFetching, session]);

  const card = session ? session.cards[session.index] : null;

  // Focus "Show answer" for each new card, "Good" once revealed.
  useEffect(() => {
    if (!card) return;
    (revealed ? goodRef.current : showRef.current)?.focus();
  }, [card, revealed]);

  const finish = useCallback(() => {
    setSession(null);
    setFinished(true);
    // Fresh counts + next_due_at for the finish screen and the list header.
    queryClient.invalidateQueries(PHRASEBOOK_QUERY_KEY);
  }, [queryClient]);

  const grade = useCallback(
    async (result) => {
      if (!card || !revealed || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const payload = await reviewPhrase(card.id, result);
        setReviewed((count) => count + 1);
        queryClient.invalidateQueries(PHRASEBOOK_SUMMARY_KEY);
        const nextIndex = session.index + 1;
        if (nextIndex < session.cards.length) {
          setSession({ ...session, index: nextIndex });
          setRevealed(false);
        } else if ((payload?.due_count ?? 0) > 0) {
          // Batch done but more are due: fetch the next batch and keep going.
          const batch = await queryClient.fetchQuery(PHRASEBOOK_REVIEW_KEY, getReviewBatch, { staleTime: 0 });
          const cards = batch?.cards || [];
          setRevealed(false);
          if (cards.length) setSession({ cards, index: 0 });
          else finish();
        } else {
          setRevealed(false);
          finish();
        }
      } catch (error) {
        toastApiError(error, "Couldn't save your answer");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [card, finish, queryClient, revealed, session]
  );

  useEffect(() => {
    if (!card) return undefined;
    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      if (!revealed && (event.key === " " || event.key === "Enter")) {
        // Enter on a focused button already clicks it.
        if (event.key === "Enter" && event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const option = REVIEW_RESULTS.find((item) => item.key === event.key);
        if (option) {
          event.preventDefault();
          grade(option.result);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, grade, revealed]);

  const backLink = (
    <Link to="/phrasebook" className="st-btn is-small">
      <ArrowBackRoundedIcon aria-hidden="true" />
      Phrasebook
    </Link>
  );

  if (reviewQuery.isError && !session && !finished) {
    return (
      <div className="pf-card pb-review-state" role="alert">
        <h2 className="pf-card-title">We couldn't load your review</h2>
        <p className="pb-muted">{getErrorMessage(reviewQuery.error, "Please try again.")}</p>
        <div className="pb-row">
          {backLink}
          <button type="button" className="st-btn is-small is-teal" onClick={() => reviewQuery.refetch()}>
            <RefreshRoundedIcon aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const data = reviewQuery.data;
    const next = data?.next_due_at ? formatRelativeTime(data.next_due_at) : "";
    const dueNow = data?.due_count ?? 0;
    return (
      <div className="pf-card pb-review-state pb-finish" role="status">
        <CelebrationOutlinedIcon className="pb-finish-icon" aria-hidden="true" />
        <h2 className="pf-card-title">{reviewed ? "Review done!" : "Nothing to review right now"}</h2>
        <p className="pb-muted">
          {reviewed ? `You reviewed ${reviewed} ${reviewed === 1 ? "phrase" : "phrases"}. ` : ""}
          {reviewQuery.isFetching
            ? "Checking what's next…"
            : dueNow > 0
              ? `${dueNow} more ${dueNow === 1 ? "is" : "are"} due.`
              : next
                ? `Next review ${next}.`
                : data?.total_count
                  ? "You're all caught up."
                  : "Save phrases from your chats to start reviewing."}
        </p>
        <div className="pb-row">
          {backLink}
          {!reviewQuery.isFetching && dueNow > 0 && (
            <button
              type="button"
              className="st-btn is-small is-teal"
              onClick={() => {
                setFinished(false);
                setSession(null);
              }}
            >
              Keep reviewing
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="pf-card pb-review-state" aria-busy="true">
        <span role="status">Loading your review…</span>
      </div>
    );
  }

  const prompt = reviewPrompt(card);
  const language = languageLabel(card.language);
  const position = session.index + 1;
  const total = session.cards.length;

  return (
    <section className="pb-review" aria-labelledby="pb-review-title">
      <div className="pb-review-top">
        {backLink}
        <p className="pb-progress" aria-label={`Card ${position} of ${total}`}>
          {position} / {total}
        </p>
      </div>
      <div className="pb-progress-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(((position - 1) / total) * 100)}%` }} />
      </div>

      <article className="pf-card pb-card" aria-live="polite">
        <h2 id="pb-review-title" className="lv-visually-hidden">
          Review card {position} of {total}
        </h2>
        <div className="pb-card-meta">
          {language && <span className="pb-lang">{language}</span>}
          {PROMPT_LABELS[prompt.kind] && <span className="pb-card-kind">{PROMPT_LABELS[prompt.kind]}</span>}
        </div>
        <p className={`pb-card-front is-${prompt.kind}`} dir="auto">
          {prompt.text}
        </p>

        {revealed ? (
          <div className="pb-card-back">
            <p className="pb-card-answer" dir="auto">
              {card.text}
            </p>
            {card.context && prompt.kind !== "context" && (
              <p className="pb-context" dir="auto">
                from: “{card.context}”
              </p>
            )}
            {card.meaning && prompt.kind !== "meaning" && (
              <p className="pb-meaning" dir="auto">
                {card.meaning}
              </p>
            )}
            {card.note && prompt.kind !== "note" && (
              <p className="pb-note" dir="auto">
                {card.note}
              </p>
            )}
          </div>
        ) : (
          <button ref={showRef} type="button" className="st-btn is-teal pb-show" onClick={() => setRevealed(true)}>
            Show answer
            <kbd className="pb-kbd" aria-hidden="true">
              Space
            </kbd>
          </button>
        )}
      </article>

      {revealed && (
        <div className="pb-grades" role="group" aria-label="How well did you know it?">
          {REVIEW_RESULTS.map((option) => (
            <button
              key={option.result}
              ref={option.result === "good" ? goodRef : undefined}
              type="button"
              className={`pb-grade is-${option.result}`}
              onClick={() => grade(option.result)}
              disabled={busy}
              aria-keyshortcuts={option.key}
            >
              <kbd className="pb-kbd" aria-hidden="true">
                {option.key}
              </kbd>
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      )}
      <p className="pb-shortcuts">Keyboard: Space shows the answer, 1–4 grade it.</p>
    </section>
  );
}
