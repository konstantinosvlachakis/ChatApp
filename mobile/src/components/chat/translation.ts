// Inline translation state for the open chat (pure; no RN imports).
//
// Received messages translate on double-tap (or the long-press "Translate" action). Results are
// cached per message id for the session, so toggling back and forth never refetches.

export type TranslationEntry =
  | { status: "loading" }
  | { status: "done"; text: string; visible: boolean };

export type TranslationMap = Readonly<Record<number, TranslationEntry>>;

/** Props a message row needs: the shown translation (or null) and whether one is loading. */
export function translationRowState(entry: TranslationEntry | undefined): {
  translatedText: string | null;
  translating: boolean;
} {
  if (!entry) return { translatedText: null, translating: false };
  if (entry.status === "loading") return { translatedText: null, translating: true };
  return { translatedText: entry.visible ? entry.text : null, translating: false };
}

type TranslatableMessage = {
  id: number;
  text?: string | null;
  sender?: { id?: number } | null;
  local_status?: string;
};

/** Received, sent (not optimistic) messages with text can be translated. */
export function canTranslateMessage(message: TranslatableMessage, currentUserId: number | undefined): boolean {
  if (message.id <= 0 || message.local_status === "sending") return false;
  if (message.sender?.id == null || message.sender.id === currentUserId) return false;
  return Boolean(String(message.text || "").trim());
}

export type TranslateToggle =
  /** A cached translation: flip its visibility, no request. */
  | { kind: "toggle"; next: TranslationEntry }
  /** Already fetching: ignore the repeat gesture. */
  | { kind: "busy" }
  /** Nothing cached: fetch (the server's stored `translated_text`, if any, seeds the cache). */
  | { kind: "fetch" };

/**
 * What a translate gesture should do. `seedText` is the per-user `translated_text` from the
 * message payload (set when this user translated it before); it is used without a request.
 * `forceShow` (menu action) always shows the translation instead of toggling it off.
 */
export function nextTranslateAction(
  entry: TranslationEntry | undefined,
  seedText: string | null | undefined,
  forceShow = false
): TranslateToggle {
  if (entry?.status === "loading") return { kind: "busy" };
  if (entry?.status === "done") {
    return { kind: "toggle", next: { ...entry, visible: forceShow ? true : !entry.visible } };
  }
  const seed = String(seedText || "").trim();
  if (seed) return { kind: "toggle", next: { status: "done", text: seed, visible: true } };
  return { kind: "fetch" };
}

/**
 * Reads a failed translate request. The API answers 400 `already_translated` with the stored
 * `translated_text` (show it) and 400 `same_language` when the message is already in the target
 * language (friendly message, no error tone).
 */
export function translationFromError(data: unknown): { text: string | null; sameLanguage: boolean } {
  if (!data || typeof data !== "object") return { text: null, sameLanguage: false };
  const body = data as { translated_text?: unknown; same_language?: unknown; code?: unknown };
  const text = typeof body.translated_text === "string" && body.translated_text.trim() ? body.translated_text : null;
  const sameLanguage = body.same_language === true || body.code === "same_language";
  return { text, sameLanguage };
}

/** Immutable set/delete helpers for the map kept in screen state. */
export function withTranslation(map: TranslationMap, id: number, entry: TranslationEntry | null): TranslationMap {
  if (entry === null) {
    if (!(id in map)) return map;
    const next = { ...map };
    delete next[id];
    return next;
  }
  return { ...map, [id]: entry };
}
