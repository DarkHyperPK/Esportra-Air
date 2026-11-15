// Runs the Player interface in a browser against a stand-in production PC, for visual checks.
//   node dev/host.ts   → http://127.0.0.1:5330/?host=http://127.0.0.1:5330   (join code K7M4QX)
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { IngestClient, type IngestSocket } from '../../../packages/capture/src/ingest.ts';
import { METHODS } from '../src/shared/api.ts';
import { PlayerController, type CaptureLike } from '../src/main/controller.ts';
import { PlayerStore } from '../src/main/store.ts';

const PORT = 5330;
const RENDERER = resolve(import.meta.dirname, '../dist/renderer');

class FakeCapture extends EventEmitter implements CaptureLike {
  state: CaptureLike['state'] = 'off';
  reason: string | null = null;
  role: 'observer' | 'player' = 'player';
  start() { this.state = 'waiting'; this.reason = 'Simulated: Valorant starts in 2 s.'; this.emit('change'); setTimeout(() => { if (this.state === 'waiting') { this.state = 'live'; this.reason = null; this.emit('change'); } }, 1500); }
  stop() { this.state = 'off'; this.reason = null; this.emit('change'); }
  setRole(role: 'observer' | 'player') { this.role = role; }
}

// The stand-in production PC.
const prodServer = createServer((req, res) => {
  const ok = new URL(req.url ?? '/', 'http://x').searchParams.get('code') === 'K7M4QX';
  res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok }));
});
const wss = new WebSocketServer({ server: prodServer, path: '/join' });
wss.on('connection', () => {});
await new Promise<void>((done) => prodServer.listen(5301, '127.0.0.1', done));

const dir = mkdtempSync(join(tmpdir(), 'player-dev-'));
const capture = new FakeCapture();
const ingest = new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket });
const secrets = new Map<string, string>();
const controller = new PlayerController({ store: new PlayerStore(join(dir, 'player.json')), secrets: { get: (k) => secrets.get(k) ?? null, set: (k, v) => void (v === null ? secrets.delete(k) : secrets.set(k, v)) }, ingest, capture, name: 'DEV-PLAYER-PC', version: 'dev' });
setInterval(() => { if (capture.state === 'live') ingest.send({ feature: 'me', key: 'health', data: '100', playerId: '11111111-2222-3333-4444-555555555555' }); }, 300).unref();

const listeners = new Set<(data: string) => void>();
controller.on('change', () => { const data = JSON.stringify(controller.snapshot()); for (const l of listeners) l(data); });
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    const send = (data: string) => res.write(`data: ${data}\n\n`);
    send(JSON.stringify(controller.snapshot()));
    listeners.add(send);
    req.on('close', () => listeners.delete(send));
    return;
  }
  if (url.pathname.startsWith('/call/') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const method = url.pathname.slice(6);
    try {
      const a = JSON.parse(body || '[]') as any[];
      if (!(METHODS as string[]).includes(method)) throw new Error('Unknown action.');
      if (method === 'connect') await controller.connect(a[0] ?? {});
      if (method === 'disconnect') controller.disconnect();
      if (method === 'retry') controller.retry();
      if (method === 'startCapture') controller.startCapture(a[0] ?? {});
      if (method === 'stopCapture') controller.stopCapture();
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(controller.snapshot()));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }
  const file = join(RENDERER, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(RENDERER) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${PORT}/?host=http://127.0.0.1:${PORT}`, joinCode: 'K7M4QX' })));
