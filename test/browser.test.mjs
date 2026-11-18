#!/usr/bin/env node
// The wordmark in a real browser: bakes "yaptake" with quicksilver-bake, mounts it on a page served
// by request interception (no server is started), and checks that it draws, falls back, fits at
// 320 px, pauses off screen and leaves the click to the element. Runs in Playwright's provisioned
// Chromium; locally under host-run --lane=browser. Writes pictures to $QUICKSILVER_EVIDENCE if set.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { bake } from '../bin/lib/bake.mjs';
import { launch, loadPlaywright } from '../bin/lib/browser.mjs';

const ROOT = join(import.meta.dirname, '..');
const ORIGIN = 'http://quicksilver.test';
const evidence = process.env.QUICKSILVER_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });

const assets = mkdtempSync(join(tmpdir(), 'quicksilver-test-'));
const results = [];
const check = async (name, run) => {
  try {
    await run();
    results.push(['ok', name]);
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push(['FAIL', name]);
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.stack : String(error)}`);
  }
};

const manifest = await bake({ word: 'yaptake', out: assets, font: join(ROOT, 'fonts/FunnelDisplay.woff2'), weight: 700, width: 880, band: 0.3, ink: 0.9, grow: 0.004, prefix: 'wordmark' });
console.log(`baked ${manifest.field} with Chromium ${manifest.generator.chromium}`);

const page = (body, script = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/quicksilver.css"><style>html,body{margin:0;background:#fff}body{padding:16px;font:16px system-ui}
@media (prefers-color-scheme: dark){html,body{background:#111}}</style></head>
<body>${body}<script type="module">
import { mount } from '/dist/index.js';
window.activations = 0;
window.mountIt = (selector, extra = {}) => {
  const handle = mount(document.querySelector(selector), { field: '/assets/${manifest.field}', stills: { light: '/assets/${manifest.stills.light}', dark: '/assets/${manifest.stills.dark}' }, onActivate: () => { window.activations++; }, ...extra });
  window.handle = handle;
  window.mode = handle.ready;
  return handle;
};
${script}
</script></body></html>`;

const LINK = `<h2 style="position:absolute;clip:rect(0 0 0 0);width:1px;height:1px;overflow:hidden">Say it. Cut it. Post it.</h2>
<a id="mark" class="quicksilver" href="#activated" aria-label="Download Yaptake" style="--quicksilver-aspect:${manifest.aspectRatio}"></a>`;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.map': 'application/json' };

const playwright = loadPlaywright();
const browser = await launch(playwright);
console.log(`browser ${browser.version()} at ${playwright.chromium.executablePath()}`);
const open = async (html, options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 }, deviceScaleFactor: 2, ...options });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const file = path.startsWith('/assets/') ? join(assets, path.slice('/assets/'.length)) : join(ROOT, path);
    try {
      return await route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error));
  await tab.goto(`${ORIGIN}/`);
  await tab.waitForFunction(() => typeof window.mountIt === 'function');
  return { context, tab, errors };
};
// Pixels in an element's screenshot that differ from the page's background.
const inked = async (tab, selector, background) => {
  const shot = await tab.locator(selector).screenshot();
  return tab.evaluate(async ({ png, background }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]) > 24) count++;
    }
    return count / (bitmap.width * bitmap.height);
  }, { png: shot.toString('base64'), background });
};

