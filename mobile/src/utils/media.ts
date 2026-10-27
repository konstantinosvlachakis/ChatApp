import { PixelRatio } from "react-native";

// Cloudinary delivery transformations for user images (mirrors web `frontend/src/lib/media.ts`).
// The API returns original URLs; ask Cloudinary for a resized, auto-format copy sized for the
// slot it is shown in. Anything that is not a Cloudinary image upload URL (API /media/ files,
// file:/data: URIs, video/raw resources such as voice notes) is returned unchanged.

export type CloudinaryCrop = "fill" | "limit";

export type CloudinaryImageOptions = {
  /** Rendered width in dp (from the style). */
  width: number;
  /** Rendered height in dp (crop "fill" only; defaults to width). */
  height?: number;
  /** "fill" = face-centred crop to width×height (default), "limit" = shrink to fit width. */
  crop?: CloudinaryCrop;
};

// Plain string parsing: React Native's URL polyfill doesn't support setting `pathname`.
const CLOUDINARY_IMAGE = /^(https?:\/\/res\.cloudinary\.com\/[^/?#]+\/image\/upload\/)([^?#]+)(.*)$/;
const TRANSFORM_KEYS = new Set([
  "a", "ac", "af", "ar", "b", "bo", "br", "c", "co", "cs", "d", "dl", "dn", "dpr", "du", "e",
  "eo", "f", "fl", "fn", "fps", "g", "h", "if", "ki", "l", "o", "p", "pg", "q", "r", "so", "sp",
  "t", "u", "vc", "vs", "w", "x", "y", "z",
]);
const MAX_PIXEL_RATIO = 3;
const MAX_DIMENSION = 2000;

const isTransformationSegment = (segment: string) =>
  segment.length > 0 &&
  segment.split(",").every((part) => {
    const match = /^([a-z]{1,3})_.+$/.exec(part);
    return Boolean(match && TRANSFORM_KEYS.has(match[1]));
  });

const pixels = (dp: number) =>
  Math.min(MAX_DIMENSION, Math.max(1, Math.round(dp * Math.min(PixelRatio.get(), MAX_PIXEL_RATIO))));

export function cloudinaryImage(url: string | null | undefined, options: CloudinaryImageOptions): string {
  if (!url) return "";
  const match = CLOUDINARY_IMAGE.exec(url);
  if (!match) return url;
  const [, prefix, path, suffix] = match;
  if (isTransformationSegment(path.split("/")[0])) return url;
  const crop = options.crop ?? "fill";
  const transformation =
    crop === "fill"
      ? `f_auto,q_auto,c_fill,g_face,w_${pixels(options.width)},h_${pixels(options.height ?? options.width)}`
      : `f_auto,q_auto,c_limit,w_${pixels(options.width)}`;
  return `${prefix}${transformation}/${path}${suffix}`;
}

/** Square avatar / portrait rendered at `size` dp. Always pass user photos through this. */
export const avatarImage = (url: string | null | undefined, size: number) =>
  cloudinaryImage(url, { width: size, crop: "fill" });
