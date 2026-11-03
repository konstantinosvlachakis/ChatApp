import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  location: "Athens, Greece",
};
jest.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockMe, setUser: () => {} }) }));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ ...jest.requireActual("react-router-dom"), useNavigate: () => mockNavigate }));

const person = (username: string, nativeLanguage: string, learning: string, match: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  username,
  native_language: nativeLanguage,
  languages_practicing: [learning],
  practice_language_levels: { [learning]: "intermediate" },
  learning_goal: "",
  profile_image_url: null,
  city: null,
  active_label: null,
  is_new: false,
  match: { teaches_me: true, learns_mine: true, reciprocal: true, score: 2, ...match },
  ...extra,
});

const meta = {
  they_speak_options: ["english", "russian"],
  they_learn_options: ["greek", "english"],
  near_available: true,
  near_city: "Athens",
  near_scope: null,
  my_level_available: true,
};

const page = (profiles: unknown[], extra: Record<string, unknown> = {}) => ({
  profiles,
  total: profiles.length,
  pagination: { page: 1, page_size: 24, total_pages: 1, total_count: profiles.length, has_next: false, has_previous: false },
  filters: meta,
  ...extra,
});

const anya = person("anya", "russian", "english", { they_teach: "russian", they_learn: "english", you_speak: "fluent" }, { active_label: "Active today" });
const boris = person("boris", "russian", "greek", { they_teach: "russian", they_learn: "greek", you_speak: "native" }, { is_new: true });
const dmitri = person("dmitri", "russian", "french", { learns_mine: false, reciprocal: false, score: 1, they_teach: "russian", they_learn: null, you_speak: null });
const elena = person("elena", "spanish", "greek", { teaches_me: false, reciprocal: false, score: 1, they_teach: null, they_learn: "greek", you_speak: "native" }, { city: "Athens" });

type Responder = (params: Record<string, unknown>) => unknown;
const respond = (perfect: unknown[], others: unknown[], counts?: Responder) => {
  (api.get as jest.Mock).mockImplementation(async (_url: string, config: { params: Record<string, unknown> }) => {
    const params = config.params;
    if (params.counts) return counts ? counts(params) : page([], { counts: { perfect: perfect.length, others: others.length } });
    return params.section === "perfect" ? page(perfect) : page(others);
  });
};
const callsFor = (section: string) => (api.get as jest.Mock).mock.calls.map((call) => call[1].params).filter((params) => params.section === section && !params.counts);

const renderPage = () =>
  render(
    <MemoryRouter>
      <CommunityPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

test("header names the rule and the old segment chips are gone", async () => {
  respond([anya], [dmitri]);
  renderPage();
  expect(screen.getByRole("heading", { level: 1, name: "People to practise with" })).toBeInTheDocument();
  expect(screen.getByText(/They speak Russian and are learning Greek or English\./)).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Exchange type" })).toBeNull();
  expect(screen.queryByText("Learning your language")).toBeNull();
  await screen.findByRole("region", { name: "Perfect exchanges" });
});

test("perfect exchanges and more people load as two separate sections", async () => {
  respond([anya, boris], [dmitri, elena]);
  renderPage();

  const carousel = await screen.findByRole("region", { name: "Perfect exchanges" });
  expect(carousel.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(2);
  expect(within(carousel).queryByText("dmitri")).toBeNull();
  expect(callsFor("perfect")[0]).toMatchObject({ section: "perfect", page: 1, page_size: 24 });
  expect(callsFor("others")[0]).toMatchObject({ section: "others", page: 1 });
  expect(callsFor("others")[0]).not.toHaveProperty("include");

  const more = screen.getByRole("region", { name: "More people to meet" });
  expect(await within(more).findByText("dmitri")).toBeInTheDocument();
  expect(within(more).getByText("Native Russian speaker")).toBeInTheDocument();
  expect(within(more).getByText("Learning Greek")).toBeInTheDocument();
  expect(within(more).queryByText("anya")).toBeNull();
});

test("perfect cards show the Perfect tag, a chip, Speaks | Learning and Say hello", async () => {
  respond([anya, boris], []);
  renderPage();
  const slide = await screen.findByRole("group", { name: "1 of 2: anya" });
  expect(within(slide).getByText("Perfect exchange")).toBeInTheDocument();
  expect(within(slide).getByText("Active today")).toBeInTheDocument();
  expect(within(slide).getByText("Speaks").nextSibling).toHaveTextContent("Russian");
  expect(within(slide).getByText("Learning").nextSibling).toHaveTextContent("English");
  expect(within(slide).getByRole("link", { name: "View anya's profile" })).toHaveAttribute("href", "/people/anya");
  expect(within(slide).getByRole("button", { name: "Say hello to anya" })).toBeInTheDocument();
  // The card behind is hidden from assistive tech until it comes to the front.
  const second = document.querySelector('[aria-label="2 of 2: boris"]') as HTMLElement;
  expect(second).toHaveAttribute("aria-hidden", "true");
  expect(second).toHaveAttribute("inert");
  expect(within(second).getByText("New member")).toBeInTheDocument();
});

test("coverflow moves one card with buttons, arrow keys and swipes", async () => {
  respond([anya, boris], []);
  renderPage();
  const carousel = await screen.findByRole("region", { name: "Perfect exchanges" });
  const counter = () => carousel.querySelector(".people-carousel-counter")?.textContent;

  expect(counter()).toBe("Showing 1 of 2");
  expect(within(carousel).getByRole("button", { name: "Previous match" })).toBeDisabled();
  fireEvent.click(within(carousel).getByRole("button", { name: "Next match" }));
  expect(counter()).toBe("Showing 2 of 2");
  expect(within(carousel).getByRole("group", { name: "2 of 2: boris" })).toHaveAttribute("aria-current", "true");
  fireEvent.keyDown(carousel, { key: "ArrowLeft" });
  expect(counter()).toBe("Showing 1 of 2");
  fireEvent.keyDown(carousel, { key: "ArrowRight" });
  expect(counter()).toBe("Showing 2 of 2");
  const stage = carousel.querySelector(".people-coverflow") as HTMLElement;
  fireEvent.touchStart(stage, { touches: [{ clientX: 100 }] });
  fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200 }] });
  expect(counter()).toBe("Showing 1 of 2");
});

