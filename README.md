# @hraness/quicksilver

A word in liquid metal on a link or button: the "yaptake" wordmark that closes
[yaptake.com](https://yaptake.com), as a package any site can use.

- **Runtime** (`mount`): vanilla TypeScript, ESM, no dependencies, about 5 KB
  gzipped. It draws the live letters over the element's still picture, leaning
  toward the pointer and ringing where it crosses or presses them.
- **CSS** (`quicksilver.css`, under 1 KB gzipped): the reserved box, focus ring
  hook and still/canvas swap.
- **Bake CLI** (`quicksilver-bake`): sets your word in Funnel Display (or any
  font) and writes its distance field, light and dark stills and a manifest.
  You run it once at dev time and commit the output.

The shader, frame and bake are taken unchanged from hraness/yaptake (8bdce88).
Baking "yaptake" with this package gives byte-identical files to yaptake.com's
(`wordmark-field.69d94236.png` and both stills).

## Integration recipe (for a site)

### 1. Install the pinned release

The package ships as an immutable GitHub Release tarball, never npm, like
`@hraness/analytics`. The release is public, so a private site's CI fetches it
without a token.

```json
"@hraness/quicksilver": "https://github.com/hraness/quicksilver/releases/download/v1.0.0/hraness-quicksilver-1.0.0.tgz"
```

- **bun:** `bun add @hraness/quicksilver@https://github.com/hraness/quicksilver/releases/download/v1.0.0/hraness-quicksilver-1.0.0.tgz`
  (use `name@url`, since a bare URL can fail to resolve). `bun.lock` records the
  tarball's `sha512` integrity, and CI runs `bun install --frozen-lockfile`.
- **npm:** `npm install https://github.com/hraness/quicksilver/releases/download/v1.0.0/hraness-quicksilver-1.0.0.tgz`.
  `package-lock.json` records `resolved` and `integrity`, and CI runs `npm ci`.
- Each release body lists the tarball's sha256, and `SHA256SUMS` is attached as
  an asset. To check by hand: `curl -sL <url> | shasum -a 256`.

### 2. Bake your word (once, at dev time)

```sh
npx -y playwright-core@1.62.0 install chromium      # Playwright's own Chromium, once per machine
npx -y -p playwright-core@1.62.0 -p https://github.com/hraness/quicksilver/releases/download/v1.0.0/hraness-quicksilver-1.0.0.tgz \
  quicksilver-bake --word sponge --out public/assets/quicksilver
```

On the Hraness Macs, run this under
`/Users/bg/.bun/bin/host-run --mode=shared --lane=browser --label=<site>-quicksilver-bake -- ...`.

The bake runs headless in Playwright's provisioned Chromium (or the Chrome for
Testing build it installed). It refuses the installed Google Chrome app,
symlinks to it and any executable override. It writes four files, each named by
its bytes so they can be cached forever. Commit them; nothing bakes at build or
run time.

| File | What it is |
| --- | --- |
| `wordmark-field.<hash>.png` | The 512² distance field the shader draws (about 120 KB) |
| `wordmark-light.<hash>.png` | Still for light pages: edged silver, 880 px wide |
| `wordmark-dark.<hash>.png` | Still for dark pages: plain silver |
| `wordmark.json` | Manifest: `aspectRatio`, `width`, `height`, `band`, file names, font hash, Chromium version |

Options: `--font <woff2|ttf|otf>` (the default is the bundled Funnel Display,
which all Hraness product sites use for headings), `--weight` (700; 300 to
700 with the bundled font),
`--width` (880 = twice the widest the wordmark is shown), `--band` (0.3, which
gives a 10:3 box; raise it for a short word), `--ink` (0.9), `--grow`
(0.004) and `--prefix` (`wordmark`). Re-baking deletes that prefix's older
hashed files in `--out`. Run `quicksilver-bake --help` for the full list.

### 3. Markup: the box is reserved before any script runs

Put the still in the HTML so the page works with no JavaScript and nothing
shifts. Keep the closing section's old headline as a visually hidden `h2`, so
the outline and SEO stay the same, and give the link its own accessible name.

```html
<section aria-labelledby="closing">
  <h2 class="visually-hidden" id="closing">Your old closing headline</h2>
  <a class="quicksilver" href="/download" aria-label="Download Sponge"
     style="--quicksilver-aspect: 880 / 264">
    <picture>
      <source srcset="/assets/quicksilver/wordmark-dark.<hash>.png" media="(prefers-color-scheme: dark)">
      <img src="/assets/quicksilver/wordmark-light.<hash>.png" width="880" height="264" alt="" decoding="async" loading="lazy">
    </picture>
  </a>
  <a class="download" href="/download">Download</a>
</section>
```

If the element has no `<img>`, `mount` adds a `<picture>` with both stills.
`mount` adds the `quicksilver` class if it is missing; load the CSS so the
element is the canvas's positioned box.

### 4. CSS

Import `@hraness/quicksilver/quicksilver.css`, or inline it, since it is only
about 2 KB. Size and look are set with custom properties on the element:

