/**
 * @hraness/quicksilver: a word in liquid metal on a link or button. `mount` keeps the baked still
 * picture in the element's reserved box and, where motion and WebGL are welcome, draws the live
 * letters over it once the element comes near the screen. The letters lean toward the pointer and
 * ring where it crosses or presses them. The element keeps its own click and keyboard behaviour:
 * this package never navigates, prevents a click or sends anything.
 */
import { createRenderer, type Renderer } from "./shader.js";
import {
  DEFAULTS, canvasSize, checkOptions, chooseMode, edgeFor, fieldPoint, isDark, lettering,
  type Finish, type Mode, type Theme,
} from "./options.js";

export type { Finish, Mode, Theme } from "./options.js";
export { chooseMode, canvasSize, edgeFor, isDark, lettering, DEFAULTS } from "./options.js";

export type MountOptions = {
  /** The distance field PNG from `quicksilver-bake` (its manifest's `field`). */
  field: URL | string;
  /** The still pictures from `quicksilver-bake`: edged silver for light pages, plain for dark ones. */
  stills: { light: URL | string; dark: URL | string };
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

type Connection = { saveData?: boolean };

const href = (value: URL | string) => String(value);

export function mount(anchor: HTMLAnchorElement | HTMLButtonElement, opts: MountOptions): Quicksilver {
  checkOptions(opts);
  // One type for listeners: a union of the two elements loses addEventListener's event types.
  const element: HTMLElement = anchor;
  const doc = anchor.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw new Error("quicksilver: the element is not in a window");
  const band = opts.band ?? DEFAULTS.band;
  const finish: Finish = opts.finish ?? "auto";
  let theme: Theme = opts.theme ?? "auto";
  const signal = new AbortController();
  // A function, so a check after an await is not narrowed away by the one before it.
  const stopped = () => signal.signal.aborted;
  const on = { signal: signal.signal, passive: true } as const;
  const systemDark = view.matchMedia("(prefers-color-scheme: dark)");
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const dark = () => isDark(theme, systemDark.matches);

  // The still picture holds the box. A site that server-renders one keeps it; otherwise mount adds it.
  let owned: HTMLElement | undefined;
  let still = anchor.querySelector("img");
  const fillStill = () => {
    if (!owned || !still) return;
    owned.querySelector("source")?.remove();
    if (theme === "auto") {
      const source = doc.createElement("source");
      source.media = "(prefers-color-scheme: dark)";
      source.srcset = href(opts.stills.dark);
      owned.prepend(source);
      still.src = href(opts.stills.light);
    } else {
      still.src = href(theme === "dark" ? opts.stills.dark : opts.stills.light);
    }
  };
  if (!still) {
    owned = doc.createElement("picture");
    owned.className = "quicksilver-still";
    still = doc.createElement("img");
    still.alt = "";
    still.decoding = "async";
    owned.append(still);
    fillStill();
    anchor.prepend(owned);
  }
  anchor.dataset["quicksilver"] = "still";

  // The element's own activation. A link answers Enter by itself; Space presses it too, as a button's does.
  element.addEventListener("click", (event) => opts.onActivate?.(event), { signal: signal.signal });
  if (anchor instanceof view.HTMLAnchorElement) {
    anchor.addEventListener("keydown", (event) => {
      if (event.key !== " " || event.repeat) return;
      event.preventDefault();
      anchor.click();
    }, { signal: signal.signal });
  }

  let canvas: HTMLCanvasElement | undefined;
  let renderer: Renderer | undefined;
  let frame = 0;
  const observers: { disconnect(): void }[] = [];
  const toStill = () => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    for (const observer of observers.splice(0)) observer.disconnect();
    renderer?.release();
    renderer = undefined;
    canvas?.remove();
    canvas = undefined;
    if (!stopped()) anchor.dataset["quicksilver"] = "still";
  };

  const live = async (): Promise<Mode> => {
    const saveData = Boolean((view.navigator as { connection?: Connection }).connection?.saveData);
    if (chooseMode({ reducedMotion: motion.matches, saveData, webgl: "WebGLRenderingContext" in view }) === "still") return "still";
    // The field is fetched only as the element comes into reach.
    await new Promise<void>((near) => {
      const watch = new view.IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        near();
      }, { rootMargin: `${String(DEFAULTS.margin)}px 0px` });
      observers.push(watch);
      watch.observe(anchor);
    });
    if (stopped()) return "still";
    const image = new view.Image();
    image.crossOrigin = "anonymous";
    image.src = href(opts.field);
    await image.decode();
    const field = await view.createImageBitmap(image, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (stopped() || motion.matches) return "still";
    canvas = doc.createElement("canvas");
    canvas.className = "quicksilver-canvas";
    canvas.setAttribute("aria-hidden", "true");
    renderer = createRenderer(canvas, field);
    if (!renderer) {
      canvas = undefined;
      return "still";
    }
    const surface = canvas, mark = renderer;
    anchor.append(surface);

    const now = () => view.performance.now() / 1000;
    let visible = false, shown = false, touched = -9, skip = false, over = 0;
    let aim: [number, number] = [0.5, 0.5], lean: [number, number, number] = [0.5, 0.5, 0], last: [number, number, number] = [9, 9, 0];
    let resolve: (mode: Mode) => void = () => undefined;
    const drawn = new Promise<Mode>((done) => { resolve = done; });

    const draw = () => {
      frame = 0;
      if (!visible || doc.hidden || !renderer) return;
      const time = now();
      // Left alone, the slow swell needs only every other frame; the pointer brings back all of them.
      skip = !skip && shown && time - touched > 2.5;
      if (!skip) {
        lean = [lean[0] + (aim[0] - lean[0]) * 0.08, lean[1] + (aim[1] - lean[1]) * 0.08, lean[2] + (over - lean[2]) * 0.06];
        const isDarkNow = dark();
        mark.draw(lettering(surface.width, isDarkNow, edgeFor(finish, isDarkNow), time, lean, band));
        if (!shown) {
          shown = true;
          anchor.dataset["quicksilver"] = "live";
          resolve("live");
        }
      }
      frame = view.requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame && renderer) frame = view.requestAnimationFrame(draw);
    };
    const measure = () => {
      const { width, height } = surface.getBoundingClientRect();
      [surface.width, surface.height] = canvasSize(width, height, view.devicePixelRatio);
      wake();
    };
    // A move to a screen with another pixel ratio redraws at that ratio.
    const ratio = () => {
      const query = view.matchMedia(`(resolution: ${String(view.devicePixelRatio)}dppx)`);
      query.addEventListener("change", () => { measure(); ratio(); }, { once: true, signal: signal.signal });
    };
    ratio();
    const point = (event: PointerEvent, press: boolean) => {
      const [x, y] = fieldPoint(event.clientX, event.clientY, surface.getBoundingClientRect(), band);
      over = 1;
      aim = [x, y];
      const time = now();
      touched = time;
      // A ring where the pointer has travelled a little way along the word, or wherever it presses.
      if (press || (Math.hypot(x - last[0], y - last[1]) > 0.05 && time - last[2] > 0.12)) {
        mark.ring(x, y, time);
        last = [x, y, time];
      }
      wake();
    };
    element.addEventListener("pointermove", (event) => { point(event, false); }, on);
    element.addEventListener("pointerdown", (event) => { point(event, true); }, on);
    element.addEventListener("pointerleave", () => { over = 0; }, on);
    // Drawn only while it is on the screen and the tab is shown.
    const seen = new view.IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      wake();
    });
    seen.observe(anchor);
    const sized = new view.ResizeObserver(measure);
    sized.observe(anchor);
    observers.push(seen, sized);
    doc.addEventListener("visibilitychange", wake, on);
    systemDark.addEventListener("change", wake, on);
    surface.addEventListener("webglcontextlost", () => { toStill(); resolve("still"); }, on);
    measure();
    return drawn;
  };

  // Reduced motion turned on later stops the live letters and shows the still.
  motion.addEventListener("change", () => { if (motion.matches) toStill(); }, on);

  const ready = live().catch(() => "still" as const).then((mode) => {
    if (mode === "still") toStill();
    return mode;
  });

  return {
    ready,
    setTheme(next) {
      checkOptions({ field: opts.field, stills: opts.stills, theme: next });
      theme = next;
      // The live loop reads the theme on its next frame.
      fillStill();
    },
    destroy() {
      signal.abort();
      toStill();
      owned?.remove();
      delete anchor.dataset["quicksilver"];
    },
  };
}
