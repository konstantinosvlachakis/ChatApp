import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "../../../lib/api";
import { toastApiError, toast } from "../../../components/Toast";
import { logger } from "../../../lib/logger";
import {
  fetchConversationSession,
  runExchangeSessionAction,
  startExchangeSession,
} from "../api/exchangeSessions";
import {
  clockOffsetMs,
  nextDeadline,
  remainingMs,
  shouldReplaceSession,
} from "../utils/exchangeSessionTiming";

const ACTION_ERRORS = {
  accept: "Couldn't accept the exchange",
  decline: "Couldn't decline the exchange",
  cancel: "Couldn't cancel the invite",
  switch: "Couldn't switch language",
  topic: "Couldn't change the topic",
  end: "Couldn't end the exchange",
};
// The session moved on elsewhere (partner acted, timer ran out): show the fresh state.
const STALE_CODES = new Set(["session_not_pending", "session_not_active", "already_switched", "not_found"]);
// After a local deadline the server may not have finalized yet (clock skew): retry a few times.
const MAX_DEADLINE_REFETCHES = 4;
const DEADLINE_GRACE_MS = 800;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Guided exchange session state for one direct chat (ChatRoom). Loads
 * `GET /conversations/<id>/session/`, merges `exchange_session` socket payloads
 * (`applySession`), runs actions and refetches when the local timer reaches
 * `expires_at`/`ends_at` (the server finalizes lazily and broadcasts). Never calls `end` itself.
 */
export default function useExchangeSession(conversationId, { enabled = true } = {}) {
  const [state, setState] = useState({ session: null, offsetMs: 0 });
  const [options, setOptions] = useState(null); // {languages, default_languages, durations}
  const [loaded, setLoaded] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const sessionRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const updateSeqRef = useRef(0);
  const deadlineRef = useRef({ key: "", count: 0 });
  const abortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Adopt a session from any source if it belongs to this chat and isn't older. */
  const applySession = useCallback(
    (incoming) => {
      if (!incoming || Number(incoming.conversation_id) !== Number(conversationId)) return;
      if (!shouldReplaceSession(sessionRef.current, incoming)) return;
      updateSeqRef.current += 1;
      sessionRef.current = incoming;
      setState({ session: incoming, offsetMs: clockOffsetMs(incoming.server_time, Date.now()) });
    },
    [conversationId]
  );

  /** Refetch; resolves with the fresh options (or null if the request failed / was superseded). */
  const refresh = useCallback(async () => {
    if (!enabled || !conversationId) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seqAtStart = updateSeqRef.current;
    try {
      const data = await fetchConversationSession(conversationId, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return null;
      const nextOptions = {
        languages: data.languages || [],
        default_languages: data.default_languages || [],
        durations: data.durations || [],
      };
      setOptions(nextOptions);
      if (data.session) {
        // The GET is authoritative for the same id even if a status would look "older"
        // (it can't be: the server never moves backwards), so reuse the normal merge.
        applySession(data.session);
      } else if (updateSeqRef.current === seqAtStart && sessionRef.current) {
        // Nothing open or recent any more (and no socket update raced this request).
        sessionRef.current = null;
        setState({ session: null, offsetMs: 0 });
      }
      return nextOptions;
    } catch (error) {
      if (!isAbortError(error)) logger.warn("Couldn't load the exchange session");
      return null;
    } finally {
      if (mountedRef.current && abortRef.current === controller) setLoaded(true);
    }
  }, [applySession, conversationId, enabled]);

  useEffect(() => {
    sessionRef.current = null;
    setState({ session: null, offsetMs: 0 });
    setLoaded(false);
    if (enabled) refresh();
  }, [conversationId, enabled, refresh]);

  // Refetch once the local clock passes the invite expiry / session end.
  const { session, offsetMs } = state;
  useEffect(() => {
    const deadline = nextDeadline(session);
    if (!enabled || !deadline) return undefined;
    const key = `${session.id}:${session.status}:${deadline}`;
    if (deadlineRef.current.key !== key) deadlineRef.current = { key, count: 0 };
    if (deadlineRef.current.count >= MAX_DEADLINE_REFETCHES) return undefined;
    const remaining = remainingMs(deadline, Date.now(), offsetMs) ?? 0;
    const delay = remaining > 0 ? remaining + DEADLINE_GRACE_MS : 2000 * (deadlineRef.current.count + 1);
    const timer = window.setTimeout(() => {
      deadlineRef.current.count += 1;
      refresh();
    }, Math.min(delay, MAX_TIMEOUT_MS));
    return () => window.clearTimeout(timer);
  }, [enabled, offsetMs, refresh, session]);

  const runAction = useCallback(
    async (action, body) => {
      const current = sessionRef.current;
      if (!current || busyRef.current) return null;
      busyRef.current = true;
      setBusyAction(action);
      try {
        const data = await runExchangeSessionAction(current.id, action, body);
        if (mountedRef.current) applySession(data?.session);
        return data?.session || null;
      } catch (error) {
        toastApiError(error, ACTION_ERRORS[action] || "Couldn't update the exchange");
        if (STALE_CODES.has(error?.code)) refresh();
        return null;
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusyAction("");
      }
    },
    [applySession, refresh]
  );

  /**
   * Invite the partner. Resolves with the pending session; a 409 `session_exists` adopts the
   * session from the error body. Other errors are rethrown for the dialog to show.
   */
  const start = useCallback(
    async (input) => {
      try {
        const data = await startExchangeSession(conversationId, input);
        applySession(data?.session);
        return data?.session || null;
      } catch (error) {
        const existing = error?.code === "session_exists" ? error?.data?.session : null;
        if (existing) {
          applySession(existing);
          toast.info("There's already an exchange in this chat.");
          return existing;
        }
        throw error;
      }
    },
    [applySession, conversationId]
  );

  return { session, offsetMs, options, loaded, busyAction, applySession, refresh, runAction, start };
}
