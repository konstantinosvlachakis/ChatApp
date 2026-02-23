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
    <div className="flex items-center border-b bg-white px-3 py-3 sm:px-4">
      <button
        type="button"
        className="mr-2 rounded-full p-1 text-gray-500 hover:bg-gray-100 md:hidden"
        onClick={() => navigate("/conversations")}
        aria-label="Back to conversations"
      >
        ←
      </button>
      <img
        src={normalizedImageSrc}
        alt={otherUser.username}
        className="mr-3 h-9 w-9 cursor-pointer rounded-full object-cover sm:h-10 sm:w-10"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = DEFAULT_AVATAR;
        }}
        onClick={() => navigate(`/people/${otherUser.username}`)}
      />
      <h2
        className="truncate text-base font-semibold cursor-pointer sm:text-lg"
        onClick={() => navigate(`/people/${otherUser.username}`)}
      >
        {otherUser.username}
      </h2>
    </div>
  );
};

export default ChatHeader;
