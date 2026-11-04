import { fireEvent, render, screen } from "@testing-library/react";
import Conversation from "./Conversation";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage, isApiError: actual.isApiError };
});

// Messages are from today (just after midnight, never in the future) so the day label is "Today".
const today = new Date();
const at = (minutes) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, minutes).toISOString();
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

  test("offers a plus button for the emoji picker", () => {
    render(<Conversation messages={messages} userId={1} onDeleteMessage={jest.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Message actions" })[0]);
    expect(screen.getAllByRole("button", { name: "Add reaction" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^React with / })).toBeNull();
  });

  test("reaction chips add or remove this user's count independently", () => {
    const reacted = [{ ...messages[0], reactions: [
      { id: 1, user_id: 1, emoji: "🔥" },
      { id: 2, user_id: 2, emoji: "🎉" },
    ] }];
    render(<Conversation messages={reacted} userId={1} onDeleteMessage={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "🔥 1, remove your reaction" }));
    fireEvent.click(screen.getByRole("button", { name: "🎉 1, add your reaction" }));
    expect(api.post).toHaveBeenCalledWith("/api/messages/1/react/", { emoji: "🔥" });
    expect(api.post).toHaveBeenCalledWith("/api/messages/1/react/", { emoji: "🎉" });
  });
});

describe("Conversation in a group chat", () => {
  const ana = { id: 3, username: "ana" };
  const groupMessages = [
    { id: 10, text: "Γεια σας!", sender: ana, timestamp: at(0), reactions: [] },
    { id: 11, text: "Τι κάνετε;", sender: ana, timestamp: at(1), reactions: [] },
    { id: 12, text: "Hello!", sender: partner, timestamp: at(2), reactions: [] },
    { id: 13, text: "Καλά!", sender: me, timestamp: at(3), status: "sent", reactions: [] },
  ];

  test("names each sender once per run and shows Seen by instead of ticks", () => {
    const { container } = render(
      <Conversation
        messages={groupMessages}
        userId={1}
        onDeleteMessage={jest.fn()}
        isGroup
        seenBy={{ messageId: 13, label: "Seen by ana" }}
      />
    );

    expect([...container.querySelectorAll(".cv-msg-sender")].map((node) => node.textContent)).toEqual([
      "ana",
      "konstantinos",
    ]);
    expect(screen.getByText("Seen by ana")).toBeInTheDocument();
    expect(container.querySelector(".cv-ticks")).toBeNull();
  });

  test("shows the group nickname as a message sender", () => {
    render(<Conversation messages={groupMessages} userId={1} onDeleteMessage={jest.fn()}
      isGroup groupNicknames={{ 3: "Annie" }} />);
    expect(screen.getByText("Annie")).toBeInTheDocument();
  });

  test("right clicking a group message avatar opens that sender's nickname editor", () => {
    const onEditGroupNickname = jest.fn();
    render(<Conversation messages={groupMessages} userId={1} onDeleteMessage={jest.fn()}
      isGroup onEditGroupNickname={onEditGroupNickname} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Edit nickname for ana" }));
    expect(onEditGroupNickname).toHaveBeenCalledWith("ana");
  });

  test("an empty group invites everyone to say hello (no openers)", () => {
    render(<Conversation messages={[]} userId={1} onDeleteMessage={jest.fn()} isGroup conversationId={9} />);

    expect(screen.getByText("This group is brand new. Say hello to everyone!")).toBeInTheDocument();
  });
});
