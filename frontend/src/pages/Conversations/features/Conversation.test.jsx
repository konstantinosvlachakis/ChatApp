import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  test("names each sender once per run and shows Seen by next to the ticks", () => {
    const { container } = render(
      <Conversation
        messages={groupMessages}
        userId={1}
        onDeleteMessage={jest.fn()}
        isGroup
        seenBy={{ messageId: 13, label: "Seen by ana", readers: ["ana"], allRead: false }}
      />
    );

    expect([...container.querySelectorAll(".cv-msg-sender")].map((node) => node.textContent)).toEqual([
      "ana",
      "konstantinos",
    ]);
    expect(screen.getByText("Seen by ana")).toBeInTheDocument();
    const ticks = container.querySelector(".cv-ticks");
    expect(ticks).toHaveAttribute("title", "Delivered");
    expect(ticks).not.toHaveClass("is-read");
  });

  test("group ticks: a single tick until someone reads, blue once everyone has", () => {
    const props = { messages: groupMessages, userId: 1, onDeleteMessage: jest.fn(), isGroup: true };
    const { container, rerender } = render(
      <Conversation {...props} seenBy={{ messageId: 13, label: null, readers: [], allRead: false }} />
    );
    expect(container.querySelector(".cv-ticks")).toHaveAttribute("title", "Sent");
    expect(screen.queryByText("Sent", { selector: ".cv-seen-by" })).toBeNull();

    rerender(
      <Conversation {...props} seenBy={{ messageId: 13, label: "Seen by everyone", readers: ["ana"], allRead: true }} />
    );
    expect(container.querySelector(".cv-ticks")).toHaveClass("is-read");
    expect(screen.getByText("Seen by everyone")).toHaveClass("is-read");
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

describe("Conversation corrections", () => {
  const correctable = {
    id: 10,
    text: "I goed home",
    sender: partner,
    timestamp: at(3),
    reactions: [],
    accepts_corrections: true,
    corrections: [
      {
        id: 7,
        corrector: me,
        corrected_text: "I went home",
        note: "go → went",
        created_at: at(4),
        updated_at: at(4),
      },
    ],
  };

  beforeEach(() => {
    api.post.mockReset();
    api.delete.mockReset();
  });

  test("shows a word diff card with strikethrough and underline marks", () => {
    const { container } = render(
      <Conversation messages={[correctable]} userId={1} onDeleteMessage={jest.fn()} learningEnabled />
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(container.querySelector("del.cv-diff-del")).toHaveTextContent("goed");
    expect(container.querySelector("ins.cv-diff-ins")).toHaveTextContent("went");
    expect(screen.getByText("Why?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove your correction" })).toBeInTheDocument();
  });

  test("hides corrections and learning actions outside ChatRoom", () => {
    const { container } = render(<Conversation messages={[correctable]} userId={1} onDeleteMessage={jest.fn()} />);
    expect(container.querySelector(".cv-correction")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.queryByRole("button", { name: "Save to phrasebook" })).toBeNull();
  });

  test("saves a correction to the phrasebook", async () => {
    const onPhrasebookChange = jest.fn();
    api.post.mockResolvedValue({ entry: { id: 1 }, created: true });
    render(
      <Conversation
        messages={[correctable]}
        userId={1}
        onDeleteMessage={jest.fn()}
        learningEnabled
        onPhrasebookChange={onPhrasebookChange}
      />
    );
    const save = screen.getByRole("button", { name: "Save your correction to your phrasebook" });
    fireEvent.click(save);
    await waitFor(() => expect(onPhrasebookChange).toHaveBeenCalled());
    await waitFor(() => expect(save).not.toBeDisabled());
    expect(api.post).toHaveBeenCalledWith("/api/phrasebook/", {
      message_id: 10,
      source: "correction",
      correction_id: 7,
    });
  });

  test("menu offers to suggest a correction on a partner's message and ask on my own", () => {
    const mine = { id: 11, text: "Me gusta", sender: me, timestamp: at(5), reactions: [], correction_requested: false };
    const fresh = { ...correctable, corrections: [] };
    render(
      <Conversation
        messages={[fresh, mine]}
        userId={1}
        onDeleteMessage={jest.fn()}
        learningEnabled
        correctionPreference="when_asked"
      />
    );
    const toggles = screen.getAllByRole("button", { name: "Message actions" });
    fireEvent.click(toggles[0]);
    expect(screen.getByRole("button", { name: "Suggest a correction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to phrasebook" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask for corrections" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Message actions" }), { key: "Escape" });
    fireEvent.click(toggles[1]);
    expect(screen.getByRole("button", { name: "Ask for corrections" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suggest a correction" })).toBeNull();
  });

  test("the correction dialog sends the corrected sentence and merges the reply", async () => {
    const onMessageUpdate = jest.fn();
    const fresh = { ...correctable, corrections: [] };
    const updated = { ...correctable };
    api.post.mockResolvedValue(updated);
    render(
      <Conversation
        messages={[fresh]}
        userId={1}
        onDeleteMessage={jest.fn()}
        learningEnabled
        onMessageUpdate={onMessageUpdate}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest a correction" }));
    const send = screen.getByRole("button", { name: "Send correction" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Corrected sentence"), { target: { value: "I went home" } });
    fireEvent.click(screen.getByRole("button", { name: "Send correction" }));
    await waitFor(() => expect(onMessageUpdate).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Send correction" })).toBeNull());
    expect(api.post).toHaveBeenCalledWith("/api/messages/10/correction/", { corrected_text: "I went home", note: "" });
    expect(onMessageUpdate).toHaveBeenCalledWith(updated);
  });
});
