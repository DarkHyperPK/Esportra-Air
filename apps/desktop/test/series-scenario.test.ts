// A whole best of 3 through the real engine with autopilot running the Standard rundown, including
// what goes wrong on the night: a remake, the graphics engine crashing mid-map, and a series won
// before map 3. Each graphic must come up once, at its moment, and never twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';
import { ObsLink } from '../src/main/obs.ts';
import { Production } from '../src/main/production.ts';
import { Store } from '../src/main/store.ts';
import { FakeObs } from './fake-obs.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
class FakeCapture extends EventEmitter {
  state: 'off' | 'waiting' | 'live' | 'unavailable' = 'off';
  reason: string | null = null;
  start() { this.state = 'live'; this.emit('change'); }
  stop() { this.state = 'off'; this.emit('change'); }
}

test('a best of 3 with a remake, an engine crash and an early series win: every graphic once, at its moment', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-series-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'series-scenario-key-0123456789', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const obsServer = new FakeObs();
  const obs = new ObsLink(() => obsServer, { backoffMs: [50] });
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs, capture: new FakeCapture(), ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  const wait = async (check: () => boolean | Promise<boolean>, label: string, ms = 20_000) => {
    const end = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > end) assert.fail(`timed out: ${label} (log: ${production.snapshot().log.slice(0, 8).map((x) => x.text).join(' | ')})`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const view = () => production.snapshot().autopilot;
  // Keeps the test process alive while the engine restarts (no other timers are pending then).
  const keepAlive = setInterval(() => {}, 100);
  // Every graphic the full-screen host showed, in order (watched on the room itself, not the capped log).
  const aired: string[] = [];
  const NAMES: Record<string, string> = { 'match-intro': 'Match intro', halftime: 'Halftime', 'map-result': 'Map result', series: 'Series', champion: 'Champion' };
  let lastAired: string | null = null;
  const shown = () => aired.map((x) => `Full screen · ${NAMES[x] ?? x}`);
  try {
    await production.createQuickMatch({ teamA: 'Night Owls', teamB: 'Crimson Five', bestOf: 3 });
    production.rundownStartFrom('standard');
    // Fast timings: no hold windows, each graphic on screen for a second, the series a second after the result.
    const row = (id: string) => production.snapshot().rundown.find((r) => r.id === id)!;
    production.rundownSave({ ...row('live'), holdSeconds: 0 });
    production.rundownSave({ ...row('half'), holdSeconds: 0, forSeconds: 2 });
    production.rundownSave({ ...row('result'), holdSeconds: 0, forSeconds: 2 });
    production.rundownSave({ ...row('series'), holdSeconds: 0, forSeconds: 2, delaySeconds: 1 });
    const code = production.match!.code;
    const room = async () => (await engine.client.get<any>(`/api/${code}`)).state;
    const watch = setInterval(() => void room().then((st) => {
      const now = st.airFullscreen ?? null;
      if (now !== lastAired) { lastAired = now; if (now) aired.push(now); }
    }).catch(() => {}), 20);
    (globalThis as any).__seriesWatch = watch;
    const ingest = (msgs: unknown[]) => engine.client.post(`/api/${code}/ingest/valorant`, msgs);
    const score = (a: number, b: number) => ingest([{ info: { match_info: { match_score: JSON.stringify({ team_0: a, team_1: b }) } }, feature: 'match_info' }]);
    const roundLive = async () => { await ingest([{ feature: 'match_info', key: 'round_phase', data: 'shopping' }]); await ingest([{ feature: 'match_info', key: 'round_phase', data: 'combat' }]); };
    const newMap = async () => { await ingest([{ events: [{ name: 'match_start', data: '' }] }]); await score(0, 0); };
    const mapEnd = () => ingest([{ events: [{ name: 'match_end', data: '' }] }]);
    /** Plays rounds one by one from (a, b) to (to[0], to[1]), A's rounds first. */
    const play = async (from: [number, number], to: [number, number]) => {
      let [a, b] = from;
      while (a < to[0] || b < to[1]) {
        if (a < to[0] && (b >= to[1] || a - from[0] <= b - from[1])) a++; else b++;
        await score(a, b);
        await new Promise((r) => setTimeout(r, 60));
      }
    };

    production.autopilotStart();
    await production.autopilotTake(); // the intro waits for Take
    await wait(() => view().now?.id === 'intro', 'intro on air');
    // The map starts straight after; under load the room watcher could miss the intro's moment on air.
    await wait(() => aired.includes('match-intro'), 'the watcher saw the intro');

    // Map 1: live, halftime at 12 rounds, 13–9, the result and then the series.
    await newMap();
    await roundLive();
    await wait(() => view().now?.id === 'map1-live', 'back to the game on map 1');
    await play([0, 0], [7, 5]);
    await wait(() => shown().includes('Full screen · Halftime'), 'halftime on map 1');
    await play([7, 5], [13, 9]);
    await mapEnd();
    await wait(async () => (await room()).teams[0].series === 1, 'map 1 counted from the game');
    await wait(() => shown().includes('Full screen · Series'), 'series after the map 1 result');

    // Map 2 is remade after three rounds: a 2–1 "map end" is no map end, nothing is counted or shown.
    await newMap();
    await roundLive();
    await wait(() => view().now?.id === 'map2-live', 'back to the game on map 2');
    await play([0, 0], [2, 1]);
    await mapEnd();
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await room()).teams[0].series, 1, 'a remade map is not counted');
    assert.equal(shown().filter((t) => t === 'Full screen · Map result').length, 1, 'and its result is not shown');

    // The remake starts over; mid-map the graphics engine crashes and comes back.
    await newMap();
    await play([0, 0], [5, 3]);
    const restarted = new Promise<void>((done) => engine.once('restarted', () => done()));
    await new Promise((r) => setTimeout(r, 400)); // the engine saves every 300 ms
    process.kill(engine.status!.pid, 'SIGKILL');
    await restarted;
    await wait(async () => { try { return (await room()).teams[0].score === 5; } catch { return false; } }, 'the score survives the crash');
    assert.equal((await room()).teams[0].series, 1, 'and so does the series');
    await play([5, 3], [7, 5]);
    await wait(() => shown().filter((t) => t === 'Full screen · Halftime').length === 2, 'halftime on map 2, once');
    await play([7, 5], [13, 10]);
    await mapEnd();
    await wait(async () => (await room()).teams[0].series === 2, 'map 2 counted: 2–0');

    // The series is won: map 3's steps are skipped and the champion waits for Take.
    await wait(() => view().next?.id === 'champion', 'champion is next', 20_000);
    assert.ok(view().segments.filter((s) => s.id.startsWith('map3-')).every((s) => s.state !== 'on_air'), 'nothing from map 3 played');
    await production.autopilotTake();
    await wait(async () => (await room()).airFullscreen === 'champion', 'champion on air');
    await wait(() => aired.includes('champion'), 'the watcher saw it');

    // Every graphic exactly as often as the show had its moment.
    const count = (name: string) => shown().filter((t) => t === `Full screen · ${name}`).length;
    assert.deepEqual([count('Match intro'), count('Halftime'), count('Map result'), count('Series'), count('Champion')], [1, 2, 2, 2, 1], shown().join(' | '));
  } finally {
    clearInterval(keepAlive);
    clearInterval((globalThis as any).__seriesWatch);
    production.autopilot.stopAll();
    production.log.stop();
    await obs.disconnect().catch(() => {});
    await engine.stop(true);
  }
});
