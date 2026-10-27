import { fireEvent, render, screen } from "@testing-library/react";
import Conversation from "./Conversation";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage, isApiError: actual.isApiError };
});

const at = (minutes) => new Date(2026, 9, 27, 10, minutes).toISOString();
const partner = { id: 2, username: "konstantinos" };
const me = { id: 1, username: "kostas" };

const messages = [
  { id: 1, text: "Hey! How was your day?", sender: partner, timestamp: at(0), can_translate: true, reactions: [] },
  { id: 2, text: "Did you order coffee?", sender: partner, timestamp: at(1), can_translate: false, reactions: [] },
  { id: 3, text: "Really good.", sender: me, timestamp: at(2), status: "read", reactions: [] },
];

describe("Conversation message grouping", () => {
  test("shows one avatar and one time/status per sender group", () => {
    const { container } = render(<Conversation messages={messages} userId={1} onDeleteMessage={jest.fn()} />);
    expect(container.querySelectorAll(".cv-msg")).toHaveLength(3);
    // Two groups (partner x2, me x1) -> two meta lines and two rendered avatars.
    expect(container.querySelectorAll(".cv-msg-meta")).toHaveLength(2);
    expect(container.querySelectorAll(".cv-msg-avatar:not(.is-hidden)")).toHaveLength(2);
    expect(screen.getByText("Seen")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  test("offers a translate shortcut only on translatable received messages", () => {
    render(<Conversation messages={messages} userId={1} onDeleteMessage={jest.fn()} />);
    expect(screen.getAllByRole("button", { name: "Translate" })).toHaveLength(1);
  });

  test("message actions menu opens from the keyboard-reachable button and closes on Escape", () => {
    render(<Conversation messages={messages} userId={1} onDeleteMessage={jest.fn()} onCommentMessage={jest.fn()} />);
    const toggles = screen.getAllByRole("button", { name: "Message actions" });
    expect(toggles).toHaveLength(3);
    toggles[2].focus();
    fireEvent.click(toggles[2]);
    const menu = screen.getByRole("dialog", { name: "Message actions" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete message" })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Message actions" })).toBeNull();
    expect(toggles[2]).toHaveFocus();
  });
});
