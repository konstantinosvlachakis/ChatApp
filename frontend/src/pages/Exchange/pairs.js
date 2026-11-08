// Language-pair pages (/exchange/<slug>, ExchangePairPage.jsx): titles, headings and
// FAQs. In the main bundle (seo/config.js, footers, home cards); the body copy is in
// pairDetails.js, loaded with the page. Plain strings only: seo/config.js builds the
// FAQPage JSON-LD from the same `faq` entries the page renders, so they always match.
// Keep claims modest: no user counts, ratings or testimonials, nothing the app can't do.
import { EXCHANGE_PAIR_SLUGS, exchangePairPath } from "./pairSlugs";

const PAIRS = {
  "english-spanish": {
    slug: "english-spanish",
    // [first, second] as they appear in the slug.
    languages: ["english", "spanish"],
    label: "English–Spanish",
    seoTitle: "English–Spanish Language Exchange with Native Speakers",
    seoDescription:
      "Practise Spanish with native speakers who want to learn English, or the other way round. Free partner matching, guided 10–30 minute exchanges and corrections.",
    heading: "Practise Spanish with native speakers who want to learn English",
    faq: [
      {
        question: "Is the English–Spanish exchange free?",
        answer:
          "Yes. Creating an account, finding English or Spanish partners, chatting and running guided exchanges are free on LangVoyage.",
      },
      {
        question: "How does LangVoyage find me a Spanish or English partner?",
        answer:
          "When you sign up you choose the language you speak and the one you're practising. People then shows a Perfect exchanges row with members who speak your target language natively and are learning yours. You decide who to message; nobody is assigned to you.",
      },
      {
        question: "I'm a beginner in Spanish. Is that OK?",
        answer:
          "Yes. You set your level when you sign up, and guided sessions suggest topics for the lower of the two levels, so simple subjects like food or your day come first. Plenty of exchanges start with short messages long before anyone calls.",
      },
      {
        question: "What about time zones between Spain, Latin America and English-speaking countries?",
        answer:
          "You don't need to be online together. Text and voice notes work whenever each of you has time, so a partner in Mexico City and one in London can simply reply when it suits them, then plan a guided session for a time when your days overlap.",
      },
      {
        question: "What if a partner makes me uncomfortable?",
        answer:
          "You can block or report any member. Blocking hides you from each other in People, and you can review the people you've blocked in Settings.",
      },
    ],
  },

  "greek-spanish": {
    slug: "greek-spanish",
    languages: ["greek", "spanish"],
    label: "Greek–Spanish",
    seoTitle: "Greek–Spanish Language Exchange with Native Speakers",
    seoDescription:
      "Practise Greek with native speakers who want to learn Spanish, or Spanish with Greek speakers. Free matching, guided 10–30 minute exchanges, corrections and a phrasebook.",
    heading: "Practise Greek with native speakers who want to learn Spanish",
    faq: [
      {
        question: "Do I need to read the Greek alphabet before I start?",
        answer:
          "No. Many Spanish speakers start by writing in Spanish and adding Greek words as they learn the letters. Your partner can send voice notes so you hear each word while you get used to reading it.",
      },
      {
        question: "How does matching work for Greek and Spanish?",
        answer:
          "Set Spanish as the language you speak and Greek as the one you're practising, or the reverse. People shows members whose languages mirror yours in its Perfect exchanges row, and you decide who to message.",
      },
      {
        question: "Is LangVoyage free for Greek–Spanish exchanges?",
        answer:
          "Yes. Signing up, finding Greek or Spanish partners, chatting and guided exchanges are free.",
      },
      {
        question: "Greece is ahead of Spain and far ahead of Latin America. How do we find time to talk?",
        answer:
          "Greece is one hour ahead of Spain and roughly five to nine hours ahead of most of Latin America, depending on the country and the season. Text and voice notes don't need you online at the same time, so keep guided sessions for when your days overlap.",
      },
      {
        question: "Can I stop a conversation that isn't working?",
        answer:
          "Yes. You can block or report any member. Blocking hides you from each other in People, and your blocks are listed in Settings, where you can undo them.",
      },
    ],
  },

  "italian-english": {
    slug: "italian-english",
    languages: ["italian", "english"],
    label: "Italian–English",
    seoTitle: "Italian–English Language Exchange with Native Speakers",
    seoDescription:
      "Practise Italian with native speakers who want to learn English, or English with Italian speakers. Free matching, guided 10–30 minute exchanges, corrections and a phrasebook.",
    heading: "Practise Italian with native speakers who want to learn English",
    faq: [
      {
        question: "Is LangVoyage free for Italian–English exchanges?",
        answer:
          "Yes. Creating an account, finding Italian or English partners, chatting and guided exchanges are free.",
      },
      {
        question: "How do I find an Italian speaker who wants to learn English?",
        answer:
          "Choose English as the language you speak and Italian as the one you're practising. People shows members who speak Italian natively and are learning English in its Perfect exchanges row; you pick who to message.",
      },
      {
        question: "My Italian is basic. Will a native speaker want to talk to me?",
        answer:
          "Your partner is learning English, so they are in the same position as you. Guided sessions suggest topics for the lower of your two levels, and you can write slowly in text before trying a call.",
      },
      {
        question: "Italy is an hour ahead of the UK and six hours ahead of New York. Does that matter?",
        answer:
          "Not much. Messages and voice notes don't need you online at the same time, so you can reply when it suits you and arrange a guided session for a time that works for both.",
      },
      {
        question: "How do corrections work?",
        answer:
          "Your partner can suggest a correction on any of your messages. It appears under the message with the changed words marked, and you can save it to your phrasebook for spaced review.",
      },
      {
        question: "What can I do if someone is rude?",
        answer:
          "Block or report them. Blocking hides you from each other in People, and you can review your blocks in Settings.",
      },
    ],
  },
};

export const EXCHANGE_PAIRS = EXCHANGE_PAIR_SLUGS.map((slug) => ({ ...PAIRS[slug], path: exchangePairPath(slug) }));

/** The pair for a URL slug, or null. */
export const getExchangePair = (slug) => EXCHANGE_PAIRS.find((pair) => pair.slug === slug) || null;

/** `/register?speak=<native>&learn=<practice>` (RegisterPage prefills steps 1 and 2). */
export const registerPath = ({ speak, learn }) =>
  `/register?${new URLSearchParams({ speak, learn }).toString()}`;
