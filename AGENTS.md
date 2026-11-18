# @hraness/quicksilver

One narrow runtime: the quicksilver wordmark (`mount`), its CSS and the bake
CLI. Sites own their look; do not grow this into a UI kit.

- Public, MIT; the bundled font is OFL (`fonts/`). Distributed only as an
  immutable GitHub Release tarball, never npm.
- `src/shader.ts` and `bin/lib/field.mjs` are taken from hraness/yaptake
  (8bdce88). Keep them in step: "yaptake" must bake to yaptake.com's bytes.
- Runtime stays dependency-free and under the size cap (`bun run size`).
- `dist/` is committed; run `bun run build` and commit it with source changes.
- Local checks: `bun run check:code`; browser tests through
  `/Users/bg/.bun/bin/host-run --mode=shared --lane=browser --label=<unique> -- bun run test:browser`.
  Never system Chrome; Playwright's provisioned Chromium only.
- Deliver through a PR; `Required` must pass. Releasing: bump `version` and
  `CHANGELOG.md` in a PR; on merge the tagger app tags `v<version>` and the
  Release workflow publishes. Merge the next version only after the previous
  Release has published.
