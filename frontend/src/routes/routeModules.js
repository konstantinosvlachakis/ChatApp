import { lazyWithPreload } from "./lazyWithPreload";

// Lazy route components, shared by AppRoutes.jsx and the boot preload in src/index.js.
// `/`, `/login` and `/register` are imported eagerly by AppRoutes (no chunk to wait for).
export const PrivacyPolicyPage = lazyWithPreload(() => import("../pages/PrivacyPolicyPage"));
export const TermsAndConditionsPage = lazyWithPreload(() =>
  import("../pages/TermsAndConditionsPage")
);
export const ForgotPasswordPage = lazyWithPreload(() => import("../pages/ForgotPasswordPage"));
export const ResetPasswordPage = lazyWithPreload(() => import("../pages/ResetPasswordPage"));
export const ConversationsPage = lazyWithPreload(() => import("../pages/Conversations/page"));
export const ProfilePage = lazyWithPreload(() => import("../pages/Profile/page"));
export const EditProfilePage = lazyWithPreload(() => import("../pages/Profile/EditProfilePage"));
export const CommunityPage = lazyWithPreload(() => import("../pages/Community/page"));
export const SettingsPage = lazyWithPreload(() => import("../pages/Settings/page"));
export const PublicProfilePage = lazyWithPreload(() => import("../pages/PublicProfile/page"));
export const PracticePage = lazyWithPreload(() => import("../pages/Practice/PracticePage"));
export const PremiumPage = lazyWithPreload(() => import("../pages/PremiumPage"));
export const ComparePlansPage = lazyWithPreload(() => import("../pages/ComparePlansPage"));

const exact = (path) => (pathname) => pathname === path;
const prefix = (path) => (pathname) => pathname.startsWith(path);
const section = (path) => (pathname) => pathname === path || pathname.startsWith(`${path}/`);

// Order matters: more specific paths first. Keep in sync with AppRoutes.jsx.
const ROUTE_COMPONENTS = [
  [exact("/privacy-policy"), PrivacyPolicyPage],
  [exact("/terms-and-conditions"), TermsAndConditionsPage],
  [exact("/forgot-password"), ForgotPasswordPage],
  [prefix("/reset-password/"), ResetPasswordPage],
  [section("/conversations"), ConversationsPage],
  [exact("/profile/edit"), EditProfilePage],
  [exact("/profile"), ProfilePage],
  [exact("/settings"), SettingsPage],
  [exact("/community"), CommunityPage],
  [prefix("/people/"), PublicProfilePage],
  [exact("/practice"), PracticePage],
  [exact("/premium/compare"), ComparePlansPage],
  [exact("/premium"), PremiumPage],
];

export const ROUTE_PRELOAD_TIMEOUT_MS = 1500;

const normalizePath = (pathname) => {
  const path = String(pathname || "/");
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
};

/** The lazy component that renders `pathname`, or null (eager page / unknown path). */
export const findRouteComponent = (pathname) => {
  const path = normalizePath(pathname);
  const match = ROUTE_COMPONENTS.find(([matches]) => matches(path));
  return match ? match[1] : null;
};

/**
 * Load the current route's chunk before the first render, waiting at most `timeoutMs`
 * so a slow network can't hold the page (it then renders with the Suspense fallback).
 * Never rejects; resolves true when the chunk is ready.
 */
export const preloadRoute = (pathname, timeoutMs = ROUTE_PRELOAD_TIMEOUT_MS) => {
  const component = findRouteComponent(pathname);
  if (!component) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    component.preload().then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      }
    );
  });
};
