// Обложка OG (1200×630) и PNG-фавиконки: node tools/make-assets.mjs [baseUrl]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const base = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();

// фавиконки
const svg = readFileSync(new URL('../img/favicon.svg', import.meta.url), 'utf8');
for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<style>html,body{margin:0;background:#121110}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await p.screenshot({ path: `img/${name}`, omitBackground: false });
  await p.close();
}

// обложка
const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(base, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.addStyleTag({ content: `
  .site-header, .hero-actions, .hero-specs, .stage-hint, .eyebrow, .lead { display: none !important; }
  .scene::after { content: ''; position: absolute; inset: 18px; border: 1.5px solid rgba(207,194,166,.5); pointer-events: none; z-index: 5; }
  .og-tag { position: absolute; left: 56px; bottom: 46px; z-index: 6; font: 400 15px/1.4 'IBM Plex Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: #c9a25b; }
  .og-brand { position: absolute; left: 56px; top: 52px; z-index: 6; font: 600 30px/1 'Cormorant Garamond', serif; letter-spacing: .26em; color: #ece3cf; }
  .og-stamp { position: absolute; right: 18px; bottom: 18px; z-index: 6; font: 400 12px/1 'IBM Plex Mono', monospace; color: #a39a88; border-left: 1.5px solid rgba(207,194,166,.5); border-top: 1.5px solid rgba(207,194,166,.5); padding: 12px 16px; background: #121110; }
  .hero { padding-top: 112px !important; justify-content: flex-start !important; }
  .hero h1 { font-size: 158px !important; margin-bottom: 0 !important; }
  .og-sub { position: absolute; left: 56px; bottom: 92px; z-index: 6; margin: 0; max-width: 470px; font: 400 21px/1.45 'IBM Plex Sans', sans-serif; color: #b9b0a0; }
  .lead { font-size: 21px !important; max-width: 470px !important; }
`});
await p.evaluate(() => {
  const s = document.getElementById('scene');
  s.insertAdjacentHTML('beforeend', '<p class="og-brand">КАЛИБР</p><p class="og-sub">Ремонт, профилактика и реставрация. Регулировка до ±5 секунд в сутки.</p><p class="og-tag">Мастерская механических часов · Москва</p><p class="og-stamp">Концепт · ViachKovDesign</p>');
  window.dispatchEvent(new Event('resize'));
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'img/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
console.log('ok');
