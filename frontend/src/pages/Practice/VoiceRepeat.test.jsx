import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import VoiceRepeat from "./VoiceRepeat";
import api from "../../lib/api";
import { calculateSpeechMatch, markSpeechWords, speechWordKey, voiceRewardLabel } from "./practiceUtils";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    isApiError: actual.isApiError,
    getErrorMessage: actual.getErrorMessage,
  };
});

const SENTENCE = "The weather is beautiful today.";
const NEXT_SENTENCE = "I drink tea every morning.";
const NEXT_URL = "/api/practice/voice/next/";
const COMPLETE_URL = "/api/practice/voice/complete/";

const voiceSentence = (overrides = {}) => ({
  id: "voice:english:1:1",
  text: SENTENCE,
  language: "english",
  bucket: 1,
  round_complete: false,
  pass_threshold: 0.68,
  ...overrides,
});

const completePayload = (overrides = {}) => ({
  id: "voice:english:1:1",
  passed: true,
  awarded_xp: 5,
  awarded_points: 2,
  already_scored: false,
  daily_limit_reached: false,
  daily_voice_limit_reached: false,
  daily_xp_limit_reached: false,
  awards_unavailable: false,
  reason: "awarded",
  stats: { points: 12, xp: 105, level: 2, correct_answers: 0, total_answers: 0, accuracy: 0 },
  leaderboard: [],
  current_rank: 1,
  ...overrides,
});

class FakeRecognition {
  static instances = [];

  constructor() {
    this.start = jest.fn();
    this.stop = jest.fn(() => this.onend?.());
    FakeRecognition.instances.push(this);
  }

  say(text) {
    act(() => {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
    });
  }

  // Async act: also flushes the XP claim that a passing attempt starts.
  end() {
    return act(async () => {
      this.onend?.();
    });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const mockServer = ({ sentences = [voiceSentence()], complete = completePayload() } = {}) => {
  let served = 0;
  api.get.mockImplementation((path) => {
    if (path === NEXT_URL) {
      const next = sentences[Math.min(served, sentences.length - 1)];
      served += 1;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    }
    return Promise.resolve({});
  });
  api.post.mockImplementation((path) => {
    if (path === COMPLETE_URL) {
      return complete instanceof Error ? Promise.reject(complete) : Promise.resolve(complete);
    }
    return Promise.resolve({ translated_text: "" });
  });
};

const renderVoice = async (props = {}) => {
  const view = render(<VoiceRepeat language="english" user={{ native_language: "english" }} {...props} />);
  await screen.findByText(SENTENCE);
  return view;
};

const passAttempt = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Record$|Try again/ }));
  latest().say("the weather is beautiful today");
  await latest().end();
};

const completeCalls = () => api.post.mock.calls.filter(([path]) => path === COMPLETE_URL);

