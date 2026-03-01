import { BASE_URL_IMG } from "../../../constants/constants";
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

const ChatHeader = ({ conversation }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const otherUser =
    conversation.sender?.username === user?.username
      ? conversation.receiver
      : conversation.sender;
  const normalizedImageSrc = resolveAvatarUrl(otherUser?.profile_image_url);
  return (
    <div className="mx-2 mt-2 flex items-center rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur sm:mx-4 sm:px-4">
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
          className="truncate cursor-pointer text-base font-semibold text-slate-800 sm:text-lg"
          onClick={() => navigate(`/people/${otherUser.username}`)}
        >
          {otherUser.username}
        </h2>
        <p className="text-xs font-medium text-slate-400">Conversation</p>
      </div>
    </div>
  );
};

export default ChatHeader;
