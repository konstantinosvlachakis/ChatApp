import React, { useCallback, useEffect, useRef, useState } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExchangeProfileCard, { ExchangeProfile } from "./ExchangeProfileCard";

interface Props {
  profiles: ExchangeProfile[];
  viewerLanguage?: string;
  busy: boolean;
  startingUsername: string;
  onSayHello: (username: string, starter?: string) => void;
}

/** Above this many slides the dots give way to the "2 / 8" counter alone. */
const MAX_DOTS = 10;

const prefersReducedMotion = () => {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * Perfect exchanges as a horizontal scroll-snap row of featured cards, one card wide.
 * Swipe/trackpad scroll natively; prev/next buttons, dots and ←/→ keys move one slide.
 * The current slide follows the scroll position, so swiping keeps the counter in sync.
 */
export default function PerfectExchangeCarousel({ profiles, viewerLanguage, busy, startingUsername, onSayHello }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [index, setIndex] = useState(0);
  const count = profiles.length;
  const last = Math.max(count - 1, 0);

  // A shorter list (search, filter) must not leave the index past the end.
  useEffect(() => {
    setIndex((current) => Math.min(current, last));
  }, [last]);

  const goTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(next, last));
      setIndex(target);
      const track = trackRef.current;
      const slide = slideRefs.current[target];
      if (track && slide && typeof track.scrollTo === "function") {
        track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    },
    [last]
  );

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    let nearest = 0;
    let distance = Infinity;
    slideRefs.current.slice(0, count).forEach((slide, position) => {
      if (!slide) return;
      const gap = Math.abs(slide.offsetLeft - track.offsetLeft - track.scrollLeft);
      if (gap < distance) {
        distance = gap;
        nearest = position;
      }
    });
    setIndex((current) => (current === nearest ? current : nearest));
  };

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

  if (!count) return null;

  return (
    <section className="people-carousel" aria-roledescription="carousel" aria-label="Perfect exchanges" onKeyDown={onKeyDown}>
      <div className="people-carousel-header">
        <div>
          <h2>Your perfect exchanges</h2>
          <p>They speak a language you're learning, and they're learning one you speak.</p>
        </div>
        {count > 1 && (
          <div className="people-carousel-controls">
            <button type="button" className="people-carousel-arrow" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous match">
              <ChevronLeftRoundedIcon aria-hidden="true" />
            </button>
            <span className="people-carousel-counter" aria-live="polite" aria-atomic="true">
              <span className="lv-visually-hidden">Match </span>
              {index + 1} / {count}
            </span>
            <button type="button" className="people-carousel-arrow" onClick={() => goTo(index + 1)} disabled={index === last} aria-label="Next match">
              <ChevronRightRoundedIcon aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="people-carousel-track" ref={trackRef} onScroll={onScroll} tabIndex={0} aria-label="Perfect exchange cards. Use the left and right arrow keys to move between matches.">
        {profiles.map((profile, position) => (
          <div
            key={profile.username}
            ref={(element) => {
              slideRefs.current[position] = element;
            }}
            className="people-carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${count}: ${profile.username}`}
            aria-current={position === index ? "true" : undefined}
          >
            <ExchangeProfileCard
              profile={profile}
              featured
              viewerLanguage={viewerLanguage}
              busy={busy}
              starting={startingUsername === profile.username}
              onSayHello={onSayHello}
              imageLoading={position === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>
      {count > 1 && count <= MAX_DOTS && (
        <div className="people-carousel-dots" role="group" aria-label="Choose a match">
          {profiles.map((profile, position) => (
            <button
              type="button"
              key={profile.username}
              aria-label={`Show match ${position + 1}: ${profile.username}`}
              aria-current={position === index ? "true" : undefined}
              onClick={() => goTo(position)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
