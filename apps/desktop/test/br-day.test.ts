import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { kit } from './br-kit.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { validLook } from '../src/main/br-graphics.ts';
import { dayStandings, focusDay } from '../src/shared/br-run.ts';
import { standings } from '../src/shared/br.ts';
import { BR_SCREENS } from '../src/shared/br-screens.ts';
import type { Lobby } from '../src/shared/api.ts';

// Day N standings (28 Nov): the numbers Air builds for the graphic (official standings per day: day points add up to the
// total, sorted, moves against the end of the previous day, adjustments counted in their day), the optional PROVISIONAL
// mark, and the graphic itself drawn from those numbers.
const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

const order = (ids: string[], shift: number) => ids.map((_, i) => ids[(i + shift) % ids.length]!);
const result = (ids: string[]) => ids.map((team, i) => ({ team, place: i + 1, elims: ids.length - i }));

/** A lobby over two days: matches 1 and 2 on Day 1, 3 and 4 on Day 2, with the given states. */
async function twoDays(states: Array<'confirmed' | 'provisional' | 'scheduled' | 'void'>) {
  const s = await kit({ teams: 6, games: 4, length: 300 });
  const l: Lobby = JSON.parse(JSON.stringify(s.lobby()));
  const ids = l.teams.map((t) => t.id);
  const d2 = { id: 'day-2', date: '2026-12-07', title: 'Day 2', matchIds: [l.games[2]!.id!, l.games[3]!.id!], startedAt: 2000 };
  l.days = [{ ...l.days![0]!, matchIds: [l.games[0]!.id!, l.games[1]!.id!], startedAt: 1000 }, d2];
  l.games = l.games.map((g, i) => ({ ...g, dayId: i < 2 ? l.days![0]!.id : 'day-2', state: states[i]!, results: states[i] === 'scheduled' || states[i] === 'void' ? [] : result(order(ids, i)) }));
  return { s, l, ids };
}

test('day points add up to the total, rows are sorted, and moves compare with the end of the previous day', async () => {
  const { s, l } = await twoDays(['confirmed', 'confirmed', 'confirmed', 'confirmed']);
  try {
    const d = dayStandings(l)!;
    assert.equal(d.n, 2); assert.equal(d.dayCount, 2); assert.equal(d.matches, 2); assert.equal(d.confirmed, 2); assert.equal(d.played, 4);
    assert.deepEqual(d.provisionalGames, []);
    for (const r of d.rows) { assert.equal(r.days.reduce((a, b) => a + b, 0), r.total, `${r.team}: days add up`); assert.equal(r.today, r.days[1]); assert.equal(r.prov, 0); }
    assert.deepEqual(d.rows.map((r) => r.total), [...d.rows.map((r) => r.total)].sort((a, b) => b - a), 'sorted by total');
    assert.deepEqual(d.rows.map((r) => r.team), standings(l).map((r) => r.team), 'the same order as the official standings');
    const dayOne = standings({ ...l, games: l.games.slice(0, 2), adjustments: [] });
    for (const r of d.rows) assert.equal(r.move, dayOne.find((x) => x.team === r.team)!.rank - r.rank, `${r.team}: move`);
    assert.ok(d.rows.some((r) => r.move !== 0), 'somebody moved');
    // Day 1 alone has no moves.
    const first = dayStandings({ ...l, days: [l.days![0]!], games: l.games.slice(0, 2) })!;
    assert.equal(first.n, 1); assert.ok(first.rows.every((r) => r.move === null));
  } finally { await s.close(); }
});

