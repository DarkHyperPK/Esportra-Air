import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { browserSource } from '../src/shared/browser-source.ts';

const screens = [
  { id: 'in-game', outputId: 'a1', scene: 'gameplay', overlay: 'ingame', title: 'In-game HUD', enabled: true },
  { id: 'fullscreen', outputId: 'h1', scene: 'fullscreen', overlay: 'fullscreen', title: 'Full screen', enabled: true },
  { id: 'map-veto', outputId: 'v1', scene: 'fullscreen', overlay: 'map-veto', title: 'Map veto', enabled: true, hosted: true },
] as never[];

test('each Rundown row has an address for its own OBS browser source', () => {
  assert.deepEqual(browserSource(5310, screens, { show: 'in-game' }), { url: 'http://127.0.0.1:5310/o/a1', always: null });
  assert.deepEqual(browserSource(5310, screens, { show: 'map-veto', style: 'band' }), {
    url: 'http://127.0.0.1:5310/o/h1?only=map-veto&style=band', always: 'http://127.0.0.1:5310/o/h1?only=map-veto&style=band&always=1',
  });
  assert.equal(browserSource(5310, screens, { show: 'own:abc' })!.url, 'http://127.0.0.1:5310/o/h1?only=own%3Aabc&style=full');
  assert.equal(browserSource(5310, screens, { show: 'nope' }), null);
});

let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');

test('a one-graphic source stays see-through until Air takes that graphic, then shows it in its look', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const state = async (fields: Record<string, unknown>) => page.evaluate((f: Record<string, unknown>) => { const H = (window as any).HUD; H.commit({ ...JSON.parse(JSON.stringify(H.state)), ...f }, { local: true }); }, fields);
    const shown = () => page.evaluate(() => { const fs = (window as any).HUD.fsShown; return fs ? fs.key : null; });
    await page.goto(`file://${OVERLAYS}/fullscreen.html?preview=1&only=map-veto&style=band`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    await state({ airFullscreen: null });
    assert.equal(await shown(), null, 'nothing until Air takes it');
    await state({ airFullscreen: 'agent-select', airFullscreenStyle: 'full' });
    assert.equal(await shown(), null, 'another graphic on air: still see-through');
    await state({ airFullscreen: 'map-veto', airFullscreenStyle: 'full' });
    assert.equal(await shown(), 'map-veto|band', 'Map veto on air: shown, in this source\'s look');
    await page.goto(`file://${OVERLAYS}/fullscreen.html?preview=1&only=map-veto&style=full&always=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    await state({ airFullscreen: null });
    assert.equal(await shown(), 'map-veto|full', 'always on: shown even when Air has nothing on air');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
