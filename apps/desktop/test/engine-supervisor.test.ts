// Runs the real engine binary (engine/target/release/air-engine) through the supervisor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { realProcess, engineEnv } from '../src/main/process.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const HUD = join(ROOT, 'esportra-valorant-hud');
const KEY = 'supervisor-test-key-0123456789abcdef';

async function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

function supervisor(dataDir: string, port: number) {
  return new EngineSupervisor({ binary: BINARY, hudRoot: HUD, dataDir, port, key: KEY, env: engineEnv(), monitorEveryMs: 200, ...realProcess });
}

function overlay(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?match=SUP`);
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  const next = async (predicate: (m: any) => boolean, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const i = messages.findIndex(predicate);
      if (i >= 0) return messages.splice(0, i + 1).at(-1);
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('overlay message not received');
  };
  return { ws, next };
}

test('graphics survive the window going away; engine is re-attached and restarted', { skip: !existsSync(BINARY) && 'build engine/ with cargo build --release first' }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'air-sup-'));
  const port = await freePort();

  const first = supervisor(data, port);
  await first.start();
  assert.equal(first.state, 'running', first.error ?? '');
  assert.equal(first.reattached, false);
  const pid = first.status!.pid;

  const view = overlay(port);
  await view.next((m) => m.type === 'snapshot');
  await first.client.patch('/api/SUP', { teams: [{ name: 'Alpha' }, { name: 'Bravo' }] });
  await view.next((m) => m.type === 'patch' && m.patch.teams);

  // The Air window crashes or is closed: the engine keeps serving the overlay.
  await first.stop(false);
  await first.client.patch('/api/SUP', { toast: { text: 'still on air' } });
  const update = await view.next((m) => m.type === 'patch' && m.patch.toast);
  assert.equal(update.patch.toast.text, 'still on air');

  // Air starts again and re-attaches to the same engine instead of starting a new one.
  const second = supervisor(data, port);
  await second.start();
  assert.equal(second.state, 'running', second.error ?? '');
  assert.equal(second.reattached, true);
  assert.equal(second.status!.pid, pid);
  assert.equal(second.hasViewers(), true);

  // The engine itself dies: it is restarted with its saved state.
  await new Promise((r) => setTimeout(r, 400)); // let the debounced save land
  process.kill(pid, 'SIGKILL');
  // The supervisor's timer does not hold the process open (Electron does that in the app).
  const keepAlive = setInterval(() => {}, 100);
  await new Promise<void>((done) => second.once('restarted', () => done()));
  clearInterval(keepAlive);
  assert.equal(second.state, 'running');
  assert.notEqual(second.status!.pid, pid);
  const state = await second.client.get<any>('/api/SUP');
  assert.equal(state.state.teams[0].name, 'Alpha');

  view.ws.close();
  await second.stop(true);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(realProcess.isAlive(second.status!.pid), false);
});

test('a port held by another program is reported clearly', { skip: !existsSync(BINARY) && 'engine not built' }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'air-sup-'));
  const blocker = createServer().listen(0, '127.0.0.1');
  await new Promise((r) => blocker.once('listening', r));
  const port = (blocker.address() as { port: number }).port;
  const sup = supervisor(data, port);
  await sup.start();
  assert.equal(sup.state, 'failed');
  assert.match(sup.error ?? '', /Port \d+ may be in use/);
  await sup.stop(false);
  blocker.close();
});

test('an engine left running by an older Air is replaced by the one Air ships; the same build is re-attached', { skip: !existsSync(BINARY) && 'engine not built' }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'air-sup-build-'));
  const port = await freePort();
  const old = new EngineSupervisor({ binary: BINARY, hudRoot: HUD, dataDir, port, key: KEY, env: engineEnv(), monitorEveryMs: 200, buildId: 'old-build', ...realProcess });
  await old.start();
  const oldPid = old.status!.pid;
  await old.stop(false);
  const same = new EngineSupervisor({ binary: BINARY, hudRoot: HUD, dataDir, port, key: KEY, env: engineEnv(), monitorEveryMs: 200, buildId: 'old-build', ...realProcess });
  await same.start();
  assert.equal(same.reattached, true);
  assert.equal(same.status!.pid, oldPid, 'the same build stays running');
  await same.stop(false);
  const updated = new EngineSupervisor({ binary: BINARY, hudRoot: HUD, dataDir, port, key: KEY, env: engineEnv(), monitorEveryMs: 200, buildId: 'new-build', ...realProcess });
  await updated.start();
  try {
    assert.equal(updated.state, 'running');
    assert.equal(updated.reattached, false, 'an older build is not kept');
    assert.notEqual(updated.status!.pid, oldPid, 'a new engine runs');
  } finally {
    await updated.stop(true);
  }
});
