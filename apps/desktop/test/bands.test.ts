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
