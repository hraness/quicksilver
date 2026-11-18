import { type Finish, type Mode, type Theme } from "./options.js";
export type { Finish, Mode, Theme } from "./options.js";
export { chooseMode, canvasSize, edgeFor, isDark, lettering, DEFAULTS } from "./options.js";
export type MountOptions = {
    /** The distance field PNG from `quicksilver-bake` (its manifest's `field`). */
    field: URL | string;
    /** The still pictures from `quicksilver-bake`: edged silver for light pages, plain for dark ones. */
    stills: {
        light: URL | string;
        dark: URL | string;
    };
    /** The page's appearance. "auto" (default) follows `prefers-color-scheme`. */
    theme?: Theme;
    /** The letters' edge. "auto" (default): edged on light, plain on dark, as the stills are. */
    finish?: Finish;
    /** The manifest's `band`: the share of the square field the box shows. Defaults to 0.3 (a 10:3 box). */
    band?: number;
    /** Called on the element's own click (mouse, touch, Enter, or Space). Never prevents or redirects it. */
    onActivate?: (event: MouseEvent) => void;
};
export type Quicksilver = {
    /** Resolves with "live" once the letters are drawn, or "still" when the still picture stays. */
    readonly ready: Promise<Mode>;
    /** Follows a site's own theme switch. */
    setTheme(theme: Theme): void;
    /** Removes the canvas, listeners and anything `mount` added; the element is left as it was. */
    destroy(): void;
};
export declare function mount(anchor: HTMLAnchorElement | HTMLButtonElement, opts: MountOptions): Quicksilver;
