import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Battle royale motion budget (23 Nov; the producer found the first motion laggy): every animation on the BR pages
// moves only transform and opacity (plus stroke-dashoffset on SVG lines), and nothing that moves carries a filter,
// blend mode or backdrop filter. Those are what made frames slow without a GPU; this keeps them out.
// Frame times themselves are measured by hand (4x CPU throttle) because they depend on the machine.
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
const PAGES = ['br-hud', 'br-lobby', 'br-today', 'br-rankings', 'br-overall', 'br-day', 'br-wwcd', 'br-mvp', 'br-champion', 'br-teams', 'br-drop', 'br-fraggers', 'br-tom', 'br-profile', 'br-mstats', 'br-pvp'];
const ALLOWED = new Set(['transform', 'opacity', 'strokeDashoffset']);

let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

test('BR graphics animate only cheap properties', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const name of PAGES) for (const mode of name === 'br-hud' ? ['rail', 'grid', 'strip', 'moments'] : ['']) {
      await page.goto(`file://${OVERLAYS}/${name}.html?preview=1${mode ? `&mode=${mode}` : ''}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      await page.waitForTimeout(150); // entrances running
      const r = await page.evaluate(() => {
        const props = new Set<string>(); const heavy: string[] = []; let n = 0;
        for (const a of document.getAnimations()) {
          const t = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
          if (!t?.closest?.('.br')) continue;
          n++;
          for (const k of (a.effect as KeyframeEffect).getKeyframes()) for (const key of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) props.add(key);
          const cs = getComputedStyle(t);
          if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || (cs as any).backdropFilter && (cs as any).backdropFilter !== 'none') heavy.push(String(t.className));
        }
        return { props: [...props], heavy, n };
      });
      assert.ok(r.n > 0, `${name} ${mode}: has an entrance`);
      assert.deepEqual(r.props.filter((p: string) => !ALLOWED.has(p)), [], `${name} ${mode}: only transform and opacity move`);
      assert.deepEqual(r.heavy, [], `${name} ${mode}: nothing moving has a filter or blend`);
    }
  } finally { await browser.close(); }
});
