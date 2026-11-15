import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
class FakeCapture extends EventEmitter { state: 'off' = 'off'; reason = null; start() {} stop() {} }

test('an Esportra match end to end: package, lineup Riot ids, live veto, bracket, sponsors, results reviewed, heartbeat', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 60_000 }, async () => {
  const { EngineSupervisor } = await import('../src/main/engine-supervisor.ts');
  const { realProcess, engineEnv } = await import('../src/main/process.ts');
  const { ObsLink } = await import('../src/main/obs.ts');
  const { Production } = await import('../src/main/production.ts');
  const { Store } = await import('../src/main/store.ts');
  const { EsportraAccount } = await import('../src/main/esportra.ts');
  const { FakeObs } = await import('./fake-obs.ts');
  const { FakeEsportra } = await import('../dev/fake-esportra.ts');
  const backend = await new FakeEsportra().start();
  const dir = mkdtempSync(join(tmpdir(), 'air-esp-sync-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'esportra-sync-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const values = new Map<string, string>();
  const esportra = new EsportraAccount({ apiBase: backend.url, store, secrets: { get: (k) => values.get(k) ?? null, set: (k, v) => void (v === null ? values.delete(k) : values.set(k, v)) }, deviceId: randomUUID(), deviceName: 'TEST-PC' });
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture() as never, ingest: { target: () => {} }, esportra, version: 'test' });
  production.setup.game = 'valorant';
  const wanted = backend.matches[0]!;
  backend.riot.set('VGD One', 'puuid-vgd-1');
  backend.riot.set('HLX Three', 'puuid-hlx-3');
  // The teams have started banning on Esportra.
  const veto = backend.vetoOf(wanted.id);
  veto.status = 'in_progress';
  veto.steps.push({ team: 0, action: 'ban', map: 'Bind', side: null }, { team: 1, action: 'ban', map: 'Abyss', side: null });
  try {
    await production.esportraSignIn(backend.email, backend.password);
    await production.useEsportraMatch(wanted.id);
    const match = production.match!;
    const room = async () => (await engine.client.get<any>(`/api/${match.code}`)).state;

    // The package: the lineup with Riot ids (seated before the game lists the players).
    assert.ok(match.source?.packageId, 'the package is kept for result proposals');
    assert.deepEqual(match.players[0].map((p) => p.gameId), ['puuid-vgd-1', '', '', '', '']);
    assert.equal(match.players[0][0]!.name, 'VGDOne');
    assert.equal(match.players[1][2]!.gameId, 'puuid-hlx-3');
    assert.equal(store.data.players!.find((p) => p.gameId === 'puuid-vgd-1')?.name, 'VGDOne', 'Teams/Players learns the Riot id');
    // The veto so far, on air.
    let st = await room();
    assert.deepEqual(st.veto.map((s: any) => `${s.team}:${s.action}:${s.map}`), ['0:ban:BIND', '1:ban:ABYSS']);
    // The bracket from Esportra.
    assert.deepEqual(st.bracket.sf[0], ['Vanguard Esports', 0, 'Helix Gaming', 0]);
    assert.deepEqual(st.bracket.gf[0], ['Night Owls', 0, 'TBD', 0]);
    // Sponsors and casters, into an event that had none (an uploaded logo is fetched into the engine).
    const event = production.eventOf(match)!;
    assert.deepEqual(event.sponsors.map((s) => s.name), ['Northwind', 'Bluefin']);
    assert.equal(event.sponsors[0]!.logo, 'https://example.com/northwind.png');
    assert.match(event.sponsors[1]!.logo, /^\/air-assets\/[0-9a-f-]{36}$/);
    assert.deepEqual(event.talent.map((t) => [t.name, t.role]), [['Sam Rivers', 'play-by-play'], ['Alex Moore', 'host']]);

    // The teams carry on: polling picks up each step and the graphic follows.
    veto.steps.push({ team: 0, action: 'pick', map: 'Lotus', side: 'DEF' }, { team: 1, action: 'pick', map: 'Haven', side: 'ATK' });
    await production.esportraSync.pollVeto(match);
    st = await room();
    assert.equal(st.veto.length, 4);
    assert.deepEqual(st.series.map((x: any) => x.map), ['LOTUS', 'HAVEN']);
    // Esportra changed its veto (an organizer edit): Air follows, shorter included.
    veto.steps.splice(3);
    await production.esportraSync.pollVeto(match);
    assert.equal((await room()).veto.length, 3);
    // Producer and Esportra edits never touch the producer's own sponsors: a refresh adds nothing.
    await production.saveSponsor(event.id, { name: 'House sponsor' });
    backend.draft.sponsors.push({ name: 'Later Sponsor', logoUrl: 'https://example.com/later.png' });
    await production.esportraRefresh();
    assert.deepEqual(production.eventOf(match)!.sponsors.map((s) => s.name), ['Northwind', 'Bluefin', 'House sponsor']);

    // A map Air counts goes to Esportra for review; offline it waits and is retried.
    backend.failProposals = 1;
    const state = await room();
    await (production as any).recordMap(match, state, [13, 9], 0, 'from the game');
    // The map's record is kept for the post-game graphics.
    const kept = (await room()).airRecord;
    assert.deepEqual([kept.map, kept.score, kept.winner, kept.how], [1, [13, 9], 0, 'game']);
    assert.equal(kept.players[0].length, 5);
    assert.deepEqual(production.snapshot().mapRecords!.maps.map((m) => m.map), [1]);
    await production.closeMap();
    assert.deepEqual(production.snapshot().mapRecords!.maps.map((m) => [m.map, m.how]), [[1, 'game'], [2, 'closed']], 'Close map keeps map 2 without counting it');
    await production.recordShow('series');
    assert.equal((await room()).airRecord.name, 'SERIES');
    await production.recordShow(1);
    await production.recordRemove(2);
    assert.deepEqual(production.snapshot().mapRecords!.maps.map((m) => m.map), [1]);
    let results = production.snapshot().esportraResults!;
    assert.deepEqual(results.items.map((i) => [i.map, i.scores, i.state]), [[1, [13, 9], 'queued']]);
    assert.match(results.items[0]!.error!, /unavailable/);
    await production.esportraSync.flush();
    assert.equal(backend.proposals.length, 1);
    assert.deepEqual([backend.proposals[0]!.mapNumber, backend.proposals[0]!.teamAScore, backend.proposals[0]!.teamBScore], [1, 13, 9]);
    // The same map again is the same proposal.
    await production.esportraSync.propose(match, 1, [13, 9], 'from the game');
    assert.equal(backend.proposals.length, 1);
    // The organizer's decision, made from Air.
    await production.esportraSync.readResults(match);
    results = production.snapshot().esportraResults!;
    assert.equal(results.canReview, true);
    assert.equal(results.items[0]!.status, 'pending');
    await production.esportraReview(results.items[0]!.proposalId, 'apply');
    assert.equal(production.snapshot().esportraResults!.items[0]!.status, 'applied');
    assert.deepEqual(backend.official.get(wanted.id)?.get(1), [13, 9], 'Esportra holds the official map score');
    await assert.rejects(production.esportraReview(results.items[0]!.proposalId, 'reject'), /already reviewed/);
    // A refusal is kept with Esportra's reason (map 4 of a best of 3).
    await production.esportraSync.propose(match, 4, [13, 2], 'Counted by the producer');
    assert.equal(production.snapshot().esportraResults!.items.at(-1)!.state, 'refused');
    // A reviewer without the right is told so.
    backend.canReview = false;
    await production.esportraSync.propose(match, 2, [11, 13], 'from the game');
    await assert.rejects(production.esportraReview(production.snapshot().esportraResults!.items.at(-1)!.proposalId, 'apply'), /cannot review/);

    // The heartbeat says what this PC is doing.
    await production.esportraSync.tick();
    assert.ok(backend.heartbeats.length >= 1);
    assert.deepEqual([backend.heartbeats[0]!.appVersion, backend.heartbeats[0]!.productionActive, backend.heartbeats[0]!.feedState], ['test', true, 'waiting']);
    // A quick match has no Esportra results.
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    assert.equal(production.snapshot().esportraResults, null);
  } finally {
    production.esportraSync.stop();
    production.autopilot.stopAll();
    production.log.stop();
    await engine.stop(true);
    await backend.stop();
  }
});

