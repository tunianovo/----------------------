// 生成 App 图标 assets/icon.png（512x512，蓝渐变圆角方块 + 白色聊天气泡 + 三个点）
// 纯 Node 实现 PNG 编码（zlib + CRC32），无外部依赖
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const SS = 2; // 超采样倍数（抗锯齿）

// ---------- 工具 ----------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 几何采样 ----------
const inRoundRect = (x, y, x1, y1, x2, y2, r) => {
  if (x < x1 || x > x2 || y < y1 || y > y2) return false;
  const cx = Math.max(x1 + r, Math.min(x, x2 - r));
  const cy = Math.max(y1 + r, Math.min(y, y2 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= x1 + r && x <= x2 - r) || (y >= y1 + r && y <= y2 - r);
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inTri = (x, y, a, b, c) => {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p3[0] - p1[0]) * (p1[1] - p2[1]);
  const d1 = sign([x, y], a, b), d2 = sign([x, y], b, c), d3 = sign([x, y], c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

// 每个物理像素：SS x SS 子采样，返回 [r,g,b,a]
function sample(px, py) {
  let r = 0, g = 0, b = 0, a = 0;
  const step = 1 / SS;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) * step;
      const y = py + (sy + 0.5) * step;
      let cr, cg, cb, ca = 0;
      // 背景：圆角方块 + 对角渐变
      if (inRoundRect(x, y, 0, 0, SIZE, SIZE, 112)) {
        const t = Math.min(1, (x + y) / (SIZE * 2));
        cr = lerp(10, 0, t); cg = lerp(108, 194, t); cb = lerp(255, 255, t);
        ca = 255;
      } else continue;
      // 白色气泡
      const bubble = inRoundRect(x, y, 112, 150, 400, 336, 76) || inTri(x, y, [164, 320], [244, 320], [164, 400]);
      if (bubble) { cr = 255; cg = 255; cb = 255; }
      // 三个点（盖在气泡上）
      if (inCircle(x, y, 190, 243, 17) || inCircle(x, y, 256, 243, 17) || inCircle(x, y, 322, 243, 17)) {
        cr = 10; cg = 108; cb = 255;
      }
      // 累加
      r += cr; g += cg; b += cb; a += ca;
    }
  }
  const n = SS * SS;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
}

// ---------- 生成原始像素 ----------
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = sample(x, y);
    const o = rowStart + 1 + x * 4;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
  }
}

// ---------- 组装 PNG ----------
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('icon.png 生成完成:', png.length, 'bytes ->', out);
