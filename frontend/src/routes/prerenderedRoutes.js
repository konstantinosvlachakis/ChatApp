// Public routes rendered to static HTML at build time (scripts/prerender.js renders them
// with PublicAppRoutes; the backend `front` view serves build/<path>/index.html for them
// and build/app-shell.html, an empty neutral shell, for every other SPA path).
export const PRERENDERED_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/privacy-policy",
  "/terms-and-conditions",
];
