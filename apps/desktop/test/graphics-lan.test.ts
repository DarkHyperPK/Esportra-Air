// Graphics on the local network (28 Nov): the engine's listening address follows the setting; page addresses
// for other PCs use this PC's network address only while it is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineSupervisor, type ChildHandle } from '../src/main/engine-supervisor.ts';
import { planLobbyScenes, planScenes } from '../src/main/scene-plan.ts';
import { browserSource } from '../src/shared/browser-source.ts';
import { pageHost, GRAPHICS_LAN_OFF } from '../src/shared/graphics-lan.ts';
import { lobbyPage } from '../src/shared/br-screens.ts';
import type { Screen } from '../src/shared/api.ts';

/** A supervisor on fake processes: records the engine's arguments, answers its status. */
function rig(host?: string) {
  const spawned: string[][] = [];
  const files = new Map<string, string>();
  let alive = new Set<number>();
  let pid = 100;
  const fetch = (async (url: string, init?: { method?: string }) => {
    if (String(url).endsWith('/control/shutdown')) { alive = new Set(); return new Response('{}'); }
    if (!alive.size) throw new Error('down');
    return new Response(JSON.stringify({ pid: [...alive][0], port: 5300, version: '0', startedAt: 0, rooms: [], outputs: [] }), { headers: { 'content-type': 'application/json' } });
  }) as never;
  void fetch;
  const sup = new EngineSupervisor({
    binary: 'engine', hudRoot: 'hud', dataDir: 'data', port: 5300, key: 'k'.repeat(20), host, buildId: 'b',
    spawn: (_c, args) => {
      spawned.push(args); pid += 1; alive.add(pid);
      files.set('data/engine.lock', JSON.stringify({ pid, port: 5300, host: args[args.indexOf('--host') + 1] }));
      return { pid, unref() {}, once() { return undefined; } } as ChildHandle;
    },
    readFile: async (p) => { const v = files.get(p); if (v === undefined) throw new Error('missing'); return v; },
    writeFile: async (p, d) => { files.set(p, d); },
    isAlive: (id) => alive.has(id), kill: (id) => alive.delete(id),
    fetch, sleep: async () => {}, monitorEveryMs: 1_000_000,
  });
  return { sup, spawned, stop: () => undefined };
}
const hostOf = (args: string[]) => args[args.indexOf('--host') + 1];

test('the engine listens on this PC only by default', async () => {
  const r = rig();
  await r.sup.start();
  assert.equal(r.sup.state, 'running', r.sup.error ?? '');
  assert.equal(hostOf(r.spawned[0]!), '127.0.0.1');
  r.stop();
});

test('with the setting on the engine starts on 0.0.0.0', async () => {
  const r = rig('0.0.0.0');
  await r.sup.start();
  assert.equal(hostOf(r.spawned[0]!), '0.0.0.0');
  r.stop();
});

test('changing the setting restarts the engine on the other address, and back', async () => {
  const r = rig();
  await r.sup.start();
  let restarted = 0;
  r.sup.on('restarted', () => { restarted += 1; });
  await r.sup.setHost('0.0.0.0');
  assert.equal(r.spawned.length, 2);
  assert.equal(hostOf(r.spawned[1]!), '0.0.0.0');
  assert.equal(r.sup.state, 'running');
  await r.sup.setHost('0.0.0.0');
  assert.equal(r.spawned.length, 2, 'the same address restarts nothing');
  await r.sup.setHost('127.0.0.1');
  assert.equal(hostOf(r.spawned[2]!), '127.0.0.1');
  assert.equal(restarted, 2);
  r.stop();
});

test('an engine left running on another address is replaced when Air starts', async () => {
  const r = rig('0.0.0.0');
  await r.sup.start();
  const second = new EngineSupervisor({ ...(r.sup as unknown as { options: ConstructorParameters<typeof EngineSupervisor>[0] }).options, host: '127.0.0.1' });
  await second.start();
  assert.equal(second.reattached, false);
  assert.equal(hostOf(r.spawned.at(-1)!), '127.0.0.1');
  r.stop();
});

