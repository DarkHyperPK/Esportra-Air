import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Every over-the-game page renders its panel inside the 1920×1080 canvas, on a see-through page, with no script errors.
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
const PAGES = ['map-veto-band', 'agent-select-band', 'match-intro-band', 'map-result-band', 'series-band', 'halftime-band', 'standings-band', 'player-profile-band', 'schedule-band', 'break-frame', 'scorebug', 'fullscreen'];

let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

test('over-the-game pages render inside the canvas', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const name of PAGES) {
      const errors: string[] = [];
      const onError = (e: Error) => errors.push(e.message);
      page.on('pageerror', onError);
      await page.goto(`file://${OVERLAYS}/${name}.html?preview=1`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      await page.waitForTimeout(700);
      const box = await page.evaluate(() => {
        const el = document.querySelector('.bd, .bd-frame, .vsb, .fs-slot') as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, bg: getComputedStyle(document.body).backgroundColor };
      });
      page.off('pageerror', onError);
      assert.deepEqual(errors, [], `${name}: no script errors`);
      if (name === 'fullscreen') continue; // shows nothing until Air names a graphic
      assert.ok(box, `${name}: the graphic is on the page`);
      assert.ok(box!.x >= -1 && box!.y >= -1 && box!.right <= 1921 && box!.bottom <= 1081, `${name}: inside the canvas ${JSON.stringify(box)}`);
    }
  } finally {
    await browser.close();
  }
});

// Templates: on every graphic's page, a template that changes every part applies with no script errors,
// most parts are found in the sample, and a fixed label's words change.
test('a template applies to every graphic', { skip: !chromium && 'needs Playwright' }, async () => {
  const { GRAPHICS, graphicPage } = await import('../src/shared/templates.ts');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const graphic of Object.keys(GRAPHICS)) {
      const parts = Object.fromEntries(GRAPHICS[graphic]!.parts.map(([id, , words]) => [id, { radius: 6, color: 'brand.secondary', ...(words ? { label: 'CHANGED' } : {}) }]));
      const tpl = { id: 't', name: 'T', graphic, parts };
      const errors: string[] = [];
      const onError = (e: Error) => errors.push(e.message);
      page.on('pageerror', onError);
      await page.goto(`file://${OVERLAYS}/${graphicPage(graphic)}.html?preview=1&template=${encodeURIComponent(JSON.stringify(tpl))}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      await page.waitForTimeout(500);
      const found = await page.evaluate(() => (window as any).HUD.templateRects());
      const styled = await page.evaluate(() => document.querySelectorAll('[data-tpl]').length);
      page.off('pageerror', onError);
      assert.deepEqual(errors, [], `${graphic}: no script errors`);
      assert.equal(found.graphic, graphic, `${graphic}: the page knows which graphic it shows`);
      const share = Object.keys(found.parts).length / GRAPHICS[graphic]!.parts.length;
      assert.ok(share >= 0.4, `${graphic}: only ${Object.keys(found.parts).join(', ')} of its parts are on the sample page`);
      assert.ok(styled > 0, `${graphic}: parts were styled`);
      if (graphic === 'map-veto|band') assert.equal(await page.evaluate(() => document.querySelector('.bd-title')!.textContent), 'CHANGED');
    }
  } finally {
    await browser.close();
  }
});

// Templates part 2: the editor's samples show parts that only appear at certain moments (preview pages
// only), a HUD part plays its entrance each time it appears, and a full HUD template stays fast.
test('samples, entrances on appear, and the cost of a HUD template', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const on = (sel: string) => page.evaluate((s: string) => { const e = document.querySelector(s); if (!e) return false; const m = e.closest('.mod'); return (!m || m.classList.contains('on') || e.classList.contains('on')) && e.getClientRects().length > 0; }, sel);
    for (const [sample, sel] of [['scoreboard', '.st'], ['poll', '.pq'], ['pause', '#hud > .pause'], ['duel', '.du'], ['lowerthird', '.lt']]) {
      await page.goto(`file://${OVERLAYS}/ingame.html?preview=1&sample=${sample}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true);
      await page.waitForTimeout(300);
      assert.ok(await on(sel!), `sample ${sample} shows ${sel}`);
    }
    await page.goto(`file://${OVERLAYS}/ingame.html?sample=scoreboard`);
    await page.waitForFunction(() => (window as any).HUD_READY === true);
    assert.equal(await on('.st'), false, 'a sample is ignored outside a preview');
    await page.goto(`file://${OVERLAYS}/holding.html?preview=1&sample=ending`);
    await page.waitForFunction(() => (window as any).HUD_READY === true);
    assert.equal(await page.evaluate(() => document.querySelector('.big')!.textContent), 'THANKS FOR WATCHING');

    // Entrance: nothing replays on load; the scoreboard animates when it comes up.
    const hud = { id: 'h', name: 'H', graphic: 'hud', parts: { scoreboard: { entrance: { kind: 'rise', ms: 600, delay: 0 } } } };
    await page.goto(`file://${OVERLAYS}/ingame.html?preview=1&template=${encodeURIComponent(JSON.stringify(hud))}`);
    await page.waitForFunction(() => (window as any).HUD_READY === true);
    await page.waitForTimeout(300);
    const anims = () => page.evaluate(() => document.getAnimations().filter((a: any) => a.effect?.target?.classList?.contains('st')).length);
    assert.equal(await anims(), 0, 'nothing plays on load');
    await page.evaluate(() => { const H = (window as any).HUD; H.state.show.scoreboard = true; H.subs.forEach((f: any) => f(H.state)); });
    await page.waitForTimeout(80);
    assert.ok(await anims() > 0, 'the scoreboard plays its entrance when it appears');

    // Speed: every HUD part styled, the demo round running for 6 s; time each apply pass.
    const { GRAPHICS } = await import('../src/shared/templates.ts');
    const all = { id: 'all', name: 'All', graphic: 'hud', parts: Object.fromEntries(GRAPHICS.hud!.parts.map(([id]) => [id, { radius: 4, color: 'brand.text', depth: 'soft', entrance: { kind: 'fade', ms: 300, delay: 0 } }])) };
    await page.goto(`file://${OVERLAYS}/ingame.html?demo=1&template=${encodeURIComponent(JSON.stringify(all))}`);
    await page.waitForFunction(() => (window as any).HUD_READY === true);
    const times: number[] = await page.evaluate(async () => {
      const T = (window as any).AirTemplates, out: number[] = [], apply = T.apply, appear = T.appear;
      T.apply = function (...a: unknown[]) { const t = performance.now(); const r = apply.apply(this, a); out.push(performance.now() - t); return r; };
      T.appear = function (...a: unknown[]) { const t = performance.now(); const r = appear.apply(this, a); out[out.length - 1] = (out[out.length - 1] ?? 0) + performance.now() - t; return r; };
      await new Promise((r) => setTimeout(r, 6000));
      return out;
    });
    const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), worst = Math.max(...times);
    console.log(`template apply: ${times.length} passes, ${avg.toFixed(2)} ms average, ${worst.toFixed(2)} ms worst`);
    assert.ok(times.length >= 3, 'the template was re-applied as the round ran');
    assert.ok(avg < 2 && worst < 8, `apply stays fast (${avg.toFixed(2)} ms avg, ${worst.toFixed(2)} ms worst)`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
