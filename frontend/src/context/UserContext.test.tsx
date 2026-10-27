import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { UserProvider, useUser } from "./UserContext";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";

jest.mock("../pages/Conversations/api/fetchUserProfile", () => ({
  fetchUserProfile: jest.fn(),
}));

const mockFetch = fetchUserProfile as jest.Mock;
let ctx: ReturnType<typeof useUser>;
const loadingStates: boolean[] = [];

const Probe = () => {
  ctx = useUser();
  loadingStates.push(ctx.loading);
  return <span data-testid="name">{ctx.user?.username || "none"}</span>;
};

const renderProvider = () =>
  render(
    <UserProvider>
      <Probe />
    </UserProvider>
  );

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  loadingStates.length = 0;
});

describe("UserProvider", () => {
  it("keeps the user and stays out of loading during a background refresh", async () => {
    mockFetch.mockResolvedValueOnce({ username: "ana" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("ana"));

    mockFetch.mockResolvedValueOnce({ username: "ana2" });
    loadingStates.length = 0;
    await act(() => ctx.refreshUserProfile());

    expect(screen.getByTestId("name").textContent).toBe("ana2");
    expect(loadingStates).not.toContain(true);
  });

  it("keeps the session when a refresh fails with a network error", async () => {
    mockFetch.mockResolvedValueOnce({ username: "ana" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("ana"));

    mockFetch.mockRejectedValueOnce(new Error("Network Error"));
    await act(() => ctx.refreshUserProfile());

    expect(screen.getByTestId("name").textContent).toBe("ana");
  });

  it("ignores an older refresh that resolves after a newer one", async () => {
    mockFetch.mockResolvedValueOnce({ username: "ana" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("ana"));

    const slow = deferred<{ username: string }>();
    mockFetch.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ username: "newest" });
    let first!: Promise<void>;
    await act(async () => {
      first = ctx.refreshUserProfile();
      await ctx.refreshUserProfile();
    });
    await act(async () => {
      slow.resolve({ username: "stale" });
      await first;
    });

    expect(screen.getByTestId("name").textContent).toBe("newest");
  });

  it("does not restore the user when a refresh resolves after logout", async () => {
    mockFetch.mockResolvedValueOnce({ username: "ana" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("ana"));

    const slow = deferred<{ username: string }>();
    mockFetch.mockReturnValueOnce(slow.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = ctx.refreshUserProfile();
      ctx.setUser(null);
    });
    await act(async () => {
      slow.resolve({ username: "ana" });
      await pending;
    });

    expect(screen.getByTestId("name").textContent).toBe("none");
    expect(ctx.loading).toBe(false);
  });
});
