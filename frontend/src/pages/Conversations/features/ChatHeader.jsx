import { BASE_URL_IMG } from "../../../constants/constants";
import { useUser } from "../../../context/UserContext";
import { useNavigate } from "react-router-dom";

const ChatHeader = ({ conversation }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const otherUser =
    conversation.sender?.username === user?.username
      ? conversation.receiver
      : conversation.sender;
  return (
    <div className="p-4 border-b bg-white flex items-center">
      <img
        src={BASE_URL_IMG + '/media/' + otherUser.profile_image_url}
        alt={otherUser.username}
        className="w-10 h-10 rounded-full mr-3 cursor-pointer"
        onClick={() => navigate(`/people/${otherUser.username}`)}
      />
      <h2
        className="font-semibold text-lg cursor-pointer"
        onClick={() => navigate(`/people/${otherUser.username}`)}
      >
        {otherUser.username}
      </h2>
    </div>
  );
};

export default ChatHeader;
