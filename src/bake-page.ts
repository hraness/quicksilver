/**
 * The shader and lettering frame as one script for quicksilver-bake's browser page, so the stills are
 * drawn by exactly the code `mount` runs. Built to dist/bake-page.js; not part of the runtime API.
 */
import { createRenderer } from "./shader.js";
import { lettering, DEFAULTS } from "./options.js";

(globalThis as unknown as { quicksilverBake: unknown }).quicksilverBake = { createRenderer, lettering, DEFAULTS };
