// Bakes a word into the quicksilver wordmark's three files: its distance field and its two still
// pictures (edged silver for light pages, plain for dark ones), each named by its bytes, plus a
// manifest. Run once at dev time; the site commits the outputs. Follows hraness/yaptake
// site/quicksilver/wordmark.mjs (8bdce88) step for step, so "yaptake" bakes yaptake.com's field.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { encode } from './field.mjs';
import { compact } from './png.mjs';
import { launch, loadPlaywright } from './browser.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
export const DEFAULT_FONT = join(ROOT, 'fonts', 'FunnelDisplay.woff2');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// The letters are set four times finer than the field keeps, so its edge is an average.
const SOURCE = 4096, SIZE = 512;

export const USAGE = `Usage: quicksilver-bake --word <text> --out <dir> [options]

  --word <text>            The word to set (required).
  --out <dir>              Where to write the field, stills and manifest (required).
  --font <path>            A .woff2, .woff, .ttf or .otf (default: bundled Funnel Display).
  --weight <100-900>       Font weight (default 700; 300-700 for the bundled font).
  --width <px>             Still width in px: twice the widest the wordmark is shown (default 880).
  --band <0-1>             Share of the square field the box shows; aspect is 1 : band (default 0.3).
  --ink <0-1>              Widest the word may be, a share of the field (default 0.9).
  --grow <share>           How much heavier than the face the letters are set (default 0.004).
  --prefix <name>          File name prefix (default "wordmark").
  --playwright-core <dir>  playwright-core to drive (default: resolved from this project).
`;

const number = (value, name, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`--${name} must be a number from ${min} to ${max}`);
  return parsed;
};

/** The bake's options from argv, with defaults, checked. */
export class UsageError extends Error {}

