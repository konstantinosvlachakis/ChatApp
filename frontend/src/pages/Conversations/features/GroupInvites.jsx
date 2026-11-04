import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import { toastApiError } from "../../../components/Toast";
import { CONVERSATIONS_LIST_QUERY_KEY } from "../api/conversationListCache";
import { GROUP_INVITES_QUERY_KEY, respondToGroupInvite, useGroupInvites } from "../api/groups";
import GroupAvatar from "./GroupAvatar";

/** Pending group invites above the chat list: who invited you, who's in it, Join / Decline. */
function GroupInvites() {
  const { data: invites = [] } = useGroupInvites();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);

  if (!invites.length) return null;

  const respond = async (invite, action) => {
    setBusyId(invite.conversation_id);
    try {
      await respondToGroupInvite(invite.conversation_id, action);
      queryClient.setQueryData(GROUP_INVITES_QUERY_KEY, (current = []) =>
        current.filter((item) => item.conversation_id !== invite.conversation_id)
      );
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
      if (action === "accept") navigate(`/conversations/${invite.conversation_id}`);
    } catch (error) {
      toastApiError(error, action === "accept" ? "Couldn't join the group" : "Couldn't decline the invite");
      queryClient.invalidateQueries({ queryKey: GROUP_INVITES_QUERY_KEY });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cv-invites">
      <p className="cv-section-label">Group invites</p>
      {invites.map((invite) => {
        const busy = busyId === invite.conversation_id;
        const inviter = invite.invited_by?.username;
        return (
          <div key={invite.conversation_id} className="cv-invite">
            <GroupAvatar members={invite.members} size={44} />
            <div className="cv-invite-body">
              <p className="cv-invite-name">{invite.display_name}</p>
              <p className="cv-invite-meta">
                {inviter ? `${inviter} invited you` : "You're invited"} · {invite.member_count}{" "}
                {invite.member_count === 1 ? "member" : "members"}
              </p>
              <div className="cv-invite-actions">
                <button
                  type="button"
                  className="cv-pill-button is-primary is-small"
                  onClick={() => respond(invite, "accept")}
                  disabled={busy}
                >
                  Join
                </button>
                <button
                  type="button"
                  className="cv-pill-button is-small"
                  onClick={() => respond(invite, "decline")}
                  disabled={busy}
                  aria-label={`Decline the invite to ${invite.display_name}`}
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(GroupInvites);
