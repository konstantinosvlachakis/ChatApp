import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PracticePage from "./PracticePage";
import api from "../../lib/api";
import { clearToasts, getToasts } from "../../components/Toast/toastStore";

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

  test("submit failure is reported with a toast", async () => {
    api.post.mockRejectedValue(new Error("nope"));
    await renderPage();
    fireEvent.click(option("bebo"));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => expect(getToasts().length).toBe(1));
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
  });
});
