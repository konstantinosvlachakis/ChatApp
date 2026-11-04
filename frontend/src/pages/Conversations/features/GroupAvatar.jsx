import React from "react";
import ChatAvatar from "./ChatAvatar";

/**
 * A group's picture: two members' photos overlapping (front-left, back-right), or one
 * photo when only one other member is shown. ``members`` should exclude the viewer.
 */
function GroupAvatar({ members = [], size = 48 }) {
  const shown = members.filter(Boolean).slice(0, 2);
  if (shown.length < 2) {
    return <ChatAvatar name={shown[0]?.username} imagePath={shown[0]?.profile_image_url} size={size} />;
  }
  const inner = Math.round(size * 0.68);
  return (
    <span className="cv-group-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <ChatAvatar
        className="cv-group-avatar-back"
        name={shown[1].username}
        imagePath={shown[1].profile_image_url}
        size={inner}
      />
      <ChatAvatar
        className="cv-group-avatar-front"
        name={shown[0].username}
        imagePath={shown[0].profile_image_url}
        size={inner}
      />
    </span>
  );
}

export default React.memo(GroupAvatar);
