import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CommunityPage from "./page";
import api from "../../lib/api";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), upload: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: () => false,
  };
});

// Greek native, English fluent (spoken), Russian beginner (learning).
const mockMe = {
  user_id: 1,
  username: "kostas",
  native_language: "Greek",
  languages_practicing: ["English", "Russian"],
  practice_language_levels: { English: "fluent", Russian: "beginner" },
};
jest.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockMe, setUser: () => {} }) }));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useNavigate: () => mockNavigate }));

const person = (username: string, nativeLanguage: string, learning: string, match: Record<string, unknown>) => ({
  username,
  native_language: nativeLanguage,
  languages_practicing: [learning],
  practice_language_levels: { [learning]: "intermediate" },
  learning_goal: "",
  profile_image_url: null,
  match: { teaches_me: true, learns_mine: true, reciprocal: true, score: 2, ...match },
});

const page = (profiles: unknown[]) => ({
  profiles,
  pagination: { page: 1, page_size: 24, total_pages: 1, total_count: profiles.length, has_next: false, has_previous: false },
});

const anya = person("anya", "russian", "english", { they_teach: "russian", they_learn: "english", you_speak: "fluent" });
const boris = person("boris", "russian", "greek", { they_teach: "russian", they_learn: "greek", you_speak: "native" });
const dmitri = person("dmitri", "russian", "french", { learns_mine: false, reciprocal: false, score: 1, they_teach: "russian", they_learn: null, you_speak: null });

const renderPage = () =>
  render(
    <MemoryRouter>
      <CommunityPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

test("Perfect exchange is the default tab and shows only real exchanges in a carousel", async () => {
  (api.get as jest.Mock).mockResolvedValue(page([anya, boris, dmitri]));
  renderPage();

  const carousel = await screen.findByRole("region", { name: "Perfect exchanges" });
  expect((api.get as jest.Mock).mock.calls[0][1].params).toMatchObject({ match: "reciprocal" });
  const slides = within(carousel).getAllByRole("group", { name: /of 2/ });
  expect(slides).toHaveLength(2);
  // A one-way match never shows on Perfect exchange, nor does the old "More people to meet" list.
  expect(screen.queryByText("dmitri")).toBeNull();
  expect(screen.queryByText("More people to meet")).toBeNull();
  expect(within(slides[0]).getByText("Russian (native)")).toBeInTheDocument();
  expect(within(slides[0]).getByText("English, which you speak fluently")).toBeInTheDocument();
});

test("carousel moves with buttons, dots and arrow keys", async () => {
  (api.get as jest.Mock).mockResolvedValue(page([anya, boris]));
  renderPage();
  const carousel = await screen.findByRole("region", { name: "Perfect exchanges" });
  const counter = () => within(carousel).getByText(/\d \/ 2/).textContent;

  expect(counter()).toBe("Match 1 / 2");
  expect(within(carousel).getByRole("button", { name: "Previous match" })).toBeDisabled();
  fireEvent.click(within(carousel).getByRole("button", { name: "Next match" }));
  expect(counter()).toBe("Match 2 / 2");
  expect(within(carousel).getByRole("button", { name: "Next match" })).toBeDisabled();
  expect(within(carousel).getByRole("group", { name: "2 of 2: boris" })).toHaveAttribute("aria-current", "true");

  fireEvent.keyDown(carousel, { key: "ArrowLeft" });
  expect(counter()).toBe("Match 1 / 2");
  fireEvent.keyDown(carousel, { key: "ArrowRight" });
  expect(counter()).toBe("Match 2 / 2");
  fireEvent.click(within(carousel).getByRole("button", { name: "Show match 1: anya" }));
  expect(counter()).toBe("Match 1 / 2");
});

test("each slide explains the exchange and its starters open the chat with a draft", async () => {
  (api.get as jest.Mock).mockResolvedValue(page([anya, boris]));
  (api.post as jest.Mock).mockResolvedValue({ id: 42 });
  renderPage();
  const slide = await screen.findByRole("group", { name: "2 of 2: boris" });

  expect(within(slide).getByText("Russian (native)")).toBeInTheDocument();
  expect(within(slide).getByText("Greek, your native language")).toBeInTheDocument();
  fireEvent.click(within(slide).getByRole("button", { name: "I'm a native Greek speaker. Want to practice together?" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/conversations/42"));
  expect(api.post).toHaveBeenCalledWith("/api/conversations/", { participant: "boris" });
});

test("no exchanges: a friendly empty state that switches to native speakers", async () => {
  (api.get as jest.Mock).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([dmitri]));
  renderPage();

  expect(await screen.findByText("No perfect exchanges yet")).toBeInTheDocument();
  const empty = screen.getByText("No perfect exchanges yet").parentElement as HTMLElement;
  expect(within(empty).getByRole("link", { name: "Edit languages" })).toHaveAttribute("href", "/profile/edit");
  fireEvent.click(screen.getByRole("button", { name: "See native speakers" }));
  expect(await screen.findByText("dmitri")).toBeInTheDocument();
  expect((api.get as jest.Mock).mock.calls[1][1].params).toMatchObject({ match: "teaches_me" });
  expect(screen.queryByRole("region", { name: "Perfect exchanges" })).toBeNull();
});

test("your exchange panel lists spoken and practised languages", async () => {
  (api.get as jest.Mock).mockResolvedValue(page([]));
  renderPage();
  const panel = screen.getByRole("heading", { name: "Your exchange" }).closest("section") as HTMLElement;

  expect(within(panel).getByText("You speak").nextSibling).toHaveTextContent("Greek, English");
  expect(within(panel).getByText("You practise").parentElement).toHaveTextContent("Russian · Beginner");
  expect(within(panel).queryByText(/English · Fluent/)).toBeNull();
  await screen.findByText("No perfect exchanges yet");
});

test("four distinct segments, Perfect exchange first and selected", async () => {
  (api.get as jest.Mock).mockResolvedValueOnce(page([anya])).mockResolvedValueOnce(page([anya, boris]));
  renderPage();
  const group = screen.getByRole("group", { name: "Exchange type" });
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(["Perfect exchange", "Native speakers", "Learning your language", "Everyone"]);
  expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(/Best matches/i)).toBeNull();
  await screen.findByRole("region", { name: "Perfect exchanges" });

  fireEvent.click(buttons[2]);
  await screen.findByText("boris");
  expect((api.get as jest.Mock).mock.calls[1][1].params).toMatchObject({ match: "learns_mine" });
  expect(screen.queryByRole("region", { name: "Perfect exchanges" })).toBeNull();
  expect(screen.getByRole("region", { name: "Learning your language" })).toBeInTheDocument();
});
