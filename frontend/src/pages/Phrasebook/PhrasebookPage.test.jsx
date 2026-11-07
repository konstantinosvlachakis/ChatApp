import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import PhrasebookPage from "./PhrasebookPage";
import api from "../../lib/api";

jest.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: { username: "kostas", languages_practicing: ["Spanish"] } }),
}));

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage };
});

const entry = (id, overrides = {}) => ({
  id,
  text: `frase ${id}`,
  meaning: `phrase ${id}`,
  note: "",
  context: "",
  language: "spanish",
  source: "message",
  source_message_id: null,
  source_conversation_id: null,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  due_at: "2026-11-01T10:00:00Z",
  interval_days: 0,
  repetitions: 0,
  lapses: 0,
  review_count: 0,
  last_reviewed_at: null,
  ...overrides,
});

const renderAt = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PhrasebookPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe("PhrasebookPage list", () => {
  test("shows entries, the due count and the review button", async () => {
    api.get.mockImplementation((path) =>
      path === "/api/phrasebook/review/"
        ? Promise.resolve({ cards: [entry(1)], due_count: 1, total_count: 2, reviewed_today: 0, next_due_at: null })
        : Promise.resolve({
            entries: [entry(1), entry(2, { source: "correction", context: "Yo goed a casa", note: "irregular" })],
            pagination: { page: 1, page_size: 30, total_pages: 1, total_count: 2, has_next: false, has_previous: false },
            due_count: 1,
            languages: ["spanish"],
          })
    );
    renderAt("/phrasebook");
    expect(await screen.findByText("frase 2")).toBeInTheDocument();
    expect(screen.getByText("from: “Yo goed a casa”")).toBeInTheDocument();
    expect(screen.getByText("Correction")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Review 1 due" })).toHaveAttribute("href", "/phrasebook/review");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("PhrasebookPage review", () => {
  test("reveals with Space, grades with number keys and finishes", async () => {
    api.get.mockResolvedValue({
      cards: [entry(1), entry(2, { meaning: "", context: "Me gusta frase 2 mucho" })],
      due_count: 2,
      total_count: 2,
      reviewed_today: 0,
      next_due_at: null,
    });
    api.post.mockResolvedValue({ entry: entry(1), due_count: 1 });
    renderAt("/phrasebook/review");

    expect(await screen.findByText("phrase 1")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    // The key listener is attached in an effect: retry until it is in place.
    await waitFor(() => {
      fireEvent.keyDown(window, { key: " " });
      expect(screen.getByText("frase 1")).toBeInTheDocument();
    });
    await waitFor(() => {
      fireEvent.keyDown(window, { key: "3" });
      expect(api.post).toHaveBeenCalledWith("/api/phrasebook/1/review/", { result: "good" });
    });

    // Second card: no meaning, so the context with the phrase blanked.
    expect(await screen.findByText("Me gusta _____ mucho")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show answer/ }));
    api.post.mockResolvedValue({ entry: entry(2), due_count: 0 });
    api.get.mockResolvedValue({ cards: [], due_count: 0, total_count: 2, reviewed_today: 2, next_due_at: "2099-01-01T00:00:00Z" });
    fireEvent.click(screen.getByRole("button", { name: /Easy/ }));

    expect(await screen.findByText("Review done!")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/You reviewed 2 phrases\. Next review/)).toBeInTheDocument());
  });
});
