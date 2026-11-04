import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { useUser } from "../../../context/UserContext";
import { getErrorMessage } from "../../../lib/api";
import { toast } from "../../../components/Toast";
import { GROUP_NAME_MAX_LENGTH, MAX_GROUP_MEMBERS, removeGroupMember, renameGroup, setGroupMemberNickname } from "../api/groups";
import { conversationTitle, groupMembers } from "../utils/conversationSearch";
import ChatAvatar from "./ChatAvatar";
import GroupAvatar from "./GroupAvatar";
import GroupPeoplePicker from "./GroupPeoplePicker";

/**
 * Group details: name (owner renames), members and invitees (owner removes), add people
 * (any member) and leave. ``onChanged`` refetches the conversation; ``onLeft`` runs after
 * you leave.
 */
export default function GroupMembersPanel({ conversation, onClose, onChanged, onLeft, initialNicknameUsername = null }) {
  const { user } = useUser();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.name || "");
  const [busy, setBusy] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editingNickname, setEditingNickname] = useState(initialNicknameUsername);
  const [nicknameDraft, setNicknameDraft] = useState(
    () => conversation.participants?.find((row) => row.user?.username === initialNicknameUsername)?.nickname || ""
  );
  const closeRef = useRef(null);
  const isOwner = conversation.my_role === "owner";
  const participants = conversation.participants || [];
  const others = groupMembers(conversation).filter((member) => member?.id !== user?.user_id);
  const isFull = participants.length >= MAX_GROUP_MEMBERS;

  useEffect(() => {
    if (!initialNicknameUsername) closeRef.current?.focus();
  }, [initialNicknameUsername]);

  const saveName = async (event) => {
    event.preventDefault();
    setBusy("rename");
    try {
      await renameGroup(conversation.id, name.trim());
      setRenaming(false);
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't rename the group."));
    } finally {
      setBusy("");
    }
  };

  const remove = async (username, isMe) => {
    setBusy(username);
    try {
      await removeGroupMember(conversation.id, username);
      if (isMe) {
        toast.success(`You left ${conversationTitle(conversation)}.`);
        onLeft?.();
        return;
      }
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, isMe ? "Couldn't leave the group." : "Couldn't remove them."));
    } finally {
      setBusy("");
    }
  };

  const saveNickname = async (event) => {
    event.preventDefault();
    if (!editingNickname) return;
    setBusy(`nickname:${editingNickname}`);
    try {
      await setGroupMemberNickname(conversation.id, editingNickname, nicknameDraft.trim());
      setEditingNickname(null);
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't save the nickname."));
    } finally {
      setBusy("");
    }
  };

  if (showPicker) {
    return (
      <GroupPeoplePicker
        mode="add"
        conversation={conversation}
        onClose={() => setShowPicker(false)}
        onDone={() => {
          setShowPicker(false);
          toast.success("Invites sent. They'll join when they accept.");
          onChanged?.();
        }}
      />
    );
  }

  return (
    <div className="cv-confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section
        className="cv-confirm cv-group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-group-panel-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose?.();
          }
        }}
      >
        <div className="cv-group-dialog-head">
          <span className="sr-only" id="cv-group-panel-title">Group details</span>
          <span />
          <button ref={closeRef} type="button" className="cv-icon-button is-plain" onClick={onClose} aria-label="Close">
            <CloseRoundedIcon />
          </button>
        </div>

        <div className="cv-group-hero">
          <GroupAvatar members={others} size={72} />
          {renaming ? (
            <form className="cv-group-rename" onSubmit={saveName}>
              <input
                type="text"
                value={name}
                maxLength={GROUP_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder={conversation.display_name || "Group name"}
                aria-label="Group name"
                autoFocus
              />
              <button type="submit" className="cv-pill-button is-primary" disabled={busy === "rename"}>
                Save
              </button>
              <button type="button" className="cv-pill-button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <h2 className="cv-group-title">
              {conversationTitle(conversation)}
              {isOwner && (
                <button
                  type="button"
                  className="cv-icon-button is-plain"
                  onClick={() => setRenaming(true)}
                  aria-label="Rename group"
                  title="Rename"
                >
                  <EditRoundedIcon />
                </button>
              )}
            </h2>
          )}
          <p className="cv-group-subtitle">
            {groupMembers(conversation).length} members
            {participants.length > groupMembers(conversation).length
              ? ` · ${participants.length - groupMembers(conversation).length} invited`
              : ""}
          </p>
        </div>

        <ul className="cv-group-people is-members" aria-label="Members">
          {participants.map((participant) => {
            const member = participant.user || {};
            const isMe = member.id === user?.user_id;
            const isPending = participant.status === "pending";
            return (
              <li key={member.id || member.username} className="cv-group-member">
                {editingNickname === member.username ? (
                  <form className="cv-group-nickname-form" onSubmit={saveNickname}>
                    <input value={nicknameDraft} maxLength={40} onChange={(event) => setNicknameDraft(event.target.value)}
                      aria-label={`Nickname for ${member.username}`} placeholder={member.username} autoFocus />
                    <div className="cv-group-nickname-actions">
                      <button type="button" className="cv-group-nickname-cancel" onClick={() => setEditingNickname(null)}>Cancel</button>
                      <button type="submit" className="cv-group-nickname-save" disabled={busy === `nickname:${member.username}`}>Save</button>
                    </div>
                  </form>
                ) : <Link to={`/people/${encodeURIComponent(member.username || "")}`} className="cv-group-member-link">
                  <ChatAvatar name={member.username} imagePath={member.profile_image_url} size={40} />
                  <span className="cv-group-person-name">
                    {participant.nickname || member.username}
                    {isMe && <span className="cv-group-you"> (you)</span>}
                    {participant.nickname && <small className="cv-group-username">@{member.username}</small>}
                  </span>
                </Link>}
                {!isPending && editingNickname !== member.username && (
                  <button type="button" className="cv-icon-button is-plain" aria-label={`Edit nickname for ${member.username}`}
                    onClick={() => { setEditingNickname(member.username); setNicknameDraft(participant.nickname || ""); }}>
                    <EditRoundedIcon />
                  </button>
                )}
                {editingNickname !== member.username && participant.role === "owner" && <span className="cv-group-tag is-owner">Owner</span>}
                {editingNickname !== member.username && isPending && <span className="cv-group-tag">Invited</span>}
                {editingNickname !== member.username && isOwner && !isMe && (
                  <button
                    type="button"
                    className="cv-icon-button is-plain cv-group-remove"
                    onClick={() => remove(member.username, false)}
                    disabled={busy === member.username}
                    aria-label={isPending ? `Cancel ${member.username}'s invite` : `Remove ${member.username}`}
                    title={isPending ? "Cancel invite" : "Remove"}
                  >
                    <CloseRoundedIcon />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {confirmLeave ? (
          <div className="cv-group-leave-confirm" role="alert">
            <p>
              Leave <strong>{conversationTitle(conversation)}</strong>? You won't see new messages unless
              someone invites you again.
              {isOwner && others.length > 0 ? " Ownership passes to the longest-standing member." : ""}
            </p>
            <div className="cv-confirm-actions">
              <button type="button" className="cv-pill-button" onClick={() => setConfirmLeave(false)} autoFocus>
                Stay
              </button>
              <button
                type="button"
                className="cv-pill-button is-danger"
                onClick={() => remove(user?.username, true)}
                disabled={busy === user?.username}
              >
                Leave group
              </button>
            </div>
          </div>
        ) : (
          <div className="cv-group-panel-actions">
            <button
              type="button"
              className="cv-pill-button"
              onClick={() => setShowPicker(true)}
              disabled={isFull}
              title={isFull ? `Groups can have up to ${MAX_GROUP_MEMBERS} people` : undefined}
            >
              <PersonAddAlt1RoundedIcon aria-hidden="true" />
              Add people
            </button>
            <button type="button" className="cv-pill-button is-danger-outline" onClick={() => setConfirmLeave(true)}>
              <LogoutRoundedIcon aria-hidden="true" />
              Leave group
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
