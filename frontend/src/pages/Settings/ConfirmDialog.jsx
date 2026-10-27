import { useEffect, useId, useRef } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Confirmation dialog on a native <dialog> opened with showModal() (like Community's
 * FilterSheet and PhotoViewer): the page behind is inert, Escape and the backdrop close it,
 * Tab stays inside, and focus returns to whatever opened it.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  confirmDisabled = false,
  tone = "teal",
  onConfirm,
  onClose,
  initialFocusRef,
}) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return undefined;
    const returnTarget = document.activeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    (initialFocusRef?.current || confirmRef.current)?.focus();
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (returnTarget && typeof returnTarget.focus === "function" && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
  }, [open, initialFocusRef]);

  const close = () => {
    if (!busy) onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      // showModal() turns Escape into "cancel"; handle it here too for older engines.
      event.preventDefault();
      close();
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

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="st-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === dialogRef.current) close();
      }}
    >
      <form
        className="st-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !confirmDisabled) onConfirm();
        }}
      >
        <div className="st-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="st-icon-btn" onClick={close} aria-label="Close" disabled={busy}>
            <CloseRoundedIcon aria-hidden="true" />
          </button>
        </div>
        <div id={bodyId} className="st-dialog-text">
          {children}
        </div>
        <div className="st-dialog-actions">
          <button type="button" className="st-btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={`st-btn ${tone === "danger" ? "is-danger" : "is-teal"}`}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel || confirmLabel : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
