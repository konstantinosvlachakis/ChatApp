// Body copy for the language-pair pages (ExchangePairPage.jsx, a lazy chunk). Titles,
// headings and FAQs live in pairs.js because seo/config.js (main bundle) needs them.
// Keep claims modest: no user counts, ratings or testimonials, nothing the app can't do.
// Topic titles come from the guided-session library (backend exchange_sessions.py
// TOPIC_LIBRARY); the prompts under them are pair-specific ideas written for these pages.

export const PAIR_DETAILS = {
  "english-spanish": {
    reverse:
      "Speak Spanish and want better English? The same exchange works the other way round: you help with Spanish, your partner helps with English, and both of you get equal time.",
    intro: [
      "English and Spanish make a natural pair: each side wants exactly what the other already has. On LangVoyage you say which language you speak and which one you are practising, and the app looks for people whose languages mirror yours.",
      "The result is a partner who needs your help as much as you need theirs. That balance keeps conversations going, because nobody is just a teacher or just a student.",
    ],
    cta: [
      { speak: "english", learn: "spanish", label: "I speak English, I'm learning Spanish" },
      { speak: "spanish", learn: "english", label: "Hablo español, I'm learning English" },
    ],
    steps: [
      {
        title: "Find a mirrored partner",
        text: "In People, the Perfect exchanges row lists members who speak Spanish natively and are learning English, or English speakers learning Spanish if Spanish is your language. You can narrow it by level, by who was active today, or to people in your city.",
      },
      {
        title: "Chat at your own pace",
        text: "Start with short texts, send a voice note so your partner can hear your Spanish r, share a photo of a menu you couldn't read, or start an audio or video call when you both feel ready.",
      },
      {
        title: "Run a guided exchange",
        text: "Pick 10, 20 or 30 minutes. The session opens in your partner's native language and switches at the halfway mark, so English and Spanish get equal time. Either of you can ask to switch earlier, and the session suggests topics for the lower of your two levels.",
      },
      {
        title: "Keep what you learned",
        text: "Your partner can correct a message word by word. Save useful phrases to your phrasebook and review them later with spaced repetition. Each session ends with a card showing how the time split between the two languages and which corrections were made.",
      },
    ],
    sides: [
      {
        learning: "spanish",
        title: "Learning Spanish as an English speaker",
        notes: [
          {
            title: "Ser and estar",
            text: "Both mean “to be”. Ser is for identity and lasting traits, estar for states and location: “es aburrido” means he's boring, “está aburrido” means he's bored. It's the slip partners correct most, so ask for it.",
          },
          {
            title: "The subjunctive",
            text: "Spanish uses it after wishes, doubts and feelings: “quiero que vengas” (I want you to come). English barely has it, so expect it to take a while; short daily messages give you lots of low-stakes practice.",
          },
          {
            title: "Tapped and rolled r",
            text: "“Pero” (but) has a single tap; “perro” (dog) has a trill. Record both in a voice note and ask your partner which one they heard.",
          },
          {
            title: "Spain or Latin America?",
            text: "Most of Spain uses vosotros; Latin America uses ustedes for any group. Vocabulary shifts too: a car is a coche in Spain and a carro or auto in much of Latin America. Ask your partner which variety they speak.",
          },
        ],
        correction: { lang: "es", original: "Ayer soy muy cansado.", corrected: "Ayer estaba muy cansado." },
      },
      {
        learning: "english",
        title: "Learning English as a Spanish speaker",
        notes: [
          {
            title: "Phrasal verbs",
            text: "Get up, get over, get by: the small word changes the meaning. Native speakers use them constantly in casual talk, and a partner is the quickest way to learn which ones sound natural.",
          },
          {
            title: "More vowel sounds",
            text: "Spanish has five vowel sounds; English has many more, so ship and sheep or full and fool can sound the same at first. Voice notes and calls let your partner hear the difference and tell you.",
          },
          {
            title: "Words that start with s",
            text: "Spanish puts an e before s + consonant (España, escuela), so “Spain” easily becomes “Espain”. One reminder from a partner usually fixes it faster than a textbook.",
          },
          {
            title: "False friends",
            text: "Embarrassed is avergonzado, not embarazada (pregnant). Actually means “in fact”, not actualmente (currently).",
          },
        ],
        correction: { lang: "en", original: "I am agree with you.", corrected: "I agree with you." },
      },
    ],
    topics: {
      beginner: [
        { title: "Food you love", prompt: "Tortilla de patatas or a full English breakfast? Describe what you eat in the morning." },
        { title: "Your day", prompt: "Dinner at 7 or at 10? Compare your daily routines hour by hour." },
        { title: "Hobbies", prompt: "Football, music or cooking: describe your weekend in three short sentences." },
      ],
      intermediate: [
        { title: "Festivals and traditions", prompt: "Semana Santa, Día de Muertos, Bonfire Night or Thanksgiving: which matters where you live?" },
        { title: "Films, series and music", prompt: "Recommend a series in your language that is worth watching with subtitles." },
        { title: "A memorable trip", prompt: "Tell the story of a trip where something went wrong, and how you solved it." },
      ],
      advanced: [
        { title: "Language and identity", prompt: "Do you feel different in English and in Spanish? Talk about Spanglish and words that don't translate." },
        { title: "Humour", prompt: "Tell a joke in your language, explain it, then try your partner's." },
        { title: "The future of work", prompt: "Would you take a four-day week for less pay? Argue both sides." },
      ],
    },
  },

  "greek-spanish": {
    reverse:
      "Is Greek your language and Spanish the one you're learning? The exchange runs both ways: you help with Greek, your partner helps with Spanish.",
    intro: [
      "Greek and Spanish sound surprisingly alike. Both have the same five clear vowel sounds and a tapped r, and they share several consonants, so Spanish speakers often find spoken Greek easier to pronounce than they expected. The alphabet is the first hurdle, and reading your partner's messages every day is a gentle way over it.",
      "Greek speakers learning Spanish have a head start too: many grammar ideas, from the subjunctive to the way verbs drop their pronouns, already work much the same way in Greek.",
    ],
    cta: [
      { speak: "spanish", learn: "greek", label: "Hablo español, I'm learning Greek" },
      { speak: "greek", learn: "spanish", label: "Μιλάω ελληνικά, I'm learning Spanish" },
    ],
    steps: [
      {
        title: "Match with someone whose languages mirror yours",
        text: "Set Spanish as the language you speak and Greek as the one you're practising, or the reverse. People puts members whose languages fit yours in its Perfect exchanges row, and you choose who to write to.",
      },
      {
        title: "Mix text and voice",
        text: "Type in Spanish while you learn the Greek letters, and ask your partner for voice notes so you hear each new word as you read it. Audio and video calls are there when you want them.",
      },
      {
        title: "Share the time fairly",
        text: "A guided exchange lasts 10, 20 or 30 minutes. It starts in your partner's native language and switches halfway, or earlier if one of you asks, with topic suggestions for the lower of your two levels.",
      },
      {
        title: "Save corrections for later",
        text: "Corrections appear right under the message, word by word, so a wrong case ending or a missing accent is easy to spot. Save the phrases you want to keep to your phrasebook and review them with spaced repetition.",
      },
    ],
    sides: [
      {
        learning: "greek",
        title: "Learning Greek as a Spanish speaker",
        notes: [
          {
            title: "The alphabet",
            text: "Many letters are familiar from maths (π, Σ, Δ), but a few look Latin and sound different: Η is an “i”, Ρ is an “r”, Β is a “v” and Ν is an “n”. Typing short replies on a Greek keyboard is the fastest way to get used to them.",
          },
          {
            title: "Stress marks",
            text: "Every Greek word of more than one syllable carries a written accent (τόνος) on the stressed syllable, and it can change the meaning: πότε means “when?”, ποτέ means “never”.",
          },
          {
            title: "Cases",
            text: "Nouns and articles change with their role in the sentence: ο φίλος (the friend, as subject), τον φίλο (as object), του φίλου (of the friend). Spanish uses word order and prepositions instead, so endings are worth asking your partner to correct.",
          },
          {
            title: "Sounds you already know",
            text: "Greek χ is close to the Spanish j in jamón, δ is like the soft d in “nada”, and θ is like the z in Castilian “zapato”. Before e or i, Greek γ sounds much like the Spanish y.",
          },
        ],
        correction: { lang: "el", original: "Θέλω να πάω στο Αθήνα.", corrected: "Θέλω να πάω στην Αθήνα." },
      },
      {
        learning: "spanish",
        title: "Learning Spanish as a Greek speaker",
        notes: [
          {
            title: "Ser and estar",
            text: "Greek has one verb, είμαι. Spanish splits it: ser for identity and lasting traits, estar for states and location, as in “soy de Atenas” but “estoy cansado”.",
          },
          {
            title: "The subjunctive feels familiar",
            text: "“Θέλω να έρθεις” maps neatly onto “quiero que vengas”. The forms are new, but putting a second verb after να or que is something you already do.",
          },
          {
            title: "Two genders, not three",
            text: "Spanish has no neuter, so neuter Greek nouns land in another gender: το σπίτι becomes la casa, το βιβλίο becomes el libro.",
          },
          {
            title: "Fewer accents, and b sounds like v",
            text: "Spanish only writes an accent where the stress is irregular (café, árbol), not on every word. And b and v are pronounced the same, unlike Greek, where β is always a v sound.",
          },
        ],
        correction: { lang: "es", original: "Soy cansado después del trabajo.", corrected: "Estoy cansado después del trabajo." },
      },
    ],
    topics: {
      beginner: [
        { title: "Food you love", prompt: "Horiatiki or gazpacho? Swap a favourite summer dish and the words for its ingredients." },
        { title: "Your home town", prompt: "Describe your town in five sentences: the sea, the hills, the plaza or the plateia." },
        { title: "Holidays", prompt: "A Greek island or the Spanish coast: where would you take your partner, and why?" },
      ],
      intermediate: [
        { title: "Festivals and traditions", prompt: "Greek Easter and Semana Santa: compare the food, the processions and what happens at midnight." },
        { title: "Living in a city", prompt: "Athens, Thessaloniki, Madrid or Buenos Aires: what would you show a visitor first?" },
        { title: "Learning languages", prompt: "Which Greek words already live in Spanish? Start with teléfono, democracia and problema." },
      ],
      advanced: [
        { title: "Culture shock", prompt: "Late dinners are normal in both Greece and Spain. Which habits would still surprise a visitor?" },
        { title: "Language and identity", prompt: "Which expressions in your language can't be translated, and what do they say about you?" },
        { title: "Something in the news", prompt: "Pick a story covered in both countries and compare how it is reported." },
      ],
    },
  },

  "italian-english": {
    reverse:
      "Italian speaker working on your English? The exchange runs both ways: you help with Italian, your partner helps with English, and the session splits the time evenly.",
    intro: [
      "Italian is written almost exactly as it sounds, which makes it rewarding to read early on; the hard part is speaking with the right rhythm and length of sounds. English is the opposite: the spelling often misleads, so hearing a native speaker matters more than another vocabulary list.",
      "That makes Italian and English a balanced exchange. Each partner can help with exactly what the other finds hard, in short messages, voice notes or a timed session.",
    ],
    cta: [
      { speak: "english", learn: "italian", label: "I speak English, I'm learning Italian" },
      { speak: "italian", learn: "english", label: "Parlo italiano, I'm learning English" },
    ],
    steps: [
      {
        title: "Tell us your two languages",
        text: "English as the language you speak and Italian as the one you're practising, or the other way round. Sign-up asks for your level too, so suggestions fit where you are.",
      },
      {
        title: "Pick a partner from People",
        text: "Perfect exchanges are members who speak Italian natively and are learning English, or the reverse. Filters for level, recent activity and your city help when the list is long.",
      },
      {
        title: "Talk in turns",
        text: "Guided exchanges run for 10, 20 or 30 minutes. The first half is in your partner's native language, the second in yours, and either of you can switch early. Prefer to go slowly? Text, voice notes and calls work outside sessions too.",
      },
      {
        title: "Review the corrections",
        text: "Partners can correct any message word by word. The end card of a session shows the language balance and the corrections made, and saved phrases come back for spaced review in your phrasebook.",
      },
    ],
    sides: [
      {
        learning: "italian",
        title: "Learning Italian as an English speaker",
        notes: [
          {
            title: "Double consonants",
            text: "Hold a double consonant slightly longer: pala (shovel) and palla (ball), nono (ninth) and nonno (grandfather). Your partner will hear the difference in a voice note even when you can't.",
          },
          {
            title: "False friends",
            text: "Camera is a room, libreria a bookshop, parenti are your relatives and a fattoria is a farm, not a factory.",
          },
          {
            title: "C and g before e and i",
            text: "C and g soften before e and i (ciao, gelato) and stay hard with an h (chiave, spaghetti). Once the rule clicks you can read any word aloud.",
          },
          {
            title: "Essere or avere",
            text: "In the passato prossimo most verbs take avere (ho mangiato), but many verbs of movement and change take essere (sono andato). Corrections in real messages help it stick.",
          },
        ],
        correction: { lang: "it", original: "Sono andato a la stazione.", corrected: "Sono andato alla stazione." },
      },
      {
        learning: "english",
        title: "Learning English as an Italian speaker",
        notes: [
          {
            title: "Phrasal verbs",
            text: "Put off, look forward to, come up with: Italian usually has a single verb, so these are best learned in real conversation.",
          },
          {
            title: "Final consonants and th",
            text: "Most Italian words end in a vowel, so it's easy to add one to English words (“I went-a”). The th in think and this has no Italian equivalent; voice notes help you hear and copy it.",
          },
          {
            title: "Simple past or present perfect",
            text: "Italian says “ieri ho visto”, but English needs the simple past with a finished time: “Yesterday I saw it”, not “Yesterday I have seen it”.",
          },
          {
            title: "False friends the other way",
            text: "Actually means “in fact” (attualmente is currently), and sensible means reasonable, not sensibile (sensitive).",
          },
        ],
        correction: { lang: "en", original: "Yesterday I have seen a great film.", corrected: "Yesterday I saw a great film." },
      },
    ],
    topics: {
      beginner: [
        { title: "Food you love", prompt: "Is cappuccino only for the morning? Compare what you eat and drink before 10 a.m." },
        { title: "Family and friends", prompt: "Who comes to Sunday lunch? Describe a family meal in short sentences." },
        { title: "Shopping", prompt: "Market or supermarket: where do you buy bread and fruit?" },
      ],
      intermediate: [
        { title: "Living in a city", prompt: "Rome, Milan, London or New York: what's good and bad about where you live?" },
        { title: "Films, series and music", prompt: "Recommend an Italian film or an English series to watch with subtitles." },
        { title: "Childhood memories", prompt: "What games did you play at school, and what did you want to be?" },
      ],
      advanced: [
        { title: "The future of work", prompt: "Remote work, a four-day week, leaving the city for a village: what would you choose?" },
        { title: "Humour", prompt: "Irony, sarcasm and understatement: which jokes survive translation?" },
        { title: "Friendly debate", prompt: "Travel slowly or see a lot? Argue the side you disagree with." },
      ],
    },
  },
};
