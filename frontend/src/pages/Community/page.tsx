import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import api, { getErrorMessage } from "../../lib/api";
import { useUser } from "../../context/UserContext";
import { createOrGetConversation } from "./api/conversation";
import ExchangeProfileCard, { ExchangeProfile } from "./components/ExchangeProfileCard";
import PeopleFilterPanel from "./components/PeopleFilterPanel";
import PerfectExchangeCarousel from "./components/PerfectExchangeCarousel";
import { viewerExchangeLanguages } from "./utils/exchangeLanguages";
import {
  DEFAULT_PANEL_FILTERS,
  DEFAULT_QUICK_FILTERS,
  PanelFilters,
  QuickFilters,
  activePanelFilterCount,
  cityFromLocation,
  countParams,
  exchangeRule,
  includesNothing,
  othersParams,
  perfectParams,
  previewTotal,
} from "./utils/peopleQuery";
import { PEOPLE_PAGE_SIZE, usePeopleFeed } from "./usePeopleFeed";
import { saveChatDraft } from "../Conversations/utils/chatDrafts";
import "./community.css";

const stripPage = ({ page, page_size, ...rest }: Record<string, string | number>) => rest;

/** Three bars of decreasing width (a funnel-like "filters" glyph). */
const FilterBarsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M4 7h16M7 12h10M10 17h4" />
  </svg>
);

const matchesSearch = (profile: ExchangeProfile, query: string) =>
  !query || [profile.username, profile.nativeLanguage, profile.learningGoal, profile.city || "", ...profile.languagesPracticing].some((value) => value.toLowerCase().includes(query));

