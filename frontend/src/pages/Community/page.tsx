import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { BASE_URL } from "../../constants/constants";
import api, { getErrorMessage, isAbortError } from "../../lib/api";
import { useUser } from "../../context/UserContext";
import { createOrGetConversation } from "./api/conversation";
import ExchangeProfileCard, { ExchangeProfile, languageLabel, languageLevel } from "./components/ExchangeProfileCard";
import FilterSheet from "./components/FilterSheet";
import "./community.css";

const PAGE_SIZE = 24;
const segments = [
  { key: "all", label: "Best matches" },
  { key: "reciprocal", label: "Perfect exchange" },
  { key: "teaches_me", label: "Native speakers" },
];
const levels = ["beginner", "intermediate", "advanced", "fluent"];

// Accept API media paths and HTTP(S) URLs, never executable URL schemes.
const mediaUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const path = /^(https?:\/\/|\/)/i.test(value) ? value : `/media/${value.replace(/^media\//, "")}`;
    const url = new URL(path, BASE_URL || window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

export default function CommunityPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ExchangeProfile[]>([]);
  const [search, setSearch] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [segment, setSegment] = useState("all");
  const [level, setLevel] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [startingUsername, setStartingUsername] = useState("");
  const [conversationError, setConversationError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        // No trailing slash: profile/data is the one API path without it.
        const payload = await api.get<any>("/api/profile/data", {
          params: { page, page_size: PAGE_SIZE, match: segment, ...(level ? { level } : {}) },
          signal: controller.signal,
        });
        const next: ExchangeProfile[] = (payload.profiles || []).map((profile: any) => ({
          username: profile.username,
          nativeLanguage: profile.native_language || "",
          languagesPracticing: profile.languages_practicing || [],
          practiceLanguageLevels: profile.practice_language_levels || {},
          learningGoal: profile.learning_goal || "",
          profileImage: mediaUrl(profile.profile_image_url),
          match: profile.match ? { teachesMe: Boolean(profile.match.teaches_me), learnsMine: Boolean(profile.match.learns_mine), reciprocal: Boolean(profile.match.reciprocal) } : undefined,
        }));
        if (!controller.signal.aborted) {
          setProfiles((previous) => Array.from(new Map((page === 1 ? next : [...previous, ...next]).map((profile) => [profile.username, profile])).values()));
          setTotalCount(payload.pagination?.total_count ?? next.length);
          setHasNextPage(Boolean(payload.pagination?.has_next));
        }
      } catch (failure) {
        if (!controller.signal.aborted && !isAbortError(failure)) {
          setError(getErrorMessage(failure, "Could not load people. Please try again."));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [page, segment, level, requestAttempt]);

  const changeServerFilter = (nextSegment: string, nextLevel: string) => {
    setProfiles([]);
    setHasNextPage(false);
    setPage(1);
    setSegment(nextSegment);
    setLevel(nextLevel);
    setError("");
    setLoading(true);
  };

  const languageOptions = useMemo(() => Array.from(new Set([filterLang, ...profiles.map((profile) => profile.nativeLanguage)].filter(Boolean))).sort(), [profiles, filterLang]);
  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => (!filterLang || profile.nativeLanguage.toLowerCase() === filterLang.toLowerCase()) && (!query || [profile.username, profile.nativeLanguage, profile.learningGoal, ...profile.languagesPracticing].some((value) => value.toLowerCase().includes(query))));
  }, [profiles, search, filterLang]);
  const [featured, ...otherProfiles] = filteredProfiles;
  const nativeLanguage = user?.native_language || "";
  const activeFilters = Number(Boolean(filterLang)) + Number(Boolean(level));

  const resetFilters = () => {
    setSearch("");
    setFilterLang("");
    if (segment !== "all" || level) changeServerFilter("all", "");
  };

  const applySheetFilters = (next: { nativeFilter: string; level: string }) => {
    setFilterLang(next.nativeFilter);
    if (next.level !== level) changeServerFilter(segment, next.level);
    setSheetOpen(false);
  };

  const resetSheetFilters = () => {
    setFilterLang("");
    if (level) changeServerFilter(segment, "");
    setSheetOpen(false);
  };

  const sayHello = async (username: string) => {
    if (startingUsername) return;
    setStartingUsername(username);
    setConversationError("");
    try {
      const conversation = await createOrGetConversation(username);
      if (!conversation?.id) throw new Error("Missing conversation");
      navigate(`/conversations/${conversation.id}`);
    } catch (failure) {
      setConversationError(getErrorMessage(failure, `Could not open a conversation with ${username}. Please try again.`));
    } finally {
      setStartingUsername("");
    }
  };

  return (
    <div className="people-page">
      <aside className="people-sidebar" aria-label="Your exchange and filters">
        <div className="people-mobile-exchange">
          <div><span>Your exchange</span><strong>{nativeLanguage ? languageLabel(nativeLanguage) : "Add a native language"}<span aria-hidden="true"> ↔ </span>{user?.languages_practicing?.length ? `${languageLabel(user.languages_practicing[0])}${user.languages_practicing.length > 1 ? ` +${user.languages_practicing.length - 1}` : ""}` : "Add a practice language"}</strong></div>
          <Link to="/profile/edit" aria-label="Edit your exchange languages">Edit ↗</Link>
        </div>
        <section className="people-exchange-summary">
          <h2>Your exchange</h2>
          {nativeLanguage ? <div className="people-summary-language people-summary-native"><span>You speak</span><strong>{languageLabel(nativeLanguage)}</strong></div> : <Link to="/profile/edit">Add your native language</Link>}
          {(user?.languages_practicing || []).map((language) => {
            const currentLevel = languageLevel(user?.practice_language_levels || {}, language);
            return <div className="people-summary-language people-summary-learning" key={language}><span>You practice</span><strong>{languageLabel(language)}{currentLevel && <small> · {currentLevel}</small>}</strong></div>;
          })}
          {!user?.languages_practicing?.length && <Link to="/profile/edit" className="people-summary-add">Add a language to find your exchange</Link>}
          <Link to="/profile/edit" className="people-exchange-edit">Edit languages <span aria-hidden="true">↗</span></Link>
        </section>
        <section className="people-filters">
          <div className="people-filter-heading"><h2>Filters{activeFilters > 0 && <span className="people-filter-count">{activeFilters}</span>}</h2></div>
          <div className="people-filter-fields">
            <label htmlFor="people-native-language">Their native language</label>
            <select id="people-native-language" value={filterLang} onChange={(event) => setFilterLang(event.target.value)}><option value="">All languages</option>{languageOptions.map((language) => <option key={language} value={language}>{languageLabel(language)}</option>)}</select>
            <label htmlFor="people-practice-level">{nativeLanguage ? `Their ${languageLabel(nativeLanguage)} level` : "Their practice level"}</label>
            <select id="people-practice-level" value={level} disabled={!nativeLanguage} onChange={(event) => changeServerFilter(segment, event.target.value)}><option value="">Any level</option>{levels.map((entry) => <option key={entry} value={entry}>{languageLabel(entry)}</option>)}</select>
            <p className="people-filter-note">Find someone you can learn with, at a pace that feels right.</p>
            {(activeFilters > 0 || segment !== "all" || search) && <button type="button" className="people-text-button" onClick={resetFilters}>Reset filters</button>}
          </div>
        </section>
      </aside>

      <section className="people-discovery" aria-labelledby="people-heading">
        <div className="people-intro"><p className="people-eyebrow">A little exchange. A new connection.</p><h1 id="people-heading">Find your next great conversation.</h1><p>Meet people who speak your next language. Share a little of yours.</p></div>
        <div className="people-search-row">
          <div className="people-search"><SearchRoundedIcon aria-hidden="true" /><input aria-label="Search loaded profiles" type="search" placeholder="Search people, languages or learning goals" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="people-search-hint">Search loaded profiles</span></div>
          <button type="button" className="people-filter-button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-label={activeFilters > 0 ? `Filters, ${activeFilters} active` : "Filters"}>
            <TuneRoundedIcon aria-hidden="true" />
            {activeFilters > 0 && <span className="people-filter-button-count" aria-hidden="true">{activeFilters}</span>}
          </button>
        </div>
        <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} nativeFilter={filterLang} level={level} languageOptions={languageOptions} viewerLanguage={nativeLanguage} onApply={applySheetFilters} onReset={resetSheetFilters} />
        <div className="people-discovery-toolbar"><div className="people-segments" role="group" aria-label="Exchange type">{segments.map((entry) => <button type="button" key={entry.key} aria-pressed={segment === entry.key} onClick={() => { if (segment !== entry.key) changeServerFilter(entry.key, level); }}>{entry.label}</button>)}</div><p className="people-result-count" aria-live="polite">{loading && !profiles.length ? "Finding people…" : `${filteredProfiles.length}${hasNextPage ? "+" : ""} ${filteredProfiles.length === 1 ? "person" : "people"} to meet`}</p></div>
        {conversationError && <p className="people-error" role="alert">{conversationError}</p>}
        {loading && !profiles.length ? (
          <div className="people-loading" role="status"><div className="people-loading-portrait" /><div><span /><span /><span /><p>Finding your next connection…</p></div></div>
        ) : featured ? (
          <>
            <ExchangeProfileCard key={`featured-${featured.username}`} profile={featured} featured viewerLanguage={nativeLanguage} busy={Boolean(startingUsername)} starting={startingUsername === featured.username} onSayHello={sayHello} />
            {otherProfiles.length > 0 && <section className="people-more" aria-labelledby="people-more-heading"><div className="people-section-heading"><h2 id="people-more-heading">More people to meet</h2><span>A new perspective in every conversation</span></div><div className="people-card-grid">{otherProfiles.map((profile) => <ExchangeProfileCard key={profile.username} profile={profile} viewerLanguage={nativeLanguage} busy={Boolean(startingUsername)} starting={startingUsername === profile.username} onSayHello={sayHello} />)}</div></section>}
          </>
        ) : !error && <div className="people-empty"><span aria-hidden="true">↔</span><h2>No people in this view yet.</h2><p>Try another language or a wider exchange filter. You might find an unexpected connection.</p><button type="button" className="people-button people-button-primary" onClick={resetFilters}>Explore all people</button><Link to="/profile/edit">Update your languages</Link></div>}
        {error && <div className="people-error" role="alert"><p>{error}</p><button type="button" className="people-button people-button-secondary" onClick={() => setRequestAttempt((attempt) => attempt + 1)}>Try again</button></div>}
        {hasNextPage && !error && <div className="people-load-more"><button type="button" className="people-button people-button-secondary" disabled={loading} onClick={() => setPage((previous) => previous + 1)}>{loading ? "Finding more people…" : "Meet more people"}</button><p>{profiles.length} of {totalCount} profiles loaded</p></div>}
      </section>
    </div>
  );
}
