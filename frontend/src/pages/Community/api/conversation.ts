import api from "../../../lib/api";

/** POST /api/conversations/ -> {id} (existing or new). Throws ApiError on failure. */
export const createOrGetConversation = async (username: string) =>
  api.post<{ id: number }>("/api/conversations/", { participant: username });
