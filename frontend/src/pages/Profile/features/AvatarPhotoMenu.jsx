import React, { useEffect, useRef } from "react";
import ZoomOutMapRoundedIcon from "@mui/icons-material/ZoomOutMapRounded";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";

/**
 * The menu under your own profile photo: "See photo" (full-size viewer) and
 * "Update photo" (file picker). Escape, Tab or a click outside closes it; ↑/↓ move
 * between the items; focus returns to the photo when it closes from the keyboard.
 */
export default function AvatarPhotoMenu({ open, onClose, canView, onView, onPick, triggerRef }) {
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    items()[0]?.focus();

    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef?.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, triggerRef]);

  const closeAndRefocus = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  const onKeyDown = (event) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === "Tab") {
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  };

  return (
    <>
      {/* Outside the menu so it survives the menu closing while the picker is open. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />
      {open && (
        <div ref={menuRef} className="pf-avatar-menu" role="menu" aria-label="Profile photo" onKeyDown={onKeyDown}>
          {canView && (
            <button
              type="button"
              role="menuitem"
              className="pf-avatar-menu-item"
              onClick={(event) => {
                onClose();
                onView(event);
              }}
            >
              <span className="pf-avatar-menu-icon" aria-hidden="true">
                <ZoomOutMapRoundedIcon />
              </span>
              <span className="pf-avatar-menu-text">
                <strong>See photo</strong>
                <small>Open it full size</small>
              </span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="pf-avatar-menu-item"
            onClick={() => {
              onClose();
              fileInputRef.current?.click();
            }}
          >
            <span className="pf-avatar-menu-icon is-accent" aria-hidden="true">
              <FileUploadOutlinedIcon />
            </span>
            <span className="pf-avatar-menu-text">
              <strong>Update photo</strong>
              <small>Choose a new picture</small>
            </span>
          </button>
        </div>
      )}
    </>
  );
}
