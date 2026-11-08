#!/usr/bin/env node

require("sucrase/register");

const fs = require("fs");
const path = require("path");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { StaticRouter } = require("react-router-dom/server");

const AppProviders = require("../src/AppProviders").default;
const PublicAppRoutes = require("../src/PublicAppRoutes").default;
const { SITE_NAME, buildHeadTags } = require("../src/seo/config");
const { PRERENDERED_ROUTES } = require("../src/routes/prerenderedRoutes");
const { buildSitemapXml } = require("../src/seo/sitemap");

const buildDir = path.resolve(__dirname, "../build");
const templatePath = path.join(buildDir, "index.html");

const shellPath = path.join(buildDir, "app-shell.html");
const sitemapPath = path.join(buildDir, "sitemap.xml");

const routes = PRERENDERED_ROUTES.map((routePath) => ({ path: routePath }));

const stripManagedSeoTags = (html) => {
  const patterns = [
    /<title>[\s\S]*?<\/title>/gi,
    /<meta[^>]+name="description"[^>]*\/?>/gi,
    /<meta[^>]+name="robots"[^>]*\/?>/gi,
    /<meta[^>]+name="googlebot"[^>]*\/?>/gi,
    /<meta[^>]+name="keywords"[^>]*\/?>/gi,
    /<meta[^>]+property="og:[^"]+"[^>]*\/?>/gi,
    /<meta[^>]+name="twitter:[^"]+"[^>]*\/?>/gi,
    /<link[^>]+rel="canonical"[^>]*\/?>/gi,
    /<script[^>]+data-seo="structured-data"[\s\S]*?<\/script>/gi,
  ];

  return patterns.reduce((nextHtml, pattern) => nextHtml.replace(pattern, ""), html);
};

const renderRoute = (routePath) => {
  const app = React.createElement(
    AppProviders,
    null,
    React.createElement(
      StaticRouter,
      { location: routePath },
      React.createElement(PublicAppRoutes)
    )
  );

  return renderToString(app);
};

const injectMarkup = (html, markup) =>
  html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);

// The backend renders these files with the Django template engine (core/views.py front),
// so generated markup must not contain template syntax or Django would rewrite it.
const assertNoTemplateSyntax = (routePath, fragment) => {
  const match = fragment.match(/\{\{|\{%|\{#/);
  if (match) {
    throw new Error(`Prerendered ${routePath} contains Django template syntax "${match[0]}"`);
  }
};

const injectHead = (html, routePath) => {
  const managedHead = buildHeadTags(routePath);
  assertNoTemplateSyntax(routePath, managedHead);
  const cleanedHtml = stripManagedSeoTags(html);
  return cleanedHtml.replace("</head>", `${managedHead}\n</head>`);
};

const writeRouteHtml = (routePath, html) => {
  if (routePath === "/") {
    fs.writeFileSync(templatePath, html);
    return;
  }

  const outputDir = path.join(buildDir, routePath.replace(/^\/+/, ""));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "index.html"), html);
};

// Neutral shell for every SPA path that isn't prerendered (app pages, reset links): an
// empty #root (body background only) and noindex head tags without a canonical/og:url,
// so e.g. /reset-password/<uid>/<token> no longer flashes the prerendered landing page
// and the token never lands in a canonical URL. The client <Seo/> sets the real tags.
const buildShellHtml = (html) => {
  const head = buildHeadTags("/app")
    .split("\n")
    .filter((tag) => !/rel="canonical"|property="og:url"/.test(tag))
    .map((tag) => (tag.startsWith("<title>") ? `<title>${SITE_NAME}</title>` : tag))
    .join("\n");
  return stripManagedSeoTags(html).replace("</head>", `${head}\n</head>`);
};

const template = fs.readFileSync(templatePath, "utf8");
if (!template.includes('<div id="root"></div>')) {
  throw new Error("build/index.html has no empty #root (already prerendered?); rebuild first");
}

routes.forEach(({ path: routePath }) => {
  const markup = renderRoute(routePath);
  assertNoTemplateSyntax(routePath, markup);
  const withMarkup = injectMarkup(template, markup);
  const withHead = injectHead(withMarkup, routePath);
  writeRouteHtml(routePath, withHead);
  process.stdout.write(`Prerendered ${routePath}\n`);
});

fs.writeFileSync(shellPath, buildShellHtml(template));
process.stdout.write("Wrote app-shell.html\n");

// Replaces the old hand-written public/sitemap.xml: indexable prerendered routes only.
fs.writeFileSync(sitemapPath, buildSitemapXml(PRERENDERED_ROUTES, new Date()));
process.stdout.write("Wrote sitemap.xml\n");
