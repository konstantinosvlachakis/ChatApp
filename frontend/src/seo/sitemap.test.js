import { buildSitemapXml, indexablePaths } from "./sitemap";
import { SITE_URL } from "./config";
import { PRERENDERED_ROUTES } from "../routes/prerenderedRoutes";

describe("sitemap.xml generator", () => {
  const xml = buildSitemapXml(PRERENDERED_ROUTES, new Date("2026-11-08T23:30:00Z"));

  test("lists the indexable public pages only", () => {
    expect(indexablePaths(PRERENDERED_ROUTES)).toEqual([
      "/",
      "/how-it-works",
      "/exchange/english-spanish",
      "/exchange/greek-spanish",
      "/exchange/italian-english",
      "/login",
      "/register",
      "/privacy-policy",
      "/terms-and-conditions",
    ]);
    // Log in / sign up are indexable (sitelink candidates); password reset stays out.
    expect(xml).not.toMatch(/\/forgot-password|\/reset-password/);
  });

  test("writes absolute locs with the build date as lastmod", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    expect(xml).toContain(`<loc>${SITE_URL}/exchange/greek-spanish</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(9);
    expect(xml.match(/<lastmod>2026-11-08<\/lastmod>/g)).toHaveLength(9);
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });

  test("parses as XML", () => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.getElementsByTagName("loc")).toHaveLength(9);
  });
});
