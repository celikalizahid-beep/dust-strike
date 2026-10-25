// Uygulama simgelerini (PNG) ek paket kullanmadan üretir: koyu zemin, turuncu nişangah, kırmızı nokta.
// Kullanım: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Normalleştirilmiş koordinatta (0..1) bir noktanın rengi; null = şeffaf
function shade(x, y, maskable) {
  const s = maskable ? 0.72 : 1; // maskelenebilir simgede içerik güvenli alana küçültülür
  const u = (x - 0.5) / s, v = (y - 0.5) / s;
  const bg = [26, 20, 12, 255];
  if (!maskable) {
    const r = 0.19, ax = Math.abs(x - 0.5), ay = Math.abs(y - 0.5);
    const qx = Math.max(ax - (0.5 - r), 0), qy = Math.max(ay - (0.5 - r), 0);
    if (qx * qx + qy * qy > r * r) return null;
  }
  const d = Math.hypot(u, v);
  if (d < 0.036) return [255, 90, 58, 255];
  const orange = [255, 178, 40, 255];
  if (Math.abs(d - 0.29) < 0.028) return orange;
  const t = 0.028;
  if ((Math.abs(u) < t && Math.abs(v) > 0.12 && Math.abs(v) < 0.37) || (Math.abs(v) < t && Math.abs(u) > 0.12 && Math.abs(u) < 0.37)) return orange;
  return bg;
}

function render(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable);
        if (c) { r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; }
      }
      const i = (py * size + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = a / (SS * SS);
    }
  }
  return png(size, buf);
}

const out = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/icon-512-maskable.png', 512, true],
  ['apps/windows/icon.png', 512, false],
  ['apps/android/icon.png', 192, false],
];
for (const [file, size, mask] of out) {
  const p = path.join(root, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, render(size, mask));
  console.log('oluşturuldu:', file, size + 'px');
}