test('page addresses use the network address only while the setting is on', () => {
  assert.equal(pageHost(GRAPHICS_LAN_OFF), '127.0.0.1');
  assert.equal(pageHost({ on: false, address: '192.168.1.5' }), '127.0.0.1');
  assert.equal(pageHost({ on: true, address: null }), '127.0.0.1');
  assert.equal(pageHost({ on: true, address: '192.168.1.5' }), '192.168.1.5');
  const screens = [{ id: 'fullscreen', outputId: 'out-1', hosted: true, enabled: true }] as unknown as Screen[];
  assert.equal(browserSource(5300, screens, { show: 'fullscreen' })!.url, 'http://127.0.0.1:5300/o/out-1?only=fullscreen&style=full');
  assert.equal(browserSource(5300, screens, { show: 'fullscreen' }, '192.168.1.5')!.url, 'http://192.168.1.5:5300/o/out-1?only=fullscreen&style=full');
  assert.equal(lobbyPage(5300, 'L1', 'br-hud'), 'http://127.0.0.1:5300/overlays/br-hud.html?match=L1');
  assert.equal(lobbyPage(5300, 'L1', 'br-hud', '', '10.0.0.4'), 'http://10.0.0.4:5300/overlays/br-hud.html?match=L1');
});

test('OBS scenes for another PC load the network address', () => {
  const urls = (plan: ReturnType<typeof planLobbyScenes>) => plan.flatMap((s) => s.sources).filter((x) => x.kind !== 'media').map((x) => x.url);
  assert.ok(urls(planLobbyScenes({ port: 5300, code: 'L1', sponsors: [] })).every((u) => u.startsWith('http://127.0.0.1:5300/')));
  const lan = urls(planLobbyScenes({ port: 5300, code: 'L1', sponsors: [], host: '192.168.1.5' }));
  assert.ok(lan.length > 0 && lan.every((u) => u.startsWith('http://192.168.1.5:5300/')), lan.join());
  const screens = [{ id: 'fullscreen', outputId: 'out-1', hosted: true, enabled: true }] as unknown as Screen[];
  const match = planScenes({ port: 5300, host: '192.168.1.5', screens, talent: [], sponsors: [], slotWanted: () => false });
  assert.ok(match.flatMap((s) => s.sources).some((x) => x.url?.startsWith('http://192.168.1.5:5300/o/')));
});

// With the real engine and Production (needs the release engine build).
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { realProcess, engineEnv } from '../src/main/process.ts';
import { ObsLink } from '../src/main/obs.ts';
import { Production } from '../src/main/production.ts';
import { Store } from '../src/main/store.ts';
import { FakeObs } from './fake-obs.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });

test('Settings › Graphics: the switch restarts the real engine; refused while a test round runs', { skip: !existsSync(BINARY) && 'build the engine first' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-lan-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const port = await freePort();
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port, key: 'lan-test-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const capture = Object.assign(new EventEmitter(), { state: 'off', reason: null, start() {}, stop() {} });
  const store = new Store(join(dir, 'air.json'));
  const production = new Production({ store, engine, obs: new ObsLink(() => new FakeObs()), capture: capture as never, ingest: { target: () => {} }, version: 'test', lanAddresses: () => ['192.168.1.50'] });
  const lockHost = () => JSON.parse(readFileSync(join(dir, 'engine', 'engine.lock'), 'utf8')).host;
  try {
    assert.deepEqual(production.snapshot().graphicsLan, { on: false, address: '192.168.1.50' });
    assert.equal(lockHost(), '127.0.0.1');
    await production.chooseGame('valorant');
    await production.chooseProfile('player-pcs');
    await production.finishOnboarding();
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 3 });

    await production.testRound('start');
    await engine.poll();
    await assert.rejects(production.setGraphicsLan(true), /Stop game data or the test round/);
    assert.equal(production.snapshot().graphicsLan.on, false);
    assert.equal(lockHost(), '127.0.0.1');
    await production.testRound('stop');
    await engine.poll();

    await production.setGraphicsLan(true);
    assert.equal(production.snapshot().graphicsLan.on, true);
    assert.equal(lockHost(), '0.0.0.0');
    assert.equal(new Store(join(dir, 'air.json')).data.graphicsLan, true);
    assert.equal(engine.state, 'running');
    // This PC still controls it, and a 127.0.0.1 page still loads.
    assert.equal((await engine.client.get<any>('/control/status')).pid > 0, true);
    assert.equal((await fetch(`http://127.0.0.1:${port}/overlays/scorebug.html`)).ok, true);

    await production.setGraphicsLan(false);
    assert.equal(lockHost(), '127.0.0.1');
    assert.equal(production.snapshot().graphicsLan.on, false);
  } finally {
    try { await engine.client.post('/control/shutdown'); } catch { /* already stopped */ }
  }
});