export default function CommunityPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PanelFilters>(DEFAULT_PANEL_FILTERS);
  const [quick, setQuick] = useState<QuickFilters>(DEFAULT_QUICK_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [quickHint, setQuickHint] = useState<"" | "near" | "myLevel">("");
  const [startingUsername, setStartingUsername] = useState("");
  const [conversationError, setConversationError] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const perfectBase = useMemo(() => stripPage(perfectParams(filters, quick, 1, PEOPLE_PAGE_SIZE)), [filters, quick]);
  const othersBase = useMemo(() => (includesNothing(filters.include) ? null : stripPage(othersParams(filters, quick, 1, PEOPLE_PAGE_SIZE))), [filters, quick]);
  const perfect = usePeopleFeed(perfectBase);
  const others = usePeopleFeed(othersBase);
  const meta = perfect.meta || others.meta;

  const exchange = useMemo(() => viewerExchangeLanguages(user), [user]);
  const nativeLanguage = user?.native_language || "";
  const learningNames = exchange.practising.length ? exchange.practising.map((entry) => entry.language) : meta?.theySpeakOptions || [];
  const spokenNames = exchange.spoken.map((entry) => entry.language);
  const city = meta?.nearCity || cityFromLocation((user as any)?.location);
  const nearAvailable = meta ? meta.nearAvailable : Boolean(city);
  const myLevelAvailable = meta ? meta.myLevelAvailable : true;
  const panelCount = activePanelFilterCount(filters);
  const anyQuick = quick.near || quick.active || quick.newMembers || quick.myLevel || quick.following;

  const query = search.trim().toLowerCase();
  const perfectShown = useMemo(() => perfect.profiles.filter((profile) => matchesSearch(profile, query)), [perfect.profiles, query]);
  const othersShown = useMemo(() => others.profiles.filter((profile) => matchesSearch(profile, query)), [others.profiles, query]);

  const toggleQuick = (key: keyof QuickFilters) => {
    if (key === "near" && !nearAvailable && !quick.near) {
      setQuickHint("near");
      return;
    }
    if (key === "myLevel" && !myLevelAvailable && !quick.myLevel) {
      setQuickHint("myLevel");
      return;
    }
    setQuickHint("");
    setQuick((current) => ({ ...current, [key]: !current[key] }));
  };

  const clearAll = () => {
    setSearch("");
    setFilters(DEFAULT_PANEL_FILTERS);
    setQuick(DEFAULT_QUICK_FILTERS);
    setQuickHint("");
  };

  const countFor = useCallback(
    async (draft: PanelFilters, signal: AbortSignal) => {
      const payload = await api.get<any>("/api/profile/data", { params: countParams(draft, quick), signal });
      return previewTotal(payload?.counts, draft);
    },
    [quick]
  );

  // Infinite scroll for "More people to meet" (the Load more button stays as a fallback).
  const { hasNext: othersHasNext, loading: othersLoading, loadMore: othersLoadMore } = others;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver !== "function" || !othersHasNext || othersLoading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) othersLoadMore();
    }, { rootMargin: "400px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [othersHasNext, othersLoading, othersLoadMore]);

  const { hasNext: perfectHasNext, loading: perfectLoading, loadMore: perfectLoadMore } = perfect;
  const loadMorePerfect = useCallback(() => {
    if (perfectHasNext && !perfectLoading) perfectLoadMore();
  }, [perfectHasNext, perfectLoading, perfectLoadMore]);

  // `starter`: an opening line, handed to the chat as a ready-to-send draft.
  const sayHello = async (username: string, starter?: string) => {
    if (startingUsername) return;
    setStartingUsername(username);
    setConversationError("");
    try {
      const conversation = await createOrGetConversation(username);
      if (!conversation?.id) throw new Error("Missing conversation");
      if (starter) saveChatDraft(conversation.id, starter, { focus: true });
      navigate(`/conversations/${conversation.id}`);
    } catch (failure) {
      setConversationError(getErrorMessage(failure, `Could not open a conversation with ${username}. Please try again.`));
    } finally {
      setStartingUsername("");
    }
  };

  const quickPills: Array<{ key: keyof QuickFilters; label: string; Icon: typeof PlaceOutlinedIcon }> = [
    { key: "near", label: city ? `Near you · ${city}` : "Near you", Icon: PlaceOutlinedIcon },
    { key: "active", label: "Active today", Icon: ScheduleRoundedIcon },
    { key: "newMembers", label: "New members", Icon: AutoAwesomeOutlinedIcon },
    { key: "myLevel", label: "Your level", Icon: BarChartRoundedIcon },
    { key: "following", label: "Following", Icon: PersonAddAltOutlinedIcon },
  ];

  const perfectEmpty = () => {
    if (quick.following && !perfect.profiles.length && !others.profiles.length && !perfect.loading && !others.loading) {
      return <><h3>You're not following anyone yet</h3><p>Visit a profile and choose Follow to keep them here.</p><button type="button" className="people-button people-button-secondary" onClick={() => toggleQuick("following")}>Explore people</button></>;
    }
    if (query && perfect.profiles.length) {
      return <><h3>No perfect exchanges in this search</h3><p>Try another name, language or goal.</p><button type="button" className="people-button people-button-secondary" onClick={() => setSearch("")}>Clear search</button></>;
    }
    if (quick.near) {
      return <><h3>No perfect exchanges near you</h3><p>Try turning off Near you to meet exchanges anywhere.</p><button type="button" className="people-button people-button-secondary" onClick={() => toggleQuick("near")}>Turn off Near you</button></>;
    }
    if (anyQuick || panelCount) {
      return <><h3>No perfect exchanges match these filters</h3><p>Loosen a filter or two and they'll show up here.</p><button type="button" className="people-button people-button-secondary" onClick={clearAll}>Clear filters</button></>;
    }
    return <><h3>No perfect exchanges yet</h3><p>Nobody right now speaks a language you're learning and is learning one you speak. The people below are a great place to start.</p><Link to="/profile/edit" className="people-button people-button-secondary">Edit languages</Link></>;
  };

  return (
    <div className="people-page">
      <div className="people-top">
        <header className="people-intro">
          <h1 id="people-heading">People to practise with</h1>
          <p>
            {exchangeRule(learningNames, spokenNames)}{" "}
            <Link to="/profile/edit" className="people-inline-link">Edit languages</Link>
          </p>
        </header>

        <div className="people-search-row">
          <div className="people-search">
            <SearchRoundedIcon aria-hidden="true" />
            <input aria-label="Search loaded profiles" type="search" placeholder="Search people, languages or goals" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <button type="button" className="people-filter-button" onClick={() => setPanelOpen(true)} aria-haspopup="dialog" aria-label={panelCount > 0 ? `Filters, ${panelCount} active` : "Filters"}>
            <FilterBarsIcon />
            {panelCount > 0 && <span className="people-filter-button-count" aria-hidden="true">{panelCount}</span>}
          </button>
        </div>
      </div>

      <div className="people-quick" role="group" aria-label="Quick filters">
        {quickPills.map((pill) => (
          <button key={pill.key} type="button" className="people-quick-pill" aria-pressed={quick[pill.key]} onClick={() => toggleQuick(pill.key)}>
            <pill.Icon aria-hidden="true" />
            {pill.label}
          </button>
        ))}
      </div>
      {quickHint === "near" && (
        <p className="people-quick-hint" role="status">Add your city to see people near you. <Link to="/profile/edit" className="people-inline-link">Set your city</Link></p>
      )}
      {quickHint === "myLevel" && (
        <p className="people-quick-hint" role="status">Add your level in the languages you're learning to use Your level. <Link to="/profile/edit" className="people-inline-link">Edit languages</Link></p>
      )}
      {quick.near && meta?.nearScope === "country" && (
        <p className="people-quick-hint" role="status">Nobody else in {city} yet, so you're seeing people in your country.</p>
      )}
      {conversationError && <p className="people-error" role="alert">{conversationError}</p>}

      <div className="people-section people-section-perfect">
        <div className="people-section-heading">
          <h2 id="people-perfect-heading">
            <span className="people-section-icon" aria-hidden="true"><SwapHorizRoundedIcon /></span>
            Perfect exchanges
          </h2>
        </div>
        {perfect.loading && !perfect.profiles.length ? (
          <div className="people-loading-row" role="status" aria-label="Finding perfect exchanges"><span /><span /><span /></div>
        ) : perfect.error && !perfect.profiles.length ? (
          <div className="people-error" role="alert"><p>{perfect.error}</p><button type="button" className="people-button people-button-secondary" onClick={perfect.retry}>Try again</button></div>
        ) : perfectShown.length ? (
          <PerfectExchangeCarousel profiles={perfectShown} viewerLanguage={nativeLanguage} busy={Boolean(startingUsername)} startingUsername={startingUsername} onSayHello={sayHello} onReachEnd={query ? undefined : loadMorePerfect} />
        ) : (
          <div className="people-empty">{perfectEmpty()}</div>
        )}
      </div>

      <section className="people-section" aria-labelledby="people-more-heading">
        <div className="people-section-heading">
          <h2 id="people-more-heading">More people to meet</h2>
          {othersBase && others.total > 0 && <span>{others.total} {others.total === 1 ? "person" : "people"}</span>}
        </div>
        {!othersBase ? (
          <div className="people-empty"><h3>Nobody else is included</h3><p>Switch on a group under “In More people, include” in Filters.</p><button type="button" className="people-button people-button-secondary" onClick={() => setPanelOpen(true)}>Open filters</button></div>
        ) : others.loading && !others.profiles.length ? (
          <div className="people-loading-row" role="status" aria-label="Finding more people"><span /><span /><span /></div>
        ) : others.error && !others.profiles.length ? (
          <div className="people-error" role="alert"><p>{others.error}</p><button type="button" className="people-button people-button-secondary" onClick={others.retry}>Try again</button></div>
        ) : othersShown.length ? (
          <div className="people-card-grid">
            {othersShown.map((profile) => (
              <ExchangeProfileCard key={profile.username} profile={profile} viewerLanguage={nativeLanguage} busy={Boolean(startingUsername)} starting={startingUsername === profile.username} onSayHello={sayHello} />
            ))}
          </div>
        ) : (
          <div className="people-empty">
            <h3>{query ? "Nobody in this search" : quick.following ? "No other people you follow match" : "Nobody else matches yet"}</h3>
            <p>{query ? "Try another name, language or goal." : "Try a wider filter. You might find an unexpected connection."}</p>
            {(query || anyQuick || panelCount > 0) && <button type="button" className="people-button people-button-secondary" onClick={clearAll}>Clear filters</button>}
          </div>
        )}
        {othersBase && others.error && others.profiles.length > 0 && (
          <div className="people-error" role="alert"><p>{others.error}</p><button type="button" className="people-button people-button-secondary" onClick={others.retry}>Try again</button></div>
        )}
        {othersBase && others.hasNext && !others.error && (
          <div className="people-load-more" ref={sentinelRef}>
            <button type="button" className="people-button people-button-secondary" disabled={others.loading} onClick={others.loadMore}>{others.loading ? "Finding more people…" : "Load more"}</button>
            <p>{others.profiles.length} of {others.total} loaded</p>
          </div>
        )}
      </section>

      <PeopleFilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        filters={filters}
        theySpeakOptions={meta?.theySpeakOptions || []}
        theyLearnOptions={meta?.theyLearnOptions || []}
        countFor={countFor}
        onApply={(next) => {
          setFilters(next);
          setPanelOpen(false);
        }}
      />
    </div>
  );
}
