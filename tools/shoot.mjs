// Скриншоты и автопроверки: node tools/shoot.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || 'screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 1280, height: 800 }, deviceScaleFactor: opts.dsf || 1, locale: 'ru-RU', reducedMotion: opts.rm || 'no-preference', isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${opts.name}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${opts.name}] pageerror: ${e.message}`));
  p.on('requestfailed', (r) => errors.push(`[${opts.name}] requestfailed: ${r.url()}`));
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  return { p, ctx };
}
async function scrollThrough(p) {
  await p.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 400) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await p.waitForTimeout(800);
}
async function overflow(p, name) {
  const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (r.sw > r.cw) errors.push(`[${name}] horizontal overflow ${r.sw} > ${r.cw}`);
  return r;
}
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizes = [[375, 812, 'mobile-375'], [768, 1024, 'tablet-768'], [1280, 800, 'desktop-1280'], [1920, 1080, 'desktop-1920'], [360, 640, 'mobile-360']];
for (const [w, h, name] of sizes) {
  if (only && !only.includes(name)) continue;
  const mobile = w < 800;
  const { p, ctx } = await page({ vp: { width: w, height: h }, name, mobile });
  await p.screenshot({ path: `${out}/${name}-hero.png` });
  // середина разбора
  const sc = await p.evaluate(() => { const st = window.ScrollTrigger && ScrollTrigger.getAll()[0]; return st ? { s: st.start, e: st.end } : null; });
  if (sc) {
    await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), sc.s + (sc.e - sc.s) * 0.45); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-explode-mid.png` });
    await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), sc.s + (sc.e - sc.s) * 0.97); await p.waitForTimeout(1800);
    await p.screenshot({ path: `${out}/${name}-explode-full.png` });
  }
  await scrollThrough(p);
  await overflow(p, name);
  // для полного скриншота снимаем закрепление: сцена остаётся в состоянии «в разборе»
  await p.evaluate(() => { const st = window.ScrollTrigger && ScrollTrigger.getAll()[0]; if (st) { st.scroll(st.end); st.kill(); } window.scrollTo({ top: 0, behavior: 'instant' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  await ctx.close();
}
// reduced motion
if (!only || only.includes('rm')) {
  for (const [w, h, name] of [[1280, 800, 'reduced-motion-1280'], [375, 812, 'reduced-motion-375']]) {
    const { p, ctx } = await page({ vp: { width: w, height: h }, name, rm: 'reduce', mobile: w < 800 });
    await overflow(p, name);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    await ctx.close();
  }
}
// состояния: FAQ, форма, слайдер
if (!only || only.includes('states')) {
  const { p, ctx } = await page({ vp: { width: 1280, height: 800 }, name: 'states' });
  await scrollThrough(p);
  await p.addStyleTag({ content: '.site-header{opacity:0!important}' });
  await p.locator('#faq').scrollIntoViewIfNeeded();
  await p.locator('.qa summary').nth(0).click();
  await p.locator('.qa summary').nth(4).click();
  await p.waitForTimeout(600);
  await p.locator('#faq').screenshot({ path: `${out}/state-faq-open.png` });
  const ba = p.locator('.ba').nth(0);
  await ba.scrollIntoViewIfNeeded();
  const box = await ba.boundingBox();
  await p.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await p.waitForTimeout(300);
  await p.locator('.case').nth(0).screenshot({ path: `${out}/state-before-after-mid.png` });
  // форма: пустая отправка
  await p.locator('#zapis').scrollIntoViewIfNeeded();
  await p.locator('.btn-submit').click();
  await p.waitForTimeout(300);
  const errs = await p.locator('.field-err:not(:empty)').count();
  if (errs < 4) errors.push(`[form] ожидались ошибки валидации, найдено ${errs}`);
  await p.locator('#zapis').screenshot({ path: `${out}/state-form-errors.png` });
  await p.fill('#f-name', 'Ольга');
  await p.locator('#f-phone').pressSequentially('9161234567');
  await p.locator('.chip').nth(1).click();
  await p.fill('#f-msg', 'Спешат на две минуты в сутки, давно не обслуживались');
  // ближайший будний день
  const d = await p.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + 3); if (t.getDay() === 0) t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); });
  await p.fill('#f-date', d);
  await p.locator('#zapis').screenshot({ path: `${out}/state-form-filled.png` });
  await p.locator('.btn-submit').click();
  await p.waitForTimeout(400);
  const ok = await p.locator('#form-success').isVisible();
  if (!ok) errors.push('[form] нет подтверждения после отправки');
  const phone = await p.inputValue('#f-phone').catch(() => '');
  await p.locator('#zapis').screenshot({ path: `${out}/state-form-sent.png` });
  console.log('form ok:', ok, 'phone:', phone);
  // лупа
  await p.addStyleTag({ content: '.site-header{opacity:1!important}' });
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(500);
  const wb = await p.locator('#p-dial').boundingBox();
  await p.mouse.move(wb.x + wb.width * 0.5, wb.y + wb.height * 0.4);
  await p.mouse.move(wb.x + wb.width * 0.55, wb.y + wb.height * 0.45);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/state-loupe.png` });
  // мобильное меню
  await ctx.close();
  const m = await page({ vp: { width: 375, height: 812 }, name: 'menu', mobile: true });
  await m.p.locator('.burger').click(); await m.p.waitForTimeout(500);
  await m.p.screenshot({ path: `${out}/state-mobile-menu.png` });
  await m.ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'Ошибок нет');
