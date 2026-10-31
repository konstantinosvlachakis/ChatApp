import { getErrorMessage, isAbortError, toApiError } from "../../lib/apiError";

/**
 * Minimal toast store (no UI dependency). `showToast` works from anywhere (components,
 * API helpers, mutation callbacks); <ToastViewport /> renders the queue.
 */
export type ToastVariant = "error" | "success" | "info";
/** "corner": bottom-right stack (default). "top": a centred confirmation under the header. */
export type ToastPlacement = "corner" | "top";

export type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  placement: ToastPlacement;
  durationMs: number;
};

export const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  error: 6000,
  success: 4000,
  info: 4000,
};

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

const emit = () => listeners.forEach((listener) => listener());

export const getToasts = () => toasts;

export const subscribeToasts = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const dismissToast = (id: number) => {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
};

export const showToast = (
  message: string,
  options: { variant?: ToastVariant; durationMs?: number; placement?: ToastPlacement } = {}
) => {
  const text = String(message || "").trim();
  if (!text) return null;
  const variant = options.variant || "info";
  // Collapse duplicates (e.g. the same failure from several retries/components).
  const duplicate = toasts.find((toast) => toast.message === text && toast.variant === variant);
  if (duplicate) dismissToast(duplicate.id);

  const toast: Toast = {
    id: nextId++,
    message: text,
    variant,
    placement: options.placement || "corner",
    durationMs: options.durationMs ?? DEFAULT_DURATION_MS[variant],
  };
  let next = [...toasts, toast];
  while (next.length > MAX_TOASTS) {
    const [oldest, ...rest] = next;
    const timer = timers.get(oldest.id);
    if (timer) clearTimeout(timer);
    timers.delete(oldest.id);
    next = rest;
  }
  toasts = next;
  if (toast.durationMs > 0) {
    timers.set(
      toast.id,
      setTimeout(() => dismissToast(toast.id), toast.durationMs)
    );
  }
  emit();
  return toast.id;
};

export const toast = {
  error: (message: string, durationMs?: number) => showToast(message, { variant: "error", durationMs }),
  success: (message: string, durationMs?: number) => showToast(message, { variant: "success", durationMs }),
  info: (message: string, durationMs?: number) => showToast(message, { variant: "info", durationMs }),
};

/**
 * Show a failed user action. Uses the API's message when there is one, prefixed with
 * what failed, and stays silent for cancelled requests.
 */
export const toastApiError = (error: unknown, action?: string) => {
  if (isAbortError(error)) return null;
  if (toApiError(error).code === "email_unverified") return null;
  const detail = getErrorMessage(error);
  return toast.error(action ? `${action}: ${detail}` : detail);
};

/** Test helper. */
export const clearToasts = () => {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  toasts = [];
  emit();
};
