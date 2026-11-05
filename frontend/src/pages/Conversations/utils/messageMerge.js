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
  const previous = Array.isArray(prev) ? prev : [];
  // A sent message keeps its optimistic list key (`localKey`), so the row isn't remounted.
  const localKeys = new Map(previous.filter((message) => message?.localKey).map((message) => [message.id, message.localKey]));
  const fetchedWithKeys = localKeys.size
    ? fetched.map((message) => (localKeys.has(message?.id) ? { ...message, localKey: localKeys.get(message.id) } : message))
    : fetched;
  const localOnly = previous.filter(
    (message) =>
      message &&
      !fetchedIds.has(message.id) &&
      (message.isPending ||
        message.isSystem ||
        (isNumericId(message.id) && message.id > newestFetchedId))
  );
  return localOnly.length ? [...fetchedWithKeys, ...localOnly] : fetchedWithKeys;
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

// Same content as an optimistic copy: kind plus sticker/GIF id, or text and whether a file is attached.
const sameContent = (pending, saved) => {
  const kind = pending.kind || "text";
  if (kind !== (saved.kind || "text")) return false;
  if (kind === "sticker") return pending.media?.pack === saved.media?.pack && pending.media?.id === saved.media?.id;
  if (kind === "gif") return pending.media?.id === saved.media?.id;
  const hasFile = (message) => Boolean(message.attachment_url || message.attachmentUrl);
  return (pending.text || "").trim() === (saved.text || "").trim() && hasFile(pending) === hasFile(saved);
};

// Our own message came back from the server (broadcast or POST response) before the other one:
// fill the matching optimistic copy in place, keeping its list position and `localKey`, instead of
// listing it twice and dropping the copy (that remounts the row: a sticker or photo flickers).
// Returns the new list, or null when there is no matching pending copy.
export const confirmPendingMessage = (list, saved, decorate = (message) => message) => {
  if (!saved?.id || list.some((message) => message.id === saved.id)) return null;
  const index = list.findIndex(
    (message) => message?.isPending && message.sender?.id === saved.sender?.id && sameContent(message, saved)
  );
  if (index === -1) return null;
  const pending = list[index];
  const attachmentUrl = saved.attachment_url || saved.attachmentUrl || null;
  const next = list.slice();
  next[index] = {
    ...pending,
    ...decorate(saved),
    isPending: false,
    localKey: pending.localKey,
    attachment_url: attachmentUrl,
    attachmentUrl,
    reply_to: saved.reply_to || pending.reply_to || null,
  };
  return next;
};
