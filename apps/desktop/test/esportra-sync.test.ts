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
  backend.riot.set('PRX One', 'puuid-prx-1');
  backend.riot.set('FNC Three', 'puuid-fnc-3');
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
    assert.deepEqual(match.players[0].map((p) => p.gameId), ['puuid-prx-1', '', '', '', '']);
    assert.equal(match.players[0][0]!.name, 'PRXOne');
    assert.equal(match.players[1][2]!.gameId, 'puuid-fnc-3');
    assert.equal(store.data.players!.find((p) => p.gameId === 'puuid-prx-1')?.name, 'PRXOne', 'Teams/Players learns the Riot id');
    // The veto so far, on air.
    let st = await room();
    assert.deepEqual(st.veto.map((s: any) => `${s.team}:${s.action}:${s.map}`), ['0:ban:BIND', '1:ban:ABYSS']);
    // The bracket from Esportra.
    assert.deepEqual(st.bracket.sf[0], ['Paper Rex', 0, 'Fnatic', 0]);
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
    // A veto typed in Air is never cut back by a shorter one from Esportra.
    veto.steps.splice(3);
    await production.esportraSync.pollVeto(match);
    assert.equal((await room()).veto.length, 4);
    // Producer and Esportra edits never touch the producer's own sponsors: a refresh adds nothing.
    await production.saveSponsor(event.id, { name: 'House sponsor' });
    backend.draft.sponsors.push({ name: 'Later Sponsor', logoUrl: 'https://example.com/later.png' });
    await production.esportraRefresh();
    assert.deepEqual(production.eventOf(match)!.sponsors.map((s) => s.name), ['Northwind', 'Bluefin', 'House sponsor']);

    // A map Air counts goes to Esportra for review; offline it waits and is retried.
    backend.failProposals = 1;
    const state = await room();
    await (production as any).recordMap(match, state, [13, 9], 0, 'from the game');
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
