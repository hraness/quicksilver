#!/usr/bin/env node
// quicksilver-bake: a word as the quicksilver wordmark's distance field, light and dark stills and
// manifest. Run once at dev time, in Playwright's provisioned Chromium; commit what it writes.
import { USAGE, bake, parseBakeArgs } from './lib/bake.mjs';

try {
  const options = parseBakeArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
  } else {
    const manifest = await bake(options);
    console.log(`${manifest.field}, ${manifest.stills.light}, ${manifest.stills.dark} → ${options.out} ("${manifest.word}", ${manifest.aspectRatio}). Chromium ${manifest.generator.chromium}`);
  }
} catch (error) {
  console.error(`quicksilver-bake: ${error instanceof Error ? error.message : String(error)}`);
  if (!(error instanceof Error && /required|must be|Unknown option|Unexpected argument/u.test(error.message))) process.exitCode = 1;
  else { process.stderr.write(USAGE); process.exitCode = 2; }
}
