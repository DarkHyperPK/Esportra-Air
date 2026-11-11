// Observer and player PCs on the same network, against the real engine binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';
import { LinkClient } from '../../../packages/capture/src/link.ts';
import { parseAddress } from '../../../packages/capture/src/protocol.ts';
import { wsIngest } from '../src/main/ws-ingest.ts';
import { lanAddresses, newCode } from '../src/main/join.ts';
import { ObsLink } from '../src/main/obs.ts';
import { Production } from '../src/main/production.ts';
import { Store } from '../src/main/store.ts';
import { FakeObs } from './fake-obs.ts';
import { CODE_ALPHABET, formatCode, parseCode } from '../src/shared/join.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
const until = async (check: () => boolean | Promise<boolean>, label: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) assert.fail(`timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 30));
  }
};

class FakeCapture extends EventEmitter {
  state: 'off' | 'waiting' | 'live' | 'unavailable' = 'off';
  reason: string | null = null;
  role: 'observer' | 'player' = 'observer';
  start() { this.state = 'waiting'; this.emit('change'); }
  stop() { this.state = 'off'; this.emit('change'); }
  setRole(role: 'observer' | 'player') { if (this.state !== 'off') throw new Error('Stop capture before changing this PC’s role.'); this.role = role; }
}

const scoreboard = (i: number) => ({ feature: 'match_info', key: `scoreboard_${i}`, data: JSON.stringify({ player_id: `pid-${i}`, name: `P${i} #T`, character: 'Clay', team: i < 5 ? 0 : 1, alive: true, money: 3900, weapon: 'TX_Hud_Rifles_Volcano', shield: 2 }) });

test('codes are readable, addresses are parsed strictly and only LAN addresses are offered', () => {
  for (let i = 0; i < 50; i++) {
    const code = newCode();
    assert.match(code, new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    assert.equal(parseCode(formatCode(code).toLowerCase()), code, 'typing it in lower case with a dash works');
  }
  assert.deepEqual(parseAddress('192.168.1.40'), { host: '192.168.1.40', port: 5301 });
  assert.deepEqual(parseAddress(' studio-pc.local:5400 '), { host: 'studio-pc.local', port: 5400 });
  for (const bad of ['', 'http://x', '1.2.3.4:80', '1.2.3.4:99999', 'a b', '../x', '1.2.3.4:5301/join']) assert.throws(() => parseAddress(bad), /address/, bad);
  assert.deepEqual(lanAddresses({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never], eth0: [{ address: '192.168.1.40', family: 'IPv4', internal: false } as never, { address: 'fe80::1', family: 'IPv6', internal: false } as never, { address: '169.254.3.3', family: 'IPv4', internal: false } as never] }), ['192.168.1.40']);
});

test('a capture-only PC joins with the code and its game data reaches the producer’s match', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-join-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const joinPort = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'join-test-key-0123456789abcd', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const store = new Store(join(dir, 'air.json'));
  store.data.join = { enabled: false, port: joinPort };
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture(), ingest: { target: () => {} }, lanAddresses: () => ['192.168.1.40'], version: 'test' });
  production.setup.game = 'valorant';
  // The other PC: its own store, secrets and ingest client.
  const otherStore = new Store(join(dir, 'other.json'));
  const otherSecrets = new Map<string, string>();
  const otherCapture = new FakeCapture();
  const otherIngest = wsIngest();
  const link = new LinkClient({ settings: { read: () => otherStore.data.link ?? null, write: (v) => { if (v) otherStore.data.link = v; else delete otherStore.data.link; } }, name: () => 'OBSERVER-PC', secrets: { get: (k) => otherSecrets.get(k) ?? null, set: (k, v) => void (v === null ? otherSecrets.delete(k) : otherSecrets.set(k, v)) }, ingest: otherIngest, capture: otherCapture, changed: () => {} });
  const room = async (code: string) => (await engine.client.get<any>(`/api/${code}`)).state;
  try {
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 1 });
    const code = production.match!.code;
    assert.deepEqual(production.snapshot().join, { enabled: false, code: null, port: joinPort, addresses: ['192.168.1.40:' + joinPort], peers: [], error: null });
    await assert.rejects(link.connect({ address: `127.0.0.1:${joinPort}`, code: 'ABC234', role: 'observer' }), /Could not reach/);

    // Joining is off until the producer allows it, and the code only exists while it is on.
    await production.joinSet(true);
    const view = production.snapshot().join;
    assert.equal(view.enabled, true);
    assert.match(view.code!, /^[A-Z2-9]{6}$/);
    assert.equal(store.data.join!.enabled, true);

    await assert.rejects(link.connect({ address: `127.0.0.1:${joinPort}`, code: 'ZZZZZZ', role: 'observer' }), /not accepted/);
    assert.equal(otherStore.data.link, undefined, 'a refused code leaves nothing saved');
    await link.connect({ address: `127.0.0.1:${joinPort}`, code: formatCode(view.code!).toLowerCase(), role: 'observer' });
    await until(() => otherIngest.state === 'connected', 'connected');
    assert.equal(link.view().state, 'connected');
    assert.equal([...otherSecrets.values()].includes(view.code!), true, 'the code is kept in the encrypted secrets only');
    assert.equal(JSON.stringify(otherStore.data).includes(view.code!), false);

    // Game data sent by the other PC lands in the producer's selected match.
    otherIngest.send(scoreboard(0));
    await until(async () => (await room(code)).players[0][0].name === 'P0', 'data arrives');
    await until(() => production.snapshot().join.peers.length === 1, 'peer listed');
    const peer = production.snapshot().join.peers[0]!;
    assert.deepEqual([peer.role, peer.name, peer.messages], ['observer', 'OBSERVER-PC', 1]);

    // Another match: the same PC keeps feeding the producer's current match.
    await production.createQuickMatch({ teamA: 'Cobra', teamB: 'Dune', bestOf: 3 });
    const second = production.match!.code;
    otherIngest.send(scoreboard(1));
    await until(async () => (await room(second)).players[0][0].name === 'P1', 'follows the new match');

    // A new code drops the PC; it is told, and does not hammer the producer.
    await production.joinRotate();
    await until(() => otherIngest.state === 'rejected', 'rejected with the old code', 8000);
    assert.match(link.view().error!, /not accepted/);
    assert.equal(link.view().state, 'rejected');

    // Switching joining off closes the door.
    await production.joinSet(false);
    assert.equal(production.snapshot().join.code, null);
    await assert.rejects(link.connect({ address: `127.0.0.1:${joinPort}`, code: view.code!, role: 'observer' }), /Could not reach/);
    link.disconnect();
    assert.equal(otherStore.data.link, undefined);
    assert.equal(otherSecrets.size, 0);
  } finally {
    otherIngest.close();
    production.joinHost.stop();
    production.autopilot.stopAll();
    production.log.stop();
    await engine.stop(true);
  }
});

test('a PC can be a player PC, and its role cannot change while capturing', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'air-role-')), 'a.json'));
  const capture = new FakeCapture();
  const link = new LinkClient({ settings: { read: () => store.data.link ?? null, write: (v) => { if (v) store.data.link = v; else delete store.data.link; } }, name: () => 'PC', secrets: { get: () => null, set: () => {} }, ingest: wsIngest(), capture, changed: () => {}, fetch: (async () => new Response('{"ok":true}', { status: 200 })) as typeof fetch });
  capture.start();
  await assert.rejects(link.connect({ address: '10.0.0.5', code: 'ABC234', role: 'player' }), /Stop capture/);
  capture.stop();
  await link.connect({ address: '10.0.0.5', code: 'ABC234', role: 'player' });
  assert.equal(capture.role, 'player');
  assert.deepEqual(store.data.link, { address: '10.0.0.5:5301', role: 'player' });
  link.disconnect();
});
