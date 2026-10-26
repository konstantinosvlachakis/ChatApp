import { api } from "./client";
import type { ChatMessage, Conversation } from "../../types";

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
    .get<Conversation[]>("/conversations/")
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

export async function sendConversationMessage(
  conversationId: number,
  text: string,
  replyToMessageId?: number | null
) {
  const formData = new FormData();
  formData.append("text", text);
  if (replyToMessageId) {
    formData.append("reply_to", String(replyToMessageId));
  }
  const response = await api.post(`/conversations/${conversationId}/messages/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
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
