import React, { useState } from "react";
import Sidebar from "../Sidebar";
import ChatWindow from "../ChatWindow";

function MainLayout() {
  const [selectedConversation, setSelectedConversation] = useState(null);

  function onSelectConversation(conversation) {
    console.log("Conversation clicked:", conversation);

    setSelectedConversation(conversation);
  }

  return (
    <div className="flex h-screen">
      <Sidebar onSelectConversation={onSelectConversation} />
      <ChatWindow conversation={selectedConversation} />
    </div>
  );
}

export default MainLayout;
