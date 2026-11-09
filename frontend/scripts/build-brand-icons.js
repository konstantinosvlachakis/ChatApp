#!/usr/bin/env node
// Regenerates every logo asset from src/brand/logoMark.js (web favicons + PWA icons and the
// Expo app icon, adaptive icon, splash and in-app mark). Run after changing the logo:
//   node scripts/build-brand-icons.js
// Uses the Playwright Chromium already installed for dev; set CHROME=<path to chrome.exe>
// if Playwright's bundled browser version isn't downloaded.

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
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
