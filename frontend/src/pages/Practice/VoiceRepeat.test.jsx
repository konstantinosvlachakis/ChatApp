import { act, fireEvent, render, screen, within } from "@testing-library/react";
import VoiceRepeat from "./VoiceRepeat";
import { calculateSpeechMatch, markSpeechWords, speechWordKey } from "./practiceUtils";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(() => Promise.resolve({ translated_text: "" })) };
  return { __esModule: true, default: client, api: client, isApiError: actual.isApiError };
});

const SENTENCE = "The weather is beautiful today.";

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

  end() {
    act(() => {
      this.onend?.();
    });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const renderVoice = () => render(<VoiceRepeat language="english" user={{ native_language: "english" }} />);

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

describe("VoiceRepeat", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    jest.spyOn(Math, "random").mockReturnValue(0.4); // english[1] = SENTENCE
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

  test("before an attempt: Hear pronunciation, Record and Skip; no Submit step", () => {
    renderVoice();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hear pronunciation/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeInTheDocument();
  });

  test("recording ends -> the attempt is scored straight away with a pass card", () => {
    renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    expect(latest().start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Listening… stop recording/ })).toBeInTheDocument();

    latest().say("the weather is beautiful today");
    latest().end();

    const status = screen.getByRole("status");
    expect(within(status).getByText("100%")).toBeInTheDocument();
    expect(within(status).getByText("Great pronunciation!")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /Next sentence/ });
    expect(next).toHaveClass("is-teal");
    expect(next).toHaveFocus();
    expect(screen.getByRole("button", { name: /Try again/ })).not.toHaveClass("is-teal");
    expect(screen.queryByRole("button", { name: /^Record$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
  });

  test("a weak attempt fails, marks missed words and offers Try again first", () => {
    renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    latest().say("the weather");
    latest().end();

    const status = screen.getByRole("status");
    expect(within(status).getByText("40%")).toBeInTheDocument();
    expect(within(status).getByText("Almost — try again")).toBeInTheDocument();
    const words = status.querySelectorAll(".pr-voice-word");
    expect([...words].map((node) => node.className.includes("is-matched"))).toEqual([true, true, false, false, false]);
    expect(within(status).getAllByText("(missed)")).toHaveLength(3);
    const tryAgain = screen.getByRole("button", { name: /Try again/ });
    expect(tryAgain).toHaveFocus();
    expect(screen.getByRole("button", { name: /Next sentence/ })).not.toHaveClass("is-teal");

    fireEvent.click(tryAgain);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(screen.queryByText("Almost — try again")).not.toBeInTheDocument();
  });

  test("stopping early scores what was heard", () => {
    renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    latest().say("the weather is beautiful today");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Listening… stop recording/ }));
    });
    expect(latest().stop).toHaveBeenCalled();
    expect(screen.getByText("Great pronunciation!")).toBeInTheDocument();
  });

  test("no speech shows a notice and keeps Record", () => {
    renderVoice();
    fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
    latest().end();
    expect(screen.getByText(/We didn't catch that/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeInTheDocument();
  });

  test("unsupported browser keeps the notice and disables Record", () => {
    delete window.SpeechRecognition;
    renderVoice();
    expect(screen.getByText("Your browser does not support speech recognition/synthesis.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Record$/ })).toBeDisabled();
  });
});
