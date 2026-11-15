// The Player app's model against a stand-in production PC (a tiny join server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { IngestClient, type IngestSocket } from '../../../packages/capture/src/ingest.ts';
import { PlayerController, type CaptureLike } from '../src/main/controller.ts';
import { PlayerStore } from '../src/main/store.ts';

class FakeCapture extends EventEmitter implements CaptureLike {
  state: CaptureLike['state'] = 'off';
  reason: string | null = null;
  role: 'observer' | 'player' = 'player';
  start() { this.state = 'waiting'; this.emit('change'); }
  stop() { this.state = 'off'; this.emit('change'); }
  setRole(role: 'observer' | 'player') { if (this.state !== 'off') throw new Error('Stop capture before changing this PC’s role.'); this.role = role; }
}

async function producer(code = 'K7M4QX') {
  const received: any[] = [];
  const urls: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const ok = url.pathname === '/join/hello' && url.searchParams.get('code') === code;
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok }));
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.searchParams.get('code') !== code) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    urls.push(String(req.url));
    wss.handleUpgrade(req, socket, head, (ws) => ws.on('message', (m) => received.push(JSON.parse(String(m)))));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { port: (server.address() as { port: number }).port, received, urls, stop: () => { wss.clients.forEach((c) => c.terminate()); server.closeAllConnections(); server.close(); } };
}

const until = async (check: () => boolean, label: string) => {
  const end = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > end) assert.fail(`timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

function make(file: string, secrets = new Map<string, string>()) {
  const capture = new FakeCapture();
  const ingest = new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket });
  const store = new PlayerStore(file);
  const controller = new PlayerController({ store, secrets: { get: (k) => secrets.get(k) ?? null, set: (k, v) => void (v === null ? secrets.delete(k) : secrets.set(k, v)) }, ingest, capture, name: 'PLAYER-PC', version: 'test' });
  return { capture, ingest, store, controller, secrets };
}

test('connecting, sending, and remembering the producer across a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'air-player-'));
  const file = join(dir, 'player.json');
  const prod = await producer();
  const a = make(file);
  try {
    assert.equal(a.controller.snapshot().link.state, 'off');
    await assert.rejects(a.controller.connect({ address: `127.0.0.1:${prod.port}`, code: 'WRONG1', role: 'player' }), /not accepted/);
    assert.equal(a.store.data.link, null, 'a refused code is not remembered');
    await a.controller.connect({ address: `127.0.0.1:${prod.port}`, code: 'k7m-4qx', role: 'player' });
    await until(() => a.controller.snapshot().link.state === 'connected', 'connected');
    assert.match(prod.urls[0]!, /role=player&name=PLAYER-PC/);

    // Capture needs the producer and an explicit OK; it never starts by itself.
    assert.throws(() => a.controller.startCapture({}), /accept the capture notice/);
    a.controller.startCapture({ consent: true });
    assert.equal(a.controller.snapshot().feed.state, 'waiting');
    await assert.rejects(a.controller.connect({ address: `127.0.0.1:${prod.port}`, code: 'K7M4QX', role: 'observer' }), /Stop game capture/);
    a.ingest.send({ feature: 'me', key: 'health', data: '80', playerId: '11111111-2222-3333-4444-555555555555' });
    await until(() => prod.received.length === 1, 'message arrives');
    assert.equal(prod.received[0].type, 'valorant');
    assert.equal(prod.received[0].message.playerId, '11111111-2222-3333-4444-555555555555');
    assert.equal(a.controller.snapshot().link.sent, 1);
    a.controller.stopCapture();
    a.ingest.close();

    // After a restart the producer and role are remembered, and the link comes back; capture stays off.
    const b = make(file, a.secrets);
    assert.deepEqual(b.store.data.link, { address: `127.0.0.1:${prod.port}`, role: 'player' });
    b.controller.resume();
    await until(() => b.controller.snapshot().link.state === 'connected', 'reconnected');
    assert.equal(b.controller.snapshot().feed.state, 'off', 'capture is never resumed without consent');
    b.controller.disconnect();
    assert.equal(b.store.data.link, null);
    assert.equal(b.secrets.size, 0, 'the code is forgotten');
    b.ingest.close();
  } finally { prod.stop(); }
});

test('an observer PC is the same app with the other role', async () => {
  const prod = await producer();
  const dir = mkdtempSync(join(tmpdir(), 'air-player-'));
  const a = make(join(dir, 'player.json'));
  try {
    await a.controller.connect({ address: `127.0.0.1:${prod.port}`, code: 'K7M4QX', role: 'observer' });
    assert.equal(a.capture.role, 'observer');
    await until(() => prod.urls.length === 1, 'joined');
    assert.match(prod.urls[0]!, /role=observer/);
    a.controller.disconnect();
    // Disconnecting frees the role: the same PC can join again as a player.
    await a.controller.connect({ address: `127.0.0.1:${prod.port}`, code: 'K7M4QX', role: 'player' });
    assert.equal(a.capture.role, 'player');
    a.ingest.close();
  } finally { prod.stop(); }
});
