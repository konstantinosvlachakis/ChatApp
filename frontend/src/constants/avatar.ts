import type { SyntheticEvent } from "react";
import defaultAvatar from "../assets/default-avatar.jpg";

// Bundled with the web app (hashed by webpack) so the fallback never depends on
// media storage; a missing fallback image once caused an endless onError loop.
export const DEFAULT_AVATAR_URL: string = defaultAvatar;

// React's onError ignores `img.onerror = null`, so guard with a data attribute instead.
export const handleAvatarError = (event: SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  if (img.dataset.avatarFallback) return;
  img.dataset.avatarFallback = "1";
  img.src = DEFAULT_AVATAR_URL;
};

// For <img> elements whose src can change (e.g. the header after a photo upload): once
// anything has loaded, the next src may fall back again. A failing fallback never
// fires onLoad, so the guard against an onError loop still holds.
export const handleAvatarLoad = (event: SyntheticEvent<HTMLImageElement>) => {
  delete event.currentTarget.dataset.avatarFallback;
};
