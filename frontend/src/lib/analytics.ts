/**
 * Google Analytics 4, privacy-safe. The only module that talks to GA.
 *
 * - Off (every function a no-op) unless REACT_APP_GA_MEASUREMENT_ID is set at build time.
 * - Google consent mode v2: `consent default` (everything denied) is queued before anything
 *   else; gtag.js is injected only after the visitor accepts, then analytics_storage is
 *   granted (ad storage / personalisation stay denied).
 * - The choice lives in localStorage `lv:analytics-consent` ({choice, updatedAt}).
 *   Declining after accepting stops sending and deletes the `_ga*` cookies.
 * - Page paths are sanitised (ids, usernames and tokens replaced, no query or hash) and
 *   events/params are allowlisted, so no message text, usernames, emails or ids reach GA.
 * No GTM container snippet in public/index.html: this module is the whole integration.
 */

export const CONSENT_STORAGE_KEY = "lv:analytics-consent";
/** window event: open the cookie banner again (footer "Cookie choices"). */
export const COOKIE_CHOICES_EVENT = "lv:cookie-choices";
/** window event: the stored consent changed (detail = "granted" | "denied"). */
export const CONSENT_CHANGE_EVENT = "lv:analytics-consent-change";
export const GTAG_SCRIPT_BASE = "https://www.googletagmanager.com/gtag/js";

export type AnalyticsConsent = "granted" | "denied";
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export const getMeasurementId = (): string => (process.env.REACT_APP_GA_MEASUREMENT_ID || "").trim();

export const isAnalyticsEnabled = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined" && Boolean(getMeasurementId());

// --- consent storage ---------------------------------------------------------------------

export const getAnalyticsConsent = (): AnalyticsConsent | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    if (raw === "granted" || raw === "denied") return raw;
    const parsed = JSON.parse(raw);
    return parsed?.choice === "granted" || parsed?.choice === "denied" ? parsed.choice : null;
  } catch {
    return null;
  }
};

const storeConsent = (choice: AnalyticsConsent) => {
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ choice, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice }));
  } catch {
    // Old browsers without CustomEvent: nothing listens there anyway.
  }
};

// --- gtag plumbing -----------------------------------------------------------------------

let consentDefaultQueued = false;
let scriptInjected = false;
let sending = false;
let pendingPage: { path: string; title: string } | null = null;
// Sanitised location of the previous page view (the next one's referrer).
let lastSentLocation: string | null = null;
const messageSentKeys = new Set<string>();

const gtag: GtagFn = (...args) => {
  window.gtag?.(...args);
};

const ensureGtagQueue = () => {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // gtag.js reads Arguments objects from the dataLayer, not arrays.
    window.gtag = function gtagShim() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
};

/** Queues the consent-mode default (all denied). Safe to call repeatedly. */
export const initAnalytics = () => {
  if (!isAnalyticsEnabled()) return;
  if (!consentDefaultQueued) {
    ensureGtagQueue();
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    consentDefaultQueued = true;
  }
  if (getAnalyticsConsent() === "granted" && !sending) startSending();
};

const gtagScriptSrc = () => `${GTAG_SCRIPT_BASE}?id=${encodeURIComponent(getMeasurementId())}`;

