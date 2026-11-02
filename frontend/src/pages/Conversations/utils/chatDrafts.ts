// Unsent composer text is kept per conversation in localStorage (MessageInput reads
// it when a chat opens), so other pages can hand a chat a ready-to-send draft.

type ConversationId = string | number | null | undefined;

export const draftStorageKeyFor = (conversationId: ConversationId) =>
  conversationId ? `chat:draft:${conversationId}` : "chat:draft:global";

const focusKeyFor = (conversationId: string | number) => `chat:draft-focus:${conversationId}`;

/**
 * Prefill a conversation's composer; with `focus`, the composer also takes focus
 * (cursor at the end) the next time that chat opens. Never throws (storage may be blocked).
 */
export const saveChatDraft = (
  conversationId: ConversationId,
  text: string,
  { focus = false }: { focus?: boolean } = {}
): boolean => {
  if (!conversationId || !text) return false;
  try {
    localStorage.setItem(draftStorageKeyFor(conversationId), text);
    if (focus) sessionStorage.setItem(focusKeyFor(conversationId), "1");
    return true;
  } catch {
    return false;
  }
};

/** True once if a draft was handed over with `focus` for this conversation. */
export const takeDraftFocusRequest = (conversationId: ConversationId): boolean => {
  if (!conversationId) return false;
  try {
    const key = focusKeyFor(conversationId);
    const requested = sessionStorage.getItem(key) === "1";
    if (requested) sessionStorage.removeItem(key);
    return requested;
  } catch {
    return false;
  }
};
