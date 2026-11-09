#!/usr/bin/env node
// Regenerates every logo asset from src/brand/logoMark.js (web favicons + PWA icons and the
// Expo app icon, adaptive icon, splash and in-app mark) and the 1200x630 link preview
// (public/og-image.png, ivory landing style). Run after changing the logo:
//   node scripts/build-brand-icons.js
// Uses the Playwright Chromium already installed for dev; set CHROME=<path to chrome.exe>
// if Playwright's bundled browser version isn't downloaded. The link preview loads Sora/Manrope
// from Google Fonts, so it needs a network connection.

require("sucrase/register");

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { logoSvgMarkup, LOGO_COLORS } = require("../src/brand/logoMark");

const root = path.resolve(__dirname, "../..");
const webPublic = path.join(root, "frontend/public");
const mobileAssets = path.join(root, "mobile/assets");

const rounded = logoSvgMarkup();
const fullBleed = logoSvgMarkup({ tileRadius: 0 });
// Android adaptive icon / PWA maskable: shapes inside the centre safe zone, background from config.
const adaptiveForeground = logoSvgMarkup({ tileRadius: null, scale: 0.62 });
const maskable = logoSvgMarkup({ tileRadius: 0, scale: 0.78 });

const targets = [
  { file: path.join(webPublic, "logo192.png"), svg: rounded, size: 192 },
  { file: path.join(webPublic, "logo512.png"), svg: rounded, size: 512 },
  { file: path.join(webPublic, "logo-maskable-512.png"), svg: maskable, size: 512 },
  { file: path.join(webPublic, "apple-touch-icon.png"), svg: fullBleed, size: 180, opaque: true },
  { file: path.join(mobileAssets, "brand-icon.png"), svg: fullBleed, size: 1024, opaque: true },
  { file: path.join(mobileAssets, "icon.png"), svg: fullBleed, size: 1024, opaque: true },
  { file: path.join(mobileAssets, "adaptive-icon.png"), svg: adaptiveForeground, size: 1024 },
  // Splash: a 512 px tile centred on a 1024 canvas (fits Android 12+'s splash icon circle).
  { file: path.join(mobileAssets, "splash.png"), svg: rounded, size: 1024, inner: 512 },
  { file: path.join(mobileAssets, "brand/logo-mark.png"), svg: fullBleed, size: 512, opaque: true },
];
const icoSizes = [16, 32, 48, 64];

// Link preview: the landing page's ivory surface, the mark and the headline.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const ogPreviewHtml = () => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700&family=Sora:wght@700&display=block">
<style>
  html,body{margin:0}
  .og{position:relative;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;box-sizing:border-box;
    display:flex;align-items:center;gap:72px;padding:0 96px;color:#152f3d;font-family:Manrope,sans-serif;
    background:
      radial-gradient(55% 60% at 8% 0%, #fbe8da 0%, rgba(251,232,218,0) 70%),
      radial-gradient(50% 55% at 100% 100%, #e7f1ee 0%, rgba(231,241,238,0) 70%),
      #fcf8f2}
  .mark{flex:none;width:300px;height:300px;filter:drop-shadow(0 24px 40px rgba(21,47,61,.18))}
  .mark svg{width:100%;height:100%;display:block}
  .eyebrow{margin:0;font-size:22px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#0f5f56}
  h1{margin:18px 0 0;font-family:Sora,sans-serif;font-size:76px;line-height:1.04;letter-spacing:-.01em}
  p.lead{margin:22px 0 0;font-size:31px;line-height:1.35;color:#56656c;max-width:640px}
  .row{display:flex;align-items:center;gap:22px;margin-top:36px}
  .cta{display:inline-block;padding:16px 34px;border-radius:999px;background:#176e65;color:#fff;font-size:27px;font-weight:700;
    box-shadow:0 12px 28px rgba(23,110,101,.22)}
  .url{font-size:25px;font-weight:700;color:#56656c}
</style></head><body><div class="og">
  <div class="mark">${rounded}</div>
  <div>
    <p class="eyebrow">LangVoyage</p>
    <h1>Speak with confidence, every day.</h1>
    <p class="lead">Language exchange with native speakers who are learning your language.</p>
    <div class="row"><span class="cta">Find a partner</span><span class="url">langvoyage.com</span></div>
  </div>
</div></body></html>`;

// ICO container holding PNG images (supported by every current browser).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)]);
}

async function main() {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  const render = async (svg, size, opaque = false, inner = size) => {
    await page.setViewportSize({ width: size, height: size });
    const background = opaque ? LOGO_COLORS.tile : "transparent";
    await page.setContent(
      `<html><body style="margin:0;background:${background}">` +
        `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">` +
        svg.replace("<svg ", `<svg width="${inner}" height="${inner}" style="display:block" `) +
        "</div>" +
        "</body></html>"
    );
    return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
  };

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, await render(target.svg, target.size, target.opaque, target.inner));
    console.log("wrote", path.relative(root, target.file));
  }
  const icoImages = [];
  for (const size of icoSizes) icoImages.push({ size, data: await render(rounded, size) });
  fs.writeFileSync(path.join(webPublic, "favicon.ico"), buildIco(icoImages));
  fs.writeFileSync(path.join(webPublic, "logo.svg"), `${rounded}\n`);
  console.log("wrote frontend/public/favicon.ico, frontend/public/logo.svg");

  await page.setViewportSize({ width: OG_WIDTH, height: OG_HEIGHT });
  await page.setContent(ogPreviewHtml(), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  fs.writeFileSync(
    path.join(webPublic, "og-image.png"),
    await page.screenshot({ clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT } })
  );
  console.log("wrote frontend/public/og-image.png");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
