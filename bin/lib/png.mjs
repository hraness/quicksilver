// Minimal 8-bit RGBA PNG reader and writer, with no dependencies. The writer filters each row the
// way that leaves it smallest by PNG's usual rule (the least sum of absolute differences) and
// compresses at zlib's highest level: the same pixels as a browser writes, about 40% smaller.
import { deflateSync, inflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (data) => { let c = 0xffffffff; for (const byte of data) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function predict(kind, a, b, c) {
  if (kind === 4) {
    const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  return kind === 0 ? 0 : kind === 1 ? a : kind === 2 ? b : (a + b) >> 1;
}

/** { width, height, data } from PNG bytes: 8-bit RGBA, not interlaced. */
export function readPNG(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!SIGNATURE.every((value, i) => buffer[i] === value)) throw new Error('Not a PNG');
  let offset = 8, width = 0, height = 0;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12);
      if (buffer[offset + 16] !== 8 || buffer[offset + 17] !== 6 || buffer[offset + 20] !== 0) throw new Error('Expected 8-bit RGBA, not interlaced');
    }
    if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * 4, data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const kind = raw[y * (stride + 1)], start = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4] : 0, b = y ? data[(y - 1) * stride + x] : 0, c = x >= 4 && y ? data[(y - 1) * stride + x - 4] : 0;
      data[y * stride + x] = (raw[start + x] + predict(kind, a, b, c)) & 255;
    }
  }
  return { width, height, data };
}

/**
 * PNG bytes for `width` by `height` 8-bit RGBA `data`. Rows are adaptively filtered, or with
 * `adaptive` false left unfiltered, as yaptake's field writer does, so a field bakes to the same bytes.
 */
export function writePNG(width, height, data, adaptive = true) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height), trial = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let best = Infinity;
    for (let kind = 0; kind < (adaptive ? 5 : 1); kind++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? data[y * stride + x - 4] : 0, b = y ? data[(y - 1) * stride + x] : 0, c = x >= 4 && y ? data[(y - 1) * stride + x - 4] : 0;
        const value = (data[y * stride + x] - predict(kind, a, b, c)) & 255;
        trial[x] = value;
        cost += value < 128 ? value : 256 - value;
      }
      if (cost < best) {
        best = cost;
        raw[y * (stride + 1)] = kind;
        raw.set(trial, y * (stride + 1) + 1);
      }
    }
  }
  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length); out.write(type, 4, 'latin1'); body.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, body.length + 8)), body.length + 8);
    return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The same picture as `bytes`, rewritten smaller. */
export function compact(bytes) {
  const { width, height, data } = readPNG(bytes);
  return writePNG(width, height, data);
}
