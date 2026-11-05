import { api, UPLOAD_TIMEOUT_MS, type NoRetryConfig } from "./client";
import type { ChatMessage, Conversation, GifMedia, StickerPack } from "../../types";

const CONVERSATIONS_CACHE_TTL_MS = 15_000;

let cachedConversations: Conversation[] | null = null;
let cachedConversationsAt = 0;
let conversationsRequest: Promise<Conversation[]> | null = null;
let cacheGeneration = 0;

export function clearConversationsCache() {
  cachedConversations = null;
  cachedConversationsAt = 0;
  conversationsRequest = null;
  cacheGeneration += 1;
}

export function getCachedConversations() {
  if (!cachedConversations) return null;
  if (Date.now() - cachedConversationsAt > CONVERSATIONS_CACHE_TTL_MS) return null;
  return [...cachedConversations];
}

export async function fetchConversations(options?: { force?: boolean }): Promise<Conversation[]> {
  const force = Boolean(options?.force);
  const cached = getCachedConversations();

  if (!force && cached) {
    return cached;
  }
  if (conversationsRequest) {
    return conversationsRequest;
  }

  const generation = cacheGeneration;
  const request = api
    // Groups are opt-in on the API (builds before this one only understand direct chats).
    .get<Conversation[]>("/conversations/", { params: { include: "groups" } })
    .then((response: { data: Conversation[] }) => {
      // Skip caching if the cache was cleared (e.g. logout) while this request was in flight.
      if (generation === cacheGeneration) {
        cachedConversations = [...response.data];
        cachedConversationsAt = Date.now();
      }
      return [...response.data];
    })
    .finally(() => {
      if (conversationsRequest === request) {
        conversationsRequest = null;
      }
    });

  conversationsRequest = request;
  return request;
}

export async function fetchConversation(conversationId: number) {
  const response = await api.get<Conversation>(`/conversations/${conversationId}/`);
  return response.data;
}

export interface ConversationMessagesPage {
  // Chronological within the page; page 1 holds the newest messages.
  messages: ChatMessage[];
  pinned_messages?: ChatMessage[];
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    // True when older messages exist (a higher page number).
    has_next: boolean;
    has_previous: boolean;
  };
}

/** Older history beyond the messages embedded in the conversation detail. */
export async function fetchConversationMessagesPage(
  conversationId: number,
  page: number,
  pageSize: number
) {
  const response = await api.get<ConversationMessagesPage>(
    `/conversations/${conversationId}/messages/`,
    { params: { page, page_size: pageSize } }
  );
  return response.data;
}

export async function createOrGetConversation(participantUsername: string) {
  const response = await api.post<{ id: number }>("/conversations/", {
    participant: participantUsername,
  });
  return response.data;
}

/** File part for a message upload (React Native FormData file object). */
export type MessageAttachmentUpload = { uri: string; name: string; type: string };

export async function sendConversationMessage(
  conversationId: number,
  text: string,
  replyToMessageId?: number | null,
  attachment?: MessageAttachmentUpload | null
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("text", text);
  if (replyToMessageId) {
    formData.append("reply_to", String(replyToMessageId));
  }
  if (attachment) {
    // RN's FormData takes { uri, name, type } for files; the DOM typings don't know that shape.
    formData.append("attachment", attachment as unknown as Blob);
  }
  const response = await api.post<ChatMessage>(`/conversations/${conversationId}/messages/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    ...(attachment ? { timeout: UPLOAD_TIMEOUT_MS } : null),
  });
  return response.data;
}

/** A sticker (`ref` "<pack>:<id>") or GIF (GIPHY id); the server resolves and stores the media. */
export type MediaMessageInput = { kind: "sticker"; stickerRef: string } | { kind: "gif"; gifId: string };

export async function sendMediaMessage(
  conversationId: number,
  input: MediaMessageInput,
  replyToMessageId?: number | null
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("kind", input.kind);
  if (input.kind === "sticker") formData.append("sticker", input.stickerRef);
  else formData.append("gif_id", input.gifId);
  if (replyToMessageId) formData.append("reply_to", String(replyToMessageId));
  const response = await api.post<ChatMessage>(`/conversations/${conversationId}/messages/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

// The packs only change with a deploy: fetched once per app session.
let stickerPacksPromise: Promise<StickerPack[]> | null = null;

export function fetchStickerPacks(): Promise<StickerPack[]> {
  if (!stickerPacksPromise) {
    stickerPacksPromise = api
      .get<{ packs: StickerPack[] }>("/stickers/")
      .then((response) => response.data?.packs || [])
      .catch((error) => {
        stickerPacksPromise = null;
        throw error;
      });
  }
  return stickerPacksPromise;
}

export type GifPage = { results: GifMedia[]; next_offset: number | null; attribution: string };

/** Trending (empty query) or search. One attempt: 503 `gifs_unavailable` means GIFs are off. */
export async function fetchGifs(query: string, offset = 0, signal?: AbortSignal): Promise<GifPage> {
  const params: Record<string, string> = {};
  if (query.trim()) params.q = query.trim();
  if (offset) params.offset = String(offset);
  const config: NoRetryConfig & { params: Record<string, string>; signal?: AbortSignal } = {
    noRetry: true,
    params,
    signal,
  };
  const response = await api.get<GifPage>("/gifs/", config);
  return response.data;
}

export async function markConversationRead(conversationId: number) {
  const response = await api.patch(`/conversations/${conversationId}/read/`);
  return response.data;
}

export async function reactToMessage(messageId: number, emoji?: string) {
  const response = await api.post(`/messages/${messageId}/react/`, {
    emoji: emoji || "",
  });
  return response.data;
}

export async function pinConversationMessage(messageId: number, isPinned: boolean) {
  const response = await api.patch(`/messages/${messageId}/pin/`, {
    is_pinned: isPinned,
  });
  return response.data;
}

export async function deleteConversationMessage(messageId: number) {
  const response = await api.delete(`/messages/${messageId}/delete/`);
  return response.data;
}

export async function translateConversationMessage(messageId: number, targetLanguage?: string) {
  const response = await api.post("/messages/translate/", {
    message_id: messageId,
    target_language: targetLanguage || "english",
  });
  return response.data;
}

/** Three opening lines for an empty chat (AI, or rule-based when AI isn't available). */
export async function fetchChatOpeners(conversationId: number, signal?: AbortSignal): Promise<string[]> {
  const response = await api.get<{ openers?: unknown; source?: string }>(`/conversations/${conversationId}/openers/`, { signal });
  const openers = response.data?.openers;
  return Array.isArray(openers) ? openers.filter((line): line is string => typeof line === "string") : [];
}
