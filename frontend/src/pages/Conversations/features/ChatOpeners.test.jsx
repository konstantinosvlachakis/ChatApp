import { fireEvent, render, screen } from "@testing-library/react";
import ChatOpeners, { resetChatOpenersCache } from "./ChatOpeners";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: () => false,
  };
});

const LINES = ["Hi! Want to swap Greek for Spanish?", "What's your favourite dish?", "How is Madrid in spring?"];

beforeEach(() => {
  jest.clearAllMocks();
  resetChatOpenersCache();
});

test("shows three lines and hands the picked one to the composer", async () => {
  api.get.mockResolvedValue({ openers: LINES, source: "ai" });
  const onPick = jest.fn();
  render(<ChatOpeners conversationId={42} onPick={onPick} />);

  expect(screen.getByRole("heading", { name: "Start the conversation" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Finding opening lines" })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: LINES[1] }));
  expect(onPick).toHaveBeenCalledWith(LINES[1]);
  expect(api.get).toHaveBeenCalledWith("/api/conversations/42/openers/", expect.objectContaining({ signal: expect.anything() }));
});

test("fetches once per chat and falls back to the plain empty state on errors", async () => {
  api.get.mockResolvedValueOnce({ openers: LINES });
  const { unmount } = render(<ChatOpeners conversationId={1} onPick={() => {}} />);
  await screen.findByRole("button", { name: LINES[0] });
  unmount();
  render(<ChatOpeners conversationId={1} onPick={() => {}} />);
  expect(screen.getByRole("button", { name: LINES[0] })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);

  api.get.mockRejectedValueOnce(new Error("offline"));
  render(<ChatOpeners conversationId={2} onPick={() => {}} />);
  expect(await screen.findByText("No messages yet. Say hello!")).toBeInTheDocument();
});
