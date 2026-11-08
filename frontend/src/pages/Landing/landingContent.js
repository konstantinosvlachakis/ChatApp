// Copy for the home page sections (AuthLandingPage; /how-it-works copy is in
// howItWorksContent.js so it stays in that page's lazy chunk).
// Plain strings: seo/config.js builds the home FAQPage JSON-LD from HOME_FAQ, so the
// structured data always matches the visible questions and answers.
import { LANGUAGE_KEYS, titleCase } from "../../constants/languages";

const languageList = (() => {
  const names = LANGUAGE_KEYS.map(titleCase);
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
})();

export const HOME_STEPS = [
  {
    title: "Choose your two languages",
    text: "Tell us the language you speak and the one you want to practise, plus your level. Sign-up takes three short steps.",
  },
  {
    title: "Meet a mirrored partner",
    text: "People shows members who speak the language you're learning and want to learn yours, so both of you get something out of every chat.",
  },
  {
    title: "Talk, swap and improve",
    text: "Chat, send voice notes or call, then try a guided 10, 20 or 30 minute exchange that switches language halfway.",
  },
];

export const HOME_FEATURES = [
  {
    icon: "match",
    title: "Reciprocal matching",
    text: "Perfect exchanges are people who speak your target language natively and are learning yours.",
  },
  {
    icon: "chat",
    title: "Chat, voice notes and calls",
    text: "One-to-one chat with photos, voice notes and audio or video calls when you're ready to speak.",
  },
  {
    icon: "timer",
    title: "Guided exchanges",
    text: "Timed sessions split evenly between both languages, with topic ideas for your level and an end card.",
  },
  {
    icon: "correct",
    title: "Corrections and a phrasebook",
    text: "Partners correct messages word by word; save phrases and review them with spaced repetition.",
  },
  {
    icon: "lumi",
    title: "Lumi, a practice companion",
    text: "An AI conversation partner for casual chat, role-play, quizzes or vocabulary drills between exchanges.",
  },
  {
    icon: "practice",
    title: "Daily practice",
    text: "Short daily drills and a voice repeat exercise on the Practice page, with points as you go.",
  },
];

export const HOME_FAQ = [
  {
    question: "What is a language exchange?",
    answer:
      "Two people who want to learn each other's language help each other: you practise their language, they practise yours. LangVoyage finds people whose languages mirror yours and gives you tools to keep the exchange fair and useful.",
  },
  {
    question: "Is LangVoyage free?",
    answer:
      "Yes. Creating an account, finding partners, chatting and guided exchanges are free.",
  },
  {
    question: "Which languages can I practise?",
    answer: `You can choose from ${languageList}. Matching works for any combination of the language you speak and the one you're learning.`,
  },
  {
    question: "Do I need to be good at the language already?",
    answer:
      "No. You pick your level when you sign up, and guided sessions suggest topics for the lower of the two partners' levels, so beginners can start with simple subjects such as food or their day.",
  },
  {
    question: "Can I block or report someone?",
    answer:
      "Yes. You can block or report any member. Blocking hides you from each other in People, and you can review your blocks in Settings.",
  },
];
