import { api } from "./client";
import type { Conversation } from "../../types";

const CONVERSATIONS_CACHE_TTL_MS = 15_000;

let cachedConversations: Conversation[] | null = null;
let cachedConversationsAt = 0;
let conversationsRequest: Promise<Conversation[]> | null = null;

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

  const request = api
    .get<Conversation[]>("/conversations/")
    .then((response: { data: Conversation[] }) => {
      cachedConversations = [...response.data];
      cachedConversationsAt = Date.now();
      return [...response.data];
    })
    .finally(() => {
      conversationsRequest = null;
    });

  conversationsRequest = request;
  return request;
}

export async function fetchConversation(conversationId: number) {
  const response = await api.get<Conversation>(`/conversations/${conversationId}/`);
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
