import api from "../../../lib/api";

export const pinMessage = async (messageId: number, isPinned: boolean) =>
  api.patch(`/api/messages/${messageId}/pin/`, { is_pinned: isPinned });
