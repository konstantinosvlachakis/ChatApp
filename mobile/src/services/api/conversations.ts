import { api } from "./client";
import type { Conversation } from "../../types";

export async function fetchConversations() {
  const response = await api.get<Conversation[]>("/conversations/");
  return response.data;
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

export async function sendConversationMessage(conversationId: number, text: string) {
  const formData = new FormData();
  formData.append("text", text);
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
