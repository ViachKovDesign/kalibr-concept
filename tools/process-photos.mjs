// Обработка фото из img/raw → img/photo (AVIF + WebP, 640/1280/2048).
// Запуск: node tools/process-photos.mjs   (нужен пакет sharp: npm i sharp)
// Детали разборки (02–09) приводятся к одному холсту 2048×1600: центр детали — в точке (950, 700),
// масштаб — 46 px на миллиметр реального размера. Поэтому слои можно класть друг на друга без подгонки в CSS.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(root, 'img/raw');
const OUT = join(root, 'img/photo');
mkdirSync(OUT, { recursive: true });

const K = 46;                 // px на мм на холсте
const CW = 2048, CH = 1600;   // холст слоя
const CX = 950, CY = 700;     // центр детали на холсте
const SIZES = [640, 1280, 2048];

// cx, cy, w — центр и ширина детали в исходнике (измерено по альфа-каналу, см. DECISIONS.md); mm — реальный диаметр
const LAYERS = [
  { id: '02', file: '02-sapphire-crystal', cx: 1023, cy: 1022, w: 1454, mm: 31.5, sy: 1.3 },
  { id: '03', file: '03-polished-bezel', cx: 1023.5, cy: 1016, w: 1577, mm: 38.4 },
  { id: '04', file: '04-graphite-dial', cx: 1022.5, cy: 1008, w: 1391, mm: 30 },
  { id: '06', file: '06-movement-dial-side', cx: 1023.5, cy: 985, w: 1289, mm: 26 },
  { id: '07', file: '07-automatic-rotor', cx: 1023, cy: 800, w: 1228, mm: 25 },
  { id: '08', file: '08-steel-midcase', cx: 962, cy: 926, w: 1576, mm: 39 },
  { id: '09', file: '09-exhibition-caseback', cx: 1024, cy: 1040, w: 1534, mm: 37 },
];

async function exportAll(img, name, widths, { alpha = true } = {}) {
  const meta = await img.metadata();
  const out = [];
  for (const w of widths) {
    const width = Math.min(w, meta.width);
    const base = img.clone().resize({ width, withoutEnlargement: true });
    await base.clone().avif({ quality: alpha ? 52 : 50, effort: 5 }).toFile(join(OUT, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 76, alphaQuality: 80, effort: 5 }).toFile(join(OUT, `${name}-${w}.webp`));
    out.push(width);
  }
  return out;
}

const report = {};

// 1. слои разборки
for (const L of LAYERS) {
  const s = (K * L.mm) / L.w;
  const sy = s * (L.sy || 1);
  const src = sharp(join(RAW, L.file + '.png'));
  const meta = await src.metadata();
  const rw = Math.round(meta.width * s), rh = Math.round(meta.height * sy);
  const scaled = await src.resize({ width: rw, height: rh, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  // где окажется центр после масштаба
  const left = Math.round(CX - L.cx * s), top = Math.round(CY - L.cy * sy);
  // обрезка/сдвиг на холст
  const ext = { left: Math.max(0, -left), top: Math.max(0, -top) };
  const vis = {
    w: Math.min(rw - ext.left, CW - Math.max(0, left)),
    h: Math.min(rh - ext.top, CH - Math.max(0, top)),
  };
  const piece = await sharp(scaled).extract({ left: ext.left, top: ext.top, width: vis.w, height: vis.h }).toBuffer();
  const canvas = sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).png();
  const buf = await canvas.toBuffer();
  await exportAll(sharp(buf), `layer-${L.id}`, SIZES);
  report[L.id] = { scale: +s.toFixed(4), scaleY: +sy.toFixed(4), offset: [left, top] };
  console.log('layer', L.id, report[L.id]);
}

// 2. hero (с альфой — лежит на сетке фона)
await exportAll(sharp(join(RAW, '01-assembled-watch.png')), 'hero-01', SIZES);

// 3. фото «Мастер» и «Как работаем» — непрозрачные
for (const n of ['10-balance-hairspring-macro', '11-watchmakers-bench', '12-watchmaker-fitting-gear']) {
  await exportAll(sharp(join(RAW, n + '.png')).flatten({ background: '#121110' }), n.slice(0, 2), SIZES, { alpha: false });
}
// 4. до/после — на фон шторки
for (const n of ['13-movement-before-cleaning', '14-movement-after-cleaning', '15-case-before-polishing', '16-case-after-polishing']) {
  await exportAll(sharp(join(RAW, n + '.png')).flatten({ background: '#16140f' }), n.slice(0, 2), SIZES, { alpha: false });
}
writeFileSync(join(OUT, 'layers.json'), JSON.stringify({ K, CW, CH, CX, CY, layers: report }, null, 2));
console.log('done');
