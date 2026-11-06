// Генератор SVG-графики часов для index.html.
// Запуск: node tools/gen-watch.mjs
// Скрипт перерисовывает блоки между маркерами <!-- GEN:имя --> ... <!-- /GEN:имя --> в index.html.
// Сайт не требует сборки: результат уже лежит в index.html, скрипт нужен только чтобы поменять геометрию.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (n) => (Math.round(n * 100) / 100).toString();
const rad = (d) => (d * Math.PI) / 180;
const pt = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))]; // 0° = 12 часов

const C = {
  ivory: '#ece3cf', dial: '#e6dcc4', paper: '#cfc2a6', brass: '#c9a25b', brassD: '#8c6a32',
  brassL: '#ead096', blue: '#1d3456', ruby: '#a2302a', plate: '#b9b5ab', dark: '#121110',
  ink: '#1c1a17', leather: '#3a281c',
};

// ---------- примитивы ----------
// прямоугольник x,y,w,h, повёрнутый на a° вокруг (0,0) — как подпуть одного path (меньше узлов DOM)
function rectSeg(x, y, w, h, a) {
  const c = Math.cos(rad(a)), sn = Math.sin(rad(a));
  const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => [px * c - py * sn, px * sn + py * c]);
  return 'M' + P.map((q) => f(q[0]) + ' ' + f(q[1])).join('L') + 'Z';
}
function circSeg(cx, cy, r) {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

function ring(rOut, rIn) {
  return `M${f(-rOut)} 0a${f(rOut)} ${f(rOut)} 0 1 0 ${f(2 * rOut)} 0a${f(rOut)} ${f(rOut)} 0 1 0 ${f(-2 * rOut)} 0Z` +
    `M${f(-rIn)} 0a${f(rIn)} ${f(rIn)} 0 1 1 ${f(2 * rIn)} 0a${f(rIn)} ${f(rIn)} 0 1 1 ${f(-2 * rIn)} 0Z`;
}

function gearPath(rRoot, rTip, teeth) {
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [
      pt(rRoot, a - step * 0.5), pt(rRoot, a - step * 0.22), pt(rTip, a - step * 0.12), pt(rTip, a + step * 0.12), pt(rRoot, a + step * 0.22),
    ];
    p.forEach((q, j) => { d += (i === 0 && j === 0 ? 'M' : 'L') + f(q[0]) + ' ' + f(q[1]); });
  }
  return d + 'Z';
}

function escapePath(rRoot, rTip, teeth) {
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [pt(rRoot, a), pt(rTip, a + step * 0.62), pt(rTip, a + step * 0.78), pt(rRoot * 0.98, a + step * 0.5)];
    p.forEach((q, j) => { d += (i === 0 && j === 0 ? 'M' : 'L') + f(q[0]) + ' ' + f(q[1]); });
  }
  return d + 'Z';
}

function jewel(x, y, r = 2.6) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 1.6)}" fill="url(#gBrass)"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${C.ruby}"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.35)}" fill="#e88a7c" opacity=".7"/>`;
}

function screw(x, y, r = 4, a = 30) {
  const [dx, dy] = pt(r * 0.8, a);
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#d9d5cb" stroke="#6d695f" stroke-width=".6"/><path d="M${f(x - dx)} ${f(y - dy)}L${f(x + dx)} ${f(y + dy)}" stroke="#4b4740" stroke-width="1.1"/>`;
}

// колесо: зубчатый венец + спицы + ступица; spin — класс CSS-вращения
function wheel(x, y, rTip, teeth, spin, arms = 4) {
  const rRoot = rTip - Math.max(2.2, rTip * 0.07);
  const rim = rRoot - Math.max(3, rTip * 0.14);
  let armsD = '';
  for (let i = 0; i < arms; i++) armsD += rectSeg(-1.6, -rim, 3.2, rim, (360 / arms) * i + 15);
  const armsSvg = `<path d="${armsD}" fill="url(#gBrass)"/>`;
  const body = `<path d="${gearPath(rRoot, rTip, teeth)}" fill="url(#gBrass)"/>` +
    `<circle r="${f(rim)}" fill="#3b3730"/>` + armsSvg +
    `<circle r="${f(Math.max(4, rTip * 0.18))}" fill="url(#gBrass)"/>` +
    `<circle r="${f(rRoot - 0.8)}" fill="none" stroke="${C.brassD}" stroke-width=".5" opacity=".7"/>`;
  return `<g transform="translate(${f(x)} ${f(y)})"><g class="${spin}">${body}</g>${jewel(0, 0, 1.9)}</g>`;
}

