# Changelog

## 1.1.0

- The swell comes to rest. It runs for 3.5 s after the letters first draw or
  the pointer last moves over, presses or leaves them, then slows to a stop
  within a second, so motion that starts by itself ends within five seconds
  (WCAG 2.2.2, Pause, Stop, Hide) without a pause button. At rest nothing is
  drawn. The swell keeps its own clock and picks up where it stopped when the
  pointer wakes it, and the first live frame is the stills' moment. `SETTLE`
  exports the timing.
- `setTheme` redraws a resting mark, as a resize does.

## 1.0.0

- `mount(anchor, { field, stills, theme, finish, band, onActivate })`: the
  quicksilver wordmark on a link or button, with still fallbacks for reduced
  motion, Save-Data and no WebGL, pausing off screen and in hidden tabs.
- `quicksilver.css`: reserved box, focus ring hook, still/canvas swap.
- `quicksilver-bake`: distance field, light and dark stills and a manifest,
  baked in Playwright's provisioned Chromium. Bundles Funnel Display (OFL).
- Shader and bake taken unchanged from hraness/yaptake 8bdce88; "yaptake"
  bakes to yaptake.com's exact files.
