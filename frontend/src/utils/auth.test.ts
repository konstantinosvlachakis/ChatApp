import {
  REFRESH_COOLDOWN_MS,
  clearClientSessionData,
  hasSessionHint,
  isPublicPath,
  refreshSessionOnce,
  resetRefreshCooldown,
  shouldCheckSession,
} from "./auth";

const setHint = () => {
  document.cookie = "lv_signed_in=1; path=/";
};

describe("session hint", () => {
  afterEach(() => {
    document.cookie = "lv_signed_in=; Max-Age=0; path=/";
  });

  test("logout-style cleanup removes the hint", () => {
    setHint();
    clearClientSessionData();
    expect(hasSessionHint()).toBe(false);
    expect(shouldCheckSession("/login")).toBe(false);
  });

  test("post-login cleanup keeps the hint the login response just set", () => {
    setHint();
    clearClientSessionData({ keepSessionHint: true });
    expect(hasSessionHint()).toBe(true);
    expect(shouldCheckSession("/login")).toBe(true);
  });

  test("app pages are always checked", () => {
    expect(shouldCheckSession("/profile")).toBe(true);
  });

  test("landing pages are public (no session check without a hint)", () => {
    expect(isPublicPath("/how-it-works")).toBe(true);
    expect(isPublicPath("/exchange/english-spanish")).toBe(true);
    expect(shouldCheckSession("/exchange/greek-spanish")).toBe(false);
  });
});

describe("session refresh", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    resetRefreshCooldown();
    fetchMock = jest.fn(async () => ({ ok: true, clone: () => ({ json: async () => ({}) }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("concurrent callers share one request", async () => {
    await Promise.all([refreshSessionOnce(), refreshSessionOnce(), refreshSessionOnce()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a refresh that just succeeded is reused instead of hitting the throttled endpoint", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-10T10:00:00Z") });
    await expect(refreshSessionOnce()).resolves.toBe(true);
    // e.g. a socket rejected right after reconnecting: no second request within the cooldown
    await expect(refreshSessionOnce()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(Date.now() + REFRESH_COOLDOWN_MS + 1);
    await refreshSessionOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a failed refresh does not start the cooldown", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(refreshSessionOnce()).resolves.toBe(false);
    await expect(refreshSessionOnce()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
