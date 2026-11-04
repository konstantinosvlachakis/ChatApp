// Sticker and GIF messages (`kind` + `media` on a Message; see system-map api-contract).

export const isStickerMessage = (msg) => msg?.kind === "sticker";
export const isGifMessage = (msg) => msg?.kind === "gif";
export const isMediaMessage = (msg) => isStickerMessage(msg) || isGifMessage(msg);

// Only http(s) URLs are rendered; anything else (javascript:, data:, garbage) is dropped.
export const safeMediaUrl = (url) => {
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

// One-line text for previews: chat list, reply quotes, notifications.
export const messagePreviewText = (msg, fallback = "Message") => {
  if (!msg) return fallback;
  if (isStickerMessage(msg)) {
    const label = msg.media?.label;
    return label && label !== "Sticker" ? `Sticker · ${label}` : "Sticker";
  }
  if (isGifMessage(msg)) return "GIF";
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  if (text) return text;
  if (msg.attachment_url || msg.attachment || msg.attachmentUrl) return "Attachment";
  return fallback;
};

// Recently sent stickers (per browser). Storage can throw (private mode, blocked site data).
const RECENT_STICKERS_KEY = "chat:recent-stickers";
const RECENT_STICKERS_LIMIT = 8;

export const readRecentStickers = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STICKERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((ref) => typeof ref === "string").slice(0, RECENT_STICKERS_LIMIT) : [];
  } catch {
    return [];
  }
};

export const rememberRecentSticker = (ref) => {
  const next = [ref, ...readRecentStickers().filter((item) => item !== ref)].slice(0, RECENT_STICKERS_LIMIT);
  try {
    localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(next));
  } catch {
    // Not remembering is fine.
  }
  return next;
};
