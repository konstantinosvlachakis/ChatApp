import { act, fireEvent, render, screen } from "@testing-library/react";
import ExchangeSessionBanner from "./ExchangeSessionBanner";

const T0 = Date.parse("2026-11-07T10:00:00Z");
const iso = (offsetMin) => new Date(T0 + offsetMin * 60_000).toISOString();

const makeSession = (overrides = {}) => ({
  id: 7,
  conversation_id: 3,
  status: "active",
  created_by: { id: 1, username: "ana" },
  partner: { id: 2, username: "ben" },
  duration_minutes: 20,
  first_language: "english",
  second_language: "spanish",
  current_language: "english",
  topic: { id: 4, title: "Street food", prompts: ["What did you eat last weekend?", "Best snack in your city?"] },
  topic_source: "ai",
  created_at: iso(-1),
  expires_at: iso(9),
  started_at: iso(0),
  halfway_at: iso(10),
  switched_at: null,
  ends_at: iso(20),
  ended_at: null,
  ended_by_id: null,
  summary: null,
  server_time: iso(0),
  ...overrides,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  window.sessionStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

test("pending invite for the starter shows the wait and a Cancel button", () => {
  const onAction = jest.fn();
  render(
    <ExchangeSessionBanner
      session={makeSession({ status: "pending", started_at: null, halfway_at: null, ends_at: null, expires_at: iso(8) })}
      currentUserId={1}
      onAction={onAction}
    />
  );
  expect(screen.getByText("Waiting for ben…")).toBeInTheDocument();
  expect(screen.getAllByText("8:00").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
  expect(onAction).toHaveBeenCalledWith("cancel");
});

test("pending invite for the partner offers Accept and Decline", () => {
  const onAction = jest.fn();
  render(
    <ExchangeSessionBanner
      session={makeSession({ status: "pending", started_at: null, halfway_at: null, ends_at: null })}
      currentUserId={2}
      onAction={onAction}
    />
  );
  expect(screen.getByText("ana invites you to a 20-minute exchange")).toBeInTheDocument();
  expect(screen.getByText("English → Spanish")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(onAction).toHaveBeenCalledWith("accept");
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(onAction).toHaveBeenCalledWith("decline");
});

test("active session counts down with the clock offset and shows the topic", () => {
  const onAction = jest.fn();
  // Server is 30 s ahead of the local clock.
  render(<ExchangeSessionBanner session={makeSession()} offsetMs={30_000} currentUserId={1} onAction={onAction} />);
  expect(screen.getByRole("timer")).toHaveTextContent("19:30");
  expect(screen.getByText("Now: English", { selector: ".cv-xs-chip" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Street food" })).toBeInTheDocument();
  expect(screen.getByText("Suggested by Lumi")).toBeInTheDocument();
  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByRole("timer")).toHaveTextContent("19:25");
  fireEvent.click(screen.getByRole("button", { name: "Switch to Spanish now" }));
  expect(onAction).toHaveBeenCalledWith("switch");
  fireEvent.click(screen.getByRole("button", { name: "Another topic" }));
  expect(onAction).toHaveBeenCalledWith("topic");
  fireEvent.click(screen.getByRole("button", { name: "End" }));
  expect(onAction).toHaveBeenCalledWith("end");
});

test("busy action shows its pending label and disables the actions", () => {
  render(<ExchangeSessionBanner session={makeSession()} currentUserId={1} busyAction="topic" onAction={() => {}} />);
  expect(screen.getByRole("button", { name: "Finding a topic…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "End" })).toBeDisabled();
});

test("halfway prompts once to switch and hides Switch now", () => {
  render(<ExchangeSessionBanner session={makeSession()} currentUserId={1} onAction={() => {}} />);
  expect(screen.queryByText("Time to switch to Spanish")).not.toBeInTheDocument();
  act(() => {
    jest.advanceTimersByTime(10 * 60_000 + 1000);
  });
  expect(screen.getByRole("status")).toHaveTextContent("Time to switch to Spanish");
  expect(screen.getByText("Now: Spanish", { selector: ".cv-xs-chip" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Switch to Spanish now/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss switch reminder" }));
  expect(screen.queryByText("Time to switch to Spanish")).not.toBeInTheDocument();
});

test("collapses to a slim bar", () => {
  render(<ExchangeSessionBanner session={makeSession()} currentUserId={1} onAction={() => {}} />);
  const toggle = screen.getByRole("button", { name: "Hide exchange details" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Show exchange details" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(screen.getByText("Now: English", { selector: ".cv-xs-headline span" })).toBeInTheDocument();
});

test("end card shows the balance, messages and corrections, and dismisses locally", () => {
  const onJump = jest.fn();
  const onStartAnother = jest.fn();
  const session = makeSession({
    status: "ended",
    ended_at: iso(20),
    summary: {
      languages: [
        { language: "english", minutes: 10, messages: { "1": 6, "2": 4 }, message_count: 10 },
        { language: "spanish", minutes: 10, messages: { "2": 3 }, message_count: 3 },
      ],
      total_minutes: 20,
      corrections: [
        { id: 1, message_id: 50, corrector_id: 2 },
        { id: 2, message_id: 51, corrector_id: 1 },
      ],
      correction_count: 2,
      corrections_truncated: false,
    },
  });
  const { unmount } = render(
    <ExchangeSessionBanner session={session} currentUserId={1} onJumpToMessage={onJump} onStartAnother={onStartAnother} />
  );
  expect(screen.getByText("Nice exchange! 20 min")).toBeInTheDocument();
  const legend = screen.getAllByRole("listitem");
  expect(legend[0]).toHaveTextContent("English 10 min · You 6, ben 4 messages");
  expect(legend[1]).toHaveTextContent("Spanish 10 min · ben 3 messages");
  expect(screen.getByText(/2 corrections during this session/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show correction 1 of 2" }));
  expect(onJump).toHaveBeenCalledWith(50);
  fireEvent.click(screen.getByRole("button", { name: "Show correction 2 of 2" }));
  expect(onJump).toHaveBeenLastCalledWith(51);
  fireEvent.click(screen.getByRole("button", { name: "Start another" }));
  expect(onStartAnother).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("Nice exchange! 20 min")).not.toBeInTheDocument();
  unmount();
  render(<ExchangeSessionBanner session={session} currentUserId={1} />);
  expect(screen.queryByText("Nice exchange! 20 min")).not.toBeInTheDocument();
});

test("declined, cancelled and expired show a dismissible note", () => {
  const { rerender } = render(
    <ExchangeSessionBanner session={makeSession({ status: "declined" })} currentUserId={1} />
  );
  expect(screen.getByText("ben declined the exchange.")).toBeInTheDocument();
  rerender(<ExchangeSessionBanner session={makeSession({ id: 8, status: "cancelled" })} currentUserId={2} />);
  expect(screen.getByText("ana cancelled the invite.")).toBeInTheDocument();
  rerender(<ExchangeSessionBanner session={makeSession({ id: 9, status: "expired" })} currentUserId={2} />);
  expect(screen.getByText("The exchange invite expired.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("The exchange invite expired.")).not.toBeInTheDocument();
});