describe("markSpeechWords", () => {
  test("marks words in order, ignoring case, punctuation and diacritics", () => {
    expect(markSpeechWords("Practico español todos los días.", "practico espanol los dias")).toEqual([
      { word: "Practico", matched: true },
      { word: "español", matched: true },
      { word: "todos", matched: false },
      { word: "los", matched: true },
      { word: "días.", matched: true },
    ]);
  });

  test("handles Greek tonos and Russian ё, and an empty transcript", () => {
    expect(markSpeechWords("Σήμερα ο καιρός", "σημερα ο καιρος").every((item) => item.matched)).toBe(true);
    expect(markSpeechWords("Он пошёл домой", "он пошел").map((item) => item.matched)).toEqual([true, true, false]);
    expect(markSpeechWords("Hello there", "").map((item) => item.matched)).toEqual([false, false]);
  });

  test("a repeated heard word only matches once, in order", () => {
    expect(markSpeechWords("the cat and the dog", "the dog").map((item) => item.matched)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
    expect(speechWordKey("Aujourd'hui,")).toBe("aujourdhui");
  });

  test("speech match score is diacritic-insensitive", () => {
    expect(calculateSpeechMatch("Il fait très beau aujourd'hui.", "il fait tres beau aujourd'hui")).toBe(1);
  });
});

describe("voiceRewardLabel", () => {
  test("labels every claim outcome", () => {
    expect(voiceRewardLabel(null)).toBe("");
    expect(voiceRewardLabel({ status: "pending" })).toBe("Saving XP...");
    expect(voiceRewardLabel({ status: "done", awardedXp: 5 })).toBe("+5 XP");
    expect(voiceRewardLabel({ status: "done", awardedXp: 0, alreadyScored: true })).toBe("Already earned today");
    expect(voiceRewardLabel({ status: "done", awardedXp: 0, voiceLimit: true })).toBe("Daily voice XP reached");
    expect(voiceRewardLabel({ status: "done", awardedXp: 0, xpLimit: true })).toBe("Daily XP limit reached");
    expect(voiceRewardLabel({ status: "done", awardedXp: 0 })).toBe("XP couldn't be saved this time");
  });
});

describe("VoiceRepeat", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    api.get.mockReset();
    api.post.mockReset();
    mockServer();
    window.SpeechRecognition = FakeRecognition;
    window.speechSynthesis = {
      getVoices: () => [{ lang: "en-US", name: "Test" }],
      cancel: jest.fn(),
      speak: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.SpeechRecognition;
    delete window.speechSynthesis;
  });

  test("loads the sentence from the server; Hear pronunciation, Record and Skip; no Submit step", async () => {
    render(<VoiceRepeat language="english" user={{ native_language: "english" }} />);
    expect(screen.getByText("Loading sentence...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeDisabled();
    await screen.findByText(SENTENCE);
    expect(api.get).toHaveBeenCalledWith(NEXT_URL, { params: { language: "english" } });
    expect(screen.getByRole("button", { name: /Hear pronunciation/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Submit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/fresh round/)).not.toBeInTheDocument();
  });

  test("shows the round-complete chip", async () => {
    mockServer({ sentences: [voiceSentence({ round_complete: true })] });
    await renderVoice();
    expect(screen.getByText(/every voice sentence for this level/)).toBeInTheDocument();
  });

  test("a load error shows a retry that fetches again", async () => {
    mockServer({ sentences: [new Error("offline"), voiceSentence()] });
    render(<VoiceRepeat language="english" user={{ native_language: "english" }} />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/offline|Could not load/)).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: /Retry/ }));
    await screen.findByText(SENTENCE);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("uses the library's English gloss instead of a translate call", async () => {
    mockServer({ sentences: [voiceSentence({ text: SENTENCE, language: "spanish", translation_hint: "Nice weather today." })] });
    await renderVoice({ language: "spanish", user: { native_language: "greek", base_translate_language: "english" } });
    expect(await screen.findByText("Nice weather today.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/api/messages/translate/", expect.anything());
  });

  test("a pass is scored straight away, claims XP once and reports progress", async () => {
    const onProgress = jest.fn();
    await renderVoice({ onProgress });
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    expect(latest().start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Listening… stop recording/ })).toBeInTheDocument();

    latest().say("the weather is beautiful today");
    await latest().end();

    const status = screen.getByRole("status");
    expect(within(status).getByText("100%")).toBeInTheDocument();
    expect(within(status).getByText("Great pronunciation!")).toBeInTheDocument();
    expect(await within(status).findByText("+5 XP")).toBeInTheDocument();
    expect(completeCalls()).toEqual([[COMPLETE_URL, { id: "voice:english:1:1", score: 1 }]]);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ awarded_xp: 5 }));

    const next = screen.getByRole("button", { name: /Next sentence/ });
    expect(next).toHaveClass("is-teal");
    expect(next).toHaveFocus();
    expect(screen.queryByRole("button", { name: /^Record$/ })).not.toBeInTheDocument();

    // Passing again on the same sentence doesn't post a second claim.
    await passAttempt();
    expect(await screen.findByText("+5 XP")).toBeInTheDocument();
    expect(completeCalls()).toHaveLength(1);
  });

  test("shows the server's reason when no XP is awarded", async () => {
    mockServer({ complete: completePayload({ awarded_xp: 0, awarded_points: 0, already_scored: true }) });
    await renderVoice();
    await passAttempt();
    expect(await screen.findByText("Already earned today")).toBeInTheDocument();
  });

  test("daily voice cap message", async () => {
    mockServer({
      complete: completePayload({ awarded_xp: 0, awarded_points: 0, daily_voice_limit_reached: true, daily_limit_reached: true }),
    });
    await renderVoice();
    await passAttempt();
    expect(await screen.findByText("Daily voice XP reached")).toBeInTheDocument();
  });

  test("a failed claim can be retried by the next passing attempt", async () => {
    mockServer({ complete: new Error("offline") });
    await renderVoice();
    await passAttempt();
    expect(await screen.findByText("XP couldn't be saved this time")).toBeInTheDocument();
    mockServer({ complete: completePayload() });
    await passAttempt();
    expect(await screen.findByText("+5 XP")).toBeInTheDocument();
  });

  test("a weak attempt fails, marks missed words, offers Try again first and claims nothing", async () => {
    await renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    latest().say("the weather");
    await latest().end();

    const status = screen.getByRole("status");
    expect(within(status).getByText("40%")).toBeInTheDocument();
    expect(within(status).getByText("Almost — try again")).toBeInTheDocument();
    const words = status.querySelectorAll(".pr-voice-word");
    expect([...words].map((node) => node.className.includes("is-matched"))).toEqual([true, true, false, false, false]);
    expect(within(status).getAllByText("(missed)")).toHaveLength(3);
    const tryAgain = screen.getByRole("button", { name: /Try again/ });
    expect(tryAgain).toHaveFocus();
    expect(screen.getByRole("button", { name: /Next sentence/ })).not.toHaveClass("is-teal");
    expect(completeCalls()).toHaveLength(0);

    fireEvent.click(tryAgain);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(screen.queryByText("Almost — try again")).not.toBeInTheDocument();
  });

  test("Next sentence fetches a new sentence from the server", async () => {
    mockServer({ sentences: [voiceSentence(), voiceSentence({ id: "voice:english:1:12", text: NEXT_SENTENCE })] });
    await renderVoice();
    await passAttempt();
    await screen.findByText("+5 XP");
    fireEvent.click(screen.getByRole("button", { name: /Next sentence/ }));
    await screen.findByText(NEXT_SENTENCE);
    expect(screen.queryByText("+5 XP")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Record$/ })).toBeEnabled());
  });

  test("stopping early scores what was heard", async () => {
    await renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    latest().say("the weather is beautiful today");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Listening… stop recording/ }));
    });
    expect(latest().stop).toHaveBeenCalled();
    expect(screen.getByText("Great pronunciation!")).toBeInTheDocument();
    await screen.findByText("+5 XP");
  });

  test("no speech shows a notice and keeps Record", async () => {
    await renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    await latest().end();
    expect(screen.getByText(/We didn't catch that/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeInTheDocument();
  });

  test("unsupported browser keeps the notice and disables Record", async () => {
    delete window.SpeechRecognition;
    await renderVoice();
    expect(screen.getByText("Your browser does not support speech recognition/synthesis.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeDisabled();
  });
});
