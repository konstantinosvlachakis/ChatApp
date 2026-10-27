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
import ChatAvatar from "./ChatAvatar";
import { formatListTime, getOtherParticipant } from "../utils/conversationSearch";

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
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { onlineUserIds } = usePresence();
  const otherUser = getOtherParticipant(conversation, user?.username) || {};
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
      </div>
    </header>
  );
};

export default ChatHeader;