const startSending = () => {
  const id = getMeasurementId();
  window[`ga-disable-${id}`] = false;
  gtag("consent", "update", { analytics_storage: "granted" });
  if (!scriptInjected) {
    const script = document.createElement("script");
    script.async = true;
    script.src = gtagScriptSrc();
    script.dataset.lvAnalytics = "gtag";
    document.head.appendChild(script);
    scriptInjected = true;
    gtag("js", new Date());
    // Sanitised page context before config, so no hit ever carries the raw URL.
    if (pendingPage) setPageContext(pendingPage.path, pendingPage.title);
    gtag("config", id, {
      send_page_view: false,
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }
  sending = true;
  // Count the page the visitor accepted on (it was only remembered before).
  if (pendingPage) sendPageView(pendingPage.path, pendingPage.title);
};

/** Expires `_ga`, `_ga_<container>` (and `_gid`) for this host and its parent domain. */
export const deleteAnalyticsCookies = () => {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter((name) => name.startsWith("_ga") || name === "_gid");
  if (!names.length) return;
  const host = window.location.hostname;
  const labels = host.split(".");
  const domains = new Set<string>(["", host, `.${host}`]);
  if (labels.length > 2) {
    const parent = labels.slice(1).join(".");
    domains.add(parent);
    domains.add(`.${parent}`);
  }
  if (labels.length >= 2) domains.add(`.${labels.slice(-2).join(".")}`);
  const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=/";
  names.forEach((name) => {
    domains.forEach((domain) => {
      document.cookie = `${name}=; ${expired}${domain ? `; domain=${domain}` : ""}`;
    });
  });
};

/** The visitor accepted analytics cookies. */
export const grantAnalyticsConsent = () => {
  if (!isAnalyticsEnabled()) return;
  storeConsent("granted");
  initAnalytics();
  if (!sending) startSending();
};

/** The visitor declined (or withdrew) analytics cookies. */
export const denyAnalyticsConsent = () => {
  if (!isAnalyticsEnabled()) return;
  storeConsent("denied");
  if (consentDefaultQueued) gtag("consent", "update", { analytics_storage: "denied" });
  window[`ga-disable-${getMeasurementId()}`] = true;
  sending = false;
  deleteAnalyticsCookies();
};

/** Reopens the consent banner (footer "Cookie choices"). */
export const openCookieChoices = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_CHOICES_EVENT));
};

// --- page views --------------------------------------------------------------------------

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/login": "Log in",
  "/register": "Sign up",
  "/forgot-password": "Forgot password",
  "/reset-password/:uid/:token": "Reset password",
  "/verify-email": "Verify email",
  "/verify-email/:token": "Verify email",
  "/finish-profile": "Finish profile",
  "/privacy-policy": "Privacy policy",
  "/terms-and-conditions": "Terms and conditions",
  "/profile": "Profile",
  "/profile/edit": "Edit profile",
  "/profile/public/:username": "Public profile",
  "/settings": "Settings",
  "/community": "People",
  "/people/:username": "Public profile",
  "/conversations": "Conversations",
  "/conversations/:id": "Conversation",
  "/practice": "Practice",
  "/phrasebook": "Phrasebook",
  "/phrasebook/review": "Phrasebook review",
  "/premium": "Premium",
  "/premium/compare": "Compare plans",
};

// First segment → placeholders for the segments after it (the last one repeats).
const DYNAMIC_PREFIXES: Record<string, string[]> = {
  "reset-password": [":uid", ":token"],
  "verify-email": [":token"],
  people: [":username"],
  conversations: [":id"],
};

const looksOpaque = (segment: string) =>
  segment.length > 40 || (/^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment));

/**
 * Strips the query and hash and replaces every id / username / token segment, e.g.
 * `/people/ana?x=1` → `/people/:username`, `/reset-password/MQ/abc-123` →
 * `/reset-password/:uid/:token`, `/conversations/42` → `/conversations/:id`.
 */
export const sanitizePath = (pathname: string): string => {
  const pathOnly = String(pathname || "/").split(/[?#]/)[0];
  const segments = pathOnly.split("/").filter(Boolean);
  const out: string[] = [];
  let placeholders: string[] | null = null;
  let prefixLength = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (placeholders) {
      // Everything after a dynamic prefix is replaced (the last placeholder repeats).
      out.push(placeholders[Math.min(out.length - prefixLength, placeholders.length - 1)]);
    } else if (index === 0 && DYNAMIC_PREFIXES[segment]) {
      placeholders = DYNAMIC_PREFIXES[segment];
      out.push(segment);
      prefixLength = out.length;
    } else if (index === 1 && segments[0] === "profile" && segment === "public") {
      placeholders = [":username"];
      out.push(segment);
      prefixLength = out.length;
    } else if (/^\d+$/.test(segment)) {
      out.push(":id");
    } else if (segment.includes("@") || looksOpaque(segment)) {
      out.push(":token");
    } else {
      out.push(segment);
    }
  }
  return `/${out.join("/")}`;
};

/** A generic, PII-free page title for a sanitised path. */
export const routeTitle = (sanitizedPath: string): string => ROUTE_TITLES[sanitizedPath] || "Other";

/** Referrer without any path or query: the external site's origin, or nothing. */
const externalReferrer = () => {
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin ? "" : referrer.origin;
  } catch {
    return "";
  }
};

