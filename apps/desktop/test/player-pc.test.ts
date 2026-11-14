// Esportra Player as a player PC, end to end: the real Player app (controller, link, ingest and the
// Overwolf capture path) joins a real engine through the producer's Air on the local network.
// Overwolf itself is stood in for by a fake GEP package; everything else is real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';
import { ObsLink } from '../src/main/obs.ts';
import { Production } from '../src/main/production.ts';
import { Store } from '../src/main/store.ts';
import { wsIngest } from '../src/main/ws-ingest.ts';
import { LinkClient } from '../../../packages/capture/src/link.ts';
import { GepBridge, type OverwolfPackages } from '../../../packages/capture/src/gep.ts';
import { IngestClient, type IngestSocket } from '../../../packages/capture/src/ingest.ts';
import { PlayerController } from '../../player/src/main/controller.ts';
import { PlayerStore } from '../../player/src/main/store.ts';
import { FakeObs } from './fake-obs.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
const until = async (check: () => boolean | Promise<boolean>, label: string, ms = 6000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) assert.fail(`timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 40));
  }
};

class FakeCapture extends EventEmitter {
  state: 'off' | 'waiting' | 'live' | 'unavailable' = 'off';
  reason: string | null = null;
  role: 'observer' | 'player' = 'observer';
  start() { this.state = 'waiting'; this.emit('change'); }
  stop() { this.state = 'off'; this.emit('change'); }
  setRole(role: 'observer' | 'player') { this.role = role; }
}

/** Overwolf's GEP package, played by the test: the game, its players and what Riot reports. */
class FakeGep extends EventEmitter {
  features: string[] | null = null;
  info: any = {};
  setRequiredFeatures(_gameId: number, features: string[]) { this.features = features; return Promise.resolve(); }
  getInfo() { return Promise.resolve({ info: this.info }); }
  report(message: unknown) { this.emit('new-info-update', {}, 21640, message); }
}

// Riot player ids are UUIDs. Player 1 of team A plays on the player PC.
const pid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const scoreboard = (i: number) => ({ feature: 'match_info', key: `scoreboard_${i}`, data: JSON.stringify({ player_id: pid(i), name: `P${i} #T`, character: 'Clay', team: i < 5 ? 0 : 1, alive: true, money: 3900, weapon: 'TX_Hud_Rifles_Volcano', shield: 2 }) });

test('a player PC with Esportra Player: joins, sends only its own player, survives a dropped network', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-player-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const joinPort = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'player-test-key-0123456789ab', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  store.data.join = { enabled: false, port: joinPort };
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, lanAddresses: () => ['192.168.1.40'], version: 'test' });
  production.setup.game = 'valorant';

  // The observer PC (the scoreboard of all ten players).
  const obsStore = new Store(join(dir, 'observer.json'));
  const obsIngest = wsIngest();
  const observer = new LinkClient({ settings: { read: () => obsStore.data.link ?? null, write: (v) => { if (v) obsStore.data.link = v; else delete obsStore.data.link; } }, name: () => 'OBSERVER-PC', secrets: new Map() as never, ingest: obsIngest, capture: new FakeCapture(), changed: () => {} });

  // The player PC: Esportra Player exactly as its main process builds it, with Overwolf faked.
  const gep = new FakeGep();
  const packages = new EventEmitter() as unknown as OverwolfPackages & EventEmitter;
  (packages as any).gep = gep;
  const secrets = new Map<string, string>();
  const ingest = new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket });
  const wire: unknown[] = [];
  const capture = new GepBridge({ packages, role: 'player', send: (m) => { wire.push(m); ingest.send(m); }, pollMs: 200 });
  const player = new PlayerController({ store: new PlayerStore(join(dir, 'player.json')), secrets: { get: (k) => secrets.get(k) ?? null, set: (k, v) => void (v === null ? secrets.delete(k) : secrets.set(k, v)) }, ingest, capture, name: 'JUNO-PC', version: 'test' });
  (packages as unknown as EventEmitter).emit('ready', {}, 'gep');

  const room = async () => (await engine.client.get<any>(`/api/${production.match!.code}`)).state;
  const seatOf = async (i: number) => (await room()).players.flat().find((p: any) => p.puuid === pid(i));
  const peer = () => production.snapshot().join.peers.find((p) => p.name === 'JUNO-PC');
  try {
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    await production.joinSet(true);
    const code = production.snapshot().join.code!;
    const address = `127.0.0.1:${joinPort}`;

    // The observer reports the ten players, so the room knows who is who.
    await observer.connect({ address, code, role: 'observer' });
    await until(() => obsIngest.state === 'connected', 'observer connected');
    for (let i = 0; i < 10; i++) obsIngest.send(scoreboard(i));
    await until(async () => !!(await seatOf(1)), 'players known');

    // Capture needs the link first, and consent.
    assert.throws(() => player.startCapture({ consent: true }), /Connect to the producer/);
    await player.connect({ address, code, role: 'player' });
    await until(() => player.snapshot().link.state === 'connected', 'player PC connected');
    assert.throws(() => player.startCapture({}), /accept the capture notice/);

    // Valorant starts on the player PC. Without consent no game data is asked for or sent.
    gep.info = { me: { player_id: pid(1), health: '64', abilities: '{"C":true,"Q":false,"E":true,"X":false}' }, match_info: { match_score: '{"team_0":9,"team_1":9}' } };
    gep.emit('game-detected', { enable: () => {} }, 21640);
    gep.report({ info: gep.info });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(gep.features, null, 'no GEP features before consent');
    assert.equal(ingest.sent, 0, 'nothing leaves the PC before consent');

    // With consent: only this player's own data, tagged with their Riot id, reaches the room.
    player.startCapture({ consent: true });
    await until(() => gep.features !== null, 'GEP switched on');
    assert.deepEqual(gep.features, ['me'], 'a player PC asks Riot for its own player only');
    await until(async () => (await seatOf(1))?.hp === 64, 'health reaches the seat');
    const seat = await seatOf(1);
    assert.equal(seat.hpKnown, true);
    assert.deepEqual(seat.abilityAvailability, [true, false, true]);
    const state = await room();
    assert.deepEqual([state.teams[0].score, state.teams[1].score], [0, 0], 'the player PC’s own view of the score never reaches the room');
    await until(() => peer()?.role === 'player', 'listed on the producer as a player PC');

    // Heartbeats keep the seat live in Air's Player PCs view, by that player's id.
    await until(() => production.snapshot().devices.seats.some((s) => s.name.startsWith('P1') && s.state === 'live'), 'seat shows live');

    // Match data from the player PC is never sent at all: every message that left it is its own player.
    gep.report({ feature: 'match_info', key: 'match_score', value: '{"team_0":12,"team_1":0}' });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(wire.length > 0);
    for (const m of wire as any[]) {
      assert.equal(JSON.stringify(m).includes('match_info'), false, 'no match data leaves a player PC');
      assert.equal(m.playerId, pid(1), 'every message is tagged with this player');
    }
    assert.equal((await room()).teams[0].score, 0);

    // The graphics engine crashes mid-match. Air restarts it and re-opens joining with the same code;
    // meanwhile the player PC keeps capturing and queues, then reconnects by itself and catches up.
    await new Promise((r) => setTimeout(r, 400)); // let the engine's debounced save land
    const keepAlive = setInterval(() => {}, 100);
    const restarted = new Promise<void>((done) => engine.once('restarted', () => done()));
    process.kill(engine.status!.pid, 'SIGKILL');
    await until(() => player.snapshot().link.state === 'connecting', 'player PC notices the drop');
    gep.info = { ...gep.info, me: { ...gep.info.me, health: '31' } }; // Riot's current state, also on re-reads
    gep.report({ feature: 'me', info: { me: { player_id: pid(1), health: '31' } } });
    await until(() => player.snapshot().link.queued > 0, 'data is queued while offline');
    await restarted;
    clearInterval(keepAlive);
    assert.equal(production.snapshot().join.code, code, 'the code stays the same after the restart');
    await until(() => player.snapshot().link.state === 'connected', 'player PC reconnects by itself', 10000);
    await until(async () => (await seatOf(1))?.hp === 31, 'queued health arrives after the reconnect', 10000);
    assert.equal(player.snapshot().link.queued, 0);

    // Wrong codes are limited: after five, the PC is told to wait.
    const stranger = new LinkClient({ settings: { read: () => null, write: () => {} }, name: () => 'STRANGER', secrets: new Map() as never, ingest: new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket }), capture: new FakeCapture(), changed: () => {} });
    for (let i = 0; i < 5; i++) await assert.rejects(stranger.connect({ address, code: 'WRONG2', role: 'player' }), /not accepted/);
    await assert.rejects(stranger.connect({ address, code, role: 'player' }), /Too many wrong codes/, 'even the right code waits after five wrong ones from that address');

    // Disconnect stops capture and forgets the producer and the code.
    player.disconnect();
    assert.equal(capture.state, 'off');
    assert.equal(player.snapshot().link.state, 'off');
    assert.equal(secrets.size, 0);
  } finally {
    ingest.close();
    obsIngest.close();
    capture.stop();
    production.joinHost.stop();
    production.autopilot.stopAll();
    production.log.stop();
    await engine.stop(true);
  }
});
