const SITE_NAME = "LangVoyage";
const DEFAULT_SITE_URL = "https://langvoyage.app";
const SITE_URL = (process.env.REACT_APP_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon.ico`;
const DEFAULT_DESCRIPTION =
  "LangVoyage helps language learners build confidence through guided practice, thoughtful conversations, and a calmer daily rhythm.";

const titleWithSite = (title) => (title ? `${title} | ${SITE_NAME}` : SITE_NAME);

const baseStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
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
    },
  ],
};

const getDefaultStructuredData = () => baseStructuredData;

const buildSeoModel = (pathname, params = {}) => {
  if (pathname === "/") {
    return {
      title: "Language Exchange and Daily Speaking Practice",
      description:
        "Build speaking confidence with guided conversations, daily language practice, and a calmer social experience for learners.",
      path: "/",
      keywords:
        "language exchange app, speaking practice, language learning community, conversation practice, LangVoyage",
      shouldIndex: true,
      structuredData: {
        ...baseStructuredData,
        "@graph": [
          ...baseStructuredData["@graph"],
          {
            "@type": "WebPage",
            "@id": `${SITE_URL}/#webpage`,
            url: SITE_URL,
            name: titleWithSite("Language Exchange and Daily Speaking Practice"),
            description:
              "Build speaking confidence with guided conversations, daily language practice, and a calmer social experience for learners.",
            isPartOf: {
              "@id": `${SITE_URL}/#website`,
            },
          },
        ],
      },
    };
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
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(titleWithSite(title))}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<script type="application/ld+json" data-seo="structured-data">${JSON.stringify(
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
  DEFAULT_DESCRIPTION,
  titleWithSite,
  buildSeoModel,
  buildHeadTags,
  getDefaultStructuredData,
};