// ---------- детали ----------
function strap() {
  // верх и низ: кожа с отстрочкой; phantom — условное изображение (штрихпунктир) для разлёта
  const upper = 'M-74 -150 L-70 -330 Q-70 -372 -66 -440 L66 -440 Q70 -372 70 -330 L74 -150 Z';
  const lower = 'M-74 150 L-70 330 Q-70 372 -66 440 L66 440 Q70 372 70 330 L74 150 Z';
  const stitchU = 'M-62 -160 L-59 -330 L-56 -440 M62 -160 L59 -330 L56 -440';
  const stitchL = 'M-62 160 L-59 330 L-56 440 M62 160 L59 330 L56 440';
  const holes = [262, 300, 338, 376].map((y) => `<ellipse cx="0" cy="${y}" rx="4.2" ry="3.4" fill="#120c08"/>`).join('');
  const half = (d, s, extra, cls) => `<g class="${cls}"><path d="${d}" fill="url(#gLeather)"/><path d="${s}" fill="none" stroke="${C.paper}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".55"/>${extra}</g>`;
  const ph = (d) => `<path d="${d}" fill="none" stroke="${C.paper}" stroke-width="1.2" stroke-dasharray="14 4 2 4" class="ln"/>`;
  return `<g class="part" id="p-strap" data-part="10"><g class="tilt">
    <g class="strap-solid">${half(upper, stitchU, '', 'strap-up')}${half(lower, stitchL, holes, 'strap-down')}</g>
    <g class="strap-phantom" opacity="0"><g class="strap-up">${ph(upper)}</g><g class="strap-down">${ph(lower)}</g></g>
  </g></g>`;
}

function caseback() {
  let nd = '';
  for (let i = 0; i < 6; i++) nd += rectSeg(-7, -146, 14, 9, i * 60 + 30);
  const notches = `<path d="${nd}" fill="#55575b"/>`;
  return `<g class="part" id="p-back" data-part="08"><g class="tilt">
    <circle r="146" fill="url(#gCase)"/>
    <circle r="146" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>${notches}
    <circle r="132" fill="none" stroke="#d8dade" stroke-width="1.2" opacity=".55"/>
    <path id="backArc" d="M-116 0a116 116 0 1 1 232 0a116 116 0 1 1 -232 0" fill="none"/>
    <text font-family="IBM Plex Mono, monospace" font-size="10.5" letter-spacing="3" fill="#3c3e42"><textPath href="#backArc">КАЛИБР · МОСКВА · № 0427 · ЛАТУНЬ · ВОДОЗАЩИТА 5 АТМ · СДЕЛАНО ВРУЧНУЮ ·</textPath></text>
    <circle r="100" fill="#15130f"/>
    <circle r="100" fill="url(#gGlass)" opacity=".8"/>
    <circle r="100" fill="none" stroke="#d8dade" stroke-width="2"/>
  </g></g>`;
}

function crown() {
  let fd = '';
  for (let y = -19; y <= 19; y += 4.75) fd += `M168 ${f(y)}H190`;
  const flutes = `<path d="${fd}" stroke="#55575b" stroke-width="1.2" opacity=".8"/>`;
  return `<g class="part" id="p-crown" data-part="09"><g class="tilt">
    <rect x="138" y="-3" width="34" height="6" rx="1.5" fill="#b9b5ab"/>
    <rect x="152" y="-12" width="17" height="24" rx="3" fill="url(#gSteel)"/>
    <rect x="166" y="-22" width="26" height="44" rx="6" fill="url(#gSteel)"/>${flutes}
    <rect x="166" y="-22" width="26" height="44" rx="6" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>
  </g></g>`;
}

