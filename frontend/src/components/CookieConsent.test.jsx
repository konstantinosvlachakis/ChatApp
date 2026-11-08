import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import CookieConsent from "./CookieConsent";
import CookieChoicesButton from "./CookieChoicesButton";
import AnalyticsRouteTracker from "./AnalyticsRouteTracker";
import * as analytics from "../lib/analytics";

const {
  CONSENT_STORAGE_KEY,
  GTAG_SCRIPT_BASE,
  getAnalyticsConsent,
  resetAnalyticsForTests,
} = analytics;

const gtagScripts = () => document.querySelectorAll(`script[src^="${GTAG_SCRIPT_BASE}"]`);

const renderBanner = () =>
  render(
    <MemoryRouter>
      <CookieChoicesButton />
      <CookieConsent />
    </MemoryRouter>
  );

describe("CookieConsent", () => {
  const originalId = process.env.REACT_APP_GA_MEASUREMENT_ID;

  beforeEach(() => {
    resetAnalyticsForTests();
    gtagScripts().forEach((script) => script.remove());
    delete window.dataLayer;
    delete window.gtag;
    window.localStorage.clear();
    process.env.REACT_APP_GA_MEASUREMENT_ID = "G-TEST123";
  });

  afterAll(() => {
    if (originalId === undefined) delete process.env.REACT_APP_GA_MEASUREMENT_ID;
    else process.env.REACT_APP_GA_MEASUREMENT_ID = originalId;
  });

  test("renders nothing (and no Cookie choices link) without a measurement id", () => {
    delete process.env.REACT_APP_GA_MEASUREMENT_ID;
    renderBanner();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cookie choices" })).not.toBeInTheDocument();
  });

  test("shows until a choice is made; Accept persists it and loads gtag.js", () => {
    renderBanner();
    const dialog = screen.getByRole("dialog", { name: "Analytics cookies" });
    expect(dialog).toHaveAttribute("aria-live", "polite");
    expect(dialog).toHaveTextContent("No ads, no message content.");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy-policy");
    expect(gtagScripts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getAnalyticsConsent()).toBe("granted");
    expect(gtagScripts()).toHaveLength(1);
  });

  test("Decline persists the choice and loads nothing; the banner stays closed next time", () => {
    const { unmount } = renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)).choice).toBe("denied");
    expect(gtagScripts()).toHaveLength(0);
    unmount();

    renderBanner();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Cookie choices reopens it with focus inside; Escape closes it", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ choice: "denied", updatedAt: "x" }));
    renderBanner();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const link = screen.getByRole("button", { name: "Cookie choices" });
    link.focus();
    fireEvent.click(link);
    expect(screen.getByRole("dialog")).toHaveTextContent("Current choice: declined.");
    expect(screen.getByRole("heading", { name: "Analytics cookies" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(link).toHaveFocus();
  });
});

describe("AnalyticsRouteTracker", () => {
  let navigateTo;
  const Nav = () => {
    navigateTo = useNavigate();
    return null;
  };

  test("tracks each new path once (query/hash-only changes are deduped)", () => {
    const spy = jest.spyOn(analytics, "trackPageView").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/community"]}>
        <Nav />
        <AnalyticsRouteTracker />
      </MemoryRouter>
    );
    act(() => navigateTo("/community?filter=near"));
    act(() => navigateTo("/community#top"));
    act(() => navigateTo("/people/ana"));
    act(() => navigateTo("/people/ana"));
    expect(spy.mock.calls).toEqual([["/community"], ["/people/ana"]]);
    spy.mockRestore();
  });
});
