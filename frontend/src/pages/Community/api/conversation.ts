import api from "../../../lib/api";
import { ConversationsPage } from "../../../routes/routeModules";

/**
 * POST /api/conversations/ -> {id} (existing or new). Throws ApiError on failure.
 * Callers open the chat next, so the chat page's code loads alongside the request and the
 * route doesn't flash its Suspense fallback.
 */
export const createOrGetConversation = async (username: string) => {
  ConversationsPage.preload().catch(() => {});
  return api.post<{ id: number }>("/api/conversations/", { participant: username });
};