function caseMid() {
  const lug = (sx, sy) => `<path d="M${sx * 52} ${sy * 122} L${sx * 56} ${sy * 186} Q${sx * 57} ${sy * 194} ${sx * 66} ${sy * 194} L${sx * 82} ${sy * 194} Q${sx * 90} ${sy * 194} ${sx * 90} ${sy * 184} L${sx * 92} ${sy * 112} Z" fill="url(#gSteel)" stroke="#55575b" stroke-width=".8"/>`;
  return `<g class="part" id="p-case" data-part="07"><g class="tilt">
    ${lug(-1, -1)}${lug(1, -1)}${lug(-1, 1)}${lug(1, 1)}
    <path d="${ring(150, 128)}" fill="url(#gCase)" fill-rule="evenodd"/>
    <circle r="150" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>
    <circle r="128" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>
    <path d="M-120 -80 A144 144 0 0 1 -40 -138" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
  </g></g>`;
}

function movementBody() {
  // платина с перляжем, мосты, колёсная передача
  const plate = `<circle r="112" fill="url(#gPlate)"/><circle r="112" fill="url(#pPerlage)"/>
    <circle r="112" fill="none" stroke="#6d695f" stroke-width="1" class="ln"/>`;
  const barrel = wheel(-40, -36, 44, 72, 'spin-xl', 5);
  const center = wheel(0, 0, 28, 56, 'spin-l', 4);
  const third = wheel(38, -24, 21, 42, 'spin-m', 4);
  const fourth = wheel(50, 18, 18, 36, 'spin-s', 4);
  const esc = `<g transform="translate(18 54)"><g class="spin-esc"><path d="${escapePath(10, 15, 15)}" fill="url(#gBrass)"/><circle r="7" fill="#3b3730"/><circle r="3.4" fill="url(#gBrass)"/></g>${jewel(0, 0, 1.6)}</g>`;
  const pallet = `<g class="pallet"><path d="M-6 66 L10 78 L22 70 M2 72 L-8 88" fill="none" stroke="#9f9a90" stroke-width="3.2" stroke-linecap="round"/>${jewel(2, 72, 1.4)}</g>`;
  // мосты: полупрозрачные с «женевскими волнами»
  const barrelBridge = 'M-102 -40 Q-104 -92 -58 -96 Q-14 -98 -4 -62 Q8 -30 -20 -10 Q-52 8 -86 -6 Q-100 -14 -102 -40Z';
  const trainBridge = 'M8 -54 Q40 -66 74 -40 Q92 -20 84 14 Q76 34 58 30 Q66 6 58 -14 Q46 -38 14 -36Z';
  const bridges = `<g opacity=".9"><path d="${barrelBridge}" fill="url(#gPlate)"/><path d="${barrelBridge}" fill="url(#pStripes)"/><path d="${barrelBridge}" fill="none" stroke="#6d695f" stroke-width="1"/>
    <path d="${trainBridge}" fill="url(#gPlate)"/><path d="${trainBridge}" fill="url(#pStripes)"/><path d="${trainBridge}" fill="none" stroke="#6d695f" stroke-width="1"/></g>`;
  const seat = `<circle cx="-34" cy="54" r="40" fill="#2e2b26" opacity=".55"/><circle cx="-34" cy="54" r="40" fill="none" stroke="#6d695f" stroke-width=".8" stroke-dasharray="3 3"/>`;
  const jewelsTop = jewel(-40, -36, 3) + jewel(38, -24, 2.2) + jewel(50, 18, 2.2) + jewel(-34, 54, 2.4);
  const screws = screw(-88, -52, 4.2, 20) + screw(-22, -84, 4.2, 70) + screw(70, -36, 3.8, 40) + screw(78, 2, 3.8, 110) + screw(-92, 30, 3.6, 160);
  const engr = `<text x="-4" y="88" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="7" letter-spacing="1.2" fill="#55514a">К-27 · 25 КАМНЕЙ</text>`;
  return plate + seat + barrel + center + third + fourth + esc + pallet + bridges + jewelsTop + screws + engr;
}

