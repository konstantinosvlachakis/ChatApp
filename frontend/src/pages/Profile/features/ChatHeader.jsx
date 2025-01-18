import { useUser } from "../../../context/UserContext";

const ChatHeader = ({ conversation }) => {
  const { user } = useUser();
  const otherUser =
    conversation.sender?.username === user?.username
      ? conversation.receiver
      : conversation.sender;
  return (
    <div className="p-4 border-b bg-white flex items-center">
      <img
        src={"http://127.0.0.1:8000" + otherUser.profile_image_url}
        alt={otherUser.username}
        className="w-10 h-10 rounded-full mr-3"
      />
      <h2 className="font-semibold text-lg">{otherUser.username}</h2>
    </div>
  );
};

export default ChatHeader;
