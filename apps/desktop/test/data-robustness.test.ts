// HUD data robustness: thousands of messy game messages through the real engine (broken JSON, wrong
// types, missing fields, huge numbers, unknown keys, extra and duplicate players, team swaps, events out
// of order, observers in the lobby). The engine must keep running, the room must stay well formed, and
// the in-game HUD page must keep drawing without a script error. Seeded, so every run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });

/** A small seeded random generator (mulberry32). */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function messages(n: number, seed: number): unknown[] {
  const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const junk = () => pick<unknown>([null, '', 'NaN', -1, 1e308, '9'.repeat(400), { a: [1, { b: 2 }] }, [], true, '{"broken":', '<script>x</script>', '\u0000￿', 'undefined']);
  const info = (k: string, v: unknown) => ({ info: { match_info: { [k]: typeof v === 'string' ? v : JSON.stringify(v) } }, feature: 'match_info' });
  const line = (i: number) => ({
    player_id: r() < 0.05 ? junk() : uuid(i), name: r() < 0.05 ? junk() : `P${i} #TAG`, character: pick(['Clay_PC_C', 'Sarge_PC_C', 'Rift_PC_C', 'Nope_PC_C', '', junk()]),
    team: pick<unknown>(['0', '1', 0, 1, 2, '', undefined, junk()]), teammate: pick<unknown>([true, false, 'true', undefined, junk()]),
    alive: pick<unknown>([true, false, 'x']), kills: pick<unknown>([0, 3, -5, 'ten', 1e9]), deaths: pick<unknown>([0, 2, null]), assists: 1,
    money: pick<unknown>([800, 3900, 4200, -100, 'lots', 1e12]), shield: pick<unknown>([0, 1, 2, 9, 'x']), weapon: pick(['TX_Hud_Pistol_Classic', 'TX_Hud_Rifles_Volcano', 'nope', '']),
    ult_points: pick<unknown>([0, 7, '3', 'x']), ult_max: pick<unknown>([7, 0, -1]), locked: pick<unknown>([true, false, 'yes']),
  });
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.floor(r() * 16); // 16 ids: ten players plus extra people (observers, substitutes)
    const roll = r();
    if (roll < 0.25) out.push({ feature: 'match_info', key: `scoreboard_${p}`, data: r() < 0.05 ? junk() : JSON.stringify(line(p)) });
    else if (roll < 0.35) out.push(info(`roster_${p}`, r() < 0.05 ? junk() : line(p)));
    else if (roll < 0.45) out.push(info('match_score', r() < 0.1 ? junk() : { team_0: Math.floor(r() * 15), team_1: Math.floor(r() * 15) }));
    else if (roll < 0.52) out.push(info('round_number', String(pick([1, 2, 12, 13, 24, 25, 30, -1, 9999]))));
    else if (roll < 0.6) out.push(info('round_phase', pick(['shopping', 'combat', 'end', 'game_end', 'nonsense', ''])));
    else if (roll < 0.72) out.push({ events: [{ name: 'kill_feed', data: r() < 0.1 ? junk() : JSON.stringify({ attacker: `P${Math.floor(r() * 16)} #TAG`, victim: `P${Math.floor(r() * 16)} #TAG`, weapon: pick(['TX_Hud_Rifles_Volcano', 'knife', '', 'x']), headshot: r() < 0.3 }) }] });
    else if (roll < 0.78) out.push({ events: [{ name: pick(['match_start', 'match_end', 'spike_planted', 'spike_defused', 'spike_detonated', 'planted_location', 'unknown_event']), data: pick(['', 'B', junk()]) }] });
    else if (roll < 0.83) out.push(info('map', pick(['Infinity', 'Ascent', 'Range', 'NotAMap', ''])));
    else if (roll < 0.88) out.push({ feature: 'match_info', key: 'observing', data: `P${Math.floor(r() * 16)} #TAG` });
    else if (roll < 0.93) out.push({ playerId: uuid(p), feature: 'me', info: { me: { health: pick(['100', '0', '-5', 'x', '']), abilities: pick(['{"C":true}', '{bad', { C: 2 }]) } } });
    else out.push(pick<unknown>([junk(), { garbage: true }, { info: junk() }, { events: junk() }, { events: [junk()] }, { feature: 'match_info', key: 'scoreboard_x', data: '{}' }]));
  }
  return out;
}

const finite = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v)) || typeof v !== 'number';

test('the HUD survives thousands of messy game messages', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 180_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-robust-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'robustness-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  let restarts = 0;
  engine.on('restarted', () => restarts++);
  const browser = chromium ? await chromium.launch() : null;
  try {
    const code = 'ROBUST';
    await engine.client.put(`/api/${code}?preset=clean`, {});
    const page = browser ? await browser.newPage({ viewport: { width: 1920, height: 1080 } }) : null;
    const errors: string[] = [];
    page?.on('pageerror', (e: Error) => errors.push(e.message));
    await page?.goto(`http://127.0.0.1:${port}/overlays/ingame.html?match=${code}`);
    const all = messages(6000, 1406);
    let accepted = 0;
    for (let i = 0; i < all.length; i += 50) {
      // A refused batch is fine; a crash is not.
      if (await engine.client.post(`/api/${code}/ingest/valorant`, all.slice(i, i + 50)).then(() => true, () => false)) accepted++;
    }
    assert.equal(restarts, 0, 'the engine never crashed');
    assert.equal(engine.state, 'running');
    assert.ok(accepted > 100, `the engine took the data (${accepted} of 120 batches)`);
    const { state } = await engine.client.get<any>(`/api/${code}`);
    // The room stays well formed: two teams of five, finite numbers, sane scores and rounds.
    assert.equal(state.teams.length, 2);
    assert.equal(state.players.length, 2);
    assert.ok(state.players.every((t: unknown[]) => t.length === 5), 'five seats a side, however many people the game listed');
    assert.ok(state.players.flat().filter((p: any) => /^P\d+$/.test(p.name)).length >= 8, `players were seated from the data: ${state.players.flat().map((p: any) => p.name).join(', ')}`);
    const ids = state.players.flat().map((p: any) => p.puuid).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, 'nobody sits in two seats');
    for (const p of state.players.flat()) for (const k of ['k', 'd', 'a', 'credits', 'hp', 'ult']) assert.ok(finite(p[k]), `${k} is a finite number: ${p[k]}`);
    for (const t of state.teams) assert.ok(Number.isFinite(+t.score) && +t.score >= 0, `score ${t.score}`);
    assert.ok(Number.isFinite(+state.round.number), `round ${state.round.number}`);
    assert.ok(JSON.stringify(state).length < 2_000_000, 'the room does not grow without limit');
    if (page) {
      await page.waitForTimeout(800);
      const drawn = await page.evaluate(() => !!document.querySelector('.vsb'));
      assert.ok(drawn, 'the scorebug is drawn');
      assert.deepEqual(errors, [], 'no script errors in the HUD');
    }
  } finally {
    await browser?.close();
    await engine.stop(true);
  }
});