/**
 * gtag attaches the browser's own location, title and referrer to EVERY event
 * (custom events too). Overwrite them with sanitised values for all later hits.
 */
const setPageContext = (path: string, title: string) => {
  const location = `${window.location.origin}${path}`;
  gtag("set", {
    page_location: location,
    page_path: path,
    page_title: title,
    page_referrer: lastSentLocation ?? externalReferrer(),
  });
  return location;
};

const sendPageView = (path: string, title: string) => {
  const location = setPageContext(path, title);
  gtag("event", "page_view", { page_path: path, page_location: location, page_title: title });
  lastSentLocation = location;
};

/** Sends a page_view (after consent) for the sanitised path; remembered until then. */
export const trackPageView = (pathname: string) => {
  if (!isAnalyticsEnabled()) return;
  const path = sanitizePath(pathname);
  const title = routeTitle(path);
  pendingPage = { path, title };
  if (sending) sendPageView(path, title);
};

// --- events ------------------------------------------------------------------------------

// Event name → allowed param keys. Anything else is dropped.
const EVENT_PARAMS: Record<string, readonly string[]> = {
  sign_up: ["method"],
  login: ["method"],
  onboarding_step: ["step"],
  profile_completed: [],
  message_sent: ["kind"],
  partner_profile_viewed: ["source"],
  conversation_started: [],
  correction_made: [],
  phrase_saved: ["source"],
  review_completed: [],
  exchange_started: ["duration_minutes"],
  exchange_accepted: [],
  exchange_completed: ["duration_minutes", "ended_early"],
  premium_viewed: [],
};

export type AnalyticsEventName = keyof typeof EVENT_PARAMS;
type ParamValue = string | number | boolean | null | undefined;

const MAX_STRING_PARAM = 40;
const ENUM_VALUE = /^[A-Za-z0-9_:-]+$/;

/** Filters to allowlisted keys with enum-ish strings (≤ 40 chars), finite numbers or booleans. */
export const cleanEventParams = (name: string, params: Record<string, ParamValue> = {}) => {
  const allowed = EVENT_PARAMS[name];
  const clean: Record<string, string | number | boolean> = {};
  if (!allowed) return clean;
  allowed.forEach((key) => {
    const value = params[key];
    if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "string" && value.length <= MAX_STRING_PARAM && ENUM_VALUE.test(value)) {
      clean[key] = value;
    }
  });
  return clean;
};

/** Sends an allowlisted event after consent. Returns whether it was sent. */
export const trackEvent = (name: string, params: Record<string, ParamValue> = {}): boolean => {
  if (!isAnalyticsEnabled() || !sending || !EVENT_PARAMS[name]) return false;
  gtag("event", name, cleanEventParams(name, params));
  return true;
};

/**
 * `message_sent` {kind}, at most once per conversation per page session. The conversation
 * id is only the local throttle key; it is never sent.
 */
export const trackMessageSent = (conversationId: string | number, kind: string): boolean => {
  if (!isAnalyticsEnabled() || !sending) return false;
  const key = String(conversationId);
  if (messageSentKeys.has(key)) return false;
  const sent = trackEvent("message_sent", { kind });
  if (sent) messageSentKeys.add(key);
  return sent;
};

/** text | voice | attachment | sticker | gif for a chat message FormData. */
export const messageKindFromForm = (formData: FormData): string => {
  const kind = formData.get("kind");
  if (kind === "sticker" || kind === "gif") return kind;
  const attachment = formData.get("attachment");
  if (attachment && typeof attachment !== "string") {
    return String(attachment.type || "").startsWith("audio/") ? "voice" : "attachment";
  }
  return "text";
};

/** Test helper: forget module state (consent queue, injected script, throttles). */
export const resetAnalyticsForTests = () => {
  consentDefaultQueued = false;
  scriptInjected = false;
  sending = false;
  pendingPage = null;
  lastSentLocation = null;
  messageSentKeys.clear();
};
