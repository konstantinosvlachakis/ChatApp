export const conversations = [
  {
    id: 1,
    name: "John Doe",
    lastMessage: "Hey! How are you?",
    timestamp: "10:45 AM",
    profilePicture: "https://randomuser.me/api/portraits/men/1.jpg",
    unreadCount: 2,
    messages: [
      { text: "Hey!", isSentByUser: true },
      { text: "How are you?", isSentByUser: true },
      { text: "I'm good, how about you?", isSentByUser: false },
    ],
  },
  {
    id: 2,
    name: "Jane Smith",
    lastMessage: "See you later!",
    timestamp: "Yesterday",
    profilePicture: "https://randomuser.me/api/portraits/women/2.jpg",
    unreadCount: 3,
    messages: [
      { text: "Hey Jane!", isSentByUser: true },
      { text: "Hi there!", isSentByUser: false },
      { text: "See you later!", isSentByUser: false },
    ],
  },
];
