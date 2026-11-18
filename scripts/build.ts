import { rm } from "node:fs/promises";

// The runtime is one ESM file a site's bundler tree-shakes; the bake page is a classic script the
// bake CLI injects into its browser page. Declarations come from tsc.
await rm("dist", { recursive: true, force: true });
const builds = [
  { entrypoints: ["src/index.ts"], format: "esm", sourcemap: "external" },
  { entrypoints: ["src/bake-page.ts"], format: "iife", sourcemap: "none" },
] as const;
for (const build of builds) {
  const result = await Bun.build({
    entrypoints: [...build.entrypoints],
    outdir: "dist",
    root: "src",
    target: "browser",
    format: build.format,
    sourcemap: build.sourcemap,
    minify: false,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}
const types = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.build.json"], { stdout: "inherit", stderr: "inherit" });
if (types.exitCode !== 0) process.exit(types.exitCode);
