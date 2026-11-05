import React, { useEffect, useMemo, useRef, useState } from "react";
import StickerImage from "./StickerImage";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { fetchGifs, fetchStickerPacks } from "../api/stickersGifs";
import { getErrorMessage } from "../../../lib/apiError";
import {
  readRecentStickers,
  rememberRecentSticker,
  safeMediaUrl,
} from "../utils/messageMedia";

const GIF_SEARCH_DEBOUNCE_MS = 400;
// Remembered for the page load: without a server key the GIF tab stays hidden.
let gifsKnownUnavailable = false;

const StickerGrid = ({ stickers, onPick, label }) => (
  <ul className="cv-media-grid is-stickers" aria-label={label}>
    {stickers.map((sticker) => {
      const src = safeMediaUrl(sticker.url);
      if (!src) return null;
      return (
        <li key={sticker.ref}>
          <button
            type="button"
            className="cv-media-cell"
            onClick={() => onPick(sticker)}
            aria-label={`Send sticker: ${sticker.label}`}
            title={sticker.label}
          >
            <StickerImage
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              width="72"
              height="72"
            />
          </button>
        </li>
      );
    })}
  </ul>
);

const StickersTab = ({ onSend }) => {
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState("");
  const [recentRefs, setRecentRefs] = useState(readRecentStickers);

  useEffect(() => {
    let active = true;
    fetchStickerPacks()
      .then((result) => active && setPacks(result))
      .catch(
        (err) =>
          active && setError(getErrorMessage(err, "Couldn't load stickers.")),
      );
    return () => {
      active = false;
    };
  }, []);

  const byRef = useMemo(() => {
    const map = new Map();
    (packs || []).forEach((pack) =>
      pack.stickers.forEach((sticker) => map.set(sticker.ref, sticker)),
    );
    return map;
  }, [packs]);
  const recent = recentRefs.map((ref) => byRef.get(ref)).filter(Boolean);

  const pick = (sticker) => {
    setRecentRefs(rememberRecentSticker(sticker.ref));
    onSend({ kind: "sticker", sticker });
  };

  if (error)
    return (
      <p className="cv-media-status" role="alert">
        {error}
      </p>
    );
  if (!packs) return <p className="cv-media-status">Loading stickers…</p>;

  return (
    <div className="cv-media-scroll">
      {recent.length > 0 && (
        <section>
          <h3 className="cv-media-heading">Recent</h3>
          <StickerGrid
            stickers={recent}
            onPick={pick}
            label="Recent stickers"
          />
        </section>
      )}
      {packs.map((pack) => (
        <section key={pack.id}>
          <h3 className="cv-media-heading">{pack.name}</h3>
          <StickerGrid
            stickers={pack.stickers}
            onPick={pick}
            label={`${pack.name} stickers`}
          />
        </section>
      ))}
    </div>
  );
};

