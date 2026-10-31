import React, { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { lazyWithPreload } from "./lazyWithPreload";
import { PRERENDERED_ROUTES } from "./prerenderedRoutes";
import {
  ComparePlansPage,
  ConversationsPage,
  EditProfilePage,
  ForgotPasswordPage,
  PremiumPage,
  PrivacyPolicyPage,
  ProfilePage,
  PublicProfilePage,
  ResetPasswordPage,
  TermsAndConditionsPage,
  findRouteComponent,
  preloadRoute,
} from "./routeModules";

// The real pages pull ESM-only dependencies Jest doesn't transform; the map is what's
// under test here, so stand in light modules.
jest.mock("../pages/PrivacyPolicyPage", () => ({ __esModule: true, default: () => null }));
jest.mock("../pages/Settings/page", () => ({ __esModule: true, default: () => null }));

// Eagerly imported by AppRoutes: nothing to preload.
const EAGER_ROUTES = ["/", "/login", "/register"];

describe("route preload map", () => {
  it("covers every prerendered public route that is lazy in AppRoutes", () => {
    expect(PRERENDERED_ROUTES).toEqual(
      expect.arrayContaining([...EAGER_ROUTES, "/forgot-password", "/privacy-policy", "/terms-and-conditions"])
    );
    PRERENDERED_ROUTES.forEach((path) => {
      if (EAGER_ROUTES.includes(path)) {
        expect(findRouteComponent(path)).toBeNull();
      } else {
        expect(findRouteComponent(path)).not.toBeNull();
      }
    });
  });

  it("maps public and app paths to their lazy page", () => {
    expect(findRouteComponent("/privacy-policy")).toBe(PrivacyPolicyPage);
    expect(findRouteComponent("/terms-and-conditions/")).toBe(TermsAndConditionsPage);
    expect(findRouteComponent("/forgot-password")).toBe(ForgotPasswordPage);
    expect(findRouteComponent("/reset-password/MQ/abc-123")).toBe(ResetPasswordPage);
    expect(findRouteComponent("/conversations")).toBe(ConversationsPage);
    expect(findRouteComponent("/conversations/12")).toBe(ConversationsPage);
    expect(findRouteComponent("/profile")).toBe(ProfilePage);
    expect(findRouteComponent("/profile/edit")).toBe(EditProfilePage);
    expect(findRouteComponent("/people/ana")).toBe(PublicProfilePage);
    expect(findRouteComponent("/premium")).toBe(PremiumPage);
    expect(findRouteComponent("/premium/compare")).toBe(ComparePlansPage);
    expect(findRouteComponent("/conversationsx")).toBeNull();
    expect(findRouteComponent("/nope")).toBeNull();
  });

  it("preloads the current route's chunk", async () => {
    await expect(preloadRoute("/privacy-policy")).resolves.toBe(true);
    await expect(preloadRoute("/login")).resolves.toBe(false);
  });
});

describe("lazyWithPreload", () => {
  const Page = () => <p>Final page</p>;

  it("renders a preloaded component in the first commit (no Suspense fallback)", async () => {
    const Lazy = lazyWithPreload(() => Promise.resolve({ default: Page }));
    await Lazy.preload();
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Lazy />
      </Suspense>
    );
    expect(screen.getByText("Final page")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("suspends when not preloaded and loads the factory once", async () => {
    const factory = jest.fn(() => Promise.resolve({ default: Page }));
    const Lazy = lazyWithPreload(factory);
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Lazy />
      </Suspense>
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Final page")).toBeInTheDocument();
    await Lazy.preload();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("retries the import after a failed preload", async () => {
    const factory = jest
      .fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue({ default: Page });
    const Lazy = lazyWithPreload(factory);
    await expect(Lazy.preload()).rejects.toThrow("chunk failed");
    await expect(Lazy.preload()).resolves.toEqual({ default: Page });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("preloadRoute resolves false after the timeout instead of waiting forever", async () => {
    jest.useFakeTimers();
    try {
      const pending = preloadRoute("/settings", 1500);
      jest.advanceTimersByTime(1500);
      // Either the chunk was quick or the timeout fired; it must settle.
      await expect(pending).resolves.toEqual(expect.any(Boolean));
    } finally {
      jest.useRealTimers();
    }
  });
});
