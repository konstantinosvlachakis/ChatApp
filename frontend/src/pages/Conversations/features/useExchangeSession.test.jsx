import { act, renderHook, waitFor } from "@testing-library/react";
import useExchangeSession from "./useExchangeSession";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    API_TIMEOUTS: { default: 15000, upload: 60000, coach: 35000 },
    ApiError: actual.ApiError,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: actual.isAbortError,
  };
});

const { ApiError } = jest.requireActual("../../../lib/apiError");

const session = (overrides = {}) => ({
  id: 5,
  conversation_id: 3,
  status: "pending",
  created_by: { id: 1, username: "ana" },
  partner: { id: 2, username: "ben" },
  duration_minutes: 20,
  first_language: "english",
  second_language: "spanish",
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  server_time: new Date().toISOString(),
  ...overrides,
});

const OPTIONS = { languages: ["english", "spanish"], default_languages: ["spanish", "english"], durations: [10, 20, 30] };

beforeEach(() => jest.clearAllMocks());

test("loads the session, merges socket updates by id and ignores other chats", async () => {
  api.get.mockResolvedValue({ session: session(), ...OPTIONS });
  const { result } = renderHook(() => useExchangeSession(3));
  await waitFor(() => expect(result.current.session?.id).toBe(5));
  expect(api.get).toHaveBeenCalledWith("/api/conversations/3/session/", expect.anything());
  expect(result.current.options.default_languages).toEqual(["spanish", "english"]);

  act(() => result.current.applySession(session({ status: "active", conversation_id: 99 })));
  expect(result.current.session.status).toBe("pending");
  act(() => result.current.applySession(session({ status: "active" })));
  expect(result.current.session.status).toBe("active");
  // A late pending broadcast doesn't undo the accept.
  act(() => result.current.applySession(session({ status: "pending" })));
  expect(result.current.session.status).toBe("active");
});

test("actions post to the session and adopt the response", async () => {
  api.get.mockResolvedValue({ session: session(), ...OPTIONS });
  api.post.mockResolvedValue({ session: session({ status: "active" }) });
  const { result } = renderHook(() => useExchangeSession(3));
  await waitFor(() => expect(result.current.session?.id).toBe(5));
  await act(() => result.current.runAction("accept"));
  expect(api.post).toHaveBeenCalledWith("/api/exchange-sessions/5/accept/", {}, expect.anything());
  expect(result.current.session.status).toBe("active");
});

test("starting when a session exists adopts the one from the 409 body", async () => {
  api.get.mockResolvedValue({ session: null, ...OPTIONS });
  const existing = session({ id: 9 });
  api.post.mockRejectedValue(
    new ApiError({ status: 409, code: "session_exists", message: "exists", data: { session: existing } })
  );
  const { result } = renderHook(() => useExchangeSession(3));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let returned;
  await act(async () => {
    returned = await result.current.start({ duration_minutes: 20, first_language: "english", second_language: "spanish" });
  });
  expect(api.post).toHaveBeenCalledWith(
    "/api/conversations/3/session/",
    { duration_minutes: 20, first_language: "english", second_language: "spanish" },
    expect.anything()
  );
  expect(returned.id).toBe(9);
  expect(result.current.session.id).toBe(9);
});

test("does nothing for groups", () => {
  renderHook(() => useExchangeSession(3, { enabled: false }));
  expect(api.get).not.toHaveBeenCalled();
});
