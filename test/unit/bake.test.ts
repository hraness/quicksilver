import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error: plain ESM without declarations
import { parseBakeArgs, DEFAULT_FONT } from "../../bin/lib/bake.mjs";
// @ts-expect-error: plain ESM without declarations
import { readPNG, writePNG, compact } from "../../bin/lib/png.mjs";
// @ts-expect-error: plain ESM without declarations
import { encode } from "../../bin/lib/field.mjs";
// @ts-expect-error: plain ESM without declarations
import { PLAYWRIGHT_DISABLED, launchOptions, provisioned } from "../../bin/lib/browser.mjs";

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions -- the bin helpers are plain ESM */

describe("quicksilver-bake arguments", () => {
  test("defaults match yaptake.com's wordmark", () => {
    expect(parseBakeArgs(["--word", "sponge", "--out", "x"])).toMatchObject({
      word: "sponge", out: "x", font: DEFAULT_FONT, weight: 700, width: 880, band: 0.3, ink: 0.9, grow: 0.004, prefix: "wordmark",
    });
  });
  test("requires a word and an output", () => {
    expect(() => parseBakeArgs(["--out", "x"])).toThrow(/--word/);
    expect(() => parseBakeArgs(["--word", "dawn"])).toThrow(/--out/);
  });
  test("refuses out-of-range numbers, unknown flags and unsafe prefixes", () => {
    expect(() => parseBakeArgs(["--word", "a", "--out", "x", "--band", "2"])).toThrow(/--band/);
    expect(() => parseBakeArgs(["--word", "a", "--out", "x", "--width", "nope"])).toThrow(/--width/);
    expect(() => parseBakeArgs(["--word", "a", "--out", "x", "--colour", "red"])).toThrow();
    expect(() => parseBakeArgs(["--word", "a", "--out", "x", "--prefix", "../up"])).toThrow(/--prefix/);
  });
  test("the bundled font's weights only, unless another font is given", () => {
    expect(() => parseBakeArgs(["--word", "a", "--out", "x", "--weight", "900"])).toThrow(/--weight/);
    expect(parseBakeArgs(["--word", "a", "--out", "x", "--weight", "900", "--font", "f.woff2"]).weight).toBe(900);
  });
  test("the bundled font is the OFL Funnel Display subset", () => {
    const hash = new Bun.CryptoHasher("sha256").update(readFileSync(DEFAULT_FONT)).digest("hex");
    expect(hash).toBe("a18ddd522b00cee8b8cfc1e24f7bd8b37e600af760879a5241f305824a1c04a7");
    expect(readFileSync(join(import.meta.dir, "../../fonts/OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});

describe("PNG", () => {
  test("adaptive and unfiltered writes read back to the same pixels", () => {
    const width = 7, height = 5, data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 3) * 11) & 255;
    for (const adaptive of [true, false]) {
      const back = readPNG(writePNG(width, height, data, adaptive));
      expect([back.width, back.height]).toEqual([width, height]);
      expect(Buffer.from(back.data).equals(Buffer.from(data))).toBe(true);
    }
  });
  test("compact keeps every pixel", () => {
    const data = new Uint8Array(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 3) & 255));
    const plain = writePNG(16, 16, data, false);
    expect(Buffer.from(readPNG(compact(plain)).data).equals(Buffer.from(data))).toBe(true);
  });
});

describe("distance field", () => {
  test("positive inside, negative outside, in red and green", () => {
    const source = 64, solid = new Uint8Array(source * source);
    for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) solid[y * source + x] = 1;
    const { width, data } = readPNG(encode(solid, source, 16));
    const value = (x: number, y: number) => ((data[(y * width + x) * 4] as number) * 256 + (data[(y * width + x) * 4 + 1] as number)) / 65535;
    expect(width).toBe(16);
    expect(value(8, 8)).toBeGreaterThan(0.5);
    expect(value(0, 0)).toBeLessThan(0.5);
    expect(data[3]).toBe(255);
  });
  test("refuses a mask that is not a whole multiple", () => {
    expect(() => encode(new Uint8Array(100), 10, 3)).toThrow();
  });
});

describe("browser custody", () => {
  test("one --disable-features switch that keeps Playwright 1.62's list and adds ours", () => {
    const options = launchOptions();
    const switches = options.args.filter((arg: string) => arg.startsWith("--disable-features="));
    expect(switches).toHaveLength(1);
    const features = (switches[0] as string).slice("--disable-features=".length).split(",");
    for (const name of [...PLAYWRIGHT_DISABLED, "PaintHolding", "MacAppCodeSignClone"]) expect(features).toContain(name);
    expect(options.args).toContain("--mute-audio");
    expect(options.ignoreDefaultArgs).toEqual([`--disable-features=${PLAYWRIGHT_DISABLED.join(",")}`]);
  });
  test("the replaced default is exactly what the pinned playwright-core passes", () => {
    const bundle = readFileSync(join(import.meta.dir, "../../node_modules/playwright-core/lib/coreBundle.js"), "utf8");
    const block = /disabledFeatures = \[([\s\S]*?)\];/u.exec(bundle)?.[1] ?? "";
    const names = [...block.matchAll(/^\s*"([A-Za-z0-9]+)"/gmu)].map((match) => match[1]);
    expect(names).toEqual(PLAYWRIGHT_DISABLED);
  });
  test("refuses the installed Chrome app and missing browsers", () => {
    expect(() => provisioned("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toThrow();
    expect(() => provisioned("/nonexistent/chrome")).toThrow(/not installed/);
  });
});
