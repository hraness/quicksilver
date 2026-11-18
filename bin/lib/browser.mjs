// The browser quicksilver-bake and the tests draw with: Playwright's own provisioned Chromium
// (or a Chrome for Testing build Playwright installed), never the installed Google Chrome app,
// a symlink to it, or an executable override.
import { realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Playwright's default --disable-features value for playwright-core 1.62, replaced by one merged switch. */
export const PLAYWRIGHT_DISABLED = ['AvoidUnnecessaryBeforeUnloadCheckSync', 'BoundaryEventDispatchTracksNodeRemoval', 'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider', 'GlobalMediaControls', 'HttpsUpgrades', 'LensOverlay', 'MediaRouter',
  'PaintHolding', 'ThirdPartyStoragePartitioning', 'BlockOriginHeaderModificationOnRedirect',
  'Translate', 'AutoDeElevate', 'OptimizationHints', 'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion'];

/** Launch options: muted, and one --disable-features switch carrying PaintHolding and MacAppCodeSignClone. */
export function launchOptions() {
  const disabled = [...new Set([...PLAYWRIGHT_DISABLED, 'PaintHolding', 'MacAppCodeSignClone'])];
  const args = ['--mute-audio', `--disable-features=${disabled.join(',')}`];
  return { headless: true, ignoreDefaultArgs: [`--disable-features=${PLAYWRIGHT_DISABLED.join(',')}`], args };
}

/** Throws unless `executable` is a real (non-symlinked) provisioned browser, not an installed Chrome app. */
export function provisioned(executable) {
  const expected = resolve(executable);
  if (!existsSync(expected)) throw new Error(`Playwright's Chromium is not installed at ${expected}. Run: npx playwright-core@1.62.0 install chromium`);
  const actual = realpathSync(expected);
  if (actual !== expected) throw new Error('Use provisioned Playwright Chromium, never a symlink.');
  if (/Google Chrome(?: Beta| Dev| Canary)?\.app(?:\/|$)/u.test(actual) || /^\/opt\/google\/chrome\b/u.test(actual)) {
    throw new Error('Use provisioned Playwright Chromium, never installed Chrome.');
  }
  return actual;
}

/** playwright-core from `path`, or as the caller's project resolves it. */
export function loadPlaywright(path) {
  const candidates = path ? [resolve(path)] : ['playwright-core', 'playwright'];
  for (const name of candidates) {
    try {
      return require(require.resolve(name, { paths: [process.cwd(), import.meta.dirname] }));
    } catch { /* try the next */ }
  }
  throw new Error('quicksilver-bake needs playwright-core. Run it with: npx -y -p playwright-core@1.62.0 -p <this package> quicksilver-bake ..., or pass --playwright-core <path>.');
}

/** Launches the provisioned Chromium, always by Playwright's own executable path (no override is read). The caller closes it. */
export async function launch(playwright) {
  const { chromium } = playwright;
  return chromium.launch({ ...launchOptions(), executablePath: provisioned(chromium.executablePath()) });
}
