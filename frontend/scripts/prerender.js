#!/usr/bin/env node

require("sucrase/register");

const fs = require("fs");
const path = require("path");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { StaticRouter } = require("react-router-dom/server");

const AppProviders = require("../src/AppProviders").default;
const PublicAppRoutes = require("../src/PublicAppRoutes").default;
const { buildHeadTags } = require("../src/seo/config");

const buildDir = path.resolve(__dirname, "../build");
const templatePath = path.join(buildDir, "index.html");

const routes = [
  { path: "/" },
  { path: "/login" },
  { path: "/register" },
  { path: "/privacy-policy" },
  { path: "/terms-and-conditions" },
];

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

const injectHead = (html, routePath) => {
  const managedHead = buildHeadTags(routePath);
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

const template = fs.readFileSync(templatePath, "utf8");

routes.forEach(({ path: routePath }) => {
  const markup = renderRoute(routePath);
  const withMarkup = injectMarkup(template, markup);
  const withHead = injectHead(withMarkup, routePath);
  writeRouteHtml(routePath, withHead);
  process.stdout.write(`Prerendered ${routePath}\n`);
});
