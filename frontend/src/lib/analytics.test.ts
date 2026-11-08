import {
  CONSENT_STORAGE_KEY,
  GTAG_SCRIPT_BASE,
  denyAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  initAnalytics,
  messageKindFromForm,
  resetAnalyticsForTests,
  routeTitle,
  sanitizePath,
  trackEvent,
  trackMessageSent,
  trackPageView,
} from "./analytics";

const ID = "G-TEST123";
const gtagScripts = () => Array.from(document.querySelectorAll(`script[src^="${GTAG_SCRIPT_BASE}"]`));
const calls = () => (window.dataLayer || []).map((entry) => Array.from(entry as ArrayLike<unknown>));
const eventCalls = (name?: string) =>
  calls().filter((call) => call[0] === "event" && (!name || call[1] === name));

describe("analytics", () => {
  const originalId = process.env.REACT_APP_GA_MEASUREMENT_ID;

  beforeEach(() => {
    resetAnalyticsForTests();
    gtagScripts().forEach((script) => script.remove());
    delete window.dataLayer;
    delete window.gtag;
    window.localStorage.clear();
    process.env.REACT_APP_GA_MEASUREMENT_ID = ID;
  });

  afterAll(() => {
    if (originalId === undefined) delete process.env.REACT_APP_GA_MEASUREMENT_ID;
    else process.env.REACT_APP_GA_MEASUREMENT_ID = originalId;
  });

  test("every function is a no-op without REACT_APP_GA_MEASUREMENT_ID", () => {
    delete process.env.REACT_APP_GA_MEASUREMENT_ID;
    initAnalytics();
    grantAnalyticsConsent();
    trackPageView("/profile");
    expect(trackEvent("login", { method: "email" })).toBe(false);
    denyAnalyticsConsent();
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
    expect(gtagScripts()).toHaveLength(0);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  test("queues the consent-mode default first and loads no script before consent", () => {
    initAnalytics();
    trackPageView("/community");
    expect(trackEvent("login", { method: "email" })).toBe(false);
    expect(calls()).toEqual([
      [
        "consent",
        "default",
        {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "denied",
          wait_for_update: 500,
        },
      ],
    ]);
    expect(gtagScripts()).toHaveLength(0);
  });

  test("Accept injects gtag.js once, grants analytics only and sends the pending page view", () => {
    initAnalytics();
    trackPageView("/people/ana?tab=1#x");
    grantAnalyticsConsent();
    grantAnalyticsConsent();

    expect(gtagScripts()).toHaveLength(1);
    expect(gtagScripts()[0].getAttribute("src")).toBe(`${GTAG_SCRIPT_BASE}?id=${ID}`);
    expect(getAnalyticsConsent()).toBe("granted");
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || "{}").updatedAt).toEqual(expect.any(String));
    const all = calls();
    expect(all[0][0]).toBe("consent");
    expect(all[0][1]).toBe("default");
    expect(all).toContainEqual(["consent", "update", { analytics_storage: "granted" }]);
    expect(all).toContainEqual([
      "config",
      ID,
      {
        send_page_view: false,
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
    expect(all.filter((call) => call[0] === "config")).toHaveLength(1);
    expect(eventCalls("page_view")).toEqual([
      [
        "event",
        "page_view",
        {
          page_path: "/people/:username",
          page_location: `${window.location.origin}/people/:username`,
          page_title: "Public profile",
        },
      ],
    ]);
  });

  test("sanitised page context is set before config and on every page, so no hit carries the raw URL", () => {
    initAnalytics();
    trackPageView("/conversations/481");
    grantAnalyticsConsent();
    trackPageView("/people/maria_92?ref=x");

    const all = calls();
    const sets = all.filter((call) => call[0] === "set");
    const configIndex = all.findIndex((call) => call[0] === "config");
    const firstSetIndex = all.findIndex((call) => call[0] === "set");
    expect(firstSetIndex).toBeGreaterThan(-1);
    expect(firstSetIndex).toBeLessThan(configIndex);
    expect(sets[sets.length - 1][1]).toEqual({
      page_location: `${window.location.origin}/people/:username`,
      page_path: "/people/:username",
      page_title: "Public profile",
      page_referrer: `${window.location.origin}/conversations/:id`,
    });
    const serialized = JSON.stringify(all);
    expect(serialized).not.toContain("481");
    expect(serialized).not.toContain("maria_92");
    expect(serialized).not.toContain("ref=x");
  });

  test("a stored grant resumes on the next load", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ choice: "granted", updatedAt: "x" }));
    initAnalytics();
    expect(gtagScripts()).toHaveLength(1);
    expect(trackEvent("premium_viewed")).toBe(true);
  });

  test("Decline loads nothing, and withdrawing stops sending and deletes _ga cookies", () => {
    initAnalytics();
    denyAnalyticsConsent();
    expect(gtagScripts()).toHaveLength(0);
    expect(getAnalyticsConsent()).toBe("denied");

    grantAnalyticsConsent();
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_TEST123=GS1.1.456; path=/";
    document.cookie = "keep=1; path=/";
    denyAnalyticsConsent();

    expect(calls()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(window[`ga-disable-${ID}`]).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toMatch(/keep=1/);
    expect(trackEvent("login", { method: "email" })).toBe(false);
    document.cookie = "keep=; Max-Age=0; path=/";
  });

  test("storage failures don't break consent", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getAnalyticsConsent()).toBeNull();
    expect(() => grantAnalyticsConsent()).not.toThrow();
    expect(trackEvent("premium_viewed")).toBe(true);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  test.each([
    ["/", "/", "Home"],
    ["/login?next=/conversations/4", "/login", "Log in"],
    ["/register#step", "/register", "Sign up"],
    ["/reset-password/MTI/c4x-0a1b2c3d4e5f6a7b8c9d", "/reset-password/:uid/:token", "Reset password"],
    ["/verify-email?token=abc", "/verify-email", "Verify email"],
    ["/verify-email/abc123def456ghi789", "/verify-email/:token", "Verify email"],
    ["/people/ana.lopez", "/people/:username", "Public profile"],
    ["/people/ana/", "/people/:username", "Public profile"],
    ["/profile/public/ana", "/profile/public/:username", "Public profile"],
    ["/conversations/42", "/conversations/:id", "Conversation"],
    ["/conversations", "/conversations", "Conversations"],
    ["/phrasebook/review", "/phrasebook/review", "Phrasebook review"],
    ["/premium/compare", "/premium/compare", "Compare plans"],
    ["/something/123/me@example.com", "/something/:id/:token", "Other"],
  ])("sanitizes %s", (input, path, title) => {
    expect(sanitizePath(input)).toBe(path);
    expect(routeTitle(path)).toBe(title);
  });

  test("trackEvent drops unknown events, unknown params and unsafe values", () => {
    grantAnalyticsConsent();
    expect(trackEvent("message_text", { text: "hola" })).toBe(false);
    trackEvent("login", { method: "google", email: "me@example.com", username: "ana" });
    trackEvent("phrase_saved", { source: "x".repeat(41) });
    trackEvent("sign_up", { method: "me@example.com" });
    trackEvent("exchange_completed", { duration_minutes: 20, ended_early: true });
    trackEvent("exchange_started", { duration_minutes: Number.NaN });

    expect(eventCalls("message_text")).toHaveLength(0);
    expect(eventCalls("login")).toEqual([["event", "login", { method: "google" }]]);
    expect(eventCalls("phrase_saved")).toEqual([["event", "phrase_saved", {}]]);
    expect(eventCalls("sign_up")).toEqual([["event", "sign_up", {}]]);
    expect(eventCalls("exchange_completed")).toEqual([
      ["event", "exchange_completed", { duration_minutes: 20, ended_early: true }],
    ]);
    expect(eventCalls("exchange_started")).toEqual([["event", "exchange_started", {}]]);
  });

  test("message_sent is sent once per conversation and never carries the id", () => {
    grantAnalyticsConsent();
    expect(trackMessageSent(7, "text")).toBe(true);
    expect(trackMessageSent(7, "voice")).toBe(false);
    expect(trackMessageSent(8, "gif")).toBe(true);
    expect(eventCalls("message_sent")).toEqual([
      ["event", "message_sent", { kind: "text" }],
      ["event", "message_sent", { kind: "gif" }],
    ]);
  });

  test("messageKindFromForm", () => {
    const form = (entries: Array<[string, string | Blob]>) => {
      const data = new FormData();
      entries.forEach(([key, value]) => data.append(key, value));
      return data;
    };
    expect(messageKindFromForm(form([["text", "hi"]]))).toBe("text");
    expect(messageKindFromForm(form([["kind", "sticker"]]))).toBe("sticker");
    expect(messageKindFromForm(form([["attachment", new Blob(["a"], { type: "audio/webm" })]]))).toBe("voice");
    expect(messageKindFromForm(form([["attachment", new Blob(["a"], { type: "image/png" })]]))).toBe("attachment");
  });
});
