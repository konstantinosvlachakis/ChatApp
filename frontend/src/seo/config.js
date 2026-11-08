const SITE_NAME = "LangVoyage";
const DEFAULT_SITE_URL = "https://www.langvoyage.com";
const SITE_URL = (process.env.REACT_APP_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
// Link previews (WhatsApp, Slack, Teams, X…) need an absolute PNG/JPG URL; .ico is ignored.
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const OG_IMAGE_ALT = "LangVoyage logo — language exchange and daily speaking practice";
const DEFAULT_DESCRIPTION =
  "LangVoyage is a language exchange app: meet native speakers who want to learn your language, chat, run guided exchanges and keep their corrections.";

// Public landing copy (also rendered on the pages, so FAQ JSON-LD matches the visible text).
// require(): this file stays CommonJS for scripts/prerender.js and the sitemap generator.
const { getExchangePair } = require("../pages/Exchange/pairs");
const { EXCHANGE_PATH_PREFIX } = require("../pages/Exchange/pairSlugs");
const { HOME_FAQ } = require("../pages/Landing/landingContent");

const titleWithSite = (title) => (title ? `${title} | ${SITE_NAME}` : SITE_NAME);

/** "/exchange/x/" -> "/exchange/x" (the backend serves both; canonicals use no slash). */
const normalizePathname = (pathname) => {
  const path = String(pathname || "/").split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
};

const baseStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo512.png`,
      email: "support@langvoyage.app",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      // Joining, matching, chat and guided exchanges are free (Premium is not on sale).
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

const HOME_TITLE = "Language Exchange App: Practise with Native Speakers";
const HOME_DESCRIPTION =
  "Find language exchange partners who speak the language you're learning and want to learn yours. Free chat, voice notes, guided 10–30 minute exchanges and corrections.";

const faqPageNode = (url, faq) => ({
  "@type": "FAQPage",
  "@id": `${url}#faq`,
  mainEntity: faq.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
});

const webPageNode = (url, title, description) => ({
  "@type": "WebPage",
  "@id": `${url}#webpage`,
  url,
  name: titleWithSite(title),
  description,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#app` },
});

const breadcrumbNode = (url, crumbs) => ({
  "@type": "BreadcrumbList",
  "@id": `${url}#breadcrumb`,
  itemListElement: crumbs.map(({ name, path }, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name,
    item: `${SITE_URL}${path}`,
  })),
});

const [organizationNode, websiteNode, appNode] = baseStructuredData["@graph"];

const HOW_IT_WORKS_TITLE = "How Language Exchange Works on LangVoyage";
const HOW_IT_WORKS_DESCRIPTION =
  "How LangVoyage language exchange works: reciprocal partner matching, chat and calls, guided exchanges that switch language halfway, corrections, a phrasebook and Lumi.";

/** WebPage + breadcrumb (+ FAQPage) graph for a public content page. */
const contentPageGraph = ({ path, title, description, crumbs, faq }) => {
  const url = `${SITE_URL}${path}`;
  const graph = [
    organizationNode,
    websiteNode,
    appNode,
    { ...webPageNode(url, title, description), breadcrumb: { "@id": `${url}#breadcrumb` } },
    breadcrumbNode(url, crumbs),
  ];
  if (faq) graph.push(faqPageNode(url, faq));
  return { "@context": "https://schema.org", "@graph": graph };
};

const exchangeSeoModel = (pathname) => {
  const pair = getExchangePair(pathname.slice(EXCHANGE_PATH_PREFIX.length));
  if (!pair) {
    // Not prerendered: served by app-shell.html; the page shows a "not found" state.
    return {
      title: "Exchange Not Found",
      description: "This language exchange page doesn't exist. See the exchanges LangVoyage has guides for.",
      path: pathname,
      shouldIndex: false,
    };
  }
  return {
    title: pair.seoTitle,
    description: pair.seoDescription,
    path: pair.path,
    shouldIndex: true,
    structuredData: contentPageGraph({
      path: pair.path,
      title: pair.seoTitle,
      description: pair.seoDescription,
      crumbs: [
        { name: "Home", path: "/" },
        { name: `${pair.label} exchange`, path: pair.path },
      ],
      faq: pair.faq,
    }),
  };
};

const getDefaultStructuredData = () => baseStructuredData;

