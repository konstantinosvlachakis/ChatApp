import { BASE_URL_IMG } from "../../../constants/constants";
import { usePresence } from "../../../context/PresenceContext";
import { useUser } from "../../../context/UserContext";
import { useNavigate } from "react-router-dom";

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
    <div className="mx-2 mt-2 flex items-center rounded-2xl border border-slate-200/80 bg-white/90 px-2.5 py-2.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur sm:mx-4 sm:px-4 sm:py-3">
      <button
        type="button"
        className="mr-2 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 md:hidden"
        onClick={() => navigate("/conversations")}
        aria-label="Back to conversations"
      >
        ←
      </button>
      <img
        src={normalizedImageSrc}
        alt={otherUser.username}
        className="mr-3 h-10 w-10 cursor-pointer rounded-full border border-slate-200 object-cover shadow-sm sm:h-11 sm:w-11"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = DEFAULT_AVATAR;
        }}
        onClick={() => navigate(`/people/${otherUser.username}`)}
      />
      <div className="min-w-0">
        <h2
          className="flex items-center gap-2 truncate cursor-pointer text-base font-semibold text-slate-800 sm:text-lg"
          onClick={() => navigate(`/people/${otherUser.username}`)}
        >
          {isOtherUserOnline && (
            <span
              className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500"
              aria-label="User online"
              title="Online"
            />
          )}
          {otherUser.username}
        </h2>
        <p className="pt-0.5 text-xs font-medium text-slate-400">
          {isOtherUserOnline
            ? "Online now"
            : socketStatus === "reconnecting"
              ? "Reconnecting chat..."
              : "Conversation"}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-sm"
          onClick={onStartAudioCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start audio call"
          title="Audio call"
        >
          Call
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-sm"
          onClick={onStartVideoCall}
          disabled={callDisabled || isInCallFlow}
          aria-label="Start video call"
          title="Video call"
        >
          Video
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
