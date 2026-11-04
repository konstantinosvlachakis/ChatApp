import { api } from "./client";
import type { Conversation, ConversationParticipant, GroupInvite } from "../../types";

/** Group chat endpoints (backend `chatapp/group_views.py`). Max 8 people incl. invites. */
export const MAX_GROUP_MEMBERS = 8;
export const GROUP_NAME_MAX_LENGTH = 60;

export async function createGroup(members: string[], name = "") {
  const response = await api.post<Conversation>("/conversations/groups/", { members, name });
  return response.data;
}

export async function inviteToGroup(conversationId: number, usernames: string[]) {
  const response = await api.post<Conversation>(`/conversations/${conversationId}/members/`, { usernames });
  return response.data;
}

export async function respondToGroupInvite(conversationId: number, action: "accept" | "decline") {
  const response = await api.post<Conversation | { declined: true }>(`/conversations/${conversationId}/invite/`, {
    action,
  });
  return response.data;
}

/** Leave (your own username) or remove someone (owner only). */
export async function removeGroupMember(conversationId: number, username: string) {
  const response = await api.delete<{ left?: boolean; group_deleted?: boolean; removed?: string }>(
    `/conversations/${conversationId}/members/${encodeURIComponent(username)}/`
  );
  return response.data;
}

export async function renameGroup(conversationId: number, name: string) {
  const response = await api.patch<{ name: string; display_name: string }>(`/conversations/${conversationId}/`, {
    name,
  });
  return response.data;
}

export async function fetchGroupInvites(): Promise<GroupInvite[]> {
  const response = await api.get<{ invites?: GroupInvite[] }>("/conversations/invites/");
  return Array.isArray(response.data?.invites) ? response.data.invites : [];
}

/** People you follow (first 50): with your chat partners, the ones you can invite. */
export async function fetchFollowingForGroups(): Promise<ConversationParticipant[]> {
  const response = await api.get<{ profiles?: ConversationParticipant[] }>("/profile/following/", {
    params: { page: 1, page_size: 50 },
  });
  return Array.isArray(response.data?.profiles) ? response.data.profiles : [];
}
