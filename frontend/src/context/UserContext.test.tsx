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

const setHint = (present: boolean) => {
  document.cookie = present ? "lv_signed_in=1; path=/" : "lv_signed_in=; Max-Age=0; path=/";
};

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  loadingStates.length = 0;
  // jsdom starts on "/" (a public page): most tests model a signed-in browser.
  setHint(true);
});

describe("UserProvider", () => {
  it("doesn't ask the server on a public page when there is no session hint", async () => {
    setHint(false);
    renderProvider();
    await waitFor(() => expect(ctx.loading).toBe(false));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("name").textContent).toBe("none");
  });

  it("still checks a public page when a cached user exists without a hint", async () => {
    setHint(false);
    localStorage.setItem("user_profile_cache:v1", JSON.stringify({ user: { username: "ana" }, cachedAt: Date.now() }));
    mockFetch.mockResolvedValueOnce({ username: "ana" });
    renderProvider();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

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
