import { useSyncExternalStore } from "react";
import { EMAIL_UNVERIFIED_CODE } from "../features/emailVerification";
import { toApiError } from "./api/errors";

/** Imperative in-app toasts (rendered by components/ToastHost, mounted once in App.tsx). */
export type ToastVariant = "error" | "success" | "info";

export type Toast = {
  id: number;
  message: string;
  title?: string;
  variant: ToastVariant;
  durationMs: number;
};

const MAX_TOASTS = 3;
let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

export function showToast(
  message: string,
  options: { title?: string; variant?: ToastVariant; durationMs?: number } = {}
) {
  const variant = options.variant || "info";
  const toast: Toast = {
    id: nextId++,
    message,
    title: options.title,
    variant,
    durationMs: options.durationMs ?? (variant === "error" ? 6000 : 4000),
  };
  // Same message already visible: don't stack duplicates.
  const duplicate = toasts.find((item) => item.message === message && item.variant === variant);
  if (duplicate) dismissToast(duplicate.id);

  toasts = [...toasts, toast];
  while (toasts.length > MAX_TOASTS) {
    dismissToast(toasts[0].id);
  }
  timers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), toast.durationMs)
  );
  emit();
  return toast.id;
}

/**
 * Show a failed action's error. Aborted requests are ignored, and so is 403
 * `email_unverified` (the API client already triggered the "verify your email" prompt).
 */
export function toastApiError(error: unknown, fallback: string, title?: string) {
  const apiError = toApiError(error);
  if (apiError.isAborted) return null;
  if (apiError.status === 403 && apiError.code === EMAIL_UNVERIFIED_CODE) return null;
  const message = apiError.code === "unknown" ? fallback : apiError.message || fallback;
  return showToast(message, { title, variant: "error" });
}

function getToasts() {
  return toasts;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useToasts() {
  return useSyncExternalStore(subscribe, getToasts, getToasts);
}
