// The distance field the shader draws: how far each texel is from the letters' outline, positive
// inside, as a share of the field's width, in twelve-bit steps across red (high byte) and green
// (low byte). Ported unchanged from hraness/yaptake site/quicksilver/field.mjs (8bdce88).
import { writePNG } from './png.mjs';

const RANGE = 0.1, LEVELS = 4095, INF = 1e20;

function line(f, n, d, v, z) { // Felzenszwalb and Huttenlocher's squared distance transform, one row
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    do { const r = v[k]; s = (f[q] + q * q - f[r] - r * r) / (2 * q - 2 * r); } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}

function distance(set, n) { // squared distance from each texel to the nearest one outside `set`
  const grid = new Float64Array(n * n), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < n * n; i++) grid[i] = set[i] ? INF : 0;
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) f[y] = grid[y * n + x]; line(f, n, d, v, z); for (let y = 0; y < n; y++) grid[y * n + x] = d[y]; }
  for (let y = 0; y < n; y++) { f.set(grid.subarray(y * n, y * n + n)); line(f, n, d, v, z); grid.set(d, y * n); }
  return grid;
}

/**
 * A square mask (1 inside, `source` texels a side) as the PNG field the shader reads, `size` texels
 * a side: the distance to the outline, a share of the field's width, blurred a little and kept to
 * RANGE either side of it, after `grow` (the same share) is added all round, which rounds corners.
 */
export function encode(solid, source, size, grow = 0) {
  if (source % size !== 0) throw new Error('The mask must be a whole multiple of the field');
  const hollow = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i++) hollow[i] = 1 - solid[i];
  const inner = distance(solid, source), outer = distance(hollow, source), step = source / size;
  let small = new Float64Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let j = 0; j < step; j++) for (let i = 0; i < step; i++) { const at = (y * step + j) * source + x * step + i; sum += Math.sqrt(inner[at]) - Math.sqrt(outer[at]); }
    small[y * size + x] = sum / (step * step * source);
  }
  // A light blur melts the tracing's small wobbles into a liquid edge.
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const next = new Float64Array(size * size), clamp = (value) => Math.min(size - 1, Math.max(0, value));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      next[y * size + x] = (small[clamp(y - dy) * size + clamp(x - dx)] + 2 * small[y * size + x] + small[clamp(y + dy) * size + clamp(x + dx)]) / 4;
    small = next;
  }
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < small.length; i++) {
    const value = Math.round(Math.round(Math.min(1, Math.max(0, (small[i] + grow) / (2 * RANGE) + 0.5)) * LEVELS) * 65535 / LEVELS);
    out[i * 4] = value >> 8; out[i * 4 + 1] = value & 255; out[i * 4 + 3] = 255;
  }
  return writePNG(size, size, out, false);
}
