// 把用户的 logo PNG（RGB, 非正方形）解码 → 居中放到正方形画布（背景取图片边缘色）→ 输出 RGBA PNG
const fs = require('fs');
const zlib = require('zlib');

const SRC = process.argv[2];
const DST = process.argv[3];

// ---------- 最小 PNG 解码（支持 8bit RGB/RGBA，全部 5 种行过滤器） ----------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是PNG');
  let pos = 8, idat = [], w = 0, h = 0, colorType = 0, bitDepth = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error('仅支持8bit RGB/RGBA，当前 colorType=' + colorType);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4); // 统一转 RGBA
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      switch (f) {
        case 0: cur[i] = line[i]; break;
        case 1: cur[i] = line[i] + a; break;
        case 2: cur[i] = line[i] + b; break;
        case 3: cur[i] = line[i] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[i] = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2];
      out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, data: out };
}

// ---------- PNG 编码（RGBA） ----------
function crc32(buf) {
  let t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 主流程 ----------
const img = decodePNG(fs.readFileSync(SRC));
const size = Math.max(img.w, img.h);
const canvas = Buffer.alloc(size * size * 4);
// 背景填充：取左上角像素颜色（logo 背景色）
const bg = [img.data[0], img.data[1], img.data[2]];
for (let i = 0; i < size * size; i++) {
  canvas[i * 4] = bg[0]; canvas[i * 4 + 1] = bg[1]; canvas[i * 4 + 2] = bg[2]; canvas[i * 4 + 3] = 255;
}
const ox = Math.floor((size - img.w) / 2), oy = Math.floor((size - img.h) / 2);
for (let y = 0; y < img.h; y++) {
  img.data.copy(canvas, ((y + oy) * size + ox) * 4, y * img.w * 4, (y + 1) * img.w * 4);
}
fs.mkdirSync(require('path').dirname(DST), { recursive: true });
fs.writeFileSync(DST, encodePNG(size, size, canvas));
console.log(`源 ${img.w}x${img.h} → 已居中为 ${size}x${size}，背景色 rgb(${bg.join(',')})`);
console.log('输出:', DST);