function movement() {
  return `<g class="part" id="p-movement" data-part="05"><g class="tilt">${movementBody()}</g></g>`;
}

function balanceBody() {
  // мост баланса + обод с винтами + спираль
  const cock = `<path d="M-34 54 L-88 10 Q-98 0 -90 -8 L-80 -12 Q-70 -14 -64 -4 L-22 40 Z" fill="url(#gPlate)" stroke="#6d695f" stroke-width="1"/>
    ${screw(-84, -2, 4, 60)}`;
  let sd = '';
  for (let i = 0; i < 12; i++) { const [x, y] = pt(33.5, i * 30); sd += circSeg(x, y, 2.1); }
  const screws = `<path d="${sd}" fill="${C.brassL}" stroke="${C.brassD}" stroke-width=".5"/>`;
  let spiral = 'M0 0';
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const a = t * 360 * 7;
    const r = 4 + t * 20;
    const [x, y] = pt(r, a);
    spiral += `L${f(x)} ${f(y)}`;
  }
  const wheelSvg = `<g class="swing">
      <path d="${ring(33, 29)}" fill="url(#gBrass)" fill-rule="evenodd"/>${screws}
      <rect x="-30" y="-1.6" width="60" height="3.2" fill="url(#gBrass)"/>
      <path d="${spiral}" fill="none" stroke="#3d5b86" stroke-width=".8" opacity=".95"/>
    </g>`;
  return `<g transform="translate(-34 54)">${wheelSvg}</g>${cock}${jewel(-34, 54, 2.6)}`;
}

function rotor() {
  // ротор автоподзавода: полудиск с «женевскими волнами» и подшипником в центре
  const half = 'M-106 0A106 106 0 0 0 106 0L20 0A20 20 0 0 1 -20 0Z';
  let balls = '';
  for (let k = 0; k < 10; k++) { const [x, y] = pt(11, k * 36); balls += circSeg(x, y, 2.2); }
  return `<g class="part" id="p-rotor" data-part="06"><g class="tilt">
    <path d="${half}" fill="url(#gSteel)"/><path d="${half}" fill="url(#pStripes)"/>
    <path d="${half}" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>
    <path d="M-100 8A100 100 0 0 0 100 8" fill="none" stroke="#ffffff" stroke-width="2" opacity=".35"/>
    <circle r="16" fill="#3a3c40"/><path d="${balls}" fill="#d8dade"/><circle r="5" fill="url(#gBrass)"/>
    <text y="62" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="2" fill="#3c3e42">КАЛИБР · К-27</text>
  </g></g>`;
}

function dialBody() {
  let td = '';
  for (let i = 0; i < 60; i++) {
    const five = i % 5 === 0;
    td += rectSeg(five ? -1.1 : -0.55, -114, five ? 2.2 : 1.1, five ? 8 : 5, i * 6);
  }
  const ticks = `<path d="${td}" fill="#d9d4c8"/>`;
  let idx = '', idxD = '';
  for (let i = 0; i < 12; i++) {
    if (i === 0) {
      idx += `<rect x="-6.5" y="-100" width="4.6" height="24" rx="1" fill="url(#gBrass)" stroke="${C.brassD}" stroke-width=".6"/><rect x="1.9" y="-100" width="4.6" height="24" rx="1" fill="url(#gBrass)" stroke="${C.brassD}" stroke-width=".6"/>`;
    } else {
      const long = i % 3 === 0;
      idxD += rectSeg(-2.6, -100, 5.2, long ? 24 : 17, i * 30);
    }
  }
  idx += `<path d="${idxD}" fill="url(#gBrass)" stroke="${C.brassD}" stroke-width=".6"/>`;
  const nums = '';
  return `<circle r="118" fill="url(#gDial)"/>
    <circle r="105" fill="none" stroke="#9a948a" stroke-width=".6" opacity=".5"/>
    <circle r="116" fill="none" stroke="#9a948a" stroke-width=".6" opacity=".5"/>${ticks}${idx}${nums}
    <text y="-42" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="17" font-weight="600" letter-spacing="4" fill="#e6dfcf">КАЛИБР</text>
    <text y="-29" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="6.5" letter-spacing="2" fill="#9a948a">МОСКВА</text>
    <text y="50" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="6.5" letter-spacing="1.6" fill="#9a948a">АВТОПОДЗАВОД · 25 КАМНЕЙ</text>
    <circle r="118" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>`;
}

