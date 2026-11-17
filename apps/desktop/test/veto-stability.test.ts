import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Map veto and Agent select redraw in place: with a template on the graphic, a redraw (a new ban, the
// turn's clock moving on each Esportra poll) keeps the template's look in the same frame and replays no
// entrance. Before 16 Nov the redraw stripped the template's styles and words and the template put them
// back a frame later: a flash on air on every update.
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

test('map veto keeps its template look and replays nothing while it updates', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`file://${OVERLAYS}/map-veto.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    const tpl = { id: 'vt1', name: 'Veto look', graphic: 'map-veto|full', parts: { cards: { radius: 14 }, stamps: { label: 'STRUCK', color: '#ffcc00' } } };
    await page.evaluate((t: unknown) => {
      const H = (window as any).HUD; const s = JSON.parse(JSON.stringify(H.state));
      s.airTemplates = [t]; s.airPageTemplates = { 'map-veto|full': 'vt1' }; s.veto = []; s.event.bestOf = 3;
      H.commit(s, { local: true });
    }, tpl);
    await page.waitForTimeout(1500); // the first entrance and the template's first pass
    const result = await page.evaluate(async () => {
      const H = (window as any).HUD; const anims: string[] = []; const flashes: string[] = [];
      document.addEventListener('animationstart', (e) => { if ((e as AnimationEvent).animationName === 'tIn') anims.push((e.target as HTMLElement).className); }, true);
      const check = (when: string) => document.querySelectorAll('.vt .card').forEach((c) => {
        const el = c as HTMLElement;
        if (el.style.getPropertyValue('border-radius') !== '14px') flashes.push(`${when}: card lost its template look`);
      });
      const steps = [{ map: 'Abyss', action: 'ban', team: 0 }, { map: 'Bind', action: 'ban', team: 1 }, { map: 'Lotus', action: 'pick', team: 0, side: 'DEF' }];
      for (let i = 0; i < 6; i++) {
        const s = JSON.parse(JSON.stringify(H.state));
        s.veto = steps.slice(0, Math.min(3, Math.floor(i / 2) + 1));
        s.vetoTurn = { team: 1, action: 'pick', endsAt: Date.now() + 30_000 - i * 1000 };
        H.commit(s, { local: true });
        check(`update ${i}`); // same frame as the redraw: what the viewer sees
        await new Promise((r) => setTimeout(r, 120));
      }
      const words = [...document.querySelectorAll('.vt .card.ban .stamp')].map((x) => x.textContent);
      return { anims, flashes, words };
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(result.flashes, [], 'the template look never drops out');
    assert.deepEqual(result.anims, [], 'no card replays its entrance');
    assert.ok(result.words.length >= 1 && result.words.every((w: string) => w === 'STRUCK'), `the template's words stay: ${result.words}`);
  } finally {
    await browser.close();
  }
});

test('the veto graphic reads Esportra\'s order relative to the team acting first, like Air', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${OVERLAYS}/map-veto.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    const teams = await page.evaluate(() => {
      const f = (window as any).HUD.vetoSteps;
      const order = [{ action: 'ban', team: 0 }, { action: 'ban', team: 1 }, { action: 'pick', team: 0 }, { action: 'pick', team: 1 }, { action: 'ban', team: 0 }, { action: 'ban', team: 1 }, { action: 'decider', team: -1 }];
      return {
        deferred: f([], 3, order, null, 1).map((x: any) => x.team),
        started: f([{ team: 1, action: 'ban', map: 'BIND' }], 3, order, null, 0).map((x: any) => x.team),
      };
    });
    assert.deepEqual(teams.deferred, [1, 0, 1, 0, 1, 0, -1], 'team B acts first after team A deferred');
    assert.deepEqual(teams.started, [1, 0, 1, 0, 1, 0, -1], 'the first step entered decides who went first');
  } finally {
    await browser.close();
  }
});
