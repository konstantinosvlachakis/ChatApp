import React, { useCallback, useEffect, useRef, useState } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { ExchangeProfile } from "./ExchangeProfileCard";
import PhotoExchangeCard from "./PhotoExchangeCard";

interface Props {
  profiles: ExchangeProfile[];
  viewerLanguage?: string;
  busy: boolean;
  startingUsername: string;
  onSayHello: (username: string, starter?: string) => void;
  /** Called when the front card is one of the last two loaded (load the next page). */
  onReachEnd?: () => void;
}

/** A horizontal swipe longer than this (px) moves one card. */
const SWIPE_PX = 40;

/** "1–3 of 8" (or "2 of 8" with one card per view). */
export const carouselRange = (index: number, perView: number, count: number) => {
  const first = Math.min(index + 1, count);
  const last = Math.min(index + perView, count);
  return first === last ? `${first} of ${count}` : `${first}–${last} of ${count}`;
};

/** Signed distance from the front card on a loop: the last card sits left of the first. */
export const loopOffset = (position: number, index: number, count: number) => {
  if (count < 3) return position - index;
  const forward = (((position - index) % count) + count) % count;
  return forward > count / 2 ? forward - count : forward;
};

/**
 * Where a card sits relative to the front one: "front", "left"/"right" (just behind),
 * "far-left"/"far-right" (further back, wide screens only) or hidden. The far slots need five
 * cards: with four, only one side could be filled and the row would look lopsided.
 */
export const coverflowPosition = (position: number, index: number, count: number) => {
  const offset = loopOffset(position, index, count);
  if (offset === 0) return "front";
  if (offset === -1) return "left";
  if (offset === 1) return "right";
  const farSlots = count >= 5;
  if (farSlots && offset === -2) return "far-left";
  if (farSlots && offset === 2) return "far-right";
  return offset < 0 ? "gone-left" : "gone-right";
};

/**
 * Perfect exchanges as a coverflow: one card in front, the previous and next ones smaller
 * behind it, and on wide screens two more further back (community.css). From three matches
 * up it loops, so both sides are always filled. Prev/next buttons, ←/→, a swipe, or a click on a side card
 * move one card. Only the front card is interactive; the others are inert.
 */
export default function PerfectExchangeCarousel({ profiles, viewerLanguage, busy, startingUsername, onSayHello, onReachEnd }: Props) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const count = profiles.length;
  const last = Math.max(count - 1, 0);
  const loops = count >= 3;

  // A shorter list (search, filter) must not leave the index past the end.
  useEffect(() => {
    setIndex((current) => Math.min(current, last));
  }, [last]);

  useEffect(() => {
    if (count && index >= count - 2) onReachEnd?.();
  }, [index, count, onReachEnd]);

  const goTo = useCallback(
    (next: number) => setIndex(loops ? ((next % count) + count) % count : Math.max(0, Math.min(next, last))),
    [loops, count, last]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  const onTouchStart = (event: React.TouchEvent) => {
    swipeStart.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const end = event.changedTouches[0]?.clientX;
    if (swipeStart.current === null || end === undefined) return;
    const distance = end - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) >= SWIPE_PX) goTo(index + (distance < 0 ? 1 : -1));
  };

  if (!count) return null;
  const range = carouselRange(index, 1, count);

  return (
    <section className="people-carousel" aria-roledescription="carousel" aria-label="Perfect exchanges" onKeyDown={onKeyDown}>
      {count > 1 && (
        <div className="people-carousel-controls">
          <button type="button" className="people-carousel-arrow" onClick={() => goTo(index - 1)} disabled={!loops && index === 0} aria-label="Previous match">
            <ChevronLeftRoundedIcon aria-hidden="true" />
          </button>
          <span className="people-carousel-counter" aria-live="polite" aria-atomic="true">
            <span className="lv-visually-hidden">Showing </span>
            {range}
          </span>
          <button type="button" className="people-carousel-arrow" onClick={() => goTo(index + 1)} disabled={!loops && index >= last} aria-label="Next match">
            <ChevronRightRoundedIcon aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        className="people-coverflow"
        tabIndex={0}
        aria-label="Perfect exchange cards. Use the left and right arrow keys to move between matches."
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
        <svg className="people-coverflow-route" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {/* Fades in and out so the route never ends at the stage's edge. */}
          <defs>
            <linearGradient id="people-route-fade" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#f5cfb1" stopOpacity="0" />
              <stop offset=".22" stopColor="#f5cfb1" stopOpacity=".6" />
              <stop offset=".78" stopColor="#f5cfb1" stopOpacity=".6" />
              <stop offset="1" stopColor="#f5cfb1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M-20 330 C 200 200, 360 160, 500 230 S 780 300, 1020 90" />
        </svg>
        {profiles.map((profile, position) => {
          const place = coverflowPosition(position, index, count);
          return (
            <div
              key={profile.username}
              className={`people-coverflow-slide is-${place}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} of ${count}: ${profile.username}`}
              aria-current={place === "front" ? "true" : undefined}
              aria-hidden={place === "front" ? undefined : true}
              // `inert` (not yet in React 18's types) keeps the cards behind out of the tab order.
              {...(place === "front" ? {} : { inert: "" })}
            >
              <PhotoExchangeCard
                profile={profile}
                viewerLanguage={viewerLanguage}
                busy={busy}
                starting={startingUsername === profile.username}
                onSayHello={onSayHello}
                imageLoading={Math.abs(loopOffset(position, index, count)) <= 2 ? "eager" : "lazy"}
              />
            </div>
          );
        })}
        {/* Click targets over the cards behind (inert slides take no clicks); keyboard users have the arrows. */}
        {(loops || index > 0) && <button type="button" className="people-coverflow-peek is-left" tabIndex={-1} aria-hidden="true" onClick={() => goTo(index - 1)} />}
        {(loops || index < last) && <button type="button" className="people-coverflow-peek is-right" tabIndex={-1} aria-hidden="true" onClick={() => goTo(index + 1)} />}
      </div>
    </section>
  );
}
