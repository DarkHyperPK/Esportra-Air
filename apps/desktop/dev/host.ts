// Development host: the real production model and graphics engine behind an HTTP version of
// `window.air`, with an in-memory OBS and a simulated game feed. Lets the interface run and be
// walked through in a normal browser on any OS (no ow-electron, OBS or Valorant needed).
//
//   node dev/host.ts [--port 5320]      then open http://127.0.0.1:5320/
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { dispatch } from '../src/main/api.ts';
import { EngineSupervisor } from '../src/main/engine-supervisor.ts';
import { IngestClient } from '../src/main/ingest.ts';
import { CaptureStats } from '../src/main/capture-stats.ts';
import { EsportraAccount } from '../src/main/esportra.ts';
import { FakeEsportra } from './fake-esportra.ts';
import { randomUUID } from 'node:crypto';
import { ObsLink } from '../src/main/obs.ts';
import { engineEnv, realProcess } from '../src/main/process.ts';
import { Production } from '../src/main/production.ts';
import { Secrets } from '../src/main/secrets.ts';
import { Store } from '../src/main/store.ts';
import { FakeObs } from '../test/fake-obs.ts';
import type { ApiMethod } from '../src/shared/api.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 5320;
const ENGINE_PORT = Number(process.argv[process.argv.indexOf('--engine-port') + 1]) || 5399;
const BINARY = join(ROOT, 'engine/target/release', process.platform === 'win32' ? 'air-engine.exe' : 'air-engine');
const RENDERER = resolve(import.meta.dirname, '../dist/renderer');
if (!existsSync(BINARY)) throw new Error('Build the engine first: cd engine && cargo build --release');

/** Replays the recorded simulated match into the engine at real pace once capture starts. */
class SimulatedCapture extends EventEmitter {
  state: 'off' | 'waiting' | 'live' | 'unavailable' = 'off';
  reason: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly ingest: IngestClient;
  private readonly stats: CaptureStats;
  constructor(ingest: IngestClient, stats: CaptureStats) { super(); this.ingest = ingest; this.stats = stats; }
  start() {
    this.state = 'waiting';
    this.reason = 'Simulated: Valorant starts in 2 s.';
    this.emit('change');
    const steps = readFileSync(join(ROOT, 'engine/fixtures/simulated-match.ndjson'), 'utf8').trim().split('\n').slice(1).map((l) => JSON.parse(l));
    const t0 = steps[0].t;
    for (const step of steps.filter((s: any) => s.kind === 'ingest')) {
      this.timers.push(setTimeout(() => {
        if (this.state === 'waiting') { this.state = 'live'; this.reason = null; this.emit('change'); }
        for (const m of step.input) { this.stats.record(m); this.ingest.send(m); }
      }, 2000 + (step.t - t0)));
    }
  }
  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.state = 'off';
    this.reason = null;
    this.emit('change');
  }
}

const dir = mkdtempSync(join(tmpdir(), 'air-dev-'));
const engine = new EngineSupervisor({ binary: BINARY, hudRoot: join(ROOT, 'esportra-valorant-hud'), dataDir: dir, port: ENGINE_PORT, key: 'dev-host-key-0123456789abcdef', env: engineEnv(), ...realProcess });
await engine.start();
const fakeObs = new FakeObs();
fakeObs.transitionMs = 400;
const obs = new ObsLink(() => fakeObs);
const ingest = new IngestClient();
const stats = new CaptureStats();
const capture = new SimulatedCapture(ingest, stats);
const store = new Store(join(dir, 'air.json'));
const secrets = new Secrets(join(dir, 'secrets.json'), { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' });
// A stand-in Esportra backend so sign-in and the match list can be tried without the network.
const backend = await new FakeEsportra().start();
console.log(JSON.stringify({ esportra: backend.url, email: backend.email, password: backend.password }));
store.data.deviceId ??= randomUUID();
const esportra = new EsportraAccount({ apiBase: backend.url, store, secrets, deviceId: store.data.deviceId, deviceName: 'DEV-PC', changed: () => production.emit('change') });
const production = new Production({ store, engine, obs, capture, ingest, stats, esportra, version: 'dev' });
let clipboard = '';
const ctx = { production, obs, secrets, copy: (text: string) => { clipboard = text; } };
await production.syncEngine();

const monitors = new Set<(data: string) => void>();
production.on('monitor', (frame) => { const data = JSON.stringify(frame); for (const l of monitors) l(data); });
const listeners = new Set<(data: string) => void>();
production.on('change', () => { const data = JSON.stringify(production.snapshot()); for (const l of listeners) l(data); });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    const send = (data: string) => res.write(`data: ${data}\n\n`);
    send(JSON.stringify(production.snapshot()));
    listeners.add(send);
    req.on('close', () => listeners.delete(send));
    return;
  }
  if (url.pathname === '/monitor-events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const send = (data: string) => res.write(`data: ${data}\n\n`);
    monitors.add(send);
    req.on('close', () => monitors.delete(send));
    return;
  }
  if (url.pathname.startsWith('/call/') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const result = await dispatch(ctx, url.pathname.slice(6) as ApiMethod, JSON.parse(body || '[]'));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result ?? null));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }
  if (url.pathname === '/dev/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ clipboard, enginePort: ENGINE_PORT, obsScenes: [...fakeObs.scenes.keys()] }));
    return;
  }
  const file = join(RENDERER, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(RENDERER) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${PORT}/?host=http://127.0.0.1:${PORT}`, enginePort: ENGINE_PORT })));

const stop = async () => { await backend.stop(); capture.stop(); ingest.close(); await engine.stop(true); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
