// Cloudinary delivery transformations for user images (avatars, profile photos, chat images).
// The backend stores and returns original URLs; clients ask Cloudinary for a resized, auto-format
// copy sized for where the image is shown. Anything that is not a Cloudinary image upload URL
// (local /media/, data:, blob:, video/raw resources such as voice notes) is returned unchanged.

export type CloudinaryCrop = "fill" | "limit";

export interface CloudinaryImageOptions {
  /** Rendered CSS width in px. */
  width: number;
  /** Rendered CSS height in px (crop "fill" only; defaults to width). */
  height?: number;
  /** "fill" = square/face-centred portrait (default), "limit" = shrink to fit, keep aspect ratio. */
  crop?: CloudinaryCrop;
  /** Device pixel ratio override (tests); defaults to the screen's, bucketed to 1 or 2. */
  dpr?: number;
}

const UPLOAD_PATH = /^\/([^/]+)\/image\/upload\/(.*)$/;
// Cloudinary transformation parameter keys; a first path segment made only of `key_value`
// parts with these keys is an existing transformation (public ids never start like that here).
const TRANSFORM_KEYS = new Set([
  "a", "ac", "af", "ar", "b", "bo", "br", "c", "co", "cs", "d", "dl", "dn", "dpr", "du", "e",
  "eo", "f", "fl", "fn", "fps", "g", "h", "if", "ki", "l", "o", "p", "pg", "q", "r", "so", "sp",
  "t", "u", "vc", "vs", "w", "x", "y", "z",
]);
// Never request more than the original's useful size for a UI slot.
const MAX_DIMENSION = 2000;

const isTransformationSegment = (segment: string) =>
  segment.length > 0 &&
  segment.split(",").every((part) => {
    const match = /^([a-z]{1,3})_.+$/.exec(part);
    return Boolean(match && TRANSFORM_KEYS.has(match[1]));
  });

const devicePixelRatio = (override?: number) => {
  const ratio = override ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;
  return ratio > 1 ? 2 : 1;
};

const pixels = (cssPixels: number, dpr: number) =>
  Math.min(MAX_DIMENSION, Math.max(1, Math.round(cssPixels * dpr)));

export const cloudinaryImage = (url: string | null | undefined, options: CloudinaryImageOptions) => {
  if (!url || typeof url !== "string") return url ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  // http is accepted too (Cloudinary SDKs default to it when `secure` is unset); the URL scheme is kept.
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.hostname !== "res.cloudinary.com") return url;
  const match = UPLOAD_PATH.exec(parsed.pathname);
  if (!match || !match[2]) return url;
  const [, cloud, rest] = match;
  if (isTransformationSegment(rest.split("/")[0])) return url;

  const dpr = devicePixelRatio(options.dpr);
  const crop = options.crop ?? "fill";
  const width = pixels(options.width, dpr);
  const transformation =
    crop === "fill"
      ? `f_auto,q_auto,c_fill,g_face,w_${width},h_${pixels(options.height ?? options.width, dpr)}`
      : `f_auto,q_auto,c_limit,w_${width}`;
  parsed.pathname = `/${cloud}/image/upload/${transformation}/${rest}`;
  return parsed.toString();
};

/** Square avatar / portrait shown at `size` CSS px. */
export const avatarImage = (url: string | null | undefined, size: number) =>
  cloudinaryImage(url, { width: size, crop: "fill" });

// Chat image bubbles are at most ~480 CSS px wide (bubble column max 520px minus padding).
export const CHAT_IMAGE_WIDTH = 480;
