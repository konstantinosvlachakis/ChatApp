import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthLandingPage from "../AuthLandingPage";
import HowItWorksPage from "../HowItWorksPage";
import PublicFooter from "../../components/Public/PublicFooter";
import { EXCHANGE_PAIRS } from "../Exchange/pairs";
import { HOME_FAQ } from "./landingContent";
import { HOW_IT_WORKS_SECTIONS } from "./howItWorksContent";
import { buildSeoModel } from "../../seo/config";
import { trackEvent } from "../../lib/analytics";

jest.mock("../../lib/analytics", () => ({
  trackEvent: jest.fn(),
  isAnalyticsEnabled: () => false,
  openCookieChoices: jest.fn(),
}));

const renderAt = (path, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/register" element={<p>Register page</p>} />
      </Routes>
    </MemoryRouter>
  );

const wordCount = (element) => element.textContent.trim().split(/\s+/).filter(Boolean).length;

describe("home page sections", () => {
  afterEach(() => jest.clearAllMocks());

  test("keeps the hero and adds how it works, features, exchange guides and FAQ", () => {
    const { container } = renderAt("/", <AuthLandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Speak with confidence/ })).toBeInTheDocument();
    ["A language exchange in three steps", "Everything a language exchange needs", "Featured language exchanges", "Questions about LangVoyage"].forEach(
      (name) => expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument()
    );
    EXCHANGE_PAIRS.forEach((pair) => {
      expect(screen.getByRole("link", { name: new RegExp(`^${pair.label} exchange.*Read the guide`) })).toHaveAttribute(
        "href",
        pair.path
      );
    });
    expect(screen.getByRole("link", { name: /full guide to how LangVoyage works/ })).toHaveAttribute("href", "/how-it-works");
    expect(wordCount(container.querySelector("main"))).toBeGreaterThanOrEqual(400);
  });

  test("home FAQ matches the FAQPage structured data", () => {
    const { container } = renderAt("/", <AuthLandingPage />);
    const visible = Array.from(container.querySelectorAll(".lp-faq-item")).map((item) => ({
      question: item.querySelector("h3").textContent,
      answer: item.querySelector("p").textContent,
    }));
    expect(visible).toEqual(HOME_FAQ);
    const faqNode = buildSeoModel("/").structuredData["@graph"].find((node) => node["@type"] === "FAQPage");
    expect(faqNode.mainEntity.map((q) => ({ question: q.name, answer: q.acceptedAnswer.text }))).toEqual(visible);
  });

  test("sign-up CTAs are tracked as home", () => {
    renderAt("/", <AuthLandingPage />);
    fireEvent.click(screen.getByRole("link", { name: "Create a free account" }));
    expect(trackEvent).toHaveBeenCalledWith("landing_cta_clicked", { page: "home" });
  });
});

describe("HowItWorksPage", () => {
  afterEach(() => jest.clearAllMocks());

  test("explains every part of the app and links the pair guides and sign-up", () => {
    const { container } = renderAt("/how-it-works", <HowItWorksPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    HOW_IT_WORKS_SECTIONS.forEach((section) =>
      expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument()
    );
    EXCHANGE_PAIRS.forEach((pair) =>
      expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === pair.path)).toBe(true)
    );
    expect(wordCount(container.querySelector("main"))).toBeGreaterThanOrEqual(600);
    fireEvent.click(screen.getAllByRole("link", { name: "Create a free account" })[0]);
    expect(trackEvent).toHaveBeenCalledWith("landing_cta_clicked", { page: "how_it_works" });
  });
});

describe("PublicFooter", () => {
  test("links How it works, every pair guide, account and legal pages", () => {
    render(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>
    );
    const exchanges = screen.getByRole("navigation", { name: "Exchanges" });
    const hrefs = Array.from(exchanges.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/how-it-works", ...EXCHANGE_PAIRS.map((pair) => pair.path)]);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy-policy");
    expect(screen.getByRole("link", { name: "Terms and conditions" })).toHaveAttribute("href", "/terms-and-conditions");
  });
});

describe("home page motion", () => {
  const originalObserver = window.IntersectionObserver;
  let observers;

  const installObserver = () => {
    observers = [];
    window.IntersectionObserver = jest.fn(function MockObserver(callback) {
      this.callback = callback;
      this.targets = [];
      this.observe = (target) => this.targets.push(target);
      this.unobserve = jest.fn();
      this.disconnect = jest.fn();
      observers.push(this);
    });
  };

  afterEach(() => {
    window.IntersectionObserver = originalObserver;
  });

  test("without IntersectionObserver every section stays visible", () => {
    delete window.IntersectionObserver;
    const { container } = renderAt("/", <AuthLandingPage />);
    expect(container.querySelector(".lp-page")).not.toHaveClass("lp-js");
    container.querySelectorAll(".lp-reveal").forEach((item) => expect(item).toHaveClass("is-visible"));
  });

  test("reveals sections on scroll and shows the slim header after the hero", () => {
    installObserver();
    const { container } = renderAt("/", <AuthLandingPage />);
    expect(container.querySelector(".lp-page")).toHaveClass("lp-js");
    const [revealer, heroWatcher] = observers;
    const first = revealer.targets[0];
    expect(first).not.toHaveClass("is-visible");

    revealer.callback([{ isIntersecting: true, target: first }]);
    expect(first).toHaveClass("is-visible");

    const bar = container.querySelector(".lp-stickybar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("link", { name: "Create account" })).toHaveLength(1);

    const { act } = require("@testing-library/react");
    act(() => heroWatcher.callback([{ isIntersecting: false, boundingClientRect: { top: -40 } }]));
    expect(bar).toHaveClass("is-shown");
    expect(bar).not.toHaveAttribute("aria-hidden");
    expect(screen.getAllByRole("link", { name: "Create account" })).toHaveLength(2);
  });
});
