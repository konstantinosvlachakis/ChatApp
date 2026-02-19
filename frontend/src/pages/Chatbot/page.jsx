import React, { useMemo, useState } from "react";

const TUTOR_DATA = {
  Spanish: {
    nativeName: "Espanol",
    basics: [
      { native: "Hello", target: "Hola", pronunciation: "OH-lah" },
      { native: "How are you?", target: "Como estas?", pronunciation: "KOH-moh ehs-TAHS" },
      { native: "My name is...", target: "Me llamo...", pronunciation: "meh YAH-moh" },
      { native: "Thank you", target: "Gracias", pronunciation: "GRAH-syahs" },
      { native: "Please", target: "Por favor", pronunciation: "por fah-BOR" },
    ],
  },
  French: {
    nativeName: "Francais",
    basics: [
      { native: "Hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" },
      { native: "How are you?", target: "Comment ca va ?", pronunciation: "koh-mahn sah vah" },
      { native: "My name is...", target: "Je m'appelle...", pronunciation: "zhuh mah-PELL" },
      { native: "Thank you", target: "Merci", pronunciation: "mehr-SEE" },
      { native: "Please", target: "S'il vous plait", pronunciation: "seel voo PLEH" },
    ],
  },
  German: {
    nativeName: "Deutsch",
    basics: [
      { native: "Hello", target: "Hallo", pronunciation: "HAH-loh" },
      { native: "How are you?", target: "Wie geht's?", pronunciation: "vee GAYTS" },
      { native: "My name is...", target: "Ich heisse...", pronunciation: "ikh HAI-suh" },
      { native: "Thank you", target: "Danke", pronunciation: "DAHN-kuh" },
      { native: "Please", target: "Bitte", pronunciation: "BIT-uh" },
    ],
  },
  Italian: {
    nativeName: "Italiano",
    basics: [
      { native: "Hello", target: "Ciao", pronunciation: "chow" },
      { native: "How are you?", target: "Come stai?", pronunciation: "KOH-meh stai" },
      { native: "My name is...", target: "Mi chiamo...", pronunciation: "mee kee-AH-moh" },
      { native: "Thank you", target: "Grazie", pronunciation: "GRAHT-see-eh" },
      { native: "Please", target: "Per favore", pronunciation: "pehr fah-VOH-reh" },
    ],
  },
};

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9? ]/g, "")
    .trim();

const ChatbotPage = () => {
  const languages = useMemo(() => Object.keys(TUTOR_DATA), []);
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I am your language tutor chatbot. Pick a language and click 'Start basics'.",
    },
  ]);
  const [activeQuiz, setActiveQuiz] = useState(null);

  const pushMessage = (role, text) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const startBasics = () => {
    const lesson = TUTOR_DATA[selectedLanguage];
    setActiveQuiz(null);
    setMessages([
      {
        role: "bot",
        text: `Great choice. We will learn ${selectedLanguage} (${lesson.nativeName}) basics.`,
      },
      ...lesson.basics.map((item) => ({
        role: "bot",
        text: `${item.native} -> ${item.target} (${item.pronunciation})`,
      })),
      {
        role: "bot",
        text: "Type 'quiz' to practice, 'lesson' to repeat the basics, or 'help' for commands.",
      },
    ]);
  };

  const handleUserMessage = () => {
    const raw = message.trim();
    if (!raw) return;

    pushMessage("user", raw);
    setMessage("");

    const lesson = TUTOR_DATA[selectedLanguage];
    const lower = normalize(raw);

    if (activeQuiz) {
      const isCorrect = normalize(raw) === normalize(activeQuiz.answer);
      if (isCorrect) {
        pushMessage("bot", `Correct. "${activeQuiz.answer}" is right.`);
      } else {
        pushMessage("bot", `Not quite. Correct answer: "${activeQuiz.answer}".`);
      }
      setActiveQuiz(null);
      pushMessage("bot", "Type 'quiz' for another one.");
      return;
    }

    if (lower === "help") {
      pushMessage(
        "bot",
        "Commands: 'lesson' to repeat basics, 'quiz' to test yourself, 'phrases' to list all beginner phrases."
      );
      return;
    }

    if (lower === "lesson" || lower === "phrases") {
      lesson.basics.forEach((item) => {
        pushMessage(
          "bot",
          `${item.native} -> ${item.target} (${item.pronunciation})`
        );
      });
      return;
    }

    if (lower === "quiz" || lower === "practice") {
      const random =
        lesson.basics[Math.floor(Math.random() * lesson.basics.length)];
      setActiveQuiz({ answer: random.target });
      pushMessage(
        "bot",
        `Quiz: How do you say "${random.native}" in ${selectedLanguage}?`
      );
      return;
    }

    const matchedPhrase = lesson.basics.find(
      (item) =>
        normalize(item.native) === lower || normalize(item.target) === lower
    );

    if (matchedPhrase) {
      pushMessage(
        "bot",
        `${matchedPhrase.native} -> ${matchedPhrase.target} (${matchedPhrase.pronunciation})`
      );
      return;
    }

    pushMessage(
      "bot",
      `I am focused on beginner ${selectedLanguage}. Try 'lesson' or 'quiz'.`
    );
  };

  return (
    <div className="h-[calc(100vh-128px)] bg-gray-50 flex flex-col">
      <div className="p-4 border-b bg-white flex flex-wrap gap-3 items-center justify-between">
        <h2 className="font-semibold text-lg">Language Tutor Chatbot</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startBasics}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Start basics
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}`}
            className={`max-w-[80%] px-4 py-2 rounded-xl ${
              msg.role === "user"
                ? "bg-blue-600 text-white ml-auto"
                : "bg-white text-gray-800 border"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <div className="border-t bg-white p-3 flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUserMessage();
          }}
          className="flex-1 border rounded-md px-3 py-2"
          placeholder="Type your message..."
        />
        <button
          type="button"
          onClick={handleUserMessage}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatbotPage;