const buildSeoModel = (rawPathname, params = {}) => {
  const pathname = normalizePathname(rawPathname);
  if (pathname === "/") {
    return {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      path: "/",
      keywords:
        "language exchange app, language exchange partner, speaking practice, conversation practice, LangVoyage",
      shouldIndex: true,
      structuredData: {
        ...baseStructuredData,
        "@graph": [
          ...baseStructuredData["@graph"],
          webPageNode(`${SITE_URL}/`, HOME_TITLE, HOME_DESCRIPTION),
          faqPageNode(`${SITE_URL}/`, HOME_FAQ),
        ],
      },
    };
  }

  if (pathname === "/how-it-works") {
    return {
      title: HOW_IT_WORKS_TITLE,
      description: HOW_IT_WORKS_DESCRIPTION,
      path: "/how-it-works",
      shouldIndex: true,
      structuredData: contentPageGraph({
        path: "/how-it-works",
        title: HOW_IT_WORKS_TITLE,
        description: HOW_IT_WORKS_DESCRIPTION,
        crumbs: [
          { name: "Home", path: "/" },
          { name: "How it works", path: "/how-it-works" },
        ],
      }),
    };
  }

  if (pathname.startsWith(EXCHANGE_PATH_PREFIX)) {
    return exchangeSeoModel(pathname);
  }

  if (pathname === "/login") {
    return {
      title: "Log In",
      description: "Log in to LangVoyage and continue your conversations, practice streaks, and coach sessions.",
      path: "/login",
      shouldIndex: false,
    };
  }

  if (pathname === "/register") {
    return {
      title: "Create Account",
      description: "Create a LangVoyage account and start practicing languages through guided conversations and daily routines.",
      path: "/register",
      shouldIndex: false,
    };
  }

  if (pathname === "/forgot-password") {
    return {
      title: "Reset Your Password",
      description: "Request a link to reset your LangVoyage password.",
      path: "/forgot-password",
      shouldIndex: false,
    };
  }

  if (pathname.startsWith("/reset-password/")) {
    // Never put the uid/token from the emailed link into the canonical URL.
    return {
      title: "Choose a New Password",
      description: "Choose a new password for your LangVoyage account.",
      path: "/reset-password",
      shouldIndex: false,
    };
  }

  if (pathname === "/privacy-policy") {
    return {
      title: "Privacy Policy",
      description: "Read the LangVoyage privacy policy and learn how account, messaging, and profile information is handled.",
      path: "/privacy-policy",
      shouldIndex: true,
    };
  }

  if (pathname === "/terms-and-conditions") {
    return {
      title: "Terms and Conditions",
      description: "Read the LangVoyage terms and conditions for using the language learning platform and communication features.",
      path: "/terms-and-conditions",
      shouldIndex: true,
    };
  }

  if (pathname.startsWith("/people/")) {
    return {
      title: params.username ? `${params.username}'s Public Profile` : "Public Profile",
      description: "Public learner profile on LangVoyage.",
      path: pathname,
      shouldIndex: false,
    };
  }

  return {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    path: pathname,
    shouldIndex: false,
  };
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * JSON for an inline <script type="application/ld+json">: "<", ">" and "&" become \u
 * escapes so the content can never close the element or start a comment; U+2028/2029 too.
 */
const serializeJsonLd = (data) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const buildHeadTags = (pathname, params = {}) => {
  const { title, description, path, keywords, shouldIndex, structuredData } = buildSeoModel(
    pathname,
    params
  );
  const canonicalUrl = `${SITE_URL}${path}`;
  const robotsContent = shouldIndex ? "index,follow" : "noindex,nofollow";
  const resolvedStructuredData = structuredData || getDefaultStructuredData();

  const tags = [
    `<title>${escapeHtml(titleWithSite(title))}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${robotsContent}" />`,
    `<meta name="googlebot" content="${robotsContent}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(titleWithSite(title))}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(titleWithSite(title))}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<script type="application/ld+json" data-seo="structured-data">${serializeJsonLd(
      resolvedStructuredData
    )}</script>`,
  ];

  if (keywords) {
    tags.splice(
      4,
      0,
      `<meta name="keywords" content="${escapeHtml(keywords)}" />`
    );
  }

  return tags.join("\n");
};

module.exports = {
  SITE_NAME,
  SITE_URL,
  DEFAULT_OG_IMAGE,
  OG_IMAGE_ALT,
  DEFAULT_DESCRIPTION,
  titleWithSite,
  buildSeoModel,
  buildHeadTags,
  getDefaultStructuredData,
  serializeJsonLd,
  normalizePathname,
};