async function setupLive() {
  const { EngineSupervisor } = await import('../src/main/engine-supervisor.ts');
  const { realProcess, engineEnv } = await import('../src/main/process.ts');
  const { ObsLink } = await import('../src/main/obs.ts');
  const { Production } = await import('../src/main/production.ts');
  const { Store } = await import('../src/main/store.ts');
  const { EsportraAccount } = await import('../src/main/esportra.ts');
  const { FakeObs } = await import('./fake-obs.ts');
  const { FakeEsportra } = await import('../dev/fake-esportra.ts');
  const backend = await new FakeEsportra().start();
  const dir = mkdtempSync(join(tmpdir(), 'air-esp-veto-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port: await freePort(), key: 'esportra-veto-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  const values = new Map<string, string>();
  const esportra = new EsportraAccount({ apiBase: backend.url, store, secrets: { get: (k) => values.get(k) ?? null, set: (k, v) => void (v === null ? values.delete(k) : values.set(k, v)) }, deviceId: randomUUID(), deviceName: 'TEST-PC' });
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture() as never, ingest: { target: () => {} }, esportra, version: 'test' });
  production.setup.game = 'valorant';
  const stop = async () => { production.esportraSync.stop(); production.autopilot.stopAll(); production.log.stop(); await engine.stop(true); await backend.stop(); };
  return { backend, engine, production, store, stop };
}