export function parseBakeArgs(argv) {
  try {
    return parseChecked(argv);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function parseChecked(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      word: { type: 'string' }, out: { type: 'string' }, font: { type: 'string' },
      weight: { type: 'string', default: '700' }, width: { type: 'string', default: '880' },
      band: { type: 'string', default: '0.3' }, ink: { type: 'string', default: '0.9' },
      grow: { type: 'string', default: '0.004' }, prefix: { type: 'string', default: 'wordmark' },
      'playwright-core': { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return { help: true };
  if (!values.word || !values.word.trim()) throw new Error('--word is required');
  if (!values.out) throw new Error('--out is required');
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(values.prefix)) throw new Error('--prefix must be lowercase letters, digits and dashes');
  const band = number(values.band, 'band', 0.15, 1);
  const width = Math.round(number(values.width, 'width', 64, 4096));
  return {
    word: values.word, out: values.out, font: values.font ?? DEFAULT_FONT,
    // The bundled Funnel Display covers 300 to 700; another font may go wider.
    weight: Math.round(values.font ? number(values.weight, 'weight', 100, 900) : number(values.weight, 'weight', 300, 700)), width, band,
    ink: number(values.ink, 'ink', 0.1, 0.98), grow: number(values.grow, 'grow', 0, 0.05),
    prefix: values.prefix, playwrightCore: values['playwright-core'],
  };
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Bakes and writes the files; returns the manifest. */
export async function bake(options) {
  const { word, out, font, weight, width, band, ink, grow, prefix } = options;
  const fontBytes = readFileSync(font);
  const pageScript = readFileSync(join(ROOT, 'dist', 'bake-page.js'), 'utf8');
  const playwright = loadPlaywright(options.playwrightCore);
  const browser = await launch(playwright);
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: pageScript });
    // The word, white on clear, its ink as wide as `ink` of the field and centred in the band the
    // canvas shows, with room above and below it for the bevel and the shadow.
    const mask = await page.evaluate(async ({ font, word, band, ink, weight, source }) => {
      const face = new FontFace('Wordmark', Uint8Array.from(atob(font), (c) => c.charCodeAt(0)), { weight: '100 900' });
      await face.load();
      document.fonts.add(face);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = source;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const set = (size) => { context.font = `${weight} ${size}px Wordmark`; return context.measureText(word); };
      let metrics = set(1000);
      const across = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
      const high = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      // As wide as `ink`, unless that leaves too little room above and below.
      const size = 1000 * Math.min(ink * source / across, (band - 0.1) * source / high);
      metrics = set(size);
      const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
      const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      context.fillStyle = '#fff';
      context.fillText(word, (source - width) / 2 + metrics.actualBoundingBoxLeft, (source - height) / 2 + metrics.actualBoundingBoxAscent);
      const data = context.getImageData(0, 0, source, source).data;
      const solid = new Uint8Array(source * source);
      let count = 0;
      for (let i = 0; i < solid.length; i++) { solid[i] = data[i * 4 + 3] >= 128 ? 1 : 0; count += solid[i]; }
      let binary = '';
      for (let i = 0; i < solid.length; i += 0x8000) binary += String.fromCharCode(...solid.subarray(i, i + 0x8000));
      return { solid: btoa(binary), width: width / source, height: height / source, count };
    }, { font: fontBytes.toString('base64'), word, band, ink, weight, source: SOURCE });
    if (!mask.count) throw new Error(`The font drew nothing for "${word}"`);
    if (mask.height > band - 0.1 + 1e-6 || mask.width > ink + 1e-6) throw new Error('The word leaves its band');
    const field = encode(Buffer.from(mask.solid, 'base64'), SOURCE, SIZE, grow);

    // The stills: the live wordmark at rest, as `mount` draws it, four times over and scaled down.
    const stills = {};
    for (const [still, dark] of [['light', false], ['dark', true]]) {
      const data = await page.evaluate(async ({ png, width, dark, band }) => {
        const { createRenderer, lettering } = globalThis.quicksilverBake;
        const field = await createImageBitmap(await (await fetch(png)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const OVER = 4, height = Math.round(width * band);
        let canvas = document.createElement('canvas');
        canvas.width = width * OVER; canvas.height = height * OVER;
        const renderer = createRenderer(canvas, field, true);
        if (!renderer) throw new Error('WebGL is not available in this browser');
        renderer.draw(lettering(canvas.width, dark, dark ? 0 : 1, 3, [0.5, 0.5, 0], band));
        for (let scale = OVER / 2; scale >= 1; scale /= 2) {
          const half = document.createElement('canvas');
          half.width = width * scale; half.height = height * scale;
          const context = half.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, half.width, half.height);
          canvas = half;
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, { png: 'data:image/png;base64,' + field.toString('base64'), width, dark, band });
      stills[still] = compact(Buffer.from(data, 'base64'));
    }

    mkdirSync(out, { recursive: true });
    const pattern = new RegExp(`^${prefix}-(field|light|dark)\\.[0-9a-f]{8}\\.png$`, 'u');
    for (const old of readdirSync(out).filter((file) => pattern.test(file))) rmSync(join(out, old));
    const name = (kind, bytes) => `${prefix}-${kind}.${hash(bytes).slice(0, 8)}.png`;
    const files = { field: name('field', field), light: name('light', stills.light), dark: name('dark', stills.dark) };
    writeFileSync(join(out, files.field), field);
    writeFileSync(join(out, files.light), stills.light);
    writeFileSync(join(out, files.dark), stills.dark);
    const height = Math.round(width * band);
    const manifest = {
      word, weight, band, ink, grow,
      aspectRatio: `${width} / ${height}`,
      width, height,
      field: files.field,
      stills: { light: files.light, dark: files.dark },
      bytes: { field: field.length, light: stills.light.length, dark: stills.dark.length },
      font: { file: basename(font), sha256: hash(fontBytes) },
      generator: { package: `@hraness/quicksilver@${VERSION}`, chromium: browser.version() },
    };
    writeFileSync(join(out, `${prefix}.json`), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally {
    await browser.close();
  }
}
