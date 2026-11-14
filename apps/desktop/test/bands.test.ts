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

// The copies of the full-screen host over the game and over the desk (?over=1) show only over-the-game
// versions: a graphic that covers the whole picture belongs to the Full screen scene the crew switches to.
test('over the game, the host never shows a graphic that covers the game', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const shows = async (over: boolean, show: string, style: string | null) => {
      await page.goto(`file://${OVERLAYS}/fullscreen.html?preview=1${over ? '&over=1' : ''}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      return page.evaluate(([show, style]: [string, string | null]) => {
        const HUD = (window as any).HUD;
        HUD.state.airFullscreen = show;
        HUD.state.airFullscreenStyle = style;
        HUD.subs.forEach((f: (s: unknown) => void) => f(HUD.state));
        return [...document.querySelectorAll('.fs-slot')].some((el) => (el as HTMLElement).style.display !== 'none');
      }, [show, style] as [string, string | null]);
    };
    assert.equal(await shows(false, 'match-intro', null), true, 'the Full screen scene shows the intro');
    assert.equal(await shows(true, 'match-intro', null), false, 'over the game it does not');
    assert.equal(await shows(true, 'champion', null), false, 'nor the champion, which has no over-the-game version');
    assert.equal(await shows(true, 'halftime', 'band'), true, 'an over-the-game look does show over the game');
    assert.equal(await shows(false, 'halftime', 'band'), true, 'and in the Full screen scene');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Map veto and Agent select redraw on live data. Unrelated changes (kills, credits, the score) must not
// rebuild them, and a lock-in or a new veto entry changes only that card: no picture reloads, no card
// replays its entrance. The over-the-game versions behave the same.
test('map veto and agent select change in place: nothing blinks on live data', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const run = async (url: string, show: string | null, cardSel: string, change: string) => {
      await page.goto(`file://${OVERLAYS}/${url}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      return page.evaluate(([show, cardSel, change]: [string | null, string, string]) => {
        const HUD = (window as any).HUD, s = HUD.state;
        const push = () => HUD.subs.forEach((f: (x: unknown) => void) => f(s));
        if (show) { s.airFullscreen = show; s.airFullscreenStyle = null; }
        s.players[0][0].agent = 'JETT';
        push();
        const cards = () => [...document.querySelectorAll(cardSel)] as HTMLElement[];
        const before = cards(), imgs = before.map((c) => c.querySelector('img')), html = before.map((c) => c.outerHTML);
        before.forEach((c, i) => ((c as any).__mark = i));
        // 50 live updates that change nothing on these graphics.
        for (let i = 0; i < 50; i++) {
          s.players[1][2].k = (+s.players[1][2].k || 0) + 1;
          s.players[0][3].credits = 1000 + i * 50;
          s.teams[0].score = i % 13;
          push();
        }
        const kept = cards().every((c, i) => c === before[i]) && cards().every((c, i) => c.querySelector('img') === imgs[i]);
        // One real change: a lock-in (agent select) or a new veto entry.
        if (change === 'lockin') s.players[0][1].agent = 'SOVA';
        else s.veto = [...s.veto, { map: 'BIND', action: 'ban', team: 1 }];
        push();
        const after = cards();
        return {
          count: [before.length, after.length], kept,
          others: after.filter((c, i) => i !== 1 && i < before.length).every((c) => before.includes(c)),
          changed: change === 'lockin' ? after[1] === before[1] && after[1]!.outerHTML !== html[1] : after.length === before.length + 1,
        };
      }, [show, cardSel, change] as [string | null, string, string]);
    };
    for (const [url, show, sel, change] of [
      ['fullscreen.html?preview=1', 'agent-select', '.lu .pc', 'lockin'],
      ['fullscreen.html?preview=1', 'map-veto', '.vt .card', 'veto'],
      ['agent-select-band.html?preview=1', null, '.bd-ag', 'lockin'],
      ['map-veto-band.html?preview=1', null, '.bd-vcol', 'veto'],
    ] as const) {
      const out = await run(url, show, sel, change);
      assert.ok(out.count[0] > 0, `${url} ${show}: cards found ${JSON.stringify(out)}`);
      assert.ok(out.kept, `${url} ${show}: 50 unrelated updates keep every card and picture`);
      assert.ok(out.others, `${url} ${show}: the other cards stay as they are`);
      assert.ok(out.changed, `${url} ${show}: the change shows ${JSON.stringify(out)}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The veto follows the format's steps, and agent select tells a player still choosing from one locked in.
test('veto steps follow the best-of; a lock-in flashes only that card', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${OVERLAYS}/fullscreen.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    const steps = await page.evaluate(() => {
      const f = (window as any).HUD.vetoSteps;
      const kinds = (bo: number) => f([], bo).map((x: any) => x.action).join(' ');
      const mid = f([{ team: 1, action: 'ban', map: 'SPLIT' }, { team: 0, action: 'ban', map: 'BIND' }], 3);
      return { bo1: kinds(1), bo3: kinds(3), bo5: kinds(5), fresh: f([], 3).map((x: any) => x.state), mid: mid.map((x: any) => `${x.state}:${x.action}:${x.team}`) };
    });
    assert.equal(steps.bo1, 'ban ban ban ban ban ban decider');
    assert.equal(steps.bo3, 'ban ban pick pick ban ban decider');
    assert.equal(steps.bo5, 'ban ban pick pick pick pick decider');
    assert.ok(steps.fresh.every((x: string) => x === 'next'), 'before the veto starts nothing is "now"');
    assert.deepEqual(steps.mid.slice(0, 4), ['done:ban:1', 'done:ban:0', 'now:pick:1', 'next:pick:0'], 'teams alternate from the team that acted first');
    assert.equal(steps.mid.at(-1), 'next:decider:-1');

    const cards = await page.evaluate(() => {
      const HUD = (window as any).HUD, s = HUD.state;
      const push = () => HUD.subs.forEach((f: (x: unknown) => void) => f(s));
      s.airFullscreen = 'agent-select'; s.airFullscreenStyle = null;
      s.players[0][0].agent = 'JETT'; s.players[0][0].locked = false;
      s.players[0][1].agent = ''; s.players[0][1].locked = false;
      push();
      const cls = () => [...document.querySelectorAll('.lu .pc')].slice(0, 3).map((c) => c.className.replace('pc ', ''));
      const before = cls();
      s.players[0][0].locked = true;
      push();
      const after = cls();
      s.players[1][4].k = 99; s.teams[0].score = 5; // unrelated: nothing re-flashes
      push();
      return { before, after, later: cls(), count: document.querySelector('.lu .cnt')!.textContent };
    });
    assert.deepEqual(cards.before, ['choosing', 'empty', 'locked']);
    assert.deepEqual(cards.after, ['locked just', 'empty', 'locked']);
    assert.deepEqual(cards.later, ['locked just', 'empty', 'locked'], 'an unrelated update changes nothing');
    assert.equal(cards.count, '9 OF 10 LOCKED');
  } finally {
    await browser.close();
  }
});
