import { useQuery } from "react-query";
import api from "../../../lib/api";
import { Conversation, GroupInvite, ParticipantProfile } from "../types";

/** Group chat endpoints (backend `chatapp/group_views.py`). Max 8 people incl. invites. */
export const MAX_GROUP_MEMBERS = 8;
export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_INVITES_QUERY_KEY = ["groupInvites"];

export const createGroup = (members: string[], name = "") =>
  api.post<Conversation>("/api/conversations/groups/", { members, name });

export const inviteToGroup = (conversationId: number, usernames: string[]) =>
  api.post<Conversation>(`/api/conversations/${conversationId}/members/`, { usernames });

export const respondToGroupInvite = (conversationId: number, action: "accept" | "decline") =>
  api.post<Conversation | { declined: true }>(`/api/conversations/${conversationId}/invite/`, { action });

/** Leave (your own username) or remove someone (owner only). */
export const removeGroupMember = (conversationId: number, username: string) =>
  api.delete<{ left?: boolean; group_deleted?: boolean; removed?: string }>(
    `/api/conversations/${conversationId}/members/${encodeURIComponent(username)}/`
  );

export const renameGroup = (conversationId: number, name: string) =>
  api.patch<{ name: string; display_name: string }>(`/api/conversations/${conversationId}/`, { name });

export const setGroupMemberNickname = (conversationId: number, username: string, nickname: string) =>
  api.patch<{ username: string; nickname: string }>(
    `/api/conversations/${conversationId}/members/${encodeURIComponent(username)}/nickname/`,
    { nickname }
  );

export const getGroupInvites = async (): Promise<GroupInvite[]> => {
  const payload = await api.get<{ invites: GroupInvite[] }>("/api/conversations/invites/");
  return Array.isArray(payload?.invites) ? payload.invites : [];
};

export const useGroupInvites = () =>
  useQuery<GroupInvite[]>({
    queryKey: GROUP_INVITES_QUERY_KEY,
    queryFn: getGroupInvites,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    useErrorBoundary: false,
  });

/** People you follow (first 50): with your chat partners, the ones you can invite. */
export const getFollowingProfiles = async (): Promise<ParticipantProfile[]> => {
  const payload = await api.get<{ profiles: ParticipantProfile[] }>("/api/profile/following/", {
    params: { page: 1, page_size: 50 },
  });
  return Array.isArray(payload?.profiles) ? payload.profiles : [];
};
