// sitemap.xml generator, run by scripts/prerender.js after the build: every prerendered
// route whose SEO model is indexable (noindex pages such as /login are left out), with
// <lastmod> = the build date. Written to build/sitemap.xml, which the backend serves at
// /sitemap.xml (core/urls.py serves it from the frontend build dir); robots.txt points there.
const { SITE_URL, buildSeoModel } = require("./config");

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** YYYY-MM-DD (UTC) for <lastmod>. */
const formatLastmod = (date) => date.toISOString().slice(0, 10);

/** Canonical paths of the indexable routes, in route order, without duplicates. */
const indexablePaths = (routes) => {
  const paths = [];
  routes.forEach((route) => {
    const { path, shouldIndex } = buildSeoModel(route);
    if (shouldIndex && !paths.includes(path)) paths.push(path);
  });
  return paths;
};

const buildSitemapXml = (routes, buildDate = new Date()) => {
  const lastmod = formatLastmod(buildDate);
  const urls = indexablePaths(routes).map(
    (path) =>
      `  <url>\n    <loc>${escapeXml(`${SITE_URL}${path}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
};

module.exports = { buildSitemapXml, indexablePaths, formatLastmod };
