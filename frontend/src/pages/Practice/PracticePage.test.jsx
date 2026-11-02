import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PracticePage from "./PracticePage";
import api from "../../lib/api";
import { clearToasts, getToasts } from "../../components/Toast/toastStore";
import { levelChangeMessage, progressSummary } from "./practiceUtils";

let mockUser;
jest.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: mockUser }),
}));

// Practice talks to the backend through the shared API client (lib/api).
jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: actual.isAbortError,
  };
});

const stats = { points: 120, xp: 230, level: 3, correct_answers: 9, total_answers: 12, accuracy: 75, preferred_language: "spanish" };
const leaderboard = [
  { rank: 1, username: "maria", points: 300, level: 5, xp: 420, is_current_user: false },
  { rank: 2, username: "kostas", points: 120, level: 3, xp: 230, is_current_user: true },
  { rank: 3, username: "li", points: 90, level: 2, xp: 140, is_current_user: false },
];
const challenge = (id = "spanish:a1:0") => ({
  id,
  sentence_parts: ["Yo ", "___", " agua."],
  options: ["bebo", "como", "leo", "duermo"],
  hint: "Present tense of beber",
  difficulty_bucket: "a1",
  language: "spanish",
  source: "library",
});
const submitPayload = (overrides = {}) => ({
  correct: true,
  correct_answer: "bebo",
  awarded_xp: 15,
  awarded_points: 10,
  already_scored: false,
  language: "spanish",
  stats: { ...stats, points: 130, xp: 245 },
  leaderboard,
  current_rank: 2,
  ...overrides,
});

const levelProgress = (overrides = {}) => {
  const attempts = overrides.attempts_in_bucket ?? 0;
  return {
    language: "spanish",
    bucket: 2,
    max_bucket: 3,
    bucket_label: "Everyday grammar",
    cefr: "A2–B1",
    attempts_in_bucket: attempts,
    window_size: attempts,
    window_accuracy: null,
    needed_for_promotion: { attempts_remaining: Math.max(0, 15 - attempts), min_attempts: 15, accuracy_target: 0.8 },
    can_promote: true,
    change: null,
    ...overrides,
  };
};

const setupApi = () => {
  let challengeCount = 0;
  api.get.mockImplementation((path) => {
    if (path === "/api/practice/state/") {
      return Promise.resolve({ language: "spanish", stats, leaderboard, current_rank: 2 });
    }
    if (path === "/api/practice/challenge/") {
      challengeCount += 1;
      return Promise.resolve({ language: "spanish", challenge: challenge(`spanish:a1:${challengeCount}`), stats });
    }
    return Promise.resolve({});
  });
};

const renderPage = async () => {
  render(<PracticePage />);
  await screen.findByText("Present tense of beber");
};

const option = (word) => screen.getByRole("button", { name: new RegExp(`^${word}\\b`) });

