import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CoachChatRoom from "./CoachChatRoom";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    API_TIMEOUTS: { coach: 35000 },
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
  };
});

// A stable object, like the real context: a new user per render would re-run the load effect forever.
jest.mock("../../../context/UserContext", () => {
  const value = {
    user: { user_id: 7, username: "kostas", native_language: "greek", languages_practicing: ["spanish"] },
    loading: false,
  };
  return { useUser: () => value };
});

// The real composer pulls in the emoji picker and media recorder; a minimal one is enough here.
jest.mock("./MessageInput", () => ({ onSendMessage }) => (
  <button type="button" onClick={() => onSendMessage("Hola, ¿qué tal?", null, null)}>
    Send test message
  </button>
));

const mockViewport = (width) => {
  window.matchMedia = jest.fn((query) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = (max ? width <= Number(max[1]) : true) && (min ? width >= Number(min[1]) : true);
    return { matches, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  });
};

const renderCoach = () =>
  render(
    <MemoryRouter>
      <CoachChatRoom />
    </MemoryRouter>
  );

const QUICK_START = "Quiz me with five short questions.";

describe("CoachChatRoom layout", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    Element.prototype.scrollTo = jest.fn();
    api.post.mockResolvedValue({ reply: "¡Muy bien!" });
    mockViewport(1024);
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("mode bar switches mode through the existing preference handler", () => {
    renderCoach();
    const modes = screen.getByRole("group", { name: "Practice mode" });
    const chat = screen.getByRole("button", { name: "Chat" });
    const correct = screen.getByRole("button", { name: "Correct" });
    expect(modes).toContainElement(correct);
    expect(chat).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Chat · Spanish")).toBeInTheDocument();

    fireEvent.click(correct);

    expect(correct).toHaveAttribute("aria-pressed", "true");
    expect(chat).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Correct · Spanish")).toBeInTheDocument();
    expect(screen.getByText("answers, then rewrites your mistakes")).toBeInTheDocument();
    // persistCoachPreferences + resetCoachConversation ran: stored prefs and a fresh welcome.
    expect(JSON.parse(window.localStorage.getItem("chat:coach:preferences:7"))).toEqual({
      language: "spanish",
      mode: "correct_me",
    });
    expect(screen.getByText(/We are in correct me mode/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Practice language"), { target: { value: "greek" } });
    expect(screen.getByText("Correct · Greek")).toBeInTheDocument();
  });

  test("quick starts show while the chat is new and fold into an Ideas chip after the first message", async () => {
    renderCoach();
    expect(screen.getByRole("group", { name: "Quick starts" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ideas" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: QUICK_START }));
    expect(api.post).toHaveBeenCalledWith(
      "/api/coach/chat/",
      { message: QUICK_START, target_language: "spanish", mode: "casual_chat" },
      { timeoutMs: 35000 }
    );
    await screen.findByText("¡Muy bien!");

    expect(screen.queryByRole("group", { name: "Quick starts" })).toBeNull();
    const ideas = screen.getByRole("button", { name: "Ideas" });
    expect(ideas).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ideas);
    expect(ideas).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Quick starts" })).toBeInTheDocument();
  });

  test("errors still come back as a Lumi reply", async () => {
    api.post.mockRejectedValueOnce(new Error("boom"));
    renderCoach();
    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await screen.findByText("The coach is unavailable right now. Please try again.");
  });

  test("desktop popover: settings button opens details, a choice closes it, Escape closes it", () => {
    renderCoach();
    const settings = screen.getByRole("button", { name: "Coach settings" });
    expect(settings).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(settings);
    const popover = screen.getByRole("dialog", { name: "Coach settings" });
    expect(settings).toHaveAttribute("aria-expanded", "true");
    expect(popover).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /Act out real situations/ }));
    expect(screen.queryByRole("dialog", { name: "Coach settings" })).toBeNull();
    expect(screen.getByText("Roleplay · Spanish")).toBeInTheDocument();
    expect(settings).toHaveFocus();

    fireEvent.click(settings);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Coach settings" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Coach settings" })).toBeNull();
    expect(settings).toHaveFocus();
  });

  test("phones: details open in a bottom sheet that closes on its button and on Escape (cancel)", () => {
    mockViewport(390);
    renderCoach();
    const settings = screen.getByRole("button", { name: "Coach settings" });
    fireEvent.click(settings);
    const sheet = screen.getByRole("dialog", { name: "Coach settings" });
    expect(sheet.tagName).toBe("DIALOG");
    expect(sheet).toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Close coach settings" }));
    expect(screen.queryByRole("dialog", { name: "Coach settings" })).toBeNull();
    expect(settings).toHaveFocus();

    fireEvent.click(settings);
    const reopened = screen.getByRole("dialog", { name: "Coach settings" });
    fireEvent(reopened, createEvent("cancel", reopened, {}, { EventType: "Event" }));
    expect(screen.queryByRole("dialog", { name: "Coach settings" })).toBeNull();
  });

  test("wide screens: details are docked, toggled by the same button and remembered", async () => {
    mockViewport(1440);
    renderCoach();
    const settings = screen.getByRole("button", { name: "Coach settings" });
    expect(screen.getByRole("complementary", { name: "Coach settings" })).toBeInTheDocument();
    expect(settings).toHaveAttribute("aria-expanded", "true");

    // Choosing in the dock keeps it open.
    fireEvent.click(screen.getByRole("button", { name: /Ask short questions/ }));
    expect(screen.getByRole("complementary", { name: "Coach settings" })).toBeInTheDocument();

    fireEvent.click(settings);
    expect(screen.queryByRole("complementary", { name: "Coach settings" })).toBeNull();
    expect(window.localStorage.getItem("chat:coach:details-docked")).toBe("0");

    // "New conversation" lives in the header too.
    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await screen.findByText("¡Muy bien!");
    expect(screen.getByRole("button", { name: "Ideas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(screen.getByRole("group", { name: "Quick starts" })).toBeInTheDocument();
  });

  describe("pending replies", () => {
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };

    test("a second send while Lumi is replying is blocked and both messages survive", async () => {
      const reply = deferred();
      api.post.mockReturnValueOnce(reply.promise);
      renderCoach();
      const send = screen.getByRole("button", { name: "Send test message" });
      fireEvent.click(send);
      fireEvent.click(send);
      expect(api.post).toHaveBeenCalledTimes(1);

      await act(async () => {
        reply.resolve({ reply: "¡Muy bien!" });
      });
      expect(screen.getAllByText("Hola, ¿qué tal?")).toHaveLength(1);
      expect(screen.getByText("¡Muy bien!")).toBeInTheDocument();
    });

    test("a reply that arrives after New conversation is dropped and not persisted", async () => {
      const reply = deferred();
      api.post.mockReturnValueOnce(reply.promise);
      renderCoach();
      fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
      fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
      expect(screen.queryByText("Hola, ¿qué tal?")).toBeNull();

      await act(async () => {
        reply.resolve({ reply: "Old chat reply" });
      });
      expect(screen.queryByText("Old chat reply")).toBeNull();
      expect(screen.queryByText("Hola, ¿qué tal?")).toBeNull();
      expect(window.localStorage.getItem("chat:coach:messages:7") || "").not.toContain("Old chat reply");

      // The composer is free again: the next send goes out.
      fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
      expect(api.post).toHaveBeenCalledTimes(2);
      await screen.findByText("¡Muy bien!");
    });
  });
});
