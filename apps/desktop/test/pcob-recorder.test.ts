import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store.ts';
import { Lobbies } from '../src/main/br-lobbies.ts';
import { BrLiveFeed } from '../src/main/br-live.ts';
import { BrRun } from '../src/main/br-run.ts';
import { gameState } from '../src/shared/br.ts';
import { targetMatch } from '../src/shared/br-run.ts';
import { PcobRecorder } from '../src/main/pcob-recorder.ts';
import { PCOB_ROUTES } from '../src/shared/pcob.ts';
import { FakePcob } from '../dev/fake-pcob.ts';

// Record PCOB (27 Nov): the raw answers of every route, exactly as received, in a file on this PC; only with
// consent (the feed is connected), with Air's own decisions beside them, and stopping by itself at its limits.
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS'];
const roster = (i: number) => ['ACE', 'ROOK', 'VEX', 'KAI'].map((p) => `T0${i}_${p}`);

async function setup(limits: { maxBytes?: number; maxMs?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pcob-rec-'));
  const store = new Store(join(dir, 'air.json'));
  store.data.events = [{ id: 'ev', name: 'Cup', stages: [], logo: '', logoLight: '', accent: '#ffb60e', talent: [], sponsors: [], tournamentId: null }];
  store.data.teams = NAMES.map((name, i) => ({ id: `t${i}`, name, tag: `T0${i}`, color: '#ffffff', logo: '' }));
  store.data.players = NAMES.flatMap((_, i) => roster(i).map((n, k) => ({ id: `p${i}-${k}`, name: n, realName: '', gameId: n, photo: '', role: '', teamId: `t${i}` })));
  const lobbies = new Lobbies({ store, patch: async () => {}, live: () => false, log: () => {}, changed: () => {} });
  const l = await lobbies.create({ eventId: 'ev', game: 'pubgm', title: 'Group A', games: 2, maps: ['Erangel', 'Miramar'] });
  lobbies.setTeams(l.id, NAMES.map((_, i) => `t${i}`));
  let now = new Date(2026, 10, 27, 14, 5, 0).getTime();
  const pcob = await new FakePcob({ teams: NAMES.map((name, i) => ({ name, players: roster(i) })), length: 300, now: () => now }).listen();
  const rec = new PcobRecorder({ dir: join(dir, 'rec'), now: () => now, ...limits });
  let run!: BrRun;
  const feed = new BrLiveFeed({
    lobby: () => lobbies.selected, patch: async () => {},
    save: (id, n, results, f, extra) => lobbies.saveFeed(id, n, results, f, extra), learn: (id, seen) => lobbies.learnOpenIds(id, seen),
    target: (lob) => { const g = targetMatch(lob); return g ? { n: g.n, state: gameState(g) } : null; }, state: (id, n, to, at) => run.onFeedState(id, n, to, at),
    log: () => {}, changed: () => {}, now: () => now, manual: true,
    tap: (route, status, body) => rec.record(route, status, body), air: (e) => rec.air(e), recording: () => rec.on,
  });
  run = new BrRun({ lobbies, store, feed, pcob: () => feed.status, log: () => {}, changed: () => {}, now: () => now });
  run.arm(l.id, lobbies.find(l.id).games[0]!.id!);
  const step = async (s: number) => { now += s * 1000; await feed.tick(); };
  const lines = () => { const f = rec.view().file; return f ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)) : []; };
  return { dir, rec, feed, pcob, step, lines, close: () => pcob.close() };
}

test('nothing is recorded while off, even with consent and polling', async () => {
  const s = await setup();
  try {
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    await s.step(1);
    assert.equal(s.rec.view().file, null);
    assert.equal(existsSync(join(s.dir, 'rec')), false, 'no folder, no file');
  } finally { await s.close(); }
});

test('records every route raw, one valid JSON line each, with Air events beside them', async () => {
  const s = await setup();
  try {
    s.feed.connect(`127.0.0.1:${s.pcob.port}`, true);
    s.rec.start();
    await s.step(1);
    const idle = s.lines();
    for (const route of Object.values(PCOB_ROUTES)) assert.ok(idle.some((l) => l.route === route), `${route} is read between games too`);
    s.pcob.begin();
    await s.step(1);
    await s.step(1);
    const all = s.lines();
    const raw = all.filter((l) => l.route);
    for (const l of raw) {
      assert.deepEqual(Object.keys(l).sort(), ['body', 'ms', 'route', 'status', 't']);
      assert.equal(typeof l.body, 'string');
      assert.equal(new Date(l.t).getTime(), l.ms);
    }
    const players = raw.filter((l) => l.route === PCOB_ROUTES.players).at(-1)!;
    assert.doesNotThrow(() => JSON.parse(players.body), 'the body is the JSON text as sent');
    assert.ok(players.body.includes('T00_ACE'));
    assert.ok(all.some((l) => l.kind === 'air' && l.event.name === 'game.start'));
    assert.match(s.rec.view().file!, /pcob-2026-11-27-1405\.ndjson$/);
    assert.equal(s.rec.view().lines, all.length);
    assert.equal(s.rec.view().bytes, readFileSync(s.rec.view().file!).length);
  } finally { await s.close(); }
});

test('a new file for every start, and errors are recorded with status 0', async () => {
  const s = await setup();
  try {
    s.feed.connect('127.0.0.1:1', true);
    s.rec.start();
    const first = s.rec.view().file;
    await s.step(1);
    const bad = s.lines().find((l) => l.route === PCOB_ROUTES.inGame)!;
    assert.equal(bad.status, 0);
    assert.ok(bad.body.length > 0);
    s.rec.stop();
    assert.equal(s.rec.view().on, false);
    s.rec.start();
    assert.notEqual(s.rec.view().file, first);
    assert.equal(readdirSync(join(s.dir, 'rec')).length, 2);
  } finally { await s.close(); }
});

test('stops by itself at its size and time limits, and keeps what it wrote', async () => {
  const small = await setup({ maxBytes: 3000 });
  try {
    small.feed.connect(`127.0.0.1:${small.pcob.port}`, true);
    small.rec.start();
    small.pcob.begin();
    for (let i = 0; i < 5; i++) await small.step(1);
    assert.equal(small.rec.view().on, false);
    assert.match(small.rec.view().stopped!, /200 MB/);
    const n = small.lines().length;
    await small.step(1);
    assert.equal(small.lines().length, n, 'nothing more is written after it stops');
    for (const l of readFileSync(small.rec.view().file!, 'utf8').split('\n').filter(Boolean)) JSON.parse(l);
  } finally { await small.close(); }
  const timed = await setup({ maxMs: 5000 });
  try {
    timed.feed.connect(`127.0.0.1:${timed.pcob.port}`, true);
    timed.rec.start();
    await timed.step(1);
    await timed.step(10);
    assert.equal(timed.rec.view().on, false);
    assert.match(timed.rec.view().stopped!, /Four hours/);
  } finally { await timed.close(); }
});
