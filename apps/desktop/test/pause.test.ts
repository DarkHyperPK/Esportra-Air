import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { PauseHint } from '../src/main/pause-hint.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => done(port)); }); });
class FakeCapture extends EventEmitter { state: 'off' = 'off'; reason = null; start() {} stop() {} }

test('a buy phase past 40 s suggests a timeout, until the round goes live or the producer acts', () => {
  let t = 0;
  const hint = new PauseHint(() => {}, () => t);
  hint.phase('buy');
  t = 39_000;
  assert.equal(hint.view(), null);
  t = 52_000;
  assert.deepEqual(hint.view(), { seconds: 52 });
  hint.dismiss();
  assert.equal(hint.view(), null, 'a pause on air (or a wave-away) quiets it');
  hint.phase('buy');
  t += 41_000;
  assert.ok(hint.view(), 'the next long buy phase asks again');
  hint.phase('live');
  assert.equal(hint.view(), null);
});

test('a timeout names its team and counts down from its length; a tech pause has neither', { skip: !existsSync(BINARY) && 'build the engine first', timeout: 60_000 }, async () => {
  const { EngineSupervisor } = await import('../src/main/engine-supervisor.ts');
  const { realProcess, engineEnv } = await import('../src/main/process.ts');
  const { ObsLink } = await import('../src/main/obs.ts');
  const { Production } = await import('../src/main/production.ts');
  const { Store } = await import('../src/main/store.ts');
  const { FakeObs } = await import('./fake-obs.ts');
  const dir = mkdtempSync(join(tmpdir(), 'air-pause-'));
  mkdirSync(join(dir, 'engine'), { recursive: true });
  const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: join(dir, 'engine'), port: await freePort(), key: 'pause-test-key-0123456789abcdef', env: engineEnv(), monitorEveryMs: 200, ...realProcess });
  await engine.start();
  const production = new Production({ store: new Store(join(dir, 'air.json')), engine, obs: new ObsLink(() => new FakeObs()), capture: new FakeCapture() as never, ingest: { target: () => {} }, version: 'test' });
  production.setup.game = 'valorant';
  try {
    await production.createQuickMatch({ teamA: 'Alpha', teamB: 'Bravo', bestOf: 3 });
    const room = async () => (await engine.client.get<any>(`/api/${production.match!.code}`)).state;
    await production.pause('timeout', { team: 1, seconds: 45 });
    let p = (await room()).airPause;
    assert.deepEqual([p.kind, p.team, p.seconds], ['timeout', 1, 45]);
    await production.pause('timeout');
    p = (await room()).airPause;
    assert.deepEqual([p.team, p.seconds], [undefined, 60], 'the default length, no team');
    await production.pause('technical', { team: 0, seconds: 999 });
    p = (await room()).airPause;
    assert.deepEqual([p.kind, p.team, p.seconds], ['technical', 0, undefined], 'a tech pause does not count down');
    await production.pause(null);
    assert.equal((await room()).airPause, undefined);
  } finally {
    production.log.stop();
    await engine.stop(true);
  }
});
