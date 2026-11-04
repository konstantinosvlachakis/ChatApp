import { Link, useNavigate } from "react-router-dom";
import { usePresence } from "../../../context/PresenceContext";
import { useUser } from "../../../context/UserContext";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import ChatAvatar from "./ChatAvatar";
import GroupAvatar from "./GroupAvatar";
import {
  conversationTitle,
  formatListTime,
  getOtherParticipant,
  groupInvitees,
  groupMembers,
  isGroupConversation,
} from "../utils/conversationSearch";

const lastSeenLabel = (lastSeen) => {
  const label = formatListTime(lastSeen);
  if (!label) return "Offline";
  return label === "Yesterday" ? "Last seen yesterday" : `Last seen ${label}`;
};

const ChatHeader = ({
  conversation,
  onStartAudioCall,
  onStartVideoCall,
  callState = "idle",
  callDisabled = false,
  socketStatus = "connecting",
  isSearchOpen = false,
  searchQuery = "",
  onSearchQueryChange,
  onToggleSearch,
  onCloseSearch,
  onSearchSubmit,
  onSearchNext,
  onSearchPrevious,
  searchResultLabel = "",
  searchDisabled = false,
  searchHasResults = false,
  isSearchingMessages = false,
  onOpenGroup,
  onStartGroup,
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { onlineUserIds } = usePresence();
  const isGroup = isGroupConversation(conversation);
  const otherUser = getOtherParticipant(conversation, user?.username) || {};
  const groupOthers = isGroup
    ? groupMembers(conversation).filter((member) => member?.id !== user?.user_id)
    : [];
  const onlineInGroup = groupOthers.filter((member) => onlineUserIds?.has(member?.id)).length;
  const invitedCount = isGroup ? groupInvitees(conversation).length : 0;
  const groupStatus = [
    `${groupOthers.length + 1} members`,
    onlineInGroup ? `${onlineInGroup} online` : "",
    invitedCount ? `${invitedCount} invited` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const isInCallFlow = callState !== "idle";
  const isOtherUserOnline = Boolean(
    otherUser?.is_virtual_online || (otherUser?.id && onlineUserIds?.has(otherUser.id))
  );
  const profilePath = `/people/${encodeURIComponent(otherUser.username || "")}`;
  const statusText = isOtherUserOnline
    ? "Online now"
    : socketStatus === "reconnecting"
      ? "Reconnecting chat…"
      : lastSeenLabel(otherUser.last_seen);

  return (
    <header className={`cv-chat-header ${isSearchOpen ? "is-searching" : ""}`}>
      <button
        type="button"
        className="cv-icon-button is-plain cv-chat-back"
        onClick={() => navigate("/conversations")}
        aria-label="Back to conversations"
      >
        <ArrowBackRoundedIcon />
      </button>
      {isGroup ? (
        <button
          type="button"
          className="cv-chat-identity is-group"
          onClick={onOpenGroup}
          aria-label={`${conversationTitle(conversation)}: group details`}
        >
          <GroupAvatar members={groupOthers} size={48} />
          <span className="cv-chat-identity-text">
            <span className="cv-chat-name" style={{ display: "block" }}>{conversationTitle(conversation)}</span>
            <span className={`cv-chat-presence ${onlineInGroup ? "is-online" : ""}`}>
              {onlineInGroup > 0 && <span className="cv-presence-dot" aria-hidden="true" />}
              {groupStatus}
            </span>
          </span>
        </button>
      ) : (
        <Link to={profilePath} className="cv-chat-identity" aria-label={`View ${otherUser.username}'s profile`}>
          <ChatAvatar name={otherUser.username} imagePath={otherUser.profile_image_url} size={48} />
          <span className="cv-chat-identity-text">
            <span className="cv-chat-name" style={{ display: "block" }}>{otherUser.username}</span>
            <span className={`cv-chat-presence ${isOtherUserOnline ? "is-online" : ""}`}>
              {isOtherUserOnline && <span className="cv-presence-dot" aria-hidden="true" />}
              {statusText}
            </span>
          </span>
        </Link>
      )}
      <div className="cv-chat-actions" style={isSearchOpen ? { flex: 1, justifyContent: "flex-end" } : undefined}>
        {isSearchOpen ? (
          <div className="cv-chat-search" role="search">
            <SearchRoundedIcon aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearchSubmit?.();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  onCloseSearch?.();
                }
              }}
              placeholder="Search messages"
              aria-label="Search messages in this conversation"
              autoFocus
            />
            <span className="cv-chat-search-count" aria-live="polite">
              {isSearchingMessages ? "…" : searchResultLabel}
            </span>
            <button
              type="button"
              className="cv-icon-button"
              onClick={onSearchPrevious}
              disabled={!searchHasResults}
              aria-label="Previous result"
            >
              <KeyboardArrowUpRoundedIcon />
            </button>
            <button
              type="button"
              className="cv-icon-button"
              onClick={onSearchNext}
              disabled={!searchHasResults}
              aria-label="Next result"
            >
              <KeyboardArrowDownRoundedIcon />
            </button>
            <button
              type="button"
              className="cv-icon-button"
              onClick={onCloseSearch}
              aria-label="Close search"
            >
              <CloseRoundedIcon />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cv-icon-button"
            onClick={onToggleSearch}
            disabled={searchDisabled}
            aria-label="Search conversation"
            title="Search"
          >
            <SearchRoundedIcon />
          </button>
        )}
        {isGroup ? (
          <button
            type="button"
            className="cv-icon-button"
            onClick={onOpenGroup}
            aria-label="Group members"
            title="Members"
          >
            <GroupAddRoundedIcon />
          </button>
        ) : (
          <>
        {onStartGroup && (
          <button
            type="button"
            className="cv-icon-button"
            onClick={onStartGroup}
            aria-label={`Start a group with ${otherUser.username}`}
            title="Start a group"
          >
            <GroupAddRoundedIcon />
          </button>
        )}
        <button
          type="button"
          className="cv-icon-button cv-call-action"
          onClick={onStartAudioCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start audio call"
          title="Audio call"
        >
          <CallRoundedIcon />
        </button>
        <button
          type="button"
          className="cv-icon-button cv-call-action"
          onClick={onStartVideoCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start video call"
          title="Video call"
        >
          <VideocamRoundedIcon />
        </button>
          </>
        )}
      </div>
    </header>
  );
};

export default ChatHeader;
