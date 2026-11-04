const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const Module = require('module');
const fromFrontend = Module.createRequire(path.join(__dirname, '../frontend/package.json'));
const { chromium } = fromFrontend('@playwright/test');
// Reuse the existing real-component SSR setup without running its screenshot loop.
const previewSource = fs.readFileSync(path.join(__dirname, 'boarding-pass-preview.cjs'), 'utf8');
const setup = previewSource.slice(0, previewSource.indexOf('\n(async () => {'));
const htmlFor = new Function('require', '__dirname', `${setup}\nreturn htmlFor;`)(require, __dirname);
const preview = htmlFor('single').replace('</body>', `<div style="position:fixed;right:18px;bottom:18px;display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid #d8d4c9;border-radius:14px;background:#fffdf8;box-shadow:0 4px 16px #152f3d14;font:13px sans-serif"><span>Plane animation preview</span><button id="flight-replay" style="min-height:40px;padding:8px 14px;border:0;border-radius:9px;background:#176f66;color:white;font-weight:700;cursor:pointer">Replay flight</button></div><script>document.getElementById('flight-replay').addEventListener('click',()=>{const svg=document.querySelector('.bp-atlas>svg');svg.setCurrentTime(0);svg.unpauseAnimations();});</script></body>`);
fs.writeFileSync(path.join(__dirname, 'flight-preview.html'), preview);

async function sample(page, seconds, reduced = false) {
  return page.evaluate(async ({ seconds, reduced }) => {
    const svg = document.querySelector('.bp-atlas > svg');
    svg.pauseAnimations();
    svg.setCurrentTime(seconds);
    await new Promise(requestAnimationFrame);
    const route = svg.querySelector('.bp-orbit');
    const motion = svg.querySelector('.bp-flight-motion');
    const rest = svg.querySelector('.bp-flight-rest');
    const group = reduced ? rest : motion;
    const screen = group.getScreenCTM();
    const ctm = svg.getScreenCTM().inverse().multiply(screen);
    const expected = route.getPointAtLength(route.getTotalLength() * Math.min(1, seconds / 1.8));
    const icon = group.querySelector('.bp-plane-icon');
    const r = icon.querySelector('path').getBoundingClientRect();
    const panel = document.querySelector('.bp-stop').getBoundingClientRect();
    const journey = document.querySelector('.bp-journey').getBoundingClientRect();
    const overlapW = Math.max(0, Math.min(r.right, panel.right) - Math.max(r.left, panel.left));
    const overlapH = Math.max(0, Math.min(r.bottom, panel.bottom) - Math.max(r.top, panel.top));
    return {
      seconds, reduced,
      position: { x: ctm.e, y: ctm.f },
      expected: { x: expected.x, y: expected.y },
      screen: { x: screen.e, y: screen.f },
      motionDisplay: getComputedStyle(motion).display,
      restDisplay: getComputedStyle(rest).display,
      panelOverlap: overlapW * overlapH,
      planeRect: {left:r.left,right:r.right,top:r.top,bottom:r.bottom},
      journeyRect: {left:journey.left,right:journey.right,top:journey.top,bottom:journey.bottom},
      iconSize: {width:getComputedStyle(icon).width,height:getComputedStyle(icon).height,x:icon.getAttribute('x'),y:icon.getAttribute('y')},
      clipped: r.left < journey.left - 1 || r.right > journey.right + 1 || r.top < journey.top - 1 || r.bottom > journey.bottom + 1,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, { seconds, reduced });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const results = [];
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    for (const width of [1440, 1024, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
      await page.route('http**/*', (route) => route.abort());
      await page.setContent(htmlFor('multi'), { waitUntil: 'load' });
      const frames = [];
      for (const seconds of [0, .9, 1.8, 4]) {
        const m = await sample(page, seconds);
        if (seconds === 0) await page.locator('.bp').screenshot({ path: path.join(__dirname, `flight-${width}-debug.png`) });
        check(Math.hypot(m.position.x - m.expected.x, m.position.y - m.expected.y) < .2, `path mismatch at ${width}/${seconds}: ${JSON.stringify(m)}`);
        check(m.motionDisplay !== 'none' && m.restDisplay === 'none', `plane visibility at ${width}/${seconds}`);
        check(m.panelOverlap === 0, `plane behind panel at ${width}/${seconds}: ${JSON.stringify(m)}`);
        check(!m.clipped, `plane clipped at ${width}/${seconds}: ${JSON.stringify(m)}`);
        check(!m.overflow, `horizontal overflow at ${width}`);
        frames.push(m);
        if (seconds !== 4) await page.locator('.bp').screenshot({ path: path.join(__dirname, `flight-${width}-${seconds}.png`) });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedStart = await sample(page, 0, true);
      const reducedEnd = await sample(page, 4, true);
      check(reducedStart.motionDisplay === 'none' && reducedStart.restDisplay !== 'none', `reduced visibility at ${width}`);
      check(Math.hypot(reducedStart.position.x - 495, reducedStart.position.y - 107) < .01, `reduced position at ${width}`);
      check(JSON.stringify(reducedStart.position) === JSON.stringify(reducedEnd.position), `reduced moved at ${width}`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const restored = await sample(page, 4);
      check(restored.motionDisplay !== 'none' && restored.restDisplay === 'none', `live preference toggle at ${width}`);
      results.push({ width, frames, reducedStart, reducedEnd, livePreferenceToggle: true });
      process.stdout.write(`${width}: sampled start/midpoint/arrival/hold plus reduced-motion toggle\n`);
      if (width === 1440) {
        await page.setContent(preview, { waitUntil: 'load' });
        await page.evaluate(() => { const svg = document.querySelector('.bp-atlas > svg'); svg.pauseAnimations(); svg.setCurrentTime(4); });
        await page.locator('#flight-replay').click();
        const replayTime = await page.evaluate(() => document.querySelector('.bp-atlas > svg').getCurrentTime());
        check(replayTime < .25, `preview replay did not restart: ${replayTime}`);
      }
      await page.close();
    }
    fs.writeFileSync(path.join(__dirname, 'flight-check-results.json'), JSON.stringify(results, null, 2));
    if (failures.length) {
      process.stderr.write(failures.join('\n') + '\n');
      process.exitCode = 1;
    } else process.stdout.write('All flight checks passed.\n');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
