/**
 * Generates the Expo app icon and splash art as real PNGs.
 *
 * Run once from the repository root:
 *
 *   node tools/make-mobile-icons.mjs
 *
 * Exists because the task guide requires the app to install with a proper icon,
 * and no image tooling is available on this machine. It writes plain RGBA PNGs
 * using only Node's built-in `zlib` — no dependencies, nothing to install.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** CRC32, required by the PNG chunk format. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode an RGBA byte array as a PNG. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Draw the icon: soft near-white plate + dark "Z", on the app's dark navy. */
function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  const plateRadius = size * 0.31;

  // The Z, as fractions of the plate so it scales with any size.
  const left = centre - plateRadius * 0.52;
  const right = centre + plateRadius * 0.52;
  const top = centre - plateRadius * 0.52;
  const bottom = centre + plateRadius * 0.52;
  const bar = plateRadius * 0.17;

  /** Signed distance from point (px,py) to the segment (x1,y1)-(x2,y2). */
  const distanceToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    const clamped = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + clamped * dx), py - (y1 + clamped * dy));
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;

      // Background: vertical navy gradient, slightly lighter at the top.
      const t = y / (size - 1);
      const bg = [
        Math.round(15 + t * 14), // #0f172a -> #1d2b44
        Math.round(23 + t * 20),
        Math.round(42 + t * 26),
      ];

      const distFromCentre = Math.hypot(x - centre, y - centre);
      // Antialias the plate edge over one pixel.
      const plate = Math.max(0, Math.min(1, plateRadius - distFromCentre + 0.5));

      let [r, g, b] = bg;

      if (plate > 0) {
        // A very light plate so the icon reads on a dark home screen.
        const light = [244, 246, 250];
        r = Math.round(bg[0] + (light[0] - bg[0]) * plate);
        g = Math.round(bg[1] + (light[1] - bg[1]) * plate);
        b = Math.round(bg[2] + (light[2] - bg[2]) * plate);

        // The Z strokes, drawn only inside the plate.
        const strokeDistance = Math.min(
          distanceToSegment(x, y, left, top, right, top), // top bar
          distanceToSegment(x, y, left, bottom, right, bottom), // bottom bar
          distanceToSegment(x, y, right, top, left, bottom), // diagonal
        );
        const ink = Math.max(0, Math.min(1, bar / 2 - strokeDistance + 0.5)) * plate;
        if (ink > 0) {
          const dark = [15, 23, 42];
          r = Math.round(r + (dark[0] - r) * ink);
          g = Math.round(g + (dark[1] - g) * ink);
          b = Math.round(b + (dark[2] - b) * ink);
        }
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

/** Solid splash image in the app background colour. */
function drawSplash(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      rgba[i] = 248; // #f8fafc, matching the app's content background
      rgba[i + 1] = 250;
      rgba[i + 2] = 252;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/mobile/assets');
mkdirSync(assets, { recursive: true });

const outputs = [
  ['icon.png', drawIcon(1024)],
  ['adaptive-icon.png', drawIcon(1024)],
  ['splash.png', drawSplash(1284, 2778)],
  ['favicon.png', drawIcon(64)],
];

for (const [name, buffer] of outputs) {
  const target = resolve(assets, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  process.stdout.write(`wrote ${name} (${buffer.length} bytes)\n`);
}
