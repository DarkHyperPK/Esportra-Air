import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Battle royale graphics (core/br.js, 22 Nov): every page draws the sample lobby with no script errors; live data
// updates in place (no entrance replays, the same nodes stay); the room's lobby replaces the sample; kit pictures
// land in their slots and nothing else loads; the full-screen host shows each BR screen Air takes.
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
const PAGES = ['br-hud', 'br-lobby', 'br-today', 'br-rankings', 'br-overall', 'br-wwcd', 'br-mvp', 'br-champion', 'br-teams', 'br-drop', 'br-fraggers', 'br-tom', 'br-profile', 'br-mstats', 'br-pvp'];
const SHA = 'a'.repeat(64);

let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

const push = (page: any, patch: string) => page.evaluate((code: string) => {
  const HUD = (window as any).HUD;
  new Function('s', code)(HUD.state);
  HUD.subs.forEach((f: (s: unknown) => void) => f(HUD.state));
}, patch);

test('battle royale pages draw the sample with no errors', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    for (const name of PAGES) for (const mode of name === 'br-hud' ? ['rail', 'grid', 'strip', 'moments'] : ['']) {
      const errors: string[] = [];
      const onError = (e: Error) => errors.push(e.message);
      page.on('pageerror', onError);
      await page.goto(`file://${OVERLAYS}/${name}.html?preview=1${mode ? `&mode=${mode}` : ''}`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      await page.waitForTimeout(1500); // entrances settle
      const r = await page.evaluate(() => ({ n: document.querySelectorAll('.br *').length, out: [...document.querySelectorAll('.br *')].filter((e) => !e.closest('.b6-mapwrap, .fd-drop, .b6-flare, .b6-rays, .b6-shard')) // light and the tilted map bleed off on purpose (clipped by .brf)
        .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > 1925 || b.bottom > 1085); }).map((e) => e.className) }));
      page.off('pageerror', onError);
      assert.deepEqual(errors, [], `${name} ${mode}: no script errors`);
      assert.ok(r.n > 10, `${name} ${mode}: draws the sample`);
      assert.deepEqual(r.out, [], `${name} ${mode}: stays inside the canvas`);
      if (name === 'br-champion') {
        const gap = await page.evaluate(() => { const w = document.querySelector('.b6-cw .fc')!.getBoundingClientRect(), st = document.querySelector('.b6-cst')!.getBoundingClientRect(); return st.left - w.right; });
        assert.ok(gap > 20, `Champions: the stats sit clear of the word (gap ${gap})`);
      }
    }
  } finally { await browser.close(); }
});

