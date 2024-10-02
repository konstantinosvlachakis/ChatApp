import React, { useState } from "react";
// import SendMessage from "../features/SendMessage"; // Ensure this matches the file casing
import { v4 as uuidv4 } from "uuid";

const MessageContainer = () => {
  const [messages, setMessages] = useState([]);
  const [clientId] = useState(uuidv4());

  const handleSendMessage = (message, type) => {
    setMessages((prevMessages) => [...prevMessages, { message, type }]);
  };

  return (
    <div className="relative w-full h-screen bg-cover bg-center bg-slate-500">
      <div className="absolute inset-0 bg-white bg-opacity-10 backdrop-blur-lg border border-white border-opacity-30 rounded-lg transition-transform transform-gpu  w-[400px] aspect-[13/16] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="header flex items-center p-5 text-white">
          <i className="fas fa-arrow-left cursor-pointer"></i>
          <div className="notifications bg-green-500 rounded-full aspect-square w-6 flex justify-center items-center ml-2 cursor-pointer transition-transform duration-200 hover:scale-125"></div>
          <div className="center flex justify-center text-center w-full">
            <div className="flex items-center">
              <img
                className="pfp w-10 rounded-full cursor-pointer transition-transform duration-1000 animate-hover"
                src="https://cdn.pixabay.com/photo/2014/11/30/14/11/cat-551554_960_720.jpg"
                alt="Profile"
              />
              <p
                id="pfpname"
                className="ml-2 font-bold transition-letter-spacing duration-300 hover:tracking-wider"
              >
                Constantinos
              </p>
            </div>
          </div>
        </div>

        <div className="content p-5 overflow-auto text-center text-gray-400 h-[calc(100%-100px)]">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`msg-btn-holder mb-4 ${
                msg.type === "received" ? "text-left" : "text-right"
              }`}
            >
              <div
                className={`msg-btn p-2 rounded-full inline-block max-w-full text-white ${
                  msg.type === "received" ? "bg-gray-700" : "bg-blue-400"
                }`}
              >
                <p>{msg.message}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="footer absolute bottom-0 w-full">
          {/* <SendMessage onSendMessage={handleSendMessage} clientId={clientId} /> */}
        </div>
      </div>
    </div>
  );
};

export default MessageContainer;
