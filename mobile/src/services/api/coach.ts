import { api } from "./client";

export async function sendCoachMessage(payload: {
  message: string;
  target_language: string;
  mode: string;
}) {
  const response = await api.post<{
    reply: string;
    target_language: string;
    native_language: string;
    mode: string;
  }>("/coach/chat/", payload);
  return response.data;
}
