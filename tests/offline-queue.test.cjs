const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, deferred, quiet } = require('./helpers.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esportra-air-queue-test-'));
  t.after(() => {
    assert.ok(path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('esportra-air-queue-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const Queue = load('offline-queue.js', { electron: { app: { getPath: () => dir } } });
  const queue = new Queue({ nodeToken: 'fixture-token', logger: quiet });
  const file = path.join(dir, 'offline-queue.ndjson');
  return { queue, file, read: () => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
}
test('records appended during an awaited send survive rewrite', async t => {
  const { queue, read } = fixture(t), gate = deferred(), entered = deferred();
  queue.enqueue({ name: 'first' });
  const draining = queue.drain(async () => { entered.resolve(); await gate.promise; });
  await entered.promise;
  queue.enqueue({ name: 'second' });
  gate.resolve(); await draining;
  assert.deepEqual(read().map(x => x.payload.name), ['second']);
});
test('overlapping drains do not send the same record twice', async t => {
  const { queue } = fixture(t), gate = deferred(), entered = deferred();
  queue.enqueue({ name: 'first' }); let calls = 0;
  const send = async () => { calls++; entered.resolve(); await gate.promise; };
  const first = queue.drain(send); await entered.promise;
  const second = queue.drain(send); gate.resolve(); await Promise.all([first, second]);
  assert.equal(calls, 1);
});
test('explicit non-acknowledgment retains a record and permits later delivery', async t => {
  const { queue, read } = fixture(t);
  queue.enqueue({ name: 'pending' }); queue.enqueue({ name: 'ready' });
  await queue.drain(async p => p.name === 'pending' ? false : true);
  assert.deepEqual(read().map(x => x.payload.name), ['pending']);
});
test('network failure retains FIFO remainder and newly appended records', async t => {
  const { queue, read } = fixture(t);
  queue.enqueue({ name: 'first' }); queue.enqueue({ name: 'second' });
  await queue.drain(async () => { queue.enqueue({ name: 'third' }); throw Error('fixture offline'); });
  assert.deepEqual(read().map(x => x.payload.name), ['first', 'second', 'third']);
});
test('tampered and malformed records stay without being sent', async t => {
  const { queue, read, file } = fixture(t); queue.enqueue({ name: 'first' });
  const entry = read()[0]; entry.payload.name = 'tampered';
  fs.writeFileSync(file, JSON.stringify(entry) + '\nnot-json\n');
  let calls = 0; await queue.drain(async () => { calls++; });
  assert.equal(calls, 0); assert.ok(fs.readFileSync(file, 'utf8').includes('not-json'));
});
test('queue metadata supplies a durable UUID unchanged on retry', async t => {
  const { queue, read } = fixture(t); queue.enqueue({ name: 'first' }); const id = read()[0].id;
  let seen;
  await queue.drain(async (_payload, metadata) => { seen = metadata.id; return false; });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(seen, id); assert.equal(read()[0].id, id);
});
test('a synchronous enqueue from the sender cannot reenter the drain', async t => {
  const { queue, read } = fixture(t); queue.enqueue({ name: 'first' });
  let sends = 0;
  queue.on('enqueue', () => queue.drain(send));
  async function send() { sends++; queue.enqueue({ name: 'second' }); }
  await queue.drain(send);
  assert.equal(sends, 1); assert.deepEqual(read().map(x => x.payload.name), ['second']);
});
test('clear refuses to erase records while delivery is in flight', async t => {
  const { queue, read } = fixture(t), gate = deferred(), entered = deferred();
  queue.enqueue({ name: 'first' });
  const draining = queue.drain(async () => { entered.resolve(); await gate.promise; return false; });
  await entered.promise; assert.throws(() => queue.clear(), /during delivery/);
  gate.resolve(); await draining; assert.equal(read().length, 1);
});
