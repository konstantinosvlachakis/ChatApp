import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ExchangePairPage from "./ExchangePairPage";
import { EXCHANGE_PAIRS } from "./pairs";
import { PAIR_DETAILS } from "./pairDetails";
import { EXCHANGE_PAIR_SLUGS } from "./pairSlugs";
import { buildSeoModel } from "../../seo/config";
import { trackEvent } from "../../lib/analytics";

jest.mock("../../lib/analytics", () => ({
  trackEvent: jest.fn(),
  isAnalyticsEnabled: () => false,
  openCookieChoices: jest.fn(),
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exchange/:pair" element={<ExchangePairPage />} />
        <Route path="/register" element={<p>Register page</p>} />
      </Routes>
    </MemoryRouter>
  );

const faqFromPage = (container) =>
  Array.from(container.querySelectorAll(".lp-faq-item")).map((item) => ({
    question: item.querySelector("h3").textContent,
    answer: item.querySelector("p").textContent,
  }));

const wordCount = (element) => element.textContent.trim().split(/\s+/).filter(Boolean).length;

describe("ExchangePairPage", () => {
  afterEach(() => jest.clearAllMocks());

  test("the content modules cover exactly the public slugs", () => {
    expect(EXCHANGE_PAIRS.map((pair) => pair.slug)).toEqual([...EXCHANGE_PAIR_SLUGS]);
    expect(Object.keys(PAIR_DETAILS)).toEqual([...EXCHANGE_PAIR_SLUGS]);
  });

  test.each(EXCHANGE_PAIRS.map((pair) => [pair.slug, pair]))("%s renders its own heading, notes and FAQ", (slug, pair) => {
    const { container } = renderAt(`/exchange/${slug}`);
    expect(screen.getByRole("heading", { level: 1, name: pair.heading })).toBeInTheDocument();
    PAIR_DETAILS[slug].sides.forEach((side) => expect(screen.getByRole("heading", { name: side.title })).toBeInTheDocument());
    expect(faqFromPage(container)).toEqual(pair.faq);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(`Home${pair.label} exchange`);
    // Substantial, real copy (≈500–800 words of content plus navigation).
    expect(wordCount(container.querySelector("main"))).toBeGreaterThanOrEqual(500);
  });

  test("headings and FAQs differ between pairs (no name-swapped pages)", () => {
    const headings = new Set(EXCHANGE_PAIRS.map((pair) => pair.heading));
    expect(headings.size).toBe(EXCHANGE_PAIRS.length);
    const questions = EXCHANGE_PAIRS.flatMap((pair) => pair.faq.map((item) => item.question));
    expect(new Set(questions).size).toBe(questions.length);
    EXCHANGE_PAIRS.forEach((pair) => {
      expect(pair.faq.length).toBeGreaterThanOrEqual(4);
      expect(pair.faq.length).toBeLessThanOrEqual(6);
    });
  });

  test("visible FAQ matches the FAQPage structured data", () => {
    EXCHANGE_PAIRS.forEach((pair) => {
      const { container, unmount } = renderAt(pair.path);
      const graph = buildSeoModel(pair.path).structuredData["@graph"];
      const faqNode = graph.find((node) => node["@type"] === "FAQPage");
      const structured = faqNode.mainEntity.map((entry) => ({
        question: entry.name,
        answer: entry.acceptedAnswer.text,
      }));
      expect(structured).toEqual(faqFromPage(container));
      unmount();
    });
  });

  test("sign-up CTAs prefill both directions and are tracked", () => {
    renderAt("/exchange/english-spanish");
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    const links = within(hero).getAllByRole("link").filter((link) => link.getAttribute("href").startsWith("/register"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/register?speak=english&learn=spanish",
      "/register?speak=spanish&learn=english",
    ]);
    fireEvent.click(links[1]);
    expect(trackEvent).toHaveBeenCalledWith("landing_cta_clicked", { page: "pair", pair: "english-spanish" });
    expect(screen.getByText("Register page")).toBeInTheDocument();
  });

  test("Greek–Spanish CTAs put the Spanish speaker first", () => {
    renderAt("/exchange/greek-spanish");
    expect(screen.getAllByRole("link", { name: "Hablo español, I'm learning Greek" })[0]).toHaveAttribute(
      "href",
      "/register?speak=spanish&learn=greek"
    );
    expect(screen.getAllByRole("link", { name: "Μιλάω ελληνικά, I'm learning Spanish" })[0]).toHaveAttribute(
      "href",
      "/register?speak=greek&learn=spanish"
    );
  });

  test("an unknown pair shows a not-found state with links to the guides, and is noindex", () => {
    renderAt("/exchange/klingon-english");
    expect(
      screen.getByRole("heading", { level: 1, name: "We don't have a guide for that exchange yet" })
    ).toBeInTheDocument();
    EXCHANGE_PAIRS.forEach((pair) => {
      expect(screen.getAllByRole("link", { name: new RegExp(`${pair.label} exchange`) })[0]).toHaveAttribute(
        "href",
        pair.path
      );
    });
    expect(buildSeoModel("/exchange/klingon-english").shouldIndex).toBe(false);
  });
});
