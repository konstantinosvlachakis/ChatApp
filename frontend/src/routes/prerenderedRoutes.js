import { EXCHANGE_PAIR_SLUGS, exchangePairPath } from "../pages/Exchange/pairSlugs";

// Public routes rendered to static HTML at build time (scripts/prerender.js renders them
// with PublicAppRoutes; the backend `front` view serves build/<path>/index.html for them
// and build/app-shell.html, an empty neutral shell, for every other SPA path). The
// indexable ones (seo/config.js shouldIndex) also make up build/sitemap.xml.
export const PRERENDERED_ROUTES = [
  "/",
  "/how-it-works",
  ...EXCHANGE_PAIR_SLUGS.map(exchangePairPath),
  "/login",
  "/register",
  "/forgot-password",
  "/privacy-policy",
  "/terms-and-conditions",
];
