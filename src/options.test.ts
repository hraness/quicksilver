import { describe, expect, test } from "bun:test";
import { DEFAULTS, canvasSize, checkOptions, chooseMode, edgeFor, fieldPoint, isDark, lettering } from "./options.js";

describe("theme and finish", () => {
  test("auto follows the system; light and dark are forced", () => {
    expect(isDark("auto", true)).toBe(true);
    expect(isDark("auto", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });
  test("auto finish is edged on light and plain on dark, like the stills", () => {
    expect(edgeFor("auto", false)).toBe(1);
    expect(edgeFor("auto", true)).toBe(0);
    expect(edgeFor("edged", true)).toBe(1);
    expect(edgeFor("plain", false)).toBe(0);
  });
});

describe("still or live", () => {
  const live = { reducedMotion: false, saveData: false, webgl: true };
  test("live only with motion, full data and WebGL", () => {
    expect(chooseMode(live)).toBe("live");
  });
  test("reduced motion, Save-Data and no WebGL each keep the still", () => {
    expect(chooseMode({ ...live, reducedMotion: true })).toBe("still");
    expect(chooseMode({ ...live, saveData: true })).toBe("still");
    expect(chooseMode({ ...live, webgl: false })).toBe("still");
  });
});

describe("canvas size", () => {
  test("follows the device ratio up to 2", () => {
    expect(canvasSize(440, 132, 1)).toEqual([440, 132]);
    expect(canvasSize(440, 132, 3)).toEqual([880, 264]);
    expect(canvasSize(232, 69.6, 2)).toEqual([464, 139]);
  });
  test("stays within the pixel budget", () => {
    const [width, height] = canvasSize(2000, 600, 2);
    expect(width * height).toBeLessThanOrEqual(DEFAULTS.budget * 1.01);
    expect(width / height).toBeCloseTo(2000 / 600, 1);
  });
  test("never zero, whatever the box or ratio", () => {
    expect(canvasSize(0, 0, 0)).toEqual([1, 1]);
    expect(canvasSize(10, 3, Number.NaN)).toEqual([10, 3]);
  });
});

describe("lettering frame", () => {
  test("matches yaptake's wordmark at rest", () => {
    const frame = lettering(880, false);
    expect(frame.box).toEqual([0, -880 * 0.35, 880]);
    expect(frame).toMatchObject({ time: 3, pointer: [0.5, 0.5, 0], shape: [0.012, 1.05, 0, 0.003], shadow: 0.13, exposure: 0.98, plain: 1, edge: 1, liquid: 1 });
    expect(lettering(880, true)).toMatchObject({ shadow: 0.35, edge: 0 });
  });
  test("a wider band moves the square up less", () => {
    expect(lettering(100, false, 1, 3, [0.5, 0.5, 0], 0.5).box[1]).toBeCloseTo(-25);
  });
  test("pointer maps into the field's square", () => {
    const box = { left: 100, top: 50, width: 400 };
    expect(fieldPoint(300, 50, box)).toEqual([0.5, 0.35]);
    expect(fieldPoint(100, 170, box)[1]).toBeCloseTo(0.65);
  });
});

describe("options", () => {
  const ok = { field: "/f.png", stills: { light: "/l.png", dark: new URL("https://x.test/d.png") } };
  test("accepts strings and URLs", () => {
    expect(() => { checkOptions(ok); }).not.toThrow();
    expect(() => { checkOptions({ ...ok, theme: "dark", finish: "plain", band: 0.4 }); }).not.toThrow();
  });
  test("rejects what would draw nothing", () => {
    expect(() => { checkOptions({ ...ok, field: undefined }); }).toThrow(/field/);
    expect(() => { checkOptions({ ...ok, stills: { light: "/l.png" } }); }).toThrow(/stills.dark/);
    expect(() => { checkOptions({ ...ok, stills: null }); }).toThrow(/stills/);
    expect(() => { checkOptions({ ...ok, theme: "sepia" }); }).toThrow(/theme/);
    expect(() => { checkOptions({ ...ok, finish: "matte" }); }).toThrow(/finish/);
    expect(() => { checkOptions({ ...ok, band: 0 }); }).toThrow(/band/);
  });
});
