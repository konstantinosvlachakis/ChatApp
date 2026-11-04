import { act, fireEvent, render, screen } from "@testing-library/react";
import MessageInput from "./MessageInput";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const renderInput = (onSendMessage) =>
  render(
    <MessageInput
      conversationId={42}
      onSendMessage={onSendMessage}
      onTyping={() => {}}
      onStopTyping={() => {}}
    />
  );

const typeAndEnter = (text) => {
  const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
  return input;
};

beforeEach(() => window.localStorage.clear());

describe("MessageInput sending", () => {
  test("Enter twice during a slow send posts once; the composer clears at once", async () => {
    const send = deferred();
    const onSendMessage = jest.fn(() => send.promise);
    renderInput(onSendMessage);

    const input = typeAndEnter("Hola");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith("Hola", null, null);
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    await act(async () => send.resolve(true));
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(window.localStorage.getItem("chat:draft:42")).toBeNull();
  });

  test("a failed send restores the text when the composer is still empty", async () => {
    const send = deferred();
    renderInput(jest.fn(() => send.promise));
    const input = typeAndEnter("Hola");

    await act(async () => send.resolve(false));
    expect(input).toHaveValue("Hola");
    expect(window.localStorage.getItem("chat:draft:42")).toBe("Hola");
  });

  test("a failed send keeps text typed during the upload", async () => {
    const send = deferred();
    renderInput(jest.fn(() => send.promise));
    const input = typeAndEnter("Hola");
    fireEvent.change(input, { target: { value: "Something new" } });

    await act(async () => send.resolve(false));
    expect(input).toHaveValue("Something new");
  });

  test("the disabled prop blocks sending", () => {
    const onSendMessage = jest.fn();
    render(
      <MessageInput
        conversationId={42}
        disabled
        onSendMessage={onSendMessage}
        onTyping={() => {}}
        onStopTyping={() => {}}
      />
    );
    const input = typeAndEnter("Hola");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue("Hola");
  });
});

describe("MessageInput replying", () => {
  test("choosing Reply focuses the composer with the cursor after the draft", () => {
    jest.useFakeTimers();
    window.localStorage.setItem("chat:draft:42", "Γεια");
    const props = { conversationId: 42, onSendMessage: jest.fn(), onTyping: () => {}, onStopTyping: () => {} };
    const { rerender } = render(<MessageInput {...props} />);
    const input = screen.getByRole("textbox", { name: "Message" });
    input.blur();

    rerender(<MessageInput {...props} replyingMessage={{ id: 7, text: "How are you?", sender: { username: "saxas" } }} />);
    act(() => jest.runOnlyPendingTimers());

    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe("Γεια".length);
    jest.useRealTimers();
  });
});
