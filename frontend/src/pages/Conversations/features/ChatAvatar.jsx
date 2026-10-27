import React, { useState } from "react";
import { BASE_URL_IMG } from "../../../constants/constants";
import { getInitials } from "../utils/conversationSearch";

// Media paths from the API may be absolute, /media/…, media/… or bare storage names.
export const resolveAvatarUrl = (path) => {
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
  if (path.startsWith("media/")) return `${BASE_URL_IMG}/${path}`;
  return `${BASE_URL_IMG}/media/${path}`;
};

/** Round portrait; falls back to initials on a peach disc when there is no photo or it fails. */
function ChatAvatar({ name, imagePath, size = 48, online = false, className = "" }) {
  const url = resolveAvatarUrl(imagePath);
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = url && failedUrl !== url;
  return (
    <span className={`cv-avatar-wrap ${className}`}>
      <span
        className="cv-avatar"
        style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }}
        aria-hidden="true"
      >
        {showImage ? (
          <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
        ) : (
          getInitials(name)
        )}
      </span>
      {online && <span className="cv-online-dot" />}
    </span>
  );
}

export default React.memo(ChatAvatar);
