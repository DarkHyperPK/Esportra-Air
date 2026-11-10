import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CaptureQueue, IngestClient, type IngestSocket } from '../../../packages/capture/src/ingest.ts';

class FakeSocket extends EventEmitter implements IngestSocket {
  readyState = 0;
  sent: any[] = [];
  readonly url: string;
  constructor(url: string) { super(); this.url = url; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.emit('open'); }
}

test('queues while disconnected and replays with age and recovered flag', () => {
  let now = 1000;
  const sockets: FakeSocket[] = [];
  const client = new IngestClient({ connect: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; }, now: () => now });
  client.target('ws://engine/ws?match=A');
  client.send({ a: 1 });
  now += 2500;
  client.send({ a: 2 });
  assert.equal(client.queued, 2);
  now += 500;
  sockets[0]!.open();
  assert.deepEqual(sockets[0]!.sent.map((m) => [m.message.a, m.bufferedAgeMs, m.recovered]), [[1, 3000], [2, 500]].map(([a, age]) => [a, age, true]));
  client.send({ a: 3 });
  assert.deepEqual(sockets[0]!.sent.at(-1), { type: 'valorant', message: { a: 3 }, bufferedAgeMs: 0, recovered: false });
});

test('switching match drops what was queued for the old one', () => {
  const sockets: FakeSocket[] = [];
  const client = new IngestClient({ connect: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; } });
  client.target('ws://engine/ws?match=A');
  client.send({ old: true });
  client.target('ws://engine/ws?match=B');
  assert.equal(client.queued, 0);
  assert.equal(sockets[0]!.readyState, 3);
  sockets[1]!.open();
  assert.deepEqual(sockets[1]!.sent, []);
  client.close();
});

test('the queue keeps at most 60 seconds', () => {
  let now = 0;
  const queue = new CaptureQueue(() => now);
  queue.add({ n: 1 });
  now = 61_000;
  queue.add({ n: 2 });
  assert.deepEqual(queue.drain().map((i) => (i.message as { n: number }).n), [2]);
});
