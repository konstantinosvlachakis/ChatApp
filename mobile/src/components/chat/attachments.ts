// Pure helpers for chat attachments (kind detection, labels, upload checks).
// Kept free of React/native imports so they stay easy to reason about and test.

export type AttachmentKind = "image" | "audio" | "video" | "file";

/** A locally picked file waiting in the composer (sent as the multipart `attachment`). */
export type PickedAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  fileSize?: number | null;
};

/** Mirrors backend `MESSAGE_ATTACHMENT_MAX_BYTES` (25 MB default, `backend/chatapp/views.py`). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Image content types the backend accepts (`ALLOWED_IMAGE_TYPES`), with the extension we upload. */
export const ALLOWED_IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const EXTENSION_TO_IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]);
// Web voice notes are recorded as audio/webm and stored as `.webm`, so `.webm` counts as audio
// (web's `isLikelyAudio`); web's video check also matches `.webm`, but chat video is rare.
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "webm", "m4a", "aac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov"]);

/** URL path without query/hash. */
function urlPath(url: string) {
  return url.split(/[?#]/)[0];
}

/** Lower-case extension of the URL's last path segment, or "". */
export function attachmentExtension(url: string | null | undefined): string {
  if (!url) return "";
  const lastSegment = urlPath(url).split("/").pop() || "";
  const dot = lastSegment.lastIndexOf(".");
  return dot > 0 ? lastSegment.slice(dot + 1).toLowerCase() : "";
}

/** Display file name (last path segment, URL-decoded), e.g. for file chips. */
export function attachmentFileName(url: string | null | undefined): string {
  if (!url) return "Attachment";
  const lastSegment = urlPath(url).split("/").pop() || "";
  try {
    return decodeURIComponent(lastSegment) || "Attachment";
  } catch {
    return lastSegment || "Attachment";
  }
}

/**
 * Kind of an attachment, from its content type when known (optimistic local sends) or else the
 * URL, mirroring web `Conversation.jsx` (extension + `/media/attachments/blob_` / `/media/audio/`).
 * Returns null when there is no attachment.
 */
export function getAttachmentKind(
  url: string | null | undefined,
  contentType?: string | null
): AttachmentKind | null {
  if (!url) return null;
  const type = (contentType || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";

  const extension = attachmentExtension(url);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (url.includes("/media/attachments/blob_") || url.includes("/media/audio/")) return "audio";
  // Cloudinary keeps images under /image/upload/ even when the extension is unusual.
  if (url.includes("res.cloudinary.com/") && url.includes("/image/upload/")) return "image";
  return "file";
}

export function attachmentLabel(kind: AttachmentKind | null): string {
  switch (kind) {
    case "image":
      return "Photo";
    case "audio":
      return "Voice message";
    case "video":
      return "Video";
    case "file":
      return "File";
    default:
      return "Attachment";
  }
}

type PreviewSource = { text?: string | null; attachment_url?: string | null; local_mime_type?: string | null };

/**
 * One-line preview for a message (list preview, pinned bar, menus): its text, or a label for an
 * attachment-only message ("Photo", "Voice message", ...). Empty string when neither exists.
 */
export function messagePreviewText(message: PreviewSource | null | undefined): string {
  if (!message) return "";
  const text = (message.text || "").trim();
  if (text) return text;
  if (message.attachment_url) {
    return attachmentLabel(getAttachmentKind(message.attachment_url, message.local_mime_type));
  }
  return "";
}

/** True when the size is known and over the upload limit. Unknown sizes are left to the server. */
export function isAttachmentTooLarge(bytes: number | null | undefined, maxBytes = MAX_ATTACHMENT_BYTES) {
  return typeof bytes === "number" && bytes > maxBytes;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** m:ss for audio positions in seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? (seconds as number) : 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
}

/**
 * Resolves a picked image's upload content type from the picker's mime type or the file
 * name / URI extension. Returns null when the backend would reject it.
 */
export function resolveImageMimeType(
  mimeType: string | null | undefined,
  nameOrUri: string | null | undefined
): string | null {
  const normalized = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (normalized && ALLOWED_IMAGE_MIME_TYPES[normalized]) {
    return normalized === "image/jpg" || normalized === "image/pjpeg" ? "image/jpeg" : normalized;
  }
  if (normalized && normalized !== "application/octet-stream") return null;
  return EXTENSION_TO_IMAGE_MIME[attachmentExtension(nameOrUri)] || null;
}

/** Upload file name whose extension matches the content type (the server renames it anyway). */
export function uploadFileName(mimeType: string, now = Date.now()): string {
  return `photo-${now}.${ALLOWED_IMAGE_MIME_TYPES[mimeType] || "jpg"}`;
}

/** Only http(s) URLs may be opened externally (attachment URLs can come from other clients). */
export function isOpenableUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
