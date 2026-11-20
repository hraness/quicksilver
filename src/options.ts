/**
 * The pure decisions behind `mount`: which appearance, which finish, still or live, how fast the swell
 * runs, how many canvas pixels, and the shader frame for the letters. Nothing here touches the DOM, so
 * it is unit tested.
 */
import type { Frame, Shape } from "./shader.js";

export type Theme = "auto" | "light" | "dark";
export type Finish = "edged" | "plain" | "auto";
export type Mode = "live" | "still";

/** The defaults yaptake.com's closing wordmark uses; `quicksilver-bake` writes the same into its manifest. */
export const DEFAULTS = {
  /** The share of the square field's height the box shows: 0.3 makes a 10:3 box. */
  band: 0.3,
  /** Rim width, rim height, pool depth and swell height: letters this narrow are all rim. */
  shape: [0.012, 1.05, 0, 0.003] as Shape,
  /** The most canvas pixels the live letters may cover. */
  budget: 400_000,
  /** How far outside the screen the field starts loading, in CSS px. */
  margin: 800,
} as const;

/** Whether the page is dark, after `theme` has its say over the system's appearance. */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === "auto" ? systemDark : theme === "dark";
}

/** The edge: dark polished edge ("edged", for light pages) or none ("plain", for dark pages). */
export function edgeFor(finish: Finish, dark: boolean): 0 | 1 {
  if (finish === "edged") return 1;
  if (finish === "plain") return 0;
  return dark ? 0 : 1;
}

export type Environment = {
  reducedMotion: boolean;
  saveData: boolean;
  webgl: boolean;
};

/** Still for reduced motion, Save-Data and no WebGL; live otherwise. The still is always in the box first. */
export function chooseMode({ reducedMotion, saveData, webgl }: Environment): Mode {
  return reducedMotion || saveData || !webgl ? "still" : "live";
}

/**
 * How the swell comes to rest. Motion that starts by itself must stop within five seconds (WCAG 2.2.2,
 * Pause, Stop, Hide), so the swell runs at full pace for `calm` seconds after the letters first draw or
 * the pointer last moves over, presses or leaves them, then slows to a stop over `fall` seconds.
 */
export const SETTLE = { calm: 3.5, fall: 1 } as const;

/**
 * The swell's pace, 1 (full) to 0 (at rest), `since` seconds after the letters first drew or the pointer
 * last acted on them and `elapsed` seconds after the frame whose pace was `previous`. The pointer brings
 * full pace back at once, so its rings answer it straight away. The fall counts every second that passed,
 * off screen and in a hidden tab included, so a swell left running stops on the next frame it gets.
 */
export function pace(previous: number, since: number, elapsed: number): number {
  return since < SETTLE.calm ? 1 : Math.max(0, previous - elapsed / SETTLE.fall);
}

/** Canvas pixels for a box of `width` by `height` CSS px: the device ratio up to 2, within `budget` pixels. */
export function canvasSize(width: number, height: number, ratio: number, budget: number = DEFAULTS.budget): [number, number] {
  const scale = Math.min(ratio > 0 ? ratio : 1, 2, Math.sqrt(budget / Math.max(width * height, 1)));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/**
 * The shader frame for letters on a canvas `side` pixels wide: the band of the square field the
 * canvas shows, plain silver, edged or not, whole body liquid. With no time or pointer it is the
 * wordmark at rest, as the stills show it.
 */
export function lettering(side: number, dark: boolean, edge: 0 | 1 = dark ? 0 : 1, time = 3,
  pointer: Frame["pointer"] = [0.5, 0.5, 0], band: number = DEFAULTS.band, shape: Shape = DEFAULTS.shape): Frame {
  return { box: [0, -side * (0.5 - band / 2), side], time, pointer, shape, shadow: dark ? 0.35 : 0.13, exposure: 0.98, plain: 1, edge, liquid: 1 };
}

/** A pointer at client (x, y) over a box, in the field's square: across its width, and down from its top. */
export function fieldPoint(clientX: number, clientY: number, box: { left: number; top: number; width: number }, band: number = DEFAULTS.band): [number, number] {
  const width = box.width || 1;
  return [(clientX - box.left) / width, (clientY - box.top) / width + 0.5 - band / 2];
}

/** Validates the options `mount` takes, so a typo fails loudly at mount time rather than drawing nothing. */
export function checkOptions(opts: { field: unknown; stills: unknown; theme?: unknown; finish?: unknown; band?: unknown }): void {
  if (typeof opts.field !== "string" && !(opts.field instanceof URL)) throw new TypeError("quicksilver: `field` must be a URL or string");
  const stills = opts.stills as { light?: unknown; dark?: unknown } | null;
  if (!stills || typeof stills !== "object") throw new TypeError("quicksilver: `stills` must be { light, dark }");
  for (const key of ["light", "dark"] as const) {
    const value = stills[key];
    if (typeof value !== "string" && !(value instanceof URL)) throw new TypeError(`quicksilver: \`stills.${key}\` must be a URL or string`);
  }
  if (opts.theme !== undefined && !["auto", "light", "dark"].includes(opts.theme as string)) throw new TypeError("quicksilver: `theme` must be auto, light or dark");
  if (opts.finish !== undefined && !["auto", "edged", "plain"].includes(opts.finish as string)) throw new TypeError("quicksilver: `finish` must be auto, edged or plain");
  if (opts.band !== undefined && !(typeof opts.band === "number" && opts.band > 0 && opts.band <= 1)) throw new TypeError("quicksilver: `band` must be a number in (0, 1]");
}
