import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { getErrorMessage } from "../../lib/api";
import { toast, toastApiError } from "../../components/Toast";
import ConfirmDialog from "../Settings/ConfirmDialog";
import { describeLanguage } from "../Profile/features/profileUtils";
import { useUser } from "../../context/UserContext";
import {
  PHRASEBOOK_QUERY_KEY,
  PHRASEBOOK_REVIEW_KEY,
  addManualPhrase,
  deletePhrase,
  getReviewBatch,
  updatePhrase,
  usePhrasebookList,
} from "./api/phrasebook";
import { formatRelativeTime } from "./phrasebookUtils";
import PhraseForm from "./PhraseForm";
import PhraseItem from "./PhraseItem";
import ReviewSession from "./ReviewSession";
import "../Profile/features/profile.css";
import "../Settings/settings.css";
import "./phrasebook.css";

const SEARCH_DEBOUNCE_MS = 300;

const useDebounced = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const ListSkeleton = () => (
  <ul className="pb-list" aria-hidden="true">
    {[0, 1, 2].map((key) => (
      <li key={key} className="pb-skel" />
    ))}
  </ul>
);

const PhrasebookList = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);

  const review = useQuery({
    queryKey: PHRASEBOOK_REVIEW_KEY,
    queryFn: getReviewBatch,
    useErrorBoundary: false,
  });
  const list = usePhrasebookList(q, language);

  const pages = list.data?.pages || [];
  const entries = pages.flatMap((page) => page?.entries || []);
  const firstPage = pages[0];
  const totalCount = firstPage?.pagination?.total_count ?? 0;
  const dueCount = review.data?.due_count ?? firstPage?.due_count ?? 0;
  const nextDue = review.data?.next_due_at ? formatRelativeTime(review.data.next_due_at) : "";
  const filtered = Boolean(q || language);

  // Filter options: the languages in use, plus the ones you're learning (handy for adding).
  const languages = useMemo(() => {
    const fromServer = firstPage?.languages || [];
    const learning = (user?.languages_practicing || []).map((lang) => String(lang || "").toLowerCase());
    return [...new Set([...fromServer, ...learning].filter(Boolean))].sort();
  }, [firstPage?.languages, user?.languages_practicing]);
  const filterLanguages = firstPage?.languages || [];

  const refreshAll = () => queryClient.invalidateQueries(PHRASEBOOK_QUERY_KEY);

  const handleAdd = async (values) => {
    setAddBusy(true);
    try {
      const payload = await addManualPhrase(values);
      if (payload?.created === false) toast.info("Already in your phrasebook");
      else toast.success("Added to your phrasebook");
      setAdding(false);
      refreshAll();
    } catch (error) {
      toastApiError(error, "Couldn't add the phrase");
    } finally {
      setAddBusy(false);
    }
  };

  const handleSave = async (id, values) => {
    try {
      await updatePhrase(id, values);
      toast.success("Phrase updated");
      refreshAll();
      return true;
    } catch (error) {
      toastApiError(error, "Couldn't save the phrase");
      return false;
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deletePhrase(pendingDelete.id);
      toast.info("Phrase deleted");
      setPendingDelete(null);
      refreshAll();
    } catch (error) {
      toastApiError(error, "Couldn't delete the phrase");
    } finally {
      setDeleting(false);
    }
  };

  let body;
  if (list.isLoading) {
    body = <ListSkeleton />;
  } else if (list.isError && !entries.length) {
    body = (
      <div className="pf-card pb-review-state" role="alert">
        <p className="pb-muted">{getErrorMessage(list.error, "Couldn't load your phrasebook.")}</p>
        <div>
          <button type="button" className="st-btn is-small is-teal" onClick={() => list.refetch()}>
            <RefreshRoundedIcon aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  } else if (!entries.length) {
    body = (
      <p className="pb-empty">
        {filtered
          ? "No phrases match your search."
          : "Your phrasebook is empty. In a chat, open a message's menu and choose “Save to phrasebook”, or save a partner's correction."}
      </p>
    );
  } else {
    body = (
      <>
        <ul className={`pb-list${list.isFetching && !list.isFetchingNextPage ? " is-refreshing" : ""}`}>
          {entries.map((entry) => (
            <PhraseItem
              key={entry.id}
              entry={entry}
              languages={languages}
              onSave={handleSave}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
        {list.hasNextPage && (
          <div className="pb-more">
            <button
              type="button"
              className="st-btn"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <header className="pb-head">
        <div className="pb-head-text">
          <h1>Phrasebook</h1>
          <p>
            {totalCount
              ? `${totalCount} saved ${totalCount === 1 ? "phrase" : "phrases"} from your chats, corrections and notes.`
              : "Save phrases from your chats and partners' corrections, then review them a little every day."}
          </p>
        </div>
        <div className="pb-head-review">
          {dueCount > 0 ? (
            <Link to="/phrasebook/review" className="st-btn is-teal">
              <StyleOutlinedIcon aria-hidden="true" />
              Review {dueCount} due
            </Link>
          ) : (
            <>
              <button type="button" className="st-btn is-teal" disabled aria-describedby="pb-caught-up">
                <StyleOutlinedIcon aria-hidden="true" />
                Review
              </button>
              <span id="pb-caught-up" className="pb-muted">
                {nextDue ? `All caught up — next review ${nextDue}` : "All caught up"}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="pb-toolbar">
        <label className="pb-search">
          <SearchRoundedIcon aria-hidden="true" />
          <span className="lv-visually-hidden">Search your phrasebook</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search phrases, meanings, notes"
            maxLength={100}
          />
        </label>
        {filterLanguages.length > 0 && (
          <label className="pb-filter">
            <span className="lv-visually-hidden">Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="">All languages</option>
              {filterLanguages.map((key) => (
                <option key={key} value={key}>
                  {describeLanguage(key).name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!adding && (
          <button type="button" className="st-btn" onClick={() => setAdding(true)}>
            <AddRoundedIcon aria-hidden="true" />
            Add phrase
          </button>
        )}
      </div>

      {adding && (
        <section className="pf-card pb-add" aria-labelledby="pb-add-title">
          <h2 id="pb-add-title" className="pf-card-title">
            Add a phrase
          </h2>
          <PhraseForm
            showContext
            languages={languages}
            initial={{ language: language || languages[0] || "" }}
            submitLabel="Add phrase"
            busyLabel="Adding…"
            busy={addBusy}
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        </section>
      )}

      {body}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this phrase?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        tone="danger"
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      >
        <p>
          “<strong>{pendingDelete?.text}</strong>” and its review progress will be removed from your phrasebook.
        </p>
      </ConfirmDialog>
    </>
  );
};

/** /phrasebook (list) and /phrasebook/review (one card at a time). */
const PhrasebookPage = () => {
  const { pathname } = useLocation();
  const isReview = /^\/phrasebook\/review\/?$/.test(pathname);
  return <div className="pf-page pb-page">{isReview ? <ReviewSession /> : <PhrasebookList />}</div>;
};

export default PhrasebookPage;