test('adjustments count in their day, and the day graphic shows the latest day with a counted match', async () => {
  const { s, l } = await twoDays(['confirmed', 'confirmed', 'confirmed', 'scheduled']);
  try {
    const team = l.teams[0]!.id;
    l.adjustments = [{ id: 'a1', team, points: -7, reason: 'late start', at: 1500, dayId: 'day-2' }, { id: 'a2', team, points: 3, reason: 'bonus', at: 1200 }];
    const d = dayStandings(l)!;
    const row = d.rows.find((r) => r.team === team)!;
    assert.equal(row.days.reduce((a, b) => a + b, 0), row.total, 'still adds up with adjustments');
    assert.equal(row.total, standings(l).find((r) => r.team === team)!.total, 'the total is the official one');
    // a2 has no day: it belongs to Day 1 (the day that had started at 1200); a1 names Day 2.
    const base = dayStandings({ ...l, adjustments: [] })!.rows.find((r) => r.team === team)!;
    assert.equal(row.days[0], base.days[0]! + 3); assert.equal(row.days[1], base.days[1]! - 7);
    assert.equal(d.confirmed, 1, 'one of Day 2’s two matches is confirmed'); assert.equal(d.matches, 2);
    // Only Day 1 has a confirmed match: the graphic shows Day 1.
    const only1 = { ...l, games: l.games.map((g, i) => (i === 2 ? { ...g, state: 'scheduled' as const, results: [] } : g)) };
    assert.equal(dayStandings(only1)!.n, 1); assert.equal(focusDay({ ...only1, days: [] }), -1);
    assert.equal(dayStandings({ ...l, games: l.games.map((g) => ({ ...g, state: 'scheduled' as const, results: [] })) }), null, 'nothing confirmed: nothing to show');
  } finally { await s.close(); }
});

test('provisional matches count only when asked, and are marked per team', async () => {
  const { s, l } = await twoDays(['confirmed', 'confirmed', 'confirmed', 'provisional']);
  try {
    const official = dayStandings(l)!;
    assert.equal(official.n, 2); assert.equal(official.played, 3); assert.deepEqual(official.provisionalGames, []);
    assert.ok(official.rows.every((r) => r.prov === 0));
    const marked = dayStandings(l, { provisional: true })!;
    assert.equal(marked.played, 4); assert.deepEqual(marked.provisionalGames, [4]); assert.equal(marked.confirmed, 1);
    const m4 = standings({ ...l, games: [l.games[3]!], adjustments: [] }, { provisional: true });
    for (const r of marked.rows) {
      assert.equal(r.prov, m4.find((x) => x.team === r.team)!.total, `${r.team}: the unconfirmed points`);
      assert.equal(r.days.reduce((a, b) => a + b, 0), r.total);
      assert.equal(r.total, official.rows.find((x) => x.team === r.team)!.total + r.prov, 'provisional total = official + unconfirmed');
    }
  } finally { await s.close(); }
});

test('the lobby look decides whether the room marks provisional matches (off by default)', async () => {
  const { s, l } = await twoDays(['confirmed', 'confirmed', 'confirmed', 'provisional']);
  try {
    const off = Lobbies.roomField(l);
    assert.equal(off.br.markProvisional, false); assert.deepEqual(off.brDay!.provisionalGames, []);
    assert.ok(off.br.provisional, 'the provisional view still rides along');
    const on = Lobbies.roomField({ ...l, look: { hud: 'rail', popup: false, templates: {}, markProvisional: true } });
    assert.equal(on.br.markProvisional, true); assert.deepEqual(on.brDay!.provisionalGames, [4]);
    assert.ok(on.brDay!.rows.some((r) => r.prov > 0));
    // The switch with nothing provisional marks nothing.
    const none = Lobbies.roomField({ ...l, games: l.games.map((g) => ({ ...g, state: 'confirmed' as const })), look: { hud: 'rail', popup: false, templates: {}, markProvisional: true } });
    assert.equal(none.br.markProvisional, false); assert.deepEqual(none.brDay!.provisionalGames, []);
    // The look keeps the switch only when it is on.
    assert.equal(validLook({ markProvisional: true }, () => null).markProvisional, true);
    assert.equal('markProvisional' in validLook({ markProvisional: false }, () => null), false);
    assert.ok(BR_SCREENS.includes('br-day' as never), 'Live, Rundown and Take know the graphic');
  } finally { await s.close(); }
});

const push = (page: any, patch: string) => page.evaluate((code: string) => {
  const HUD = (window as any).HUD;
  new Function('s', code)(HUD.state);
  HUD.subs.forEach((f: (s: unknown) => void) => f(HUD.state));
}, patch);
const text = (page: any, sel: string) => page.evaluate((q: string) => [...document.querySelectorAll(q)].map((e) => e.textContent!.trim()), sel);

