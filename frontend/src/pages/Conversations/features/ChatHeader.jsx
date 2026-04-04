import { BASE_URL_IMG } from "../../../constants/constants";
import { usePresence } from "../../../context/PresenceContext";
import { useUser } from "../../../context/UserContext";
import { useNavigate } from "react-router-dom";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";

const DEFAULT_AVATAR = `${BASE_URL_IMG}/media/profile_images/MainAfter.jpg`;

const resolveAvatarUrl = (path) => {
  if (!path) return DEFAULT_AVATAR;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${BASE_URL_IMG}${path}`;
  if (path.startsWith("media/")) return `${BASE_URL_IMG}/${path}`;
  return `${BASE_URL_IMG}/media/${path}`;
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
  const otherUser =
    conversation.sender?.username === user?.username
      ? conversation.receiver
      : conversation.sender;
  const normalizedImageSrc = resolveAvatarUrl(otherUser?.profile_image_url);
  const isInCallFlow = callState !== "idle";
  const isOtherUserOnline = Boolean(
    otherUser?.is_virtual_online || (otherUser?.id && onlineUserIds?.has(otherUser.id))
  );

  return (
    <div className="mx-2 mt-2 flex items-center gap-3 rounded-[1.35rem] border border-slate-200/80 bg-white/92 px-3 py-2 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.38)] backdrop-blur sm:mx-4 sm:gap-4 sm:px-5 sm:py-2.5">
      <button
        type="button"
        className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 md:hidden"
        onClick={() => navigate("/conversations")}
        aria-label="Back to conversations"
      >
        ←
      </button>
      <img
        src={normalizedImageSrc}
        alt={otherUser.username}
        className="h-10 w-10 cursor-pointer rounded-full border border-white object-cover shadow-[0_8px_18px_-10px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 sm:h-11 sm:w-11"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = DEFAULT_AVATAR;
        }}
        onClick={() => navigate(`/people/${otherUser.username}`)}
      />
      <div className="min-w-0 flex-1">
        <h2
          className="flex items-center gap-2 truncate cursor-pointer text-[1.05rem] font-semibold leading-none text-slate-800 sm:text-[1.15rem]"
          onClick={() => navigate(`/people/${otherUser.username}`)}
        >
          {isOtherUserOnline && (
            <span
              className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
              aria-label="User online"
              title="Online"
            />
          )}
          {otherUser.username}
        </h2>
        <p className="pt-1 text-[11px] font-medium tracking-[0.02em] text-slate-400 sm:text-xs">
          {isOtherUserOnline
            ? "Online now"
            : socketStatus === "reconnecting"
              ? "Reconnecting chat..."
              : "Conversation"}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isSearchOpen ? (
          <div className="flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50/90 px-2 py-1.5 shadow-inner shadow-white/70">
            <SearchRoundedIcon sx={{ fontSize: 17 }} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearchSubmit?.();
                }
              }}
              placeholder="Search"
              className="w-24 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 sm:w-36"
              autoFocus
            />
            <span className="min-w-[3rem] text-center text-[11px] font-medium text-slate-400">
              {isSearchingMessages ? "..." : searchResultLabel}
            </span>
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600 disabled:opacity-40"
              onClick={onSearchPrevious}
              disabled={!searchHasResults}
              aria-label="Previous result"
            >
              <KeyboardArrowUpRoundedIcon sx={{ fontSize: 18 }} />
            </button>
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600 disabled:opacity-40"
              onClick={onSearchNext}
              disabled={!searchHasResults}
              aria-label="Next result"
            >
              <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
            </button>
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
              onClick={onCloseSearch}
              aria-label="Close search"
            >
              <CloseRoundedIcon sx={{ fontSize: 17 }} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onToggleSearch}
            disabled={searchDisabled}
            aria-label="Search conversation"
            title="Search"
          >
            <SearchRoundedIcon sx={{ fontSize: 18 }} />
          </button>
        )}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onStartAudioCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start audio call"
          title="Audio call"
        >
          <CallRoundedIcon sx={{ fontSize: 18 }} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onStartVideoCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start video call"
          title="Video call"
        >
          <VideocamRoundedIcon sx={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