test('the BR HUD updates in place and follows the room', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${OVERLAYS}/br-hud.html?preview=1&mode=rail`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    await page.waitForTimeout(300);
    // The room's own lobby replaces the sample: one renamed team.
    await push(page, `const B = JSON.parse(JSON.stringify(window.BR_SAMPLE)); B.br.teams[2].tag = 'ZZZ'; s.br = B.br; s.brLive = B.brLive;`);
    await page.waitForTimeout(1800); // the board's entrance finishes
    const first = await page.evaluate(() => { (window as any).__row = document.querySelector('.brh-row'); return [...document.querySelectorAll('.brh-row .nm')].map((e) => e.textContent); });
    assert.ok(first.some((t: string) => t!.startsWith('ZZZ')), 'the room lobby is drawn');
    // A knock and an elim on the leader: the board changes, the same row nodes stay, no entrance plays again.
    await push(page, `s.brLive = JSON.parse(JSON.stringify(s.brLive)); s.brLive.teams.s2.players = 'aakd'; s.brLive.teams.s2.elims = 12;`);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({
      same: (window as any).__row === document.querySelector('.brh-row'),
      pips: [...document.querySelectorAll('.brh-row')][0]!.querySelectorAll('.br-pips i.k, .br-pips i.d').length,
      points: document.querySelector('.brh-row .pt')!.textContent,
      running: document.getAnimations().filter((a: any) => a.effect?.target?.classList?.contains('brh-row') && a.playState === 'running').length,
    }));
    assert.equal(after.same, true, 'rows morph in place');
    assert.equal(after.pips, 2, 'knocked and out players show');
    assert.equal(after.points, String(66 + 3), 'live points add the new elims');
    assert.equal(after.running, 0, 'no entrance replays on live data');
    // The grid layout from Air's layout field.
    await push(page, `s.layout = { ...s.layout, brHud: 'grid' };`);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => !!document.querySelector('.brh-tile')), false, 'preview ?mode= wins over the layout field');
  } finally { await browser.close(); }
});

test('kit pictures fill their slots; anything else is refused', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${OVERLAYS}/br-wwcd.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.br-slot')].filter((e) => (e as HTMLElement).style.getPropertyValue('--pic')).length), 0, 'no pack: slots stay empty');
    await push(page, `s.airPack = { esports: '/packs/pubgm/${SHA}.png', ci: 'https://example.com/x.png', character: ['/packs/pubgm/${SHA}.webp'], wallpaper: ['/packs/pubgm/${'b'.repeat(64)}.jpg'], item: ['/packs/pubgm/${'c'.repeat(64)}.png'] };`);
    await page.waitForTimeout(100);
    const pic = (sel: string) => page.evaluate((q: string) => { const e = document.querySelector(q) as HTMLElement | null; return e ? e.style.getPropertyValue('--pic') : null; }, sel);
    assert.match((await pic('.b6-logo'))!, /\/packs\/pubgm\/a{64}\.png/, 'esports logo');
    assert.equal(await pic('.b6-ci'), '', 'outside links never load');
    assert.match((await pic('.brf > .br-slot.bg'))!, /b{64}\.jpg/, 'pack wallpaper is the background');
    assert.match((await pic('.b6-crate'))!, /c{64}\.png/, 'the crate is a pack item');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.br img[src*="webp"]').length), 0, 'no game character stands in for players');
    // The event's theme: a preset, own colours (hex only), own background, props off.
    await push(page, `s.airBrTheme = { preset: 'jungle', colors: { acc: '#12ab34', bg1: 'red;x' }, background: '/air-assets/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}', props: { crate: false, chutes: false } };`);
    await page.waitForTimeout(100);
    const th = await page.evaluate(() => { const m = document.querySelector('.br-layer, [data-theme]') as HTMLElement; return { name: m.dataset.theme, acc: m.style.getPropertyValue('--acc'), bg1: m.style.getPropertyValue('--bg1'), crate: !!document.querySelector('.b6-crate'), chutes: document.querySelectorAll('.b6-chute').length }; });
    assert.equal(th.name, 'jungle');
    assert.equal(th.acc, '#12ab34', 'own colour replaces the preset');
    assert.equal(th.bg1, '#0c241c', 'a colour that is not hex is ignored');
    assert.equal(th.crate, false, 'crate off');
    assert.equal(th.chutes, 0, 'parachutes off');
    assert.match((await pic('.brf > .br-slot.bg'))!, /air-assets/, 'the event background replaces the wallpaper');
    // Players: a Teams/Players photo, else the grey shadow.
    await push(page, `const B = JSON.parse(JSON.stringify(window.BR_SAMPLE)); const w = B.br.standings[0].team; const g = B.br.games.filter((x) => x.results && x.results.length).slice(-1)[0]; const t = B.br.teams.find((x) => x.id === g.results[0].team); t.photos = ['/air-assets/${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}', 'javascript:x']; s.br = B.br; s.brLive = B.brLive;`);
    await page.waitForTimeout(150);
    const ph = await page.evaluate(() => ({ img: [...document.querySelectorAll('.b6-ph img')].map((e) => e.getAttribute('src')), none: document.querySelectorAll('.b6-ph.none').length }));
    assert.equal(ph.img.length, 1, 'one photo');
    assert.match(ph.img[0]!, /air-assets/);
    assert.ok(ph.none >= 3, 'the rest are shadows');
  } finally { await browser.close(); }
});

test('the full-screen host shows each BR screen', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`file://${OVERLAYS}/fullscreen.html`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    const lobby = await page.evaluate(() => { const S = { teams: [{ id: 'a', name: 'ALPHA', tag: 'ALP', color: '#fff', logo: '', players: [] }], games: [{ n: 1, map: 'Erangel', done: false, results: [] }], scoring: { placement: [10], perElim: 1 }, standings: [{ team: 'a', total: 0, wins: 0, elims: 0 }], current: 1, played: 0, champion: null, title: 'GROUP A', game: 'pubgm' }; return JSON.stringify(S); });
    for (const [id, cls] of [['br-lobby', 'brf-lobby'], ['br-today', 'brf-today'], ['br-overall', 'brf-overall'], ['br-champion', 'brf-champ']]) {
      await push(page, `s.br = ${lobby}; s.airFullscreen = '${id}'; s.airFullscreenStyle = 'full';`);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate((c: string) => { const e = document.querySelector('.' + c); return !!e && e.getClientRects().length > 0; }, cls), true, `${id} shows`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