| Property | Default |
| --- | --- |
| `--quicksilver-width` | `clamp(232px, 60vw, 440px)` (yaptake.com's), never wider than its container |
| `--quicksilver-aspect` | `10 / 3`; set it to the manifest's `aspectRatio` |
| `--quicksilver-focus` | `2px solid currentColor`; set it to the site's focus ring |
| `--quicksilver-focus-offset`, `--quicksilver-radius` | `4px`, `12px` |

The element carries `data-quicksilver="still"` until the live letters draw,
then `"live"`, when the CSS fades the canvas in over the still.

### 5. Mount

```ts
import { mount } from "@hraness/quicksilver";
import manifest from "./assets/quicksilver/wordmark.json";

const base = "/assets/quicksilver/";
const link = document.querySelector<HTMLAnchorElement>("a.quicksilver");
if (link) {
  mount(link, {
    field: base + manifest.field,
    stills: { light: base + manifest.stills.light, dark: base + manifest.stills.dark },
    band: manifest.band,
    onActivate: () => track("cta clicked", { cta: "download", placement: "wordmark" }),
  });
}
```

```ts
mount(anchor: HTMLAnchorElement | HTMLButtonElement, opts: {
  field: URL | string;                       // the manifest's field
  stills: { light: URL | string; dark: URL | string };
  theme?: "auto" | "light" | "dark";         // default "auto" (prefers-color-scheme)
  finish?: "edged" | "plain" | "auto";       // default "auto": edged on light, plain on dark
  band?: number;                             // the manifest's band (default 0.3)
  onActivate?: (event: MouseEvent) => void;  // the element's own click (mouse, touch, Enter, Space)
}): { ready: Promise<"live" | "still">; setTheme(theme): void; destroy(): void }
```

How it behaves:

- **Still first.** Reduced motion, Save-Data and no WebGL keep the still and
  add no canvas. If reduced motion turns on later, the live letters stop.
- **Lazy.** The field is fetched only when the element is within 800 px of the
  screen.
- **Cheap.** Drawing stops off screen and in hidden tabs. Left alone, the slow
  swell draws every other frame. The canvas follows the device pixel ratio (up
  to 2, within 400k pixels) and the element's size through a `ResizeObserver`.
  If the WebGL context is lost, the still comes back.
- **Never navigates.** The canvas is `aria-hidden` with `pointer-events: none`,
  so the press lands on the element. `onActivate` never prevents or redirects
  the click: the link goes where its `href` says, and the button runs its own
  handler. On a link, Space also activates it, as it would a button.
- `setTheme` follows a site's own theme toggle. A forced "light" or "dark"
  also switches the still, including one already in the page's HTML (its
  `<source>`s stand aside until the theme goes back to "auto").
- `ready` always settles: "live" at the first drawn frame, "still" whenever
  the still stays or takes over, including on `destroy()`.
- `destroy()` removes the canvas, listeners and anything `mount` added, and
  puts a server-rendered picture, the `quicksilver` class and
  `data-quicksilver` back as they were.
- `mount` handles Space on a link (no modifiers, and not if a handler already
  called `preventDefault`). When moving yaptake.com's own `wordmark()` to
  this package, drop its Space handler so the link is not activated twice.

### 6. Analytics convention

The package sends nothing. In `onActivate`, send
`cta clicked` with `{ placement: "wordmark" }` (plus the site's usual `cta`
value), next to whatever download event the site already sends from the
link's own handler. Keep the existing events as they are. That is what
yaptake.com does: `cta clicked {cta: "mac download", placement: "wordmark"}`,
alongside its unchanged `download started`.

### 7. Accessibility

- The link or button keeps an accessible name (`aria-label="Download Sponge"`
  or visually hidden text inside it). The still is `alt=""` and the canvas is
  `aria-hidden`, so the name is all a screen reader hears.
- Keep the old closing headline as a visually hidden `h2`.
- The focus ring is the element's own (`--quicksilver-focus`). In forced-colors
  mode the canvas is hidden and the still shows.

## A 404 page

Each Hraness product site's 404 page leads with "404" in quicksilver, as a link
home. The sites share one bake, run as in step 2:

```sh
quicksilver-bake --word 404 --band 0.5 --prefix not-found --out public/quicksilver
```

The bake is deterministic, so every site serves the same four files:
`not-found-field.5a840199.png`, `not-found-light.b59514ea.png`,
`not-found-dark.149f2a4e.png` and `not-found.json`. Band 0.5 gives a 2:1 box
(880 × 440). At the default 0.3, three glyphs fill only half its width.

Follow the recipe above, with these differences:

- The page answers at any address, including nested ones, so every file URL
  starts with `/`.
- The still is the first thing on the page, so don't give it `loading="lazy"`.
- The picture of "404" is the link's only visible label, so the link's name
  starts with it: `aria-label="404: go to the Sponge home page"` (WCAG 2.5.3,
  label in name). Keep a plain text link to the home page as well.
- Pass the manifest's band to `mount`: `band: 0.5`.

## Development

```sh
bun install
bun run check:code            # lint, typecheck, build, unit tests, size cap, package smoke
/Users/bg/.bun/bin/host-run --mode=shared --lane=browser --label=quicksilver-browser -- bun run test:browser
```

`test:browser` bakes "yaptake", mounts it on a page served through request
interception (no server is started), and checks that:

- the live letters draw non-blank pixels without moving the box
- the dark appearance works
- reduced motion, Save-Data and no WebGL each keep the still
- nothing overflows at 320 px
- the click and keyboard reach the element and its navigation, on a link and on a button
- drawing pauses off screen
- `setTheme` and `destroy` work

`dist/` is committed and CI fails if a build changes it. A version bump merged
to `main` is tagged by the release tagger app, and the tag's Release workflow
verifies, packs and publishes `hraness-quicksilver-<version>.tgz` with its
sha256 as an immutable GitHub Release.

## Licence

The code is MIT. The bundled Funnel Display (`fonts/`) is under the SIL Open
Font License 1.1, which allows bundling it with software as long as `OFL.txt`
travels with it. See `fonts/FONT-SOURCE.txt`.
