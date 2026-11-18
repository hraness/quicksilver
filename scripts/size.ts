import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

// What a site pays: the runtime minified and gzipped (as a site's bundler ships `mount`), and the CSS.
const CAP = 6 * 1024;
const result = await Bun.build({ entrypoints: ["dist/index.js"], target: "browser", format: "esm", minify: true });
const first = result.outputs[0];
if (!result.success || !first) throw new Error("size: build failed");
const code = await first.text();
const css = readFileSync("quicksilver.css");
const gz = gzipSync(code, { level: 9 }).length;
console.log(`runtime: ${String(code.length)} B minified, ${String(gz)} B gzipped (cap ${String(CAP)}); css: ${String(css.length)} B, ${String(gzipSync(css, { level: 9 }).length)} B gzipped`);
if (gz > CAP) process.exit(1);
