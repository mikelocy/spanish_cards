// Generates the app icons with no image dependencies — raw pixels, then a
// hand-rolled PNG. Run: node tools/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public');

// ---- PNG encoding ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // One filter byte (0 = None) in front of every scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Drawing ----
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = (v) => Math.round(v * size); // fractions of the canvas

  const bg = hex('#c8442b');
  const backCard = hex('#e08272');   // lighter tint, so the back card reads as a second card
  const white = [255, 255, 255];
  const ink = hex('#c8442b');

  // Rounded-rectangle test in canvas coordinates.
  const inRounded = (x, y, rx, ry, w, h, r) => {
    if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false;
    const cx = Math.min(Math.max(x, rx + r), rx + w - r);
    const cy = Math.min(Math.max(y, ry + r), ry + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  const put = (i, [r, g, b]) => {
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };

  // Geometry — everything inside the middle 80% so a maskable crop is safe.
  const back = { x: S(0.20), y: S(0.17), w: S(0.56), h: S(0.50), r: S(0.055) };
  const front = { x: S(0.26), y: S(0.30), w: S(0.56), h: S(0.50), r: S(0.055) };
  const barR = S(0.022);
  const bars = [
    { x: front.x + S(0.07), y: front.y + S(0.14), w: S(0.34), h: S(0.055) },
    { x: front.x + S(0.07), y: front.y + S(0.26), w: S(0.22), h: S(0.055) },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      put(i, bg);

      if (inRounded(x, y, back.x, back.y, back.w, back.h, back.r)) put(i, backCard);
      if (inRounded(x, y, front.x, front.y, front.w, front.h, front.r)) {
        put(i, white);
        for (const b of bars) {
          if (inRounded(x, y, b.x, b.y, b.w, b.h, barR)) put(i, ink);
        }
      }
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, encodePng(size, size, draw(size)));
  console.log('wrote', file, fs.statSync(file).size, 'bytes');
}
