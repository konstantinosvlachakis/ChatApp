const ChatHeader = ({ conversation }) => {
  return (
    <div className="p-4 border-b bg-white flex items-center">
      <img
        src={conversation.sender.profile_image_url}
        alt={conversation.sender.username}
        className="w-10 h-10 rounded-full mr-3"
      />
      <h2 className="font-semibold text-lg">{conversation.sender.username}</h2>
    </div>
  );
};

export default ChatHeader;