const GifsTab = ({ onSend, onUnavailable }) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | more
  const [error, setError] = useState("");
  const searchRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query.trim()),
      GIF_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const load = (searchQuery, offset) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus(offset ? "more" : "loading");
    setError("");
    fetchGifs({ query: searchQuery, offset }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setResults((previous) =>
          offset ? [...previous, ...page.results] : page.results,
        );
        setNextOffset(page.next_offset ?? null);
        setStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err?.code === "gifs_unavailable") {
          gifsKnownUnavailable = true;
          onUnavailable();
          return;
        }
        setError(getErrorMessage(err, "Couldn't load GIFs."));
        setStatus("error");
      });
  };

  useEffect(() => {
    load(debouncedQuery, 0);
    return () => requestRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  return (
    <div className="cv-media-gifs">
      <label className="cv-media-search">
        <SearchRoundedIcon aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIPHY"
          aria-label="Search GIFs"
          maxLength={50}
        />
      </label>
      <div
        className="cv-media-scroll"
        aria-busy={status === "loading" || status === "more"}
      >
        {status === "loading" && (
          <p className="cv-media-status">Loading GIFs…</p>
        )}
        {status === "error" && (
          <p className="cv-media-status" role="alert">
            {error}{" "}
            <button
              type="button"
              className="cv-media-link"
              onClick={() => load(debouncedQuery, 0)}
            >
              Try again
            </button>
          </p>
        )}
        {status !== "loading" && status !== "error" && results.length === 0 && (
          <p className="cv-media-status">
            No GIFs found{debouncedQuery ? ` for “${debouncedQuery}”` : ""}.
          </p>
        )}
        {results.length > 0 && status !== "loading" && (
          <ul
            className="cv-media-grid is-gifs"
            aria-label={debouncedQuery ? "GIF results" : "Trending GIFs"}
          >
            {results.map((gif) => {
              const src =
                safeMediaUrl(gif.preview_url) || safeMediaUrl(gif.url);
              if (!src) return null;
              return (
                <li key={gif.id}>
                  <button
                    type="button"
                    className="cv-media-cell"
                    onClick={() => onSend({ kind: "gif", gif })}
                    aria-label={`Send GIF${gif.title ? `: ${gif.title}` : ""}`}
                    title={gif.title || "GIF"}
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={gif.width}
                      height={gif.height}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {nextOffset !== null && status === "ready" && results.length > 0 && (
          <button
            type="button"
            className="cv-media-more"
            onClick={() => load(debouncedQuery, nextOffset)}
          >
            More GIFs
          </button>
        )}
        {status === "more" && <p className="cv-media-status">Loading more…</p>}
      </div>
      <p className="cv-media-attribution">Powered by GIPHY</p>
    </div>
  );
};

// Popover with Stickers and GIFs tabs. `onSend({kind, sticker|gif})` sends one and the
// parent closes the popover.
// `tab` / `onTabChange` let the composer's Sticker and GIF buttons drive the open tab;
// without them the picker keeps its own tab state.
const StickerGifPicker = ({ onSend, tab: controlledTab, onTabChange, onGifsUnavailable }) => {
  const [ownTab, setOwnTab] = useState(controlledTab || "stickers");
  const tab = controlledTab || ownTab;
  const setTab = (next) => (onTabChange ? onTabChange(next) : setOwnTab(next));
  const [gifsAvailable, setGifsAvailable] = useState(!gifsKnownUnavailable);
  // Already known to be off (an earlier picker hit 503): tell the composer once.
  useEffect(() => {
    if (gifsKnownUnavailable) onGifsUnavailable?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { id: "stickers", label: "Stickers" },
    ...(gifsAvailable ? [{ id: "gifs", label: "GIFs" }] : []),
  ];

  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || tabs.length < 2)
      return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab);
    const next =
      tabs[
        (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
          tabs.length
      ];
    setTab(next.id);
    event.currentTarget.parentElement
      ?.querySelector(`[data-tab="${next.id}"]`)
      ?.focus();
  };

  return (
    <div className="cv-media-picker">
      <div
        className="cv-media-tabs"
        role="tablist"
        aria-label="Stickers and GIFs"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab={item.id}
            id={`cv-media-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="cv-media-panel"
            tabIndex={tab === item.id ? 0 : -1}
            className={`cv-media-tab ${tab === item.id ? "is-on" : ""}`}
            onClick={() => setTab(item.id)}
            onKeyDown={handleTabKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="cv-media-panel"
        role="tabpanel"
        aria-labelledby={`cv-media-tab-${tab}`}
        className="cv-media-panel"
      >
        {tab === "gifs" && gifsAvailable ? (
          <GifsTab
            onSend={onSend}
            onUnavailable={() => {
              setGifsAvailable(false);
              setTab("stickers");
              onGifsUnavailable?.();
            }}
          />
        ) : (
          <StickersTab onSend={onSend} />
        )}
      </div>
    </div>
  );
};

export default StickerGifPicker;
