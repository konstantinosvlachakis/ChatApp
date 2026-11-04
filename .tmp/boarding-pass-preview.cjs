const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const src = path.join(frontend, 'src') + path.sep;
const fromFrontend = Module.createRequire(path.join(frontend, 'package.json'));
const { transformSync } = fromFrontend('@babel/core');
const { chromium } = fromFrontend('@playwright/test');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const originalJs = require.extensions['.js'];
for (const extension of ['.js', '.jsx', '.ts', '.tsx']) {
  require.extensions[extension] = (mod, filename) => {
    if (!filename.startsWith(src)) return originalJs(mod, filename);
    const presets = [
      [fromFrontend.resolve('@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }],
      [fromFrontend.resolve('@babel/preset-react'), { runtime: 'classic' }],
    ];
    if (/\.tsx?$/.test(filename)) presets.push([fromFrontend.resolve('@babel/preset-typescript'), { allExtensions: true, isTSX: filename.endsWith('.tsx') }]);
    const result = transformSync(fs.readFileSync(filename, 'utf8'), { filename, presets, babelrc: false, configFile: false });
    mod._compile(result.code, filename);
  };
}
require.extensions['.css'] = () => {};
for (const extension of ['.jpg', '.png', '.svg']) {
  require.extensions[extension] = (mod, filename) => {
    const mime = extension === '.svg' ? 'image/svg+xml' : extension === '.jpg' ? 'image/jpeg' : 'image/png';
    mod.exports = `data:${mime};base64,${fs.readFileSync(filename).toString('base64')}`;
  };
}

const React = fromFrontend('react');
const { renderToStaticMarkup } = fromFrontend('react-dom/server');
const { StaticRouter } = fromFrontend('react-router-dom/server');
const { ProfileHero } = require(path.join(frontend, 'src/pages/Profile/features/ProfileParts.jsx'));
const css = [
  read('frontend/src/styles/tokens.css'),
  read('frontend/src/pages/Profile/features/profile.css'),
  read('frontend/src/pages/Profile/features/boardingPass.css'),
].join('\n');
const progress = { bucket: 1, max_bucket: 3, bucket_label: 'Basics', attempts_in_bucket: 0, window_accuracy: null, needed_for_promotion: { attempts_remaining: 15, min_attempts: 15, accuracy_target: 0.8 } };
const variants = { single: ['spanish'], multi: ['french', 'japanese', 'spanish'] };
const flags = {
  gb: '<rect width="60" height="40" fill="#183b75"/><path stroke="white" stroke-width="10" d="M0 0L60 40M60 0L0 40"/><path stroke="#c62640" stroke-width="4" d="M0 0L60 40M60 0L0 40"/><path stroke="white" stroke-width="14" d="M30 0V40M0 20H60"/><path stroke="#c62640" stroke-width="8" d="M30 0V40M0 20H60"/>',
  es: '<rect width="60" height="40" fill="#b6212e"/><rect y="10" width="60" height="20" fill="#f3c232"/>',
  fr: '<rect width="20" height="40" fill="#21468b"/><rect x="20" width="20" height="40" fill="white"/><rect x="40" width="20" height="40" fill="#ce2b37"/>',
  jp: '<rect width="60" height="40" fill="white"/><circle cx="30" cy="20" r="11" fill="#bd2440"/>',
};
function htmlFor(variant) {
  const languages = variants[variant];
  const profile = { username: 'kostas', age: 30, native_language: 'english', languages_practicing: languages, practice_language_levels: { spanish: 'intermediate', french: 'beginner', japanese: 'advanced' } };
  const passStats = Object.fromEntries(languages.map((language) => [language, { progress, partners: language === 'spanish' ? 26 : 128 }]));
  let content = renderToStaticMarkup(React.createElement(StaticRouter, null,
    React.createElement('main', { className: 'pf-page' }, React.createElement(ProfileHero, {
      profile, ringColor: '#eaa7ce', passStats, passesInteractive: true,
      statusItems: [{ key: 'place', icon: 'place', text: 'Athens, Greece' }, { key: 'time', icon: 'time', text: '11:45 PM local time' }],
    }, React.createElement('a', { className: 'pf-btn is-primary', href: '#' }, 'Edit profile'), React.createElement('a', { className: 'pf-btn', href: '#' }, 'Share profile')))));
  content = content.replace(/src="https:\/\/flagcdn\.com\/[^/]+\/([a-z]+)\.png"/g, (_, country) => `src="data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">${flags[country] || flags.es}</svg>`).toString('base64')}"`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*,*::before,*::after{box-sizing:border-box}body{margin:0;background:var(--lv-cream);padding:24px;font-family:var(--lv-font-body)}a{cursor:pointer}.lv-photo-thumb{width:100%;height:100%;padding:0;border:0;background:none}@media(max-width:767px){body{padding:16px}}</style></head><body>${content}</body></html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const [variant, width] of [['single', 1440], ['single', 1024], ['single', 768], ['single', 390], ['single', 320], ['multi', 1440], ['multi', 1024], ['multi', 768], ['multi', 390]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await page.route('http**/*', (route) => route.abort());
      const html = htmlFor(variant);
      fs.writeFileSync(path.join(__dirname, `boarding-pass-${variant}-${width}.html`), html);
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({ path: path.join(__dirname, `boarding-pass-${variant}-${width}.png`), fullPage: true });
      const metrics = await page.evaluate(() => {
        const selectors = ['.bp', '.bp-journey', '.bp-stop', '.pf-avatar', '.bp-stub'];
        const boxes = Object.fromEntries(selectors.map((selector) => {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          return [selector, r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null];
        }));
        const avatar = document.querySelector('.pf-avatar').getBoundingClientRect();
        const avatarLinkOverlaps = [...document.querySelectorAll('.bp-links a')].map((link) => {
          const r = link.getBoundingClientRect();
          const width = Math.max(0, Math.min(avatar.right, r.right) - Math.max(avatar.left, r.left));
          const height = Math.max(0, Math.min(avatar.bottom, r.bottom) - Math.max(avatar.top, r.top));
          return { label: link.getAttribute('aria-label') || link.textContent.trim(), width, height, area: width * height };
        }).filter((overlap) => overlap.area > 0);
        return { ...boxes, overflow: document.documentElement.scrollWidth > innerWidth, avatarLinkOverlaps };
      });
      process.stdout.write(`${variant} ${width} ${JSON.stringify(metrics)}\n`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
