import { useCallback, useEffect, useRef, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { DEFAULT_AVATAR_URL } from "../constants/avatar";
import "./PhotoViewer.css";

const SWIPE_MIN_DISTANCE = 50;
const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

/** True for a real uploaded photo: not empty and not the bundled chameleon default avatar. */
export const isRealPhoto = (src) => Boolean(src) && src !== DEFAULT_AVATAR_URL;

/** Keeps only real photos, in order: `[{ key, src, alt }]`. */
export const buildPhotoGallery = (entries) => (entries || []).filter((entry) => entry && isRealPhoto(entry.src));

/**
 * Viewer state for a page. `open(index, event)` remembers the clicked thumbnail so focus goes
 * back to it on close (Safari doesn't focus buttons on click, so activeElement isn't enough).
 */
export const usePhotoViewer = () => {
  const [index, setIndex] = useState(null);
  const triggerRef = useRef(null);
  const open = useCallback((nextIndex, event) => {
    triggerRef.current = event?.currentTarget || document.activeElement;
    setIndex(nextIndex);
  }, []);
  const close = useCallback(() => setIndex(null), []);
  return { index, open, close, triggerRef };
};

/**
 * Full-screen photo viewer (lightbox) on a native <dialog> opened with showModal(), like
 * Community's FilterSheet: the page behind is inert. Escape, backdrop click and the close
 * button close it; ←/→, the arrow buttons and horizontal swipes page through several photos.
 * Native pinch-zoom is left alone (no touch-action / preventDefault on touch).
 */
export default function PhotoViewer({ photos, index, onClose, returnFocusRef, label = "Photo viewer" }) {
  const gallery = buildPhotoGallery(photos);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const touchRef = useRef(null);
  const isOpen = index !== null && index !== undefined && gallery.length > 0;
  const [current, setCurrent] = useState(0);
  const count = gallery.length;

  useEffect(() => {
    if (isOpen) setCurrent(Math.min(Math.max(index, 0), count - 1));
  }, [isOpen, index, count]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return undefined;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    closeButtonRef.current?.focus();
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    const returnTarget = returnFocusRef?.current;

    return () => {
      body.style.overflow = previousOverflow;
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (returnTarget && typeof returnTarget.focus === "function" && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
  }, [isOpen, returnFocusRef]);

  const go = useCallback(
    (step) => {
      if (count < 2) return;
      setCurrent((value) => (value + step + count) % count);
    },
    [count]
  );

  if (!isOpen) return null;

  const photo = gallery[current] || gallery[0];

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "Escape") {
      // showModal() turns Escape into "cancel"; handle it here too for older engines.
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) {
      touchRef.current = null; // pinch: never a swipe
      return;
    }
    touchRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    // While pinch-zoomed in, a horizontal drag pans the page instead of changing photo.
    if ((window.visualViewport?.scale || 1) > 1.01) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? 1 : -1);
  };

  return (
    <dialog
      ref={dialogRef}
      className="lv-photo-viewer"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget || event.target.dataset?.viewerBackdrop) onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={(event) => {
        if (event.touches.length > 1) touchRef.current = null;
      }}
      onTouchEnd={handleTouchEnd}
    >
      <div className="lv-photo-viewer-stage" data-viewer-backdrop="true">
        <img key={photo.src} className="lv-photo-viewer-image" src={photo.src} alt={photo.alt || ""} />
      </div>

      <div className="lv-photo-viewer-bar" data-viewer-backdrop="true">
        {count > 1 ? (
          <p className="lv-photo-viewer-counter" aria-live="polite">
            {current + 1} / {count}
          </p>
        ) : (
          <span />
        )}
        <button
          ref={closeButtonRef}
          type="button"
          className="lv-photo-viewer-button"
          onClick={onClose}
          aria-label="Close photo viewer"
        >
          <CloseRoundedIcon />
        </button>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="lv-photo-viewer-button lv-photo-viewer-prev"
            onClick={() => go(-1)}
            aria-label="Previous photo"
          >
            <ChevronLeftRoundedIcon />
          </button>
          <button
            type="button"
            className="lv-photo-viewer-button lv-photo-viewer-next"
            onClick={() => go(1)}
            aria-label="Next photo"
          >
            <ChevronRightRoundedIcon />
          </button>
        </>
      )}
    </dialog>
  );
}