test("Say hello opens the chat", async () => {
  respond([boris], []);
  (api.post as jest.Mock).mockResolvedValue({ id: 42 });
  renderPage();
  const slide = await screen.findByRole("group", { name: "1 of 1: boris" });
  fireEvent.click(within(slide).getByRole("button", { name: "Say hello to boris" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/conversations/42"));
  expect(api.post).toHaveBeenCalledWith("/api/conversations/", { participant: "boris" });
});

test("quick filters apply to both sections and show the city", async () => {
  respond([anya], [elena]);
  renderPage();
  await screen.findByRole("region", { name: "Perfect exchanges" });
  const group = screen.getByRole("group", { name: "Quick filters" });
  const near = within(group).getByRole("button", { name: "Near you · Athens" });
  expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Near you · Athens", "Active today", "New members", "Your level", "Following"]);

  fireEvent.click(near);
  expect(near).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(group).getByRole("button", { name: "Active today" }));
  await waitFor(() => expect(callsFor("perfect").at(-1)).toMatchObject({ near: 1, active: 1 }));
  expect(callsFor("others").at(-1)).toMatchObject({ near: 1, active: 1 });
});

test("no perfect exchanges near you suggests turning off Near you", async () => {
  respond([], [elena]);
  renderPage();
  expect(await screen.findByText("No perfect exchanges yet")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Edit languages" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Near you · Athens" }));
  expect(await screen.findByText("No perfect exchanges near you")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Turn off Near you" }));
  expect(screen.getByRole("button", { name: "Near you · Athens" })).toHaveAttribute("aria-pressed", "false");
});

test("filter panel applies languages, include switches and sort; Show N people uses the API total", async () => {
  jest.useFakeTimers();
  try {
    respond([anya], [dmitri, elena], () => page([], { counts: { perfect: 1, others: 4 } }));
    renderPage();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });

    fireEvent.click(within(within(dialog).getByRole("group", { name: "They speak" })).getByRole("button", { name: "English" }));
    fireEvent.click(within(dialog).getByRole("switch", { name: "Everyone else" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Recently active" }));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    const show = await within(dialog).findByRole("button", { name: "Show 5 people" });
    const countCall = (api.get as jest.Mock).mock.calls.map((call) => call[1].params).filter((params) => params.counts).at(-1);
    expect(countCall).toMatchObject({ they_speak: "russian", include: "native,learners", sort: "active", counts: 1 });

    fireEvent.click(show);
    await act(async () => {});
    expect(callsFor("others").at(-1)).toMatchObject({ they_speak: "russian", include: "native,learners", sort: "active" });
    const perfectCall = callsFor("perfect").at(-1);
    expect(perfectCall).toMatchObject({ they_speak: "russian" });
    expect(perfectCall).not.toHaveProperty("include");
    expect(perfectCall).not.toHaveProperty("sort");
    expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
