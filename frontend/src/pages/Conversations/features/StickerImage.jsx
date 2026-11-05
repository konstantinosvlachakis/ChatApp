import React, { useEffect, useRef, useState } from "react";

// The longest sticker animation (all cycles) ends within this; a single-cycle replay within 3.5 s.
const FULL_ANIMATION_MS = 8500;
const REPLAY_ANIMATION_MS = 3500;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** `?replay=n#once`: a new image (its animations restart) playing every animation once. */
export const replayUrl = (src, count) => `${src}${src.includes("?") ? "&" : "?"}replay=${count}#once`;

/**
 * A sticker <img>. Its animation lives inside the SVG and plays a few cycles on load; hovering a
 * sticker whose animation has finished plays a short replay. The replay URL is preloaded and
 * swapped in once ready so the sticker never flashes. Nothing replays with reduced motion.
 */
export function StickerImage({ src, alt, ...imgProps }) {
  const [shown, setShown] = useState(src);
  const startedAtRef = useRef(Date.now());
  const busyUntilRef = useRef(Date.now() + FULL_ANIMATION_MS);
  const replayCountRef = useRef(0);

  useEffect(() => {
    setShown(src);
    startedAtRef.current = Date.now();
    busyUntilRef.current = Date.now() + FULL_ANIMATION_MS;
  }, [src]);

  const replay = () => {
    if (!src || prefersReducedMotion() || Date.now() < busyUntilRef.current) return;
    replayCountRef.current += 1;
    const next = replayUrl(src, replayCountRef.current);
    busyUntilRef.current = Date.now() + REPLAY_ANIMATION_MS;
    const preload = new Image();
    preload.onload = () => setShown(next);
    preload.src = next;
  };

  return <img {...imgProps} src={shown} alt={alt} onMouseEnter={replay} />;
}

export default StickerImage;
