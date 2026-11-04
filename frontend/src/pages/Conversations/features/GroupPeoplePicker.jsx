import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "react-query";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { useUser } from "../../../context/UserContext";
import { getErrorMessage } from "../../../lib/api";
import { useGetConversations } from "../api/getConversations";
import {
  GROUP_NAME_MAX_LENGTH,
  MAX_GROUP_MEMBERS,
  createGroup,
  getFollowingProfiles,
  inviteToGroup,
} from "../api/groups";
import { getOtherParticipant } from "../utils/conversationSearch";
import ChatAvatar from "./ChatAvatar";

const normalize = (value) => String(value || "").toLowerCase().trim();

/**
 * Pick people for a group: "create" makes a new group (optional name), "add" invites more
 * people to ``conversation``. Candidates are the people you follow and your direct-chat
 * partners (the API only accepts those). Invitees join when they accept.
 */
export default function GroupPeoplePicker({ mode = "create", conversation = null, preselected = [], onClose, onDone }) {
  const { user } = useUser();
  const { data: conversations = [] } = useGetConversations();
  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ["followingForGroups"],
    queryFn: getFollowingProfiles,
    staleTime: 60 * 1000,
    useErrorBoundary: false,
  });
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(() => preselected.filter(Boolean));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  const takenUsernames = useMemo(
    () => new Set((conversation?.participants || []).map((participant) => normalize(participant.user?.username))),
    [conversation]
  );
  const capacity =
    mode === "create" ? MAX_GROUP_MEMBERS - 1 : MAX_GROUP_MEMBERS - (conversation?.participants || []).length;

  const candidates = useMemo(() => {
    const byName = new Map();
    const add = (profile) => {
      const key = normalize(profile?.username);
      if (!key || key === normalize(user?.username) || takenUsernames.has(key) || byName.has(key)) return;
      byName.set(key, profile);
    };
    conversations.forEach((item) => add(getOtherParticipant(item, user?.username)));
    following.forEach(add);
    return Array.from(byName.values());
  }, [conversations, following, takenUsernames, user?.username]);

  const visible = candidates.filter((profile) => normalize(profile.username).includes(normalize(query)));
  const selectedSet = new Set(selected.map(normalize));
  const isFull = selected.length >= capacity;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const toggle = (username) => {
    setError("");
    setSelected((current) =>
      current.some((item) => normalize(item) === normalize(username))
        ? current.filter((item) => normalize(item) !== normalize(username))
        : current.length >= capacity
          ? current
          : [...current, username]
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selected.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "create"
          ? await createGroup(selected, name.trim())
          : await inviteToGroup(conversation.id, selected);
      onDone?.(result);
    } catch (err) {
      setError(getErrorMessage(err, mode === "create" ? "Couldn't create the group." : "Couldn't send the invites."));
      setBusy(false);
    }
  };

  const title = mode === "create" ? "New group chat" : "Add people";
  return (
    <div className="cv-confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <form
        className="cv-confirm cv-group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-group-picker-title"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose?.();
          }
        }}
      >
        <div className="cv-group-dialog-head">
          <h2 id="cv-group-picker-title">{title}</h2>
          <button type="button" className="cv-icon-button is-plain" onClick={onClose} aria-label="Close">
            <CloseRoundedIcon />
          </button>
        </div>
        <p className="cv-group-dialog-hint">
          {mode === "create"
            ? "Practise together with up to 7 people you follow or chat with. They join when they accept."
            : `Invite people you follow or chat with. ${Math.max(capacity, 0)} ${capacity === 1 ? "place" : "places"} left.`}
        </p>

        {mode === "create" && (
          <label className="cv-group-field">
            <span>Group name <small>(optional)</small></span>
            <input
              type="text"
              value={name}
              maxLength={GROUP_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Greek Tuesdays"
            />
          </label>
        )}

        {selected.length > 0 && (
          <ul className="cv-group-chips" aria-label="Selected people">
            {selected.map((username) => (
              <li key={username}>
                <button type="button" onClick={() => toggle(username)} aria-label={`Remove ${username}`}>
                  {username}
                  <CloseRoundedIcon aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="cv-search cv-group-search" role="search">
          <SearchRoundedIcon aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            aria-label="Search people to add"
          />
        </div>

        <ul className="cv-group-people" aria-label="People you can add">
          {visible.map((profile) => {
            const isSelected = selectedSet.has(normalize(profile.username));
            const disabled = !isSelected && isFull;
            return (
              <li key={profile.username}>
                <button
                  type="button"
                  className={`cv-group-person ${isSelected ? "is-selected" : ""}`}
                  onClick={() => toggle(profile.username)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                >
                  <ChatAvatar name={profile.username} imagePath={profile.profile_image_url} size={40} />
                  <span className="cv-group-person-name">{profile.username}</span>
                  <span className="cv-group-check" aria-hidden="true">
                    {isSelected && <CheckRoundedIcon />}
                  </span>
                </button>
              </li>
            );
          })}
          {!visible.length && (
            <li className="cv-group-empty">
              {loadingFollowing
                ? "Loading people…"
                : candidates.length
                  ? `No one matches “${query.trim()}”.`
                  : "Follow people or start a chat first, then add them here."}
            </li>
          )}
        </ul>

        {error && (
          <p className="cv-group-error" role="alert">
            {error}
          </p>
        )}

        <div className="cv-confirm-actions">
          <button type="button" className="cv-pill-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cv-pill-button is-primary" disabled={!selected.length || busy}>
            {busy
              ? mode === "create" ? "Creating…" : "Inviting…"
              : mode === "create"
                ? `Create group${selected.length ? ` (${selected.length + 1})` : ""}`
                : `Invite${selected.length ? ` ${selected.length}` : ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}