test('the Esportra veto as it happens: custom order, coin toss, turn, decider, reset, swapped sides, own veto, two matches, 404 and offline', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 90_000 }, async () => {
  const { backend, engine, production, stop } = await setupLive();
  try {
    await production.esportraSignIn(backend.email, backend.password);
    const [first, second] = backend.matches as [any, any];
    second.bestOf = 3;
    const v = backend.vetoOf(first.id);
    // A custom order where team 2 starts, and a coin toss team 1 won.
    v.sequence = [{ action: 'ban', team: 1 }, { action: 'ban', team: 0 }, { action: 'pick', team: 1 }, { action: 'pick', team: 0 }, { action: 'ban', team: 1 }, { action: 'ban', team: 0 }, { action: 'decider', team: -1 }];
    v.status = 'toss_choice_pending';
    v.toss = { pending: true, winner: 0 };
    await production.useEsportraMatch(first.id);
    let match = production.match!;
    const room = async () => (await engine.client.get<any>(`/api/${production.match!.code}`)).state;
    await production.esportraSync.pollVeto(match);
    let st = await room();
    assert.deepEqual(st.vetoOrder.map((o: any) => `${o.action}:${o.team}`), ['ban:1', 'ban:0', 'pick:1', 'pick:0', 'ban:1', 'ban:0', 'decider:-1']);
    assert.deepEqual(st.vetoToss, { pending: true, winner: 0 });
    assert.equal(production.snapshot().esportraVeto!.status, 'toss_choice_pending');

    // The veto starts: whose turn it is, with its time left.
    v.status = 'in_progress';
    v.toss = { pending: false, winner: 0 };
    v.turn = { team: 1, action: 'ban', startedAt: new Date().toISOString(), seconds: 45 };
    await production.esportraSync.pollVeto(match);
    st = await room();
    assert.equal(st.vetoTurn.team, 1);
    assert.ok(st.vetoTurn.endsAt > Date.now() + 30_000 && st.vetoTurn.endsAt <= Date.now() + 45_000);
    let pushed = 0;
    production.on('change', () => pushed++);
    v.steps.push({ team: 1, action: 'ban', map: 'Bind', side: null }, { team: 0, action: 'ban', map: 'Dust2', side: null });
    await production.esportraSync.pollVeto(match);
    assert.ok(pushed > 0, 'a veto step from Esportra reaches the interface (the main process pushes on "change")');
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['BIND'], 'a map Air does not know is left out');
    assert.deepEqual(production.snapshot().esportraVeto!.unknownMaps, ['Dust2']);
    v.steps[1] = { team: 0, action: 'ban', map: 'Abyss', side: null };
    v.steps.push({ team: 1, action: 'pick', map: 'Lotus', side: 'ATK', sideTeam: 0 }, { team: 0, action: 'pick', map: 'Haven', side: null },
      { team: 1, action: 'ban', map: 'Ascent', side: null }, { team: 0, action: 'ban', map: 'Corrode', side: null }, { team: -1, action: 'decider', map: 'Sunset', side: 'DEF', sideTeam: 1 });
    v.status = 'completed';
    v.turn = null;
    await production.esportraSync.pollVeto(match);
    st = await room();
    assert.equal(st.veto.length, 7);
    assert.deepEqual([st.veto[2].side, st.veto[2].sideTeam, st.veto[6].sideTeam], ['ATK', 0, 1]);
    assert.deepEqual(st.series.map((x: any) => x.map), ['LOTUS', 'HAVEN', 'SUNSET']);
    assert.equal(st.vetoTurn, undefined, 'no turn once the veto is complete');
    // Complete: the loop stops asking.
    const asked = () => backend.calls.filter((c) => c.endsWith('/veto')).length;
    const before = asked();
    (production.esportraSync as any).last.veto = 0;
    await production.esportraSync.tick();
    assert.equal(asked(), before, 'a finished veto is not polled');

    // The organizer resets it: the graphics clear too.
    v.steps.length = 0;
    v.status = 'pending';
    await production.esportraSync.pollVeto(match);
    st = await room();
    assert.deepEqual([st.veto.length, st.series.length], [0, 0]);

    // The producer swapped the sides here: Esportra's team 1 is Air's right-hand team.
    const teams = production.match!.teams;
    await production.updateMatch(match.id, { teams: [teams[1], teams[0]] });
    v.status = 'in_progress';
    v.steps.push({ team: 1, action: 'ban', map: 'Bind', side: null });
    await production.esportraSync.pollVeto(production.match!);
    st = await room();
    assert.deepEqual([st.veto[0].team, st.vetoOrder[0].team], [0, 0], 'Esportra team 2 is on the left here');

    // The producer enters a step: from now on the veto is theirs, and Esportra is not followed.
    await production.vetoStep({ map: 'ABYSS' });
    v.steps.push({ team: 0, action: 'ban', map: 'Pearl', side: null });
    await production.esportraSync.pollVeto(production.match!);
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['BIND', 'ABYSS']);
    assert.equal(production.snapshot().esportraVeto!.source, 'air');
    await production.vetoFollowEsportra();
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['BIND', 'PEARL'], 'following Esportra again takes its veto');
    assert.equal(production.snapshot().esportraVeto!.source, 'esportra');

    // A second match keeps its own veto state.
    const v2 = backend.vetoOf(second.id);
    v2.status = 'in_progress';
    v2.steps.push({ team: 0, action: 'ban', map: 'Split', side: null });
    await production.useEsportraMatch(second.id);
    await production.esportraSync.pollVeto(production.match!);
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['SPLIT']);
    assert.equal(production.snapshot().esportraVeto!.status, 'in_progress');

    // Esportra unreachable: the veto stays, and the interface says since when.
    backend.down = true;
    await production.esportraSync.pollVeto(production.match!).catch(() => {});
    assert.ok(production.snapshot().esportraVeto!.unreachableSince);
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['SPLIT']);
    backend.down = false;
    await production.esportraSync.pollVeto(production.match!);
    assert.equal(production.snapshot().esportraVeto!.unreachableSince, null);
    // The match leaves the schedule: the veto stays and is no longer followed.
    backend.matches.splice(backend.matches.indexOf(second), 1);
    await production.esportraSync.pollVeto(production.match!).catch(() => {});
    assert.equal(production.snapshot().esportraVeto!.gone, true);
    assert.deepEqual((await room()).veto.map((x: any) => x.map), ['SPLIT']);
  } finally {
    await stop();
  }
});

test('a full device allowance says so, instead of saying Air is not turned on', async () => {
  const { EsportraAccount } = await import('../src/main/esportra.ts');
  const { Store } = await import('../src/main/store.ts');
  const { FakeEsportra } = await import('../dev/fake-esportra.ts');
  const backend = await new FakeEsportra().start();
  backend.deviceLimit = 0;
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'air-esp-limit-')), 'air.json'));
  const values = new Map<string, string>();
  const account = new EsportraAccount({ apiBase: backend.url, store, secrets: { get: (k) => values.get(k) ?? null, set: (k, v) => void (v === null ? values.delete(k) : values.set(k, v)) }, deviceId: randomUUID(), deviceName: 'TEST-PC' });
  try {
    await account.login(backend.email, backend.password);
    assert.equal(account.view().state, 'denied');
    assert.match(account.view().warning!, /device allowance is full/);
  } finally { await backend.stop(); }
});
