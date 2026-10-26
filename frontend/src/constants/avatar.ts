import type { SyntheticEvent } from "react";

// Inline so the fallback can never 404 (a missing fallback image caused an endless onError loop).
export const DEFAULT_AVATAR_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#e2e8f0"/>' +
      '<circle cx="32" cy="25" r="11" fill="#94a3b8"/>' +
      '<path d="M12 56c2-11 10-17 20-17s18 6 20 17z" fill="#94a3b8"/>' +
      "</svg>"
  );

// React's onError ignores `img.onerror = null`, so guard with a data attribute instead.
export const handleAvatarError = (event: SyntheticEvent<HTMLImageElement>) => {
  const img = event.currentTarget;
  if (img.dataset.avatarFallback) return;
  img.dataset.avatarFallback = "1";
  img.src = DEFAULT_AVATAR_URL;
};