test('the Day standings page draws Air’s numbers, and PROVISIONAL shows only with the switch and an unconfirmed match', { skip: !chromium && 'needs Playwright' }, async () => {
  const { s, l } = await twoDays(['confirmed', 'confirmed', 'confirmed', 'provisional']);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    const draw = async (look: Lobby['look'], name = 'br-day') => {
      await page.goto(`file://${OVERLAYS}/${name}.html`);
      await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
      const f = Lobbies.roomField({ ...l, look });
      await push(page, `const F = ${JSON.stringify(f)}; s.br = F.br; s.brDay = F.brDay;`);
      await page.waitForTimeout(1800);
    };
    await draw(undefined);
    assert.equal((await text(page, '.b6-hd h1'))[0], 'DAY 2 STANDINGS');
    assert.equal((await text(page, '.b6-prov')).length, 0, 'no tag while the switch is off');
    const total = await text(page, '.b6-dy .b6-tr .t b');
    const f = Lobbies.roomField(l);
    assert.deepEqual(total, f.brDay!.rows.map((r) => String(r.total)), 'the totals are Air’s, in order');
    assert.equal(total.length, f.brDay!.rows.length);
    const heads = await text(page, '.b6-dy .b6-th span');
    assert.deepEqual(heads.slice(5, 8), ['DAY 1', 'DAY 2', 'WWCD']);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.b6-dy .bar .pv').length), 0);
    // Each row: the day columns add up to the total on the screen.
    const sums = await page.evaluate(() => [...document.querySelectorAll('.b6-dy .b6-tr')].map((r) => { const c = [...r.querySelectorAll(':scope > .c')].map((e) => +e.textContent!); return [c[0]! + c[1]!, +r.querySelector('.t b')!.textContent!]; }));
    for (const [a, b] of sums) assert.equal(a, b);

    await draw({ hud: 'rail', popup: false, templates: {}, markProvisional: true });
    assert.deepEqual(await text(page, '.b6-prov'), ['PROVISIONAL']);
    assert.ok((await text(page, '.b6-s')).join(' ').includes('MATCH 4 NOT CONFIRMED · POINTS CAN STILL CHANGE'));
    assert.ok(await page.evaluate(() => document.querySelectorAll('.b6-dy .bar .pv').length) > 0, 'hatched segment');
    assert.deepEqual(await text(page, '.b6-dy .b6-tr .t b'), Lobbies.roomField({ ...l, look: { hud: 'rail', popup: false, templates: {}, markProvisional: true } }).brDay!.rows.map((r) => String(r.total)), 'numbers use the provisional standings');
    // Overall standings follow the same switch.
    await draw({ hud: 'rail', popup: false, templates: {}, markProvisional: true }, 'br-overall');
    assert.deepEqual(await text(page, '.b6-prov'), ['PROVISIONAL']);
    assert.ok(await page.evaluate(() => document.querySelectorAll('.b6-ov .bar .pv').length) > 0);
    await draw(undefined, 'br-overall');
    assert.equal((await text(page, '.b6-prov')).length, 0); assert.equal(await page.evaluate(() => document.querySelectorAll('.b6-ov .bar .pv').length), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await s.close(); }
});

test('with no day yet the page says so, and a long table (22 teams, 3 days) stays on the canvas', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${OVERLAYS}/br-day.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    await push(page, `const B = JSON.parse(JSON.stringify(window.BR_SAMPLE)); s.br = B.br; s.brDay = null;`);
    await page.waitForTimeout(400);
    assert.match((await text(page, '.b6-none'))[0]!, /once a match of the day is confirmed/);
    await push(page, `const B = JSON.parse(JSON.stringify(window.BR_SAMPLE)), rows = B.brDay.rows; while (rows.length < 22) { const r = { ...rows[rows.length - 1], team: 'x' + rows.length }; rows.push(r); B.br.teams.push({ ...B.br.teams[0], id: r.team, name: 'EXTRA ' + rows.length, tag: 'X' + rows.length }); } B.brDay.dayCount = 3; B.brDay.n = 3; rows.forEach(r => { r.days = [3, 4, r.today]; }); s.br = B.br; s.brDay = B.brDay;`);
    await page.waitForTimeout(1800);
    assert.deepEqual((await text(page, '.b6-dy .b6-th span')).slice(5, 8), ['BEFORE', 'DAY 2', 'DAY 3'], 'at most the last two days, earlier ones summed');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.b6-dy .b6-tr').length), 22);
    const out = await page.evaluate(() => [...document.querySelectorAll('.b6-dy, .b6-dy *, .b6-ft')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > 1925 || b.bottom > 1022 && !e.closest('.b6-ft') ); }).map((e) => e.className));
    assert.deepEqual(out, [], 'rows stay above the footer');
  } finally { await browser.close(); }
});
