import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import {
  VALORANT_MAPS, holdingMode, nextVetoStep, roomFields, seriesMaps, validEventData, validMatchData, validOrder, validPrep, validVeto, emptyEventData,
} from '../src/shared/match-data.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const POOL = ['ABYSS', 'ASCENT', 'BIND', 'CORRODE', 'HAVEN', 'LOTUS', 'SUNSET'] as const;
const BO3 = [
  { team: 0, action: 'ban', map: 'BIND' }, { team: 1, action: 'ban', map: 'ABYSS' },
  { team: 0, action: 'pick', map: 'LOTUS', side: 'DEF' }, { team: 1, action: 'pick', map: 'HAVEN', side: 'ATK' },
  { team: 0, action: 'ban', map: 'ASCENT' }, { team: 1, action: 'ban', map: 'CORRODE' },
  { team: -1, action: 'decider', map: 'SUNSET' },
];

test('Air knows the same maps as the HUD catalog', () => {
  (globalThis as any).window = {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (process as any).getBuiltinModule('module').createRequire(import.meta.url)(join(ROOT, 'esportra-valorant-hud/core/catalog.js'));
  assert.deepEqual([...VALORANT_MAPS].sort(), Object.keys((globalThis as any).window.VCAT.maps).sort());
});

test('a veto follows its best-of: order, one map once, from the pool, a team for every ban and pick', () => {
  assert.equal(validVeto(BO3, 3, [...POOL]).length, 7);
  assert.throws(() => validVeto([{ team: 0, action: 'pick', map: 'BIND' }], 3, [...POOL]), /Step 1 of a best of 3 is a ban/);
  assert.throws(() => validVeto([BO3[0], { ...BO3[1], map: 'BIND' }], 3, [...POOL]), /already in the veto/);
  assert.throws(() => validVeto([{ team: 0, action: 'ban', map: 'PEARL' }], 3, [...POOL]), /not in this match's map pool/);
  assert.throws(() => validVeto([{ action: 'ban', map: 'BIND' }], 3, [...POOL]), /which team banned/);
  assert.throws(() => validVeto([{ team: 0, action: 'ban', map: 'NOWHERE' }], 3, [...POOL]), /not a map Air knows/);
  assert.throws(() => validVeto([...BO3, BO3[0]], 3, [...POOL]), /has 7 steps/);
  assert.throws(() => validMatchData({ mapPool: ['BIND', 'LOTUS'] }, 3), /needs 7 maps/);
});

test('the next step: teams take turns from whoever acted first; the decider is nobody\'s', () => {
  assert.deepEqual(nextVetoStep([], 3), { action: 'ban', team: 0 });
  assert.deepEqual(nextVetoStep(validVeto([{ team: 1, action: 'ban', map: 'BIND' }], 3, [...POOL]), 3), { action: 'ban', team: 0 });
  assert.deepEqual(nextVetoStep(validVeto(BO3.slice(0, 6), 3, [...POOL]), 3), { action: 'decider', team: -1 });
  assert.equal(nextVetoStep(validVeto(BO3, 3, [...POOL]), 3), null);
});

test('who starts the veto: the usual order alternates from the chosen team until the first step is in', () => {
  assert.deepEqual(nextVetoStep([], 3, null, 1), { action: 'ban', team: 1 });
  assert.deepEqual(nextVetoStep([], 3, null), { action: 'ban', team: 0 }, 'team A by default');
  assert.deepEqual(nextVetoStep([{ team: 1, action: 'ban', map: 'BIND' }], 3, null, 1), { action: 'ban', team: 0 });
  assert.equal(validMatchData({ vetoFirst: 1 }, 3).vetoFirst, 1);
  assert.equal(roomFields(validMatchData({ vetoFirst: 1 }, 3), emptyEventData(), { mapsPlayed: 0, seriesWon: false }).vetoFirst, 1, 'the graphics know who starts');
});

test('the veto makes the series: picks then the decider, with the current map and holding text', () => {
  const md = validMatchData({ mapPool: [...POOL], veto: BO3, show: { mode: 'auto', message: 'Back soon', minutes: 5 } }, 3);
  assert.deepEqual(seriesMaps(md.veto).map((m) => `${m.map}:${m.pick}`), ['LOTUS:0', 'HAVEN:1', 'SUNSET:-1']);
  const before = roomFields(md, emptyEventData(), { mapsPlayed: 0, seriesWon: false });
  assert.deepEqual(before.map, { number: 1, name: 'LOTUS' });
  assert.equal((before.holding as any).mode, 'starting');
  assert.deepEqual((before.series as any[]).map((x) => x.map), ['LOTUS', 'HAVEN', 'SUNSET']);
  const between = roomFields(md, emptyEventData(), { mapsPlayed: 1, seriesWon: false });
  assert.deepEqual(between.map, { number: 2, name: 'HAVEN' });
  assert.equal((between.holding as any).mode, 'brb', 'Break between maps');
  assert.equal((roomFields(md, emptyEventData(), { mapsPlayed: 2, seriesWon: true }).holding as any).mode, 'ending');
  assert.equal(holdingMode('starting', 2, true), 'starting', 'the producer\'s choice wins');
  assert.equal(roomFields(validMatchData({}, 3), emptyEventData(), { mapsPlayed: 0, seriesWon: false }).series, undefined, 'no veto: the series is left as it is');
});

test('a match\'s own veto order (from Esportra): checked, followed for the next step, and sent to the room', () => {
  const order = validOrder([{ action: 'ban', team: 1 }, { action: 'ban', team: 0 }, { action: 'pick', team: 1 }, { action: 'pick', team: 0 }, { action: 'ban', team: 1 }, { action: 'ban', team: 0 }, { action: 'decider', team: -1 }])!;
  assert.deepEqual(nextVetoStep([], 3, order), { action: 'ban', team: 1 }, 'team 2 starts in this order');
  assert.deepEqual(nextVetoStep(validVeto([{ team: 1, action: 'ban', map: 'BIND' }], 3, [...POOL], order), 3, order), { action: 'ban', team: 0 });
  assert.throws(() => validOrder([{ action: 'decider' }, { action: 'ban' }]), /decider is the last step/);
  assert.throws(() => validOrder([{ action: 'side' }]), /bans, picks and a decider/);
  assert.equal(validOrder(null), null);
  // A best of 1 with a pick at the end (Esportra's ban-pick style) is valid with its order, not without.
  const bo1 = validOrder([...Array(5).fill({ action: 'ban', team: 0 }), { action: 'pick', team: 0 }])!;
  const five = ['ABYSS', 'ASCENT', 'BIND', 'CORRODE', 'HAVEN'].map((map, i) => ({ team: i % 2, action: 'ban', map }));
  assert.equal(validVeto([...five, { team: 0, action: 'pick', map: 'LOTUS' }], 1, [...POOL], bo1).length, 6);
  assert.throws(() => validVeto([...five, { team: 0, action: 'pick', map: 'LOTUS' }], 1, [...POOL]), /Step 6 of a best of 1 is a ban/);
  const md = validMatchData({ mapPool: [...POOL], veto: [], vetoOrder: order, vetoSource: 'esportra' }, 3);
  const fields = roomFields(md, emptyEventData(), { mapsPlayed: 0, seriesWon: false });
  assert.equal((fields.vetoOrder as unknown[]).length, 7);
  assert.deepEqual(fields.series, [], 'a reset Esportra veto clears the series maps');
  assert.equal(roomFields(validMatchData({ mapPool: [...POOL] }, 3), emptyEventData(), { mapsPlayed: 0, seriesWon: false }).series, undefined, 'a veto of your own that is empty leaves the series alone');
});

test('event data and player prep are checked', () => {
  const ev = validEventData({ standings: [['NIGHT OWLS', '3–1', '7–3', '+20'], ['', '', '', '']], ticker: ['One', ' ', 'Two'], bracket: { gf: [['A', 1, 'B', 2]] }, handle: '@esportra' });
  assert.equal(ev.standings.length, 1, 'empty rows are dropped');
  assert.deepEqual(ev.ticker, ['One', 'Two']);
  assert.deepEqual(ev.bracket.gf, [['A', 1, 'B', 2]]);
  assert.throws(() => validEventData({ ticker: ['x'.repeat(161)] }), /longer than 160/);
  assert.deepEqual(validPrep({ rating: '1.24', acs: '262', quote: 'Last round.' }), { maps: null, rating: '1.24', kpr: '', acs: 262, hs: '', clutches: null, quote: 'Last round.' });
  assert.throws(() => validPrep({ acs: -3 }), /from 0 to 999/);
});

const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
class FakeCapture extends EventEmitter { state: 'off' = 'off'; reason = null; start() {} stop() {} }

test('match data reaches the room: veto, maps, holding text, standings, ticker, bracket; entered live step by step', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 60_000 }, async () => {
  const { EngineSupervisor } = await import('../src/main/engine-supervisor.ts');
  const { realProcess, engineEnv } = await import('../src/main/process.ts');
  const { ObsLink } = await import('../src/main/obs.ts');
  const { Production } = await import('../src/main/production.ts');
  const { Store } = await import('../src/main/store.ts');
  const { FakeObs } = await import('./fake-obs.ts');
  const dir = mkdtempSync(join(tmpdir(), 'air-md-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'match-data-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture() as never, ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  try {
    await production.createEvent('Cup');
    const event = production.snapshot().events.find((e) => e.name === 'Cup')!;
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 3 });
    await production.updateMatch(production.match!.id, { eventId: event.id });
    const code = production.match!.code;
    const room = async () => (await engine.client.get<any>(`/api/${code}`)).state;
    // Entered live, as the teams ban and pick.
    for (const step of BO3) await production.vetoStep({ map: step.map, ...(step.side ? { side: step.side as 'ATK' | 'DEF' } : {}) });
    await assert.rejects(production.vetoStep({ map: 'PEARL' }), /complete/);
    let st = await room();
    assert.deepEqual(st.veto.map((v: any) => `${v.team}:${v.action}:${v.map}`), BO3.map((v) => `${v.team}:${v.action}:${v.map}`));
    assert.deepEqual(st.series.map((x: any) => x.map), ['LOTUS', 'HAVEN', 'SUNSET']);
    assert.deepEqual([st.map.number, st.map.name], [1, 'LOTUS']);
    assert.equal(st.holding.mode, 'starting');
    // The decider's side, chosen as on Esportra: in a best of 3 by the team that went first (team 0 here).
    const { deciderSideTeam } = await import('../src/shared/match-data.ts');
    await production.vetoEdit(6, { side: 'DEF', sideTeam: deciderSideTeam(3, 0) });
    st = await room();
    assert.deepEqual([st.veto[6].side, st.veto[6].sideTeam], ['DEF', 0]);
    assert.equal(st.series[2].side, 'DEF', 'map 3 carries the decider side');
    await production.vetoUndo();
    assert.equal((await room()).veto.length, 6, 'undo takes the last step back off air');
    // Who starts: swapping swaps the teams of the steps entered; a step can be edited in place.
    await production.vetoFirst(1);
    st = await room();
    assert.deepEqual([st.vetoFirst, st.veto[0].team, st.veto[1].team], [1, 1, 0], 'Swap: the other team started, every step follows');
    await production.vetoEdit(2, { side: 'ATK', sideTeam: 0 });
    st = await room();
    assert.deepEqual([st.veto[2].side, st.veto[2].sideTeam], ['ATK', 0]);
    await assert.rejects(production.vetoEdit(0, { map: st.veto[1].map }), /already in the veto/);
    await assert.rejects(production.vetoEdit(9, { map: 'BIND' }), /not in the veto yet/);
    await production.vetoFirst(0);
    // The event's standings, ticker and bracket, and the holding text.
    const eventId = production.match!.eventId!;
    {
      await production.eventDataSave(eventId, { standings: [['ALPHA', '2–0', '4–0', '+30']], ticker: ['Alpha lead the group'], bracket: { gf: [['ALPHA', 0, 'BRAVO', 0]] }, handle: '@cup', site: 'cup.gg' });
      st = await room();
      assert.deepEqual([st.standings[0][0], st.ticker[0], st.bracket.gf[0][2], st.event.handle], ['ALPHA', 'Alpha lead the group', 'BRAVO', '@cup']);
    }
    await production.matchDataSave({ ...production.snapshot().matchData!, show: { mode: 'brb', message: 'Back after the break', target: 0, minutes: 7 } });
    st = await room();
    assert.deepEqual([st.holding.mode, st.holding.message, st.holding.minutes], ['brb', 'Back after the break', 7]);
    // Fix data: one map won moves the current map to map 2 and the holding text to Break.
    await production.matchDataSave({ ...production.snapshot().matchData!, show: { mode: 'auto', message: '', target: 0, minutes: 5 } });
    await production.correct({ field: 'series', value: [1, 0], reason: 'Map won' });
    st = await room();
    assert.deepEqual([st.map.number, st.map.name, st.holding.mode], [2, 'HAVEN', 'brb']);
    assert.deepEqual(production.snapshot().readout?.series, [1, 0]);
    // The bracket can go on air.
    await engine.client.post('/control/action', { match: code, name: 'fullscreen.show', args: { screen: 'bracket' } });
    assert.equal((await room()).airFullscreen, 'bracket');
    // A best-of change keeps a veto only while it fits.
    await production.updateMatch(production.match!.id, { bestOf: 5 });
    assert.deepEqual(production.snapshot().matchData!.veto, [], 'a best of 3 veto does not fit a best of 5');
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});

test('Esportra\'s own order is relative to the team acting first: after a defer the other team acts, everywhere', async () => {
  const { nextVetoStep, firstTeamOf } = await import('../src/shared/match-data.ts');
  // Esportra's Bo3 order: T1 bans, T2 bans, T1 picks, T2 picks, T1 bans, T2 bans, decider.
  const order = [{ action: 'ban', team: 0 }, { action: 'ban', team: 1 }, { action: 'pick', team: 0 }, { action: 'pick', team: 1 }, { action: 'ban', team: 0 }, { action: 'ban', team: 1 }, { action: 'decider', team: -1 }] as const;
  // Team A won the toss and deferred: team B acts first.
  assert.deepEqual(nextVetoStep([], 3, order as never, 1), { action: 'ban', team: 1 });
  assert.deepEqual(nextVetoStep([{ team: 1, action: 'ban', map: 'BIND' }], 3, order as never, 1), { action: 'ban', team: 0 });
  assert.deepEqual(nextVetoStep([{ team: 1, action: 'ban', map: 'BIND' }, { team: 0, action: 'ban', map: 'ABYSS' }], 3, order as never, 0), { action: 'pick', team: 1 }, 'once a step is in, it decides who went first');
  // An order where T2 starts: the first step was made by T2.
  assert.equal(firstTeamOf([{ team: 0, action: 'ban', map: 'BIND' }], [{ action: 'ban', team: 1 }] as never, 0), 1);
  // The HUD draws the same teams.
  (globalThis as any).window = {};
});