function dial() {
  return `<g class="part" id="p-dial" data-part="04"><g class="tilt">${dialBody()}</g></g>`;
}

function handsBody(h = 0, m = 0, s = 0) {
  return `<g class="hand hand-h" transform="rotate(${h})"><path d="M0 -66 L5.2 -16 L2.6 10 L-2.6 10 L-5.2 -16Z" fill="url(#gBrass)" stroke="#6a4f22" stroke-width=".6"/><path d="M0 -60 L1.4 -18 L-1.4 -18Z" fill="#fff3cf" opacity=".35"/></g>
    <g class="hand hand-m" transform="rotate(${m})"><path d="M0 -100 L4 -20 L2.2 12 L-2.2 12 L-4 -20Z" fill="url(#gBrass)" stroke="#6a4f22" stroke-width=".6"/><path d="M0 -94 L1.1 -22 L-1.1 -22Z" fill="#fff3cf" opacity=".35"/></g>
    <g class="hand hand-s" transform="rotate(${s})"><path d="M-.6 -108 L.6 -108 L1 24 L-1 24Z" fill="#e2c486"/><circle cy="18" r="3.4" fill="#e2c486"/></g>
    <circle r="5.4" fill="url(#gBrass)" stroke="${C.brassD}" stroke-width=".6"/><circle r="1.6" fill="#2a2b2d"/>`;
}

function hands() {
  return `<g class="part" id="p-hands" data-part="03"><g class="tilt">${handsBody(305, 60, 180)}</g></g>`;
}

function bezel() {
  let gd = '';
  for (let i = 0; i < 120; i++) gd += rectSeg(-0.4, -146, 0.8, 6, i * 3);
  const grain = `<path d="${gd}" fill="#55575b" opacity=".55"/>`;
  return `<g class="part" id="p-bezel" data-part="02"><g class="tilt">
    <path d="${ring(146, 118)}" fill="url(#gBezel)" fill-rule="evenodd"/>${grain}
    <circle r="146" fill="none" stroke="#55575b" stroke-width="1" class="ln"/>
    <circle r="118" fill="none" stroke="#55575b" stroke-width="1.2" class="ln"/>
    <circle r="124" fill="none" stroke="#ffffff" stroke-width=".8" opacity=".5"/>
  </g></g>`;
}

function crystal() {
  return `<g class="part" id="p-crystal" data-part="01"><g class="tilt">
    <circle r="121" fill="url(#gGlass)"/>
    <path d="M-92 -58 A110 110 0 0 1 22 -108 A120 120 0 0 0 -70 -40 Z" fill="#fff" opacity=".16"/>
    <path d="M60 80 A104 104 0 0 1 20 100" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".18"/>
    <circle r="121" fill="none" stroke="#f2ead8" stroke-width="1" opacity=".55" class="ln"/>
  </g></g>`;
}

