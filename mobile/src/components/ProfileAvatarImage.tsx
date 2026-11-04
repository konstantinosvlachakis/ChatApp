import React, { useEffect, useState } from "react";
import { Image, type ImageProps, type ImageSourcePropType } from "react-native";

/**
 * Bundled default portrait (the same file as the web's `assets/default-avatar.jpg`). The server's
 * placeholder `profile_images/MainAfter.jpg` isn't served in production (media lives on
 * Cloudinary), so it must never be requested.
 */
export const DEFAULT_AVATAR_SOURCE: ImageSourcePropType = require("../../assets/default-avatar.jpg");

/** True for "no photo": empty, or the server's MainAfter placeholder path/URL. */
export function isPlaceholderAvatar(url?: string | null): boolean {
  return !url || /(^|\/)MainAfter\.[a-z0-9]+(\?.*)?$/i.test(url);
}

type ProfileAvatarImageProps = Omit<ImageProps, "source"> & {
  /** Absolute photo URL, or empty/placeholder for the default portrait. */
  url?: string | null;
  /** Sizing transform for a real photo (e.g. `(u) => avatarImage(u, 52)`). */
  transform?: (url: string) => string;
};

/** A profile photo that falls back to the bundled default portrait (missing or failing photo). */
export function ProfileAvatarImage({ url, transform, ...imageProps }: ProfileAvatarImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // A new photo (e.g. after an upload) gets a fresh attempt.
  useEffect(() => setFailedUrl(null), [url]);

  const usable = !isPlaceholderAvatar(url) && failedUrl !== url ? (url as string) : null;
  const source = usable ? { uri: transform ? transform(usable) : usable } : DEFAULT_AVATAR_SOURCE;
  return (
    <Image
      {...imageProps}
      source={source}
      onError={(event) => {
        if (usable) setFailedUrl(usable);
        imageProps.onError?.(event);
      }}
    />
  );
}
