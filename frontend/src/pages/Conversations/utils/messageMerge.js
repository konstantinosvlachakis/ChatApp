// Pure helpers for merging fetched message pages into the live chat list without
// dropping local-only entries (optimistic sends, call summaries, socket arrivals).

const isNumericId = (id) => typeof id === "number" && Number.isFinite(id);

// Replace the list with a freshly fetched latest page, keeping local entries the page
// can't know about: optimistic (`isPending`) and system messages, and messages newer
// than the page's newest id (e.g. message_created arrivals during the fetch).
export const mergeLatestPage = (prev, pageMessages) => {
  const fetched = Array.isArray(pageMessages) ? pageMessages : [];
  const fetchedIds = new Set(fetched.map((message) => message?.id));
  const newestFetchedId = fetched.reduce(
    (newest, message) => (isNumericId(message?.id) && message.id > newest ? message.id : newest),
    -Infinity
  );
  const localOnly = (Array.isArray(prev) ? prev : []).filter(
    (message) =>
      message &&
      !fetchedIds.has(message.id) &&
      (message.isPending ||
        message.isSystem ||
        (isNumericId(message.id) && message.id > newestFetchedId))
  );
  return localOnly.length ? [...fetched, ...localOnly] : fetched;
};

// Prepend an older page, skipping ids already listed.
export const prependOlderMessages = (prev, olderMessages) => {
  const older = Array.isArray(olderMessages) ? olderMessages : [];
  if (!older.length) return prev;
  const seen = new Set(prev.map((message) => message.id));
  const uniqueOlder = older.filter((message) => !seen.has(message.id));
  return uniqueOlder.length ? [...uniqueOlder, ...prev] : prev;
};

// Put a removed message back where it was: after `previousId` when that is still
// listed, otherwise at its old index (clamped). No-op if it is already listed.
export const restoreMessage = (list, message, previousId, previousIndex) => {
  if (!message || list.some((item) => item.id === message.id)) return list;
  let index = -1;
  if (previousId != null) {
    const previousPosition = list.findIndex((item) => item.id === previousId);
    if (previousPosition !== -1) index = previousPosition + 1;
  } else {
    index = 0;
  }
  if (index === -1) {
    index = Math.min(Math.max(0, previousIndex ?? list.length), list.length);
  }
  return [...list.slice(0, index), message, ...list.slice(index)];
};
