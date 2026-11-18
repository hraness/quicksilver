/**
 * The pure decisions behind `mount`: which appearance, which finish, still or live, how many canvas
 * pixels, and the shader frame for the letters. Nothing here touches the DOM, so it is unit tested.
 */
import type { Frame, Shape } from "./shader.js";
export type Theme = "auto" | "light" | "dark";
export type Finish = "edged" | "plain" | "auto";
export type Mode = "live" | "still";
/** The defaults yaptake.com's closing wordmark uses; `quicksilver-bake` writes the same into its manifest. */
export declare const DEFAULTS: {
    /** The share of the square field's height the box shows: 0.3 makes a 10:3 box. */
    readonly band: 0.3;
    /** Rim width, rim height, pool depth and swell height: letters this narrow are all rim. */
    readonly shape: Shape;
    /** The most canvas pixels the live letters may cover. */
    readonly budget: 400000;
    /** How far outside the screen the field starts loading, in CSS px. */
    readonly margin: 800;
};
/** Whether the page is dark, after `theme` has its say over the system's appearance. */
export declare function isDark(theme: Theme, systemDark: boolean): boolean;
/** The edge: dark polished edge ("edged", for light pages) or none ("plain", for dark pages). */
export declare function edgeFor(finish: Finish, dark: boolean): 0 | 1;
export type Environment = {
    reducedMotion: boolean;
    saveData: boolean;
    webgl: boolean;
};
/** Still for reduced motion, Save-Data and no WebGL; live otherwise. The still is always in the box first. */
export declare function chooseMode({ reducedMotion, saveData, webgl }: Environment): Mode;
/** Canvas pixels for a box of `width` by `height` CSS px: the device ratio up to 2, within `budget` pixels. */
export declare function canvasSize(width: number, height: number, ratio: number, budget?: number): [number, number];
/**
 * The shader frame for letters on a canvas `side` pixels wide: the band of the square field the
 * canvas shows, plain silver, edged or not, whole body liquid. With no time or pointer it is the
 * wordmark at rest, as the stills show it.
 */
export declare function lettering(side: number, dark: boolean, edge?: 0 | 1, time?: number, pointer?: Frame["pointer"], band?: number, shape?: Shape): Frame;
/** A pointer at client (x, y) over a box, in the field's square: across its width, and down from its top. */
export declare function fieldPoint(clientX: number, clientY: number, box: {
    left: number;
    top: number;
    width: number;
}, band?: number): [number, number];
/** Validates the options `mount` takes, so a typo fails loudly at mount time rather than drawing nothing. */
export declare function checkOptions(opts: {
    field: unknown;
    stills: unknown;
    theme?: unknown;
    finish?: unknown;
    band?: unknown;
}): void;