try {
  await check('draws the live letters: non-blank canvas pixels, still hidden, box unchanged', async () => {
    const { context, tab, errors } = await open(page(LINK));
    const before = await tab.locator('#mark').boundingBox();
    assert.equal(await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; }), 'live');
    await tab.waitForTimeout(500);
    assert.equal(await tab.getAttribute('#mark', 'data-quicksilver'), 'live');
    const after = await tab.locator('#mark').boundingBox();
    assert.deepEqual(after, before, 'mounting moved the box');
    assert(Math.abs(after.height - after.width * manifest.height / manifest.width) < 1, 'the box keeps the manifest aspect');
    const canvas = await tab.evaluate(() => { const c = document.querySelector('#mark canvas'); return { w: c.width, h: c.height, hidden: c.getAttribute('aria-hidden'), opacity: getComputedStyle(c).opacity, img: getComputedStyle(document.querySelector('#mark img')).opacity }; });
    assert.equal(canvas.hidden, 'true');
    assert.equal(canvas.w, Math.round(after.width * 2));
    // Only the canvas shows now: hide nothing, the still is at opacity 0 behind it.
    await tab.waitForFunction(() => getComputedStyle(document.querySelector('#mark canvas')).opacity === '1' && getComputedStyle(document.querySelector('#mark img')).opacity === '0');
    const share = await inked(tab, '#mark', [255, 255, 255]);
    assert(share > 0.08, `only ${(share * 100).toFixed(1)}% of the box is drawn`);
    if (evidence) await tab.locator('#mark').screenshot({ path: join(evidence, 'package-live-light.png') });
    assert.deepEqual(errors, []);
    await context.close();
  });

  await check('dark appearance: live and still both dark-finished', async () => {
    const { context, tab } = await open(page(LINK), { colorScheme: 'dark' });
    assert.equal(await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; }), 'live');
    const src = await tab.evaluate(() => document.querySelector('#mark img').currentSrc);
    assert.match(src, /wordmark-dark\./u);
    await tab.waitForFunction(() => getComputedStyle(document.querySelector('#mark canvas')).opacity === '1');
    const share = await inked(tab, '#mark', [17, 17, 17]);
    assert(share > 0.08, `only ${(share * 100).toFixed(1)}% drawn on dark`);
    if (evidence) await tab.locator('#mark').screenshot({ path: join(evidence, 'package-live-dark.png') });
    await context.close();
  });

  await check('reduced motion keeps the still picture and adds no canvas', async () => {
    const { context, tab } = await open(page(LINK), { reducedMotion: 'reduce' });
    assert.equal(await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; }), 'still');
    const state = await tab.evaluate(async () => {
      const img = document.querySelector('#mark img');
      await img.decode();
      return { canvases: document.querySelectorAll('canvas').length, attr: document.querySelector('#mark').dataset.quicksilver, natural: img.naturalWidth, opacity: getComputedStyle(img).opacity };
    });
    assert.deepEqual(state, { canvases: 0, attr: 'still', natural: manifest.width, opacity: '1' });
    assert((await inked(tab, '#mark', [255, 255, 255])) > 0.08, 'the still shows');
    if (evidence) await tab.locator('#mark').screenshot({ path: join(evidence, 'package-still-light.png') });
    await context.close();
  });

  await check('no WebGL and Save-Data keep the still', async () => {
    for (const [label, script] of [
      ['no WebGL', `const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl' ? null : get.call(this, kind, ...rest); };`],
      ['Save-Data', `Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true }) });`],
    ]) {
      const { context, tab } = await open(page(LINK, script));
      assert.equal(await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; }), 'still', label);
      assert.equal(await tab.evaluate(() => document.querySelectorAll('canvas').length), 0, label);
      await context.close();
    }
  });

  await check('nothing overflows at 320 px, live or still', async () => {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const { context, tab } = await open(page(LINK), { viewport: { width: 320, height: 640 }, reducedMotion });
      await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; });
      await tab.waitForTimeout(300);
      const layout = await tab.evaluate(() => {
        const box = document.querySelector('#mark').getBoundingClientRect();
        return { scroll: document.documentElement.scrollWidth, left: box.left, right: box.right, width: box.width };
      });
      assert(layout.scroll <= 320, `page scrolls sideways (${layout.scroll}px)`);
      assert(layout.left >= 0 && layout.right <= 320, `wordmark leaves the screen: ${JSON.stringify(layout)}`);
      if (evidence && reducedMotion === 'no-preference') await tab.screenshot({ path: join(evidence, 'package-320.png') });
      await context.close();
    }
  });

  await check('the click and keyboard reach the element, which navigates itself', async () => {
    const { context, tab } = await open(page(LINK));
    await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; });
    await tab.waitForFunction(() => document.querySelector('#mark').dataset.quicksilver === 'live');
    // A press on the drawn letters lands on the link, not the canvas.
    const hit = await tab.evaluate(() => { const r = document.querySelector('#mark').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('a')?.id; });
    assert.equal(hit, 'mark');
    await tab.click('#mark');
    assert.equal(await tab.evaluate(() => window.activations), 1);
    assert.equal(await tab.evaluate(() => location.hash), '#activated', 'the link did not navigate');
    await tab.evaluate(() => { history.replaceState(null, '', '/'); });
    await tab.focus('#mark');
    await tab.keyboard.press('Enter');
    await tab.keyboard.press(' ');
    assert.equal(await tab.evaluate(() => window.activations), 3);
    assert.equal(await tab.evaluate(() => location.hash), '#activated');
    const name = await tab.evaluate(() => document.querySelector('#mark').getAttribute('aria-label'));
    assert.equal(name, 'Download Yaptake');
    await context.close();
  });

  await check('works on a button too', async () => {
    const { context, tab } = await open(page(`<button id="b" class="quicksilver" type="button" aria-label="Get it" onclick="window.native=(window.native||0)+1"></button>`));
    assert.equal(await tab.evaluate(() => { window.mountIt('#b'); return window.mode; }), 'live');
    await tab.click('#b');
    await tab.focus('#b');
    await tab.keyboard.press(' ');
    assert.deepEqual(await tab.evaluate(() => [window.activations, window.native]), [2, 2]);
    await context.close();
  });

  await check('pauses off screen and resumes on screen', async () => {
    const { context, tab } = await open(page(`${LINK}<div style="height:4000px"></div>`, `
      window.frames = 0; const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf((t) => { window.frames++; callback(t); });`));
    await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; });
    await tab.waitForTimeout(400);
    const running = await tab.evaluate(() => window.frames);
    assert(running > 3, 'not drawing on screen');
    await tab.evaluate(() => window.scrollTo(0, 3000));
    await tab.waitForTimeout(300);
    const settled = await tab.evaluate(() => window.frames);
    await tab.waitForTimeout(600);
    assert((await tab.evaluate(() => window.frames)) - settled <= 1, 'still drawing off screen');
    await tab.evaluate(() => window.scrollTo(0, 0));
    await tab.waitForTimeout(400);
    assert((await tab.evaluate(() => window.frames)) - settled > 3, 'did not resume on screen');
    await context.close();
  });

  await check('setTheme follows a site toggle; destroy leaves the element as it was', async () => {
    const { context, tab } = await open(page(LINK));
    await tab.evaluate(() => { window.mountIt('#mark', { theme: 'dark' }); return window.mode; });
    assert.match(await tab.evaluate(() => document.querySelector('#mark img').getAttribute('src')), /wordmark-dark\./u);
    await tab.evaluate(() => window.handle.setTheme('light'));
    assert.match(await tab.evaluate(() => document.querySelector('#mark img').getAttribute('src')), /wordmark-light\./u);
    await tab.evaluate(() => window.handle.destroy());
    assert.equal(await tab.evaluate(() => document.querySelector('#mark').outerHTML), `<a id="mark" class="quicksilver" href="#activated" aria-label="Download Yaptake" style="--quicksilver-aspect:${manifest.aspectRatio}"></a>`);
    await tab.click('#mark');
    assert.equal(await tab.evaluate(() => window.activations), 0, 'a listener outlived destroy');
    await context.close();
  });

  await check('keeps a server-rendered still picture', async () => {
    const markup = `<a id="mark" class="quicksilver" href="#x" aria-label="Download" style="--quicksilver-aspect:${manifest.aspectRatio}"><picture><source srcset="/assets/${manifest.stills.dark}" media="(prefers-color-scheme: dark)"><img src="/assets/${manifest.stills.light}" width="${manifest.width}" height="${manifest.height}" alt=""></picture></a>`;
    const { context, tab } = await open(page(markup));
    const before = await tab.locator('#mark').boundingBox();
    await tab.evaluate(() => { window.mountIt('#mark'); return window.mode; });
    assert.equal(await tab.evaluate(() => document.querySelectorAll('#mark img').length), 1);
    assert.deepEqual(await tab.locator('#mark').boundingBox(), before);
    // A forced theme on a light system shows the dark still, and destroy puts the markup back exactly.
    await tab.evaluate(() => window.handle.setTheme('dark'));
    await tab.waitForFunction(() => /wordmark-dark\./u.test(document.querySelector('#mark img').currentSrc));
    await tab.evaluate(() => window.handle.destroy());
    assert.equal(await tab.evaluate(() => document.querySelector('#mark').outerHTML), markup);
    await context.close();
  });

  await check('ready settles as "still" when destroyed before the letters draw', async () => {
    const far = (top) => `<div style="height:${top}px"></div>${LINK}`;
    const settle = (tab) => tab.evaluate(() => Promise.race([window.mode, new Promise((done) => { window.setTimeout(() => { done('hung'); }, 3000); })]));
    // Far below: still waiting for the element to come near.
    let { context, tab } = await open(page(far(5000)));
    await tab.evaluate(() => { window.mountIt('#mark'); window.handle.destroy(); });
    assert.equal(await settle(tab), 'still');
    await context.close();
    // Near but not on screen: the canvas is in, no frame is drawn yet.
    ({ context, tab } = await open(page(far(1000))));
    await tab.evaluate(() => { window.mountIt('#mark'); });
    await tab.waitForFunction(() => document.querySelector('#mark canvas'));
    await tab.evaluate(() => window.handle.destroy());
    assert.equal(await settle(tab), 'still');
    assert.equal(await tab.evaluate(() => document.querySelectorAll('canvas').length), 0);
    await context.close();
  });
} finally {
  await browser.close();
  if (evidence) writeFileSync(join(evidence, 'browser-test.txt'), results.map((row) => row.join('  ')).join('\n') + `\nChromium ${manifest.generator.chromium}\n`);
  rmSync(assets, { recursive: true, force: true });
}

const failed = results.filter(([state]) => state === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
