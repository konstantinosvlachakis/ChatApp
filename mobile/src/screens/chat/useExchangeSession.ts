import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { clockOffsetMs, exchangeErrorText, isOpenSession } from "../../features/exchangeSession";
import {
  fetchConversationSession,
  runExchangeSessionAction,
  sessionFromConflict,
  startExchangeSession,
  type StartExchangeSessionInput,
} from "../../services/api/exchangeSessions";
import { toApiError } from "../../services/api/errors";
import { EMAIL_UNVERIFIED_CODE } from "../../features/emailVerification";
import { showToast, toastApiError } from "../../services/toast";
import type { ExchangeSession, ExchangeSessionAction } from "../../types";
import { useStableCallback } from "./useStableCallback";

export type ExchangeSessionOptions = {
  languages: string[];
  defaultLanguages: string[];
  durations: number[];
};

type UseExchangeSessionArgs = {
  /** The open chat. */
  conversationId: number | undefined;
  /** Direct chat, screen focused (groups never call the endpoint). */
  enabled: boolean;
};

// Dismissed end cards / closed notes stay hidden for the rest of the app run (local only).
const dismissedSessionIds = new Set<number>();
// Deadline refetches per session+status+deadline, so a lagging server can't cause a loop.
const MAX_DEADLINE_REFETCHES = 3;
const DEADLINE_RETRY_DELAYS_MS = [800, 3000, 8000];

/**
 * The open chat's guided exchange: GET on open/focus/foreground, `exchange_session` socket
 * events (`applySessionEvent`), start + actions, and a refetch when the local timer reaches
 * `ends_at` / `expires_at` (the server finalizes lazily; the client never calls `end` itself).
 */
export function useExchangeSession({ conversationId, enabled }: UseExchangeSessionArgs) {
  const [session, setSession] = useState<ExchangeSession | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [options, setOptions] = useState<ExchangeSessionOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<ExchangeSessionAction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, setDismissedVersion] = useState(0);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const requestRef = useRef<AbortController | null>(null);
  const deadlineAttemptsRef = useRef<Record<string, number>>({});
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySession = useCallback((next: ExchangeSession | null, forConversationId: number | undefined) => {
    if (forConversationId !== conversationIdRef.current) return;
    if (next && next.conversation_id !== forConversationId) return;
    setSession(next);
    if (next) setOffsetMs(clockOffsetMs(next.server_time));
  }, []);

  const refresh = useCallback(async () => {
    const id = conversationIdRef.current;
    if (!id || !enabledRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setOptionsLoading(true);
    try {
      const info = await fetchConversationSession(id, controller.signal);
      if (controller.signal.aborted || id !== conversationIdRef.current) return;
      applySession(info.session, id);
      setOptions({
        languages: info.languages,
        defaultLanguages: info.default_languages,
        durations: info.durations,
      });
    } catch {
      // The banner is optional: the chat works without it.
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setOptionsLoading(false);
      }
    }
  }, [applySession]);

  // Reset per chat; fetch whenever the chat is (re)shown.
  useEffect(() => {
    setSession(null);
    setOptions(null);
    setSheetOpen(false);
    setBusyAction(null);
    deadlineAttemptsRef.current = {};
  }, [conversationId]);

  useEffect(() => {
    if (!enabled || !conversationId) return;
    refresh();
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [conversationId, enabled, refresh]);

  // Coming back to the foreground: the timer may have run out meanwhile.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && enabledRef.current) refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(
    () => () => {
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    },
    []
  );

  /** Chat socket `exchange_session` (stable: it's a socket effect dependency). */
  const applySessionEvent = useStableCallback((next: ExchangeSession) => {
    if (!next || typeof next.id !== "number") return;
    applySession(next, next.conversation_id);
  });

  /** The local timer reached the deadline: refetch (a few times at most) until the server agrees. */
  const handleDeadline = useStableCallback((current: ExchangeSession) => {
    const key = `${current.id}:${current.status}:${current.status === "pending" ? current.expires_at : current.ends_at}`;
    const attempts = deadlineAttemptsRef.current[key] || 0;
    if (attempts >= MAX_DEADLINE_REFETCHES || deadlineTimerRef.current) return;
    deadlineAttemptsRef.current[key] = attempts + 1;
    deadlineTimerRef.current = setTimeout(() => {
      deadlineTimerRef.current = null;
      refresh();
    }, DEADLINE_RETRY_DELAYS_MS[attempts] ?? 8000);
  });

  const openSheet = useStableCallback(() => {
    setSheetOpen(true);
    if (!options && !optionsLoading) refresh();
  });
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  /** Start sheet submit: resolves when started (sheet closes); throws to show the error in the sheet. */
  const start = useStableCallback(async (input: StartExchangeSessionInput) => {
    const id = conversationIdRef.current;
    if (!id) return;
    try {
      const created = await startExchangeSession(id, input);
      applySession(created, id);
      setSheetOpen(false);
    } catch (error) {
      const existing = sessionFromConflict(error);
      if (existing) {
        applySession(existing, id);
        setSheetOpen(false);
        showToast("There's already an exchange in this chat.", { variant: "info" });
        return;
      }
      throw error;
    }
  });

  const act = useStableCallback(async (action: ExchangeSessionAction, body?: { title?: string }) => {
    const current = session;
    const id = conversationIdRef.current;
    if (!current || busyAction) return;
    setBusyAction(action);
    try {
      const next = await runExchangeSessionAction(current.id, action, body);
      applySession(next, id);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status === 409 || (apiError.status === 403 && apiError.code !== EMAIL_UNVERIFIED_CODE)) {
        // The session moved on (answered, ended, switched): show its current state.
        refresh();
      }
      const friendly = exchangeErrorText(apiError.code, "");
      if (friendly && !apiError.isAborted) {
        showToast(friendly, { title: "Guided exchange", variant: "error" });
      } else {
        // Network/throttle/unverified email: the shared handler (it skips aborts and email_unverified).
        toastApiError(error, "Could not update the exchange.", "Guided exchange");
      }
    } finally {
      setBusyAction(null);
    }
  });

  const dismiss = useStableCallback(() => {
    if (!session || isOpenSession(session)) return;
    dismissedSessionIds.add(session.id);
    setDismissedVersion((v) => v + 1);
  });

  const visibleSession = session && !dismissedSessionIds.has(session.id) ? session : null;

  return {
    session: visibleSession,
    offsetMs,
    options,
    optionsLoading,
    busyAction,
    sheetOpen,
    openSheet,
    closeSheet,
    start,
    act,
    dismiss,
    refresh,
    applySessionEvent,
    handleDeadline,
  };
}
