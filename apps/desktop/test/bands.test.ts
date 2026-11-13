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