const defs = `<defs>
  <linearGradient id="gBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efd79f"/><stop offset=".38" stop-color="#c9a25b"/><stop offset=".72" stop-color="#8f6b33"/><stop offset="1" stop-color="#d9b672"/></linearGradient>
  <linearGradient id="gBezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".45" stop-color="#a7a9ad"/><stop offset=".7" stop-color="#5d5f63"/><stop offset="1" stop-color="#dcdee1"/></linearGradient>
  <linearGradient id="gSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eceef0"/><stop offset=".4" stop-color="#a2a4a8"/><stop offset=".72" stop-color="#5a5c60"/><stop offset="1" stop-color="#c9cbce"/></linearGradient>
  <radialGradient id="gCase" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#e6e8ea"/><stop offset=".6" stop-color="#8e9094"/><stop offset="1" stop-color="#46484c"/></radialGradient>
  <radialGradient id="gDial" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#3a3b3d"/><stop offset=".75" stop-color="#232426"/><stop offset="1" stop-color="#18191a"/></radialGradient>
  <linearGradient id="gPlate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcd8cf"/><stop offset=".5" stop-color="#aaa69c"/><stop offset="1" stop-color="#77736a"/></linearGradient>
  <linearGradient id="gGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
  <linearGradient id="gLeather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1c13"/><stop offset=".5" stop-color="#4a3324"/><stop offset="1" stop-color="#2a1c13"/></linearGradient>
  <pattern id="pPerlage" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="4.3" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width=".7"/><circle cx="0" cy="0" r="4.3" fill="none" stroke="#000" stroke-opacity=".08" stroke-width=".7"/></pattern>
  <pattern id="pStripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="4" height="8" fill="#fff" opacity=".12"/></pattern>
</defs>`;

// Порядок отрисовки: сзади наперёд (вид спереди).
const watch = `<g id="watch" transform="translate(0 0) scale(1)">
${strap()}
${caseback()}
${crown()}
${caseMid()}
${rotor()}
${movement()}
${dial()}
${hands()}
${bezel()}
${crystal()}
</g>`;

// ---------- статичные символы для «до/после» ----------
function staticCase(id) {
  const lugs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => `<path d="M${sx * 52} ${sy * 122} L${sx * 56} ${sy * 186} Q${sx * 57} ${sy * 194} ${sx * 66} ${sy * 194} L${sx * 82} ${sy * 194} Q${sx * 90} ${sy * 194} ${sx * 90} ${sy * 184} L${sx * 92} ${sy * 112} Z" fill="url(#gSteel)" stroke="#55575b" stroke-width=".8"/>`).join('');
  return `<symbol id="${id}" viewBox="-230 -230 460 460">
    <path d="M-62 -190 L-60 -240 L60 -240 L62 -190Z M-62 190 L-60 240 L60 240 L62 190Z" fill="url(#gLeather)"/>
    <rect x="152" y="-12" width="17" height="24" rx="3" fill="url(#gSteel)"/><rect x="166" y="-22" width="26" height="44" rx="6" fill="url(#gSteel)" stroke="#55575b"/>
    ${lugs}<path d="${ring(150, 128)}" fill="url(#gCase)" fill-rule="evenodd"/>
    <path d="${ring(146, 118)}" fill="url(#gBezel)" fill-rule="evenodd"/>
    ${dialBody()}${handsBody(305, 60, 200)}
    <circle r="121" fill="url(#gGlass)"/>
  </symbol>`;
}

