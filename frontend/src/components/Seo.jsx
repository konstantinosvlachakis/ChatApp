import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  SITE_NAME,
  SITE_URL,
  DEFAULT_OG_IMAGE,
  titleWithSite,
  buildSeoModel,
  getDefaultStructuredData,
} from "../seo/config";

const ensureMetaTag = (selector, attributes) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    document.head.appendChild(tag);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    tag.setAttribute(key, value);
  });

  return tag;
};

const ensureLinkTag = (selector, attributes) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("link");
    document.head.appendChild(tag);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    tag.setAttribute(key, value);
  });

  return tag;
};

const Seo = () => {
  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    const { title, description, path, keywords, shouldIndex, structuredData } = buildSeoModel(
      location.pathname,
      params
    );

    const canonicalUrl = `${SITE_URL}${path}`;
    const robotsContent = shouldIndex ? "index,follow" : "noindex,nofollow";

    document.title = titleWithSite(title);

    ensureMetaTag('meta[name="description"]', {
      name: "description",
      content: description,
    });

    ensureMetaTag('meta[name="robots"]', {
      name: "robots",
      content: robotsContent,
    });

    ensureMetaTag('meta[name="googlebot"]', {
      name: "googlebot",
      content: robotsContent,
    });

    if (keywords) {
      ensureMetaTag('meta[name="keywords"]', {
        name: "keywords",
        content: keywords,
      });
    }

    ensureMetaTag('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    });
    ensureMetaTag('meta[property="og:site_name"]', {
      property: "og:site_name",
      content: SITE_NAME,
    });
    ensureMetaTag('meta[property="og:title"]', {
      property: "og:title",
      content: titleWithSite(title),
    });
    ensureMetaTag('meta[property="og:description"]', {
      property: "og:description",
      content: description,
    });
    ensureMetaTag('meta[property="og:url"]', {
      property: "og:url",
      content: canonicalUrl,
    });
    ensureMetaTag('meta[property="og:image"]', {
      property: "og:image",
      content: DEFAULT_OG_IMAGE,
    });

    ensureMetaTag('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary",
    });
    ensureMetaTag('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: titleWithSite(title),
    });
    ensureMetaTag('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: description,
    });
    ensureMetaTag('meta[name="twitter:image"]', {
      name: "twitter:image",
      content: DEFAULT_OG_IMAGE,
    });

    ensureLinkTag('link[rel="canonical"]', {
      rel: "canonical",
      href: canonicalUrl,
    });

    let structuredDataScript = document.head.querySelector('script[data-seo="structured-data"]');
    if (!structuredDataScript) {
      structuredDataScript = document.createElement("script");
      structuredDataScript.type = "application/ld+json";
      structuredDataScript.setAttribute("data-seo", "structured-data");
      document.head.appendChild(structuredDataScript);
    }
    structuredDataScript.textContent = JSON.stringify(structuredData || getDefaultStructuredData());
  }, [location.pathname, params]);

  return null;
};

export default Seo;