describe("PracticePage", () => {
  beforeEach(() => {
    mockUser = {
      username: "kostas",
      native_language: "greek",
      base_translate_language: "english",
      languages_practicing: ["Spanish"],
    };
    jest.clearAllMocks();
    clearToasts();
    setupApi();
  });

  test("renders each stat once and shows the rank only in the leaderboard", async () => {
    await renderPage();
    const strip = screen.getByRole("region", { name: "Your progress" });
    expect(within(strip).getByText("Today")).toBeInTheDocument();
    expect(within(strip).getByText("0/10")).toBeInTheDocument();
    expect(screen.getAllByText("Points")).toHaveLength(1);
    expect(screen.getAllByText("Level")).toHaveLength(1);
    expect(screen.getAllByText("Accuracy")).toHaveLength(1);
    expect(screen.getAllByText("Today")).toHaveLength(1);
    expect(within(strip).getByText("120")).toBeInTheDocument();
    expect(within(strip).getByText("75%")).toBeInTheDocument();
    expect(within(strip).getByText("70 XP to level 4")).toBeInTheDocument();
    expect(screen.getAllByText(/#2/)).toHaveLength(1);
    expect(screen.getByText("You're #2")).toBeInTheDocument();
    // Language names are title-cased in the picker.
    expect(screen.getByRole("option", { name: "Spanish" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/practice/state/", { params: { language: "spanish" } });
  });

  test("selecting an option fills the blank; Check answer is disabled until a choice", async () => {
    await renderPage();
    const check = screen.getByRole("button", { name: "Check answer" });
    expect(check).toBeDisabled();
    fireEvent.click(option("como"));
    expect(option("como")).toHaveAttribute("aria-pressed", "true");
    expect(check).toBeEnabled();
    expect(document.querySelector(".pr-blank")).toHaveTextContent("como");
  });

  test("double clicking Check answer posts once (submitting guard)", async () => {
    let resolveSubmit;
    api.post.mockImplementation(() => new Promise((resolve) => { resolveSubmit = resolve; }));
    await renderPage();
    fireEvent.click(option("bebo"));
    const check = screen.getByRole("button", { name: "Check answer" });
    fireEvent.click(check);
    fireEvent.click(check);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/api/practice/submit/", {
      challenge_id: "spanish:a1:1",
      selected_word: "bebo",
      language: "spanish",
    });
    expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
    await act(async () => resolveSubmit(submitPayload()));
    expect(await screen.findByText("Nice one! That's right.")).toBeInTheDocument();
  });

  test("correct answer shows XP gained, counts toward today and moves focus to Next", async () => {
    api.post.mockResolvedValue(submitPayload());
    await renderPage();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    const status = await screen.findByRole("status");
    await within(status).findByText("Nice one! That's right.");
    expect(within(status).getByText("+15 XP · +10 points")).toBeInTheDocument();
    expect(screen.getByText("1/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    expect(option("bebo")).toHaveClass("is-correct");
  });

  test("wrong answer shows the right answer and can translate the sentence", async () => {
    api.post.mockImplementation((path) => {
      if (path === "/api/practice/submit/") {
        return Promise.resolve(submitPayload({ correct: false, awarded_xp: 3, awarded_points: 1 }));
      }
      return Promise.resolve({ translated_text: "I drink water." });
    });
    await renderPage();
    fireEvent.click(option("como"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByText("Not quite.");
    expect(screen.getByText("bebo", { selector: "b" })).toBeInTheDocument();
    expect(option("como")).toHaveClass("is-wrong");
    expect(option("bebo")).toHaveClass("is-answer");
    expect(screen.getByText("0/10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show translation/i }));
    expect(await screen.findByText("I drink water.")).toBeInTheDocument();
    expect(api.post).toHaveBeenLastCalledWith("/api/messages/translate/", {
      text: "Yo bebo agua.",
      target_language: "english",
    });
  });

  test("already_scored shows the note and no XP", async () => {
    api.post.mockResolvedValue(submitPayload({ already_scored: true, awarded_xp: 0, awarded_points: 0 }));
    await renderPage();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText(/Already scored today/)).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ XP/)).not.toBeInTheDocument();
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  test("keyboard: 1-4 pick options, Enter checks, Enter again loads the next challenge", async () => {
    api.post.mockResolvedValue(submitPayload());
    await renderPage();
    fireEvent.keyDown(document.body, { key: "3" });
    expect(option("leo")).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document.body, { key: "1" });
    expect(option("bebo")).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document.body, { key: "Enter" });
    await screen.findByText("Nice one! That's right.");
    expect(api.post).toHaveBeenCalledTimes(1);

    // Digits do nothing once answered.
    fireEvent.keyDown(document.body, { key: "2" });
    expect(option("bebo")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(document.body, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled());
    expect(api.get).toHaveBeenLastCalledWith("/api/practice/challenge/", { params: { language: "spanish" } });
    expect(document.querySelector(".pr-sentence")).toHaveFocus();
  });

  test("round_complete shows the fresh-round note on that challenge only", async () => {
    let challengeCount = 0;
    api.get.mockImplementation((path) => {
      if (path === "/api/practice/state/") {
        return Promise.resolve({ language: "spanish", stats, leaderboard, current_rank: 2 });
      }
      challengeCount += 1;
      return Promise.resolve({
        language: "spanish",
        challenge: { ...challenge(`spanish:1:${challengeCount}`), round_complete: challengeCount === 1 },
        stats,
      });
    });
    api.post.mockResolvedValue(submitPayload());
    await renderPage();
    expect(screen.getByText(/practised every sentence for this level/)).toBeInTheDocument();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.queryByText(/practised every sentence/)).not.toBeInTheDocument());
  });

  test("leaderboard shows real profile photos and falls back to the default avatar", async () => {
    const withPhotos = [
      { ...leaderboard[0], profile_image_url: "https://example.test/media/profile_images/maria.jpg" },
      { ...leaderboard[1], profile_image_url: null },
    ];
    api.get.mockImplementation((path) =>
      Promise.resolve(
        path === "/api/practice/state/"
          ? { language: "spanish", stats, leaderboard: withPhotos, current_rank: 2 }
          : { language: "spanish", challenge: challenge(), stats }
      )
    );
    await renderPage();
    const board = screen.getByRole("complementary", { name: "Leaderboard" });
    const images = board.querySelectorAll("img.pr-board-avatar");
    expect(images[0].getAttribute("src")).toContain("maria.jpg");
    expect(images[1].getAttribute("src")).not.toContain("maria.jpg");
    expect(images[1].getAttribute("src")).toBeTruthy();
  });

  test("leaderboard highlights You", async () => {
    await renderPage();
    const board = screen.getByRole("complementary", { name: "Leaderboard" });
    const rows = within(board).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveClass("is-you");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(within(rows[1]).getByText("You")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("You")).not.toBeInTheDocument();
    expect(rows[0].querySelector("img.pr-board-avatar")).toHaveAttribute("src");
  });

  test("first-load failure shows a friendly error with Retry", async () => {
    api.get.mockRejectedValueOnce(new Error("boom"));
    render(<PracticePage />);
    expect(await screen.findByText("We couldn't load your practice")).toBeInTheDocument();
    setupApi();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Present tense of beber")).toBeInTheDocument();
  });

  test("a voice XP award updates the stats strip and leaderboard", async () => {
    const voiceStats = { ...stats, points: 122, xp: 235 };
    api.get.mockImplementation((path) => {
      if (path === "/api/practice/voice/next/") {
        return Promise.resolve({
          id: "voice:spanish:2:4",
          text: "Hoy hace muy buen tiempo.",
          language: "spanish",
          bucket: 2,
          round_complete: false,
          pass_threshold: 0.68,
          translation_hint: "The weather is very nice today.",
        });
      }
      if (path === "/api/practice/state/") {
        return Promise.resolve({ language: "spanish", stats, leaderboard, current_rank: 2 });
      }
      return Promise.resolve({ language: "spanish", challenge: challenge(), stats });
    });
    api.post.mockResolvedValue({
      awarded_xp: 5,
      awarded_points: 2,
      already_scored: false,
      daily_voice_limit_reached: false,
      daily_xp_limit_reached: false,
      stats: voiceStats,
      leaderboard: [{ ...leaderboard[1], rank: 1, points: 122 }],
      current_rank: 1,
    });
    const Recognition = jest.fn(function FakeRecognition() {
      this.start = jest.fn();
      this.stop = jest.fn();
      Recognition.latest = this;
    });
    window.SpeechRecognition = Recognition;
    window.speechSynthesis = { getVoices: () => [], cancel: jest.fn(), speak: jest.fn() };
    try {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Voice repeat/ }));
      await screen.findByText("Hoy hace muy buen tiempo.");
      fireEvent.click(screen.getByRole("button", { name: /^Record$/ }));
      act(() => {
        Recognition.latest.onresult({
          resultIndex: 0,
          results: [Object.assign([{ transcript: "hoy hace muy buen tiempo" }], { isFinal: true })],
        });
        Recognition.latest.onend();
      });
      expect(await screen.findByText("+5 XP")).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith("/api/practice/voice/complete/", { id: "voice:spanish:2:4", score: 1 });
      const strip = screen.getByRole("region", { name: "Your progress" });
      expect(within(strip).getByText("122")).toBeInTheDocument();
      expect(within(strip).getByText("65 XP to level 4")).toBeInTheDocument();
      expect(screen.getByText("You're #1")).toBeInTheDocument();
    } finally {
      delete window.SpeechRecognition;
      delete window.speechSynthesis;
    }
  });

  test("submit failure is reported with a toast", async () => {
    api.post.mockRejectedValue(new Error("nope"));
    await renderPage();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => expect(getToasts().length).toBe(1));
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
  });

  test("shows the per-language difficulty and level-up progress", async () => {
    const progress = levelProgress({ attempts_in_bucket: 12, window_size: 12, window_accuracy: 0.85 });
    api.get.mockImplementation((path) =>
      Promise.resolve(
        path === "/api/practice/state/"
          ? { language: "spanish", stats, progress, leaderboard, current_rank: 2 }
          : { language: "spanish", challenge: challenge(), stats }
      )
    );
    await renderPage();
    const level = screen.getByRole("region", { name: "Difficulty for this language" });
    expect(within(level).getByText("Spanish · Everyday grammar")).toBeInTheDocument();
    expect(within(level).getByText("A2–B1")).toBeInTheDocument();
    expect(within(level).getByText("12/15 sentences · 85% accuracy · 3 more to level up")).toBeInTheDocument();
    expect(within(level).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
  });

  test("a promotion shows a level-up banner that can be dismissed", async () => {
    api.post.mockResolvedValue(
      submitPayload({
        progress: levelProgress({ bucket: 3, bucket_label: "Advanced grammar", cefr: "B1–B2", change: "promoted", can_promote: false, needed_for_promotion: null }),
      })
    );
    await renderPage();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Level up!")).toBeInTheDocument();
    expect(screen.getByText("Spanish → Advanced grammar")).toBeInTheDocument();
    expect(screen.getByText("Spanish · Advanced grammar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Level up!")).not.toBeInTheDocument();
  });

  test("a demotion shows a kind note", async () => {
    api.post.mockResolvedValue(
      submitPayload({ correct: false, progress: levelProgress({ bucket: 1, bucket_label: "Basics", cefr: "A1", change: "demoted" }) })
    );
    await renderPage();
    fireEvent.click(option("como"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Let's practise Basics a bit more.")).toBeInTheDocument();
    expect(screen.queryByText("Level up!")).not.toBeInTheDocument();
  });
});

describe("practice level helpers", () => {
  test("progressSummary covers the promotion states", () => {
    expect(progressSummary(levelProgress())).toBe("0/15 sentences · 15 more to level up");
    expect(progressSummary(levelProgress({ attempts_in_bucket: 5, window_accuracy: 0.6 }))).toBe(
      "5/15 sentences · 60% accuracy · 10 more at ≥ 80% accuracy to level up"
    );
    expect(
      progressSummary(
        levelProgress({
          attempts_in_bucket: 18,
          window_accuracy: 0.7,
          needed_for_promotion: { attempts_remaining: 0, min_attempts: 15, accuracy_target: 0.8 },
        })
      )
    ).toBe("15/15 sentences · 70% accuracy · Keep accuracy ≥ 80% to level up");
    expect(progressSummary(levelProgress({ can_promote: false, needed_for_promotion: null, window_accuracy: 0.9 }))).toBe(
      "Top level · 90% accuracy"
    );
    expect(progressSummary(null)).toBe("");
  });

  test("levelChangeMessage only fires on a change", () => {
    expect(levelChangeMessage(levelProgress())).toBeNull();
    expect(levelChangeMessage(levelProgress({ change: "promoted" }))).toEqual({
      tone: "good",
      title: "Level up!",
      text: "Spanish → Everyday grammar",
    });
    expect(levelChangeMessage(levelProgress({ change: "demoted" })).tone).toBe("calm");
  });
});
