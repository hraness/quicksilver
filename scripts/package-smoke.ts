import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Packs the package, installs the tarball into an empty project as a site would, and checks what
// a site imports: the runtime's exports, the CSS export, the bake CLI's help and the bundled font.
const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), "quicksilver-smoke-"));
const run = (cmd: string[], cwd: string) => {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed:\n${result.stderr.toString()}${result.stdout.toString()}`);
  return result.stdout.toString();
};
try {
  run(["bun", "pm", "pack", "--ignore-scripts", "--destination", work], root);
  const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("no tarball");
  const listing = run(["tar", "-tzf", join(work, tarball)], root).split("\n").filter(Boolean).sort();
  for (const required of ["package/dist/index.js", "package/dist/index.d.ts", "package/dist/bake-page.js", "package/quicksilver.css", "package/bin/quicksilver-bake.mjs", "package/fonts/FunnelDisplay.woff2", "package/fonts/OFL.txt", "package/LICENSE", "package/README.md"]) {
    if (!listing.includes(required)) throw new Error(`the tarball is missing ${required}`);
  }
  for (const name of listing) if (/\.test\.|\/test\/|\/scripts\/|node_modules/u.test(name)) throw new Error(`the tarball carries ${name}`);
  const site = join(work, "site");
  run(["mkdir", "-p", site], root);
  await Bun.write(join(site, "package.json"), JSON.stringify({ name: "smoke-site", private: true, type: "module", dependencies: { "@hraness/quicksilver": `file:${join(work, tarball)}` } }));
  run(["bun", "install", "--ignore-scripts"], site);
  await Bun.write(join(site, "check.mjs"), `
    const api = await import("@hraness/quicksilver");
    for (const name of ["mount", "chooseMode", "canvasSize", "edgeFor", "isDark", "lettering", "DEFAULTS"]) if (!(name in api)) throw new Error("missing export " + name);
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const css = require.resolve("@hraness/quicksilver/quicksilver.css");
    if (!css.endsWith("quicksilver.css")) throw new Error("css export");
  `);
  run(["node", "check.mjs"], site);
  const help = run(["node", join(site, "node_modules/@hraness/quicksilver/bin/quicksilver-bake.mjs"), "--help"], site);
  if (!help.includes("--word")) throw new Error("bake --help");
  console.log(`package smoke passed: ${String(listing.length)} files in ${tarball}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