const symbols = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">
${defs}
${staticCase('sym-watch')}
</svg>`;

// ---------- «грязь» и царапины для кейсов (детерминированный ГПСЧ) ----------
let seed = 27;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
let dust = '';
for (let i = 0; i < 70; i++) {
  const a = rnd() * 360, r = Math.sqrt(rnd()) * 108;
  const [x, y] = pt(r, a);
  dust += circSeg(x, y, 0.5 + rnd() * 1.6);
}
let scratches = '', scratches2 = '';
for (let i = 0; i < 46; i++) {
  const a = rnd() * 360, r = 118 + rnd() * 30;
  const [x, y] = pt(r, a);
  const len = 6 + rnd() * 22, dir = rnd() * 180;
  const [dx, dy] = pt(len / 2, dir);
  scratches += `M${f(x - dx)} ${f(y - dy)}L${f(x + dx)} ${f(y + dy)}`;
}
for (let i = 0; i < 18; i++) {
  const a = rnd() * 360, r = 20 + rnd() * 90;
  const [x, y] = pt(r, a);
  const len = 8 + rnd() * 30, dir = rnd() * 180;
  const [dx, dy] = pt(len / 2, dir);
  scratches2 += `M${f(x - dx)} ${f(y - dy)}L${f(x + dx)} ${f(y + dy)}`;
}

// ---------- график суточного хода ----------
const rate = {
  pos: ['ЦВ', 'ЦН', 'ГВ', 'ГН', 'ГЛ', 'ГП'],
  full: ['Циферблатом вверх', 'Циферблатом вниз', 'Головкой вверх', 'Головкой вниз', 'Головкой влево', 'Головкой вправо'],
  before: [-38, -51, -24, -44, -62, -33],
  after: [3, 4, 1, 5, 2, 3],
};
const RX0 = 46, RX1 = 314, RTOP = 16, RSC = 1.4, VMAX = 10;
const ry = (v) => RTOP + (VMAX - v) * RSC;
const fmt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
let rateSvg = `<svg class="rate-svg" viewBox="0 0 320 158" role="img" aria-label="График суточного хода в шести положениях: до ремонта часы отставали на 24–62 секунды в сутки, после — спешат на 1–5 секунд, в пределах допуска ±5.">
  <g font-family="IBM Plex Mono, monospace" font-size="11" fill="#a39a88">
  <rect x="${RX0}" y="${f(ry(5))}" width="${RX1 - RX0}" height="${f(10 * RSC)}" fill="#c9a25b" opacity=".13"/>`;
for (const v of [-20, -40, -60]) rateSvg += `<path d="M${RX0} ${f(ry(v))}H${RX1}" stroke="#34302a" stroke-width="1"/><text x="${RX0 - 6}" y="${f(ry(v) + 3)}" text-anchor="end">${fmt(v)}</text>`;
rateSvg += `<text x="${RX0 - 6}" y="${f(ry(0) + 3)}" text-anchor="end">0</text><text x="${RX1}" y="${f(ry(5) - 3)}" text-anchor="end" fill="#c9a25b">допуск ±5</text></g>`;
const gw = (RX1 - RX0) / 6;
let rateTable = '';
rate.pos.forEach((p, i) => {
  const cx = RX0 + gw * i + gw / 2;
  const b = rate.before[i], a = rate.after[i];
  const bx = cx - 14, ax = cx + 1;
  rateSvg += `<rect class="bar bar-before" x="${f(bx)}" y="${f(ry(0))}" width="13" height="${f(-b * RSC)}" rx="2" fill="#5d82c8"><title>${rate.full[i]}: до ремонта ${fmt(b)} с/сут</title></rect>`;
  rateSvg += `<rect class="bar bar-after" x="${f(ax)}" y="${f(ry(a))}" width="13" height="${f(a * RSC)}" rx="2" fill="#b88a2e"><title>${rate.full[i]}: после ${fmt(a)} с/сут</title></rect>`;
  rateSvg += `<text x="${f(cx)}" y="150" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="#a39a88">${p}</text>`;
  if (b === Math.min(...rate.before)) rateSvg += `<text x="${f(bx + 6.5)}" y="${f(ry(b) + 11)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="#ece3cf">${fmt(b)}</text>`;
  if (a === Math.max(...rate.after)) rateSvg += `<text x="${f(ax + 6.5)}" y="${f(ry(a) - 4)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="#ece3cf">${fmt(a)}</text>`;
  rateTable += `<tr><th scope="row">${rate.full[i]}</th><td>${fmt(b)}</td><td>${fmt(a)}</td></tr>`;
});
rateSvg += `<path d="M${RX0} ${f(ry(0))}H${RX1}" stroke="#8d8576" stroke-width="1"/></svg>`;

// ---------- вставка ----------
const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
const put = (name, content) => {
  const re = new RegExp(`(<!-- GEN:${name} -->)[\\s\\S]*?(<!-- /GEN:${name} -->)`);
  if (!re.test(html)) { console.warn('нет маркера', name); return; }
  html = html.replace(re, `$1\n${content}\n$2`);
};
put('watch', watch);
put('sprite', symbols);
put('rate', rateSvg);
put('ratetable', rateTable);
writeFileSync(file, html);
console.log('ok: watch', watch.length, 'sprite', symbols.length);
