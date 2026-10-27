import React, { useSyncExternalStore } from "react";
import { dismissToast, getToasts, subscribeToasts, type Toast } from "./toastStore";
import "./toast.css";

const VARIANT_CLASSES: Record<Toast["variant"], string> = {
  error: "border-red-200 bg-red-50 text-red-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-slate-200 bg-white text-slate-900",
};

const liveProps = (toast: Toast) => ({
  role: toast.variant === "error" ? "alert" : "status",
  "aria-live": toast.variant === "error" ? ("assertive" as const) : ("polite" as const),
});

const DismissButton = ({ id, className }: { id: number; className: string }) => (
  <button type="button" onClick={() => dismissToast(id)} className={className} aria-label="Dismiss notification">
    <span aria-hidden="true">×</span>
  </button>
);

/**
 * Renders the toast queue (max 3, newest last). Errors use role="alert" (announced
 * immediately); others role="status" (polite). Each toast auto-dismisses.
 * Corner toasts stack bottom-right; `placement: "top"` ones show centred under the header.
 */
const ToastViewport = () => {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const topToasts = toasts.filter((toast) => toast.placement === "top");
  const cornerToasts = toasts.filter((toast) => toast.placement !== "top");

  return (
    <>
      <div className="lv-toast-top" data-testid="toast-viewport-top">
        {topToasts.map((toast) => (
          <div key={toast.id} {...liveProps(toast)} className={`lv-toast-pill is-${toast.variant}`}>
            {toast.variant !== "info" && (
              <span className="lv-toast-pill-icon" aria-hidden="true">
                {toast.variant === "success" ? "✓" : "!"}
              </span>
            )}
            <p>{toast.message}</p>
            <DismissButton id={toast.id} className="lv-toast-pill-close" />
          </div>
        ))}
      </div>
      <div
        className="lv-toast-viewport pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
        data-testid="toast-viewport"
      >
        {cornerToasts.map((toast) => (
          <div
            key={toast.id}
            {...liveProps(toast)}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
          >
            <p className="flex-1 leading-snug">{toast.message}</p>
            <DismissButton
              id={toast.id}
              className="-mr-1 rounded p-1 text-current opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            />
          </div>
        ))}
      </div>
    </>
  );
};

export default ToastViewport;
