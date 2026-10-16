const { test } = require('node:test');
const assert = require('node:assert/strict');
const CaptureWindow = require('../src/capture-window');
const LanRelay = require('../src/lan-relay');
const { quiet } = require('./helpers.cjs');
test('observer recovery retains only the last 60 seconds and bounds memory', () => {
  let now = 0; const buffer = new CaptureWindow({ now: () => now, maxBytes: 500, maxItems: 2 });
  for (let sequence = 1; sequence <= 3; sequence++) buffer.push({ streamId: 'observer', sequence });
  assert.equal(buffer.status().retainedMessages, 2);
  assert.deepEqual(buffer.since(2, 'observer').map(packet => packet.sequence), [3]);
  now = 61000; assert.equal(buffer.status().retainedMessages, 0);
});
test('observer markers include match routing without granting production control', () => {
  const relay = new LanRelay({ mode: 'observer', logger: quiet });
  const packet = relay.sendMarker('replay', { matchCode: 'FINAL', showId: 'show' });
  assert.equal(packet.kind, 'replay'); assert.equal(packet.matchCode, 'FINAL');
  assert.equal(relay.getStatus().retainedMessages, 1);
  assert.throws(() => relay.sendMarker('take', {}), /marker/);
});
test('reconnected consumer skips acknowledged packets and only advances after acceptance', async () => {
  const accepted = [];
  const relay = new LanRelay({ mode: 'production', logger: quiet, onGepState: async (payload, context) => { accepted.push({ payload, context }); } });
  const entry = { streamId: 'observer', lastSequence: 2 };
  await relay._handleObserverMessage(JSON.stringify({ type: 'gep_state', streamId: 'observer', sequence: 2, payload: { key: 'old' } }), entry);
  assert.equal(accepted.length, 0);
  await relay._handleObserverMessage(JSON.stringify({ type: 'gep_state', streamId: 'observer', sequence: 3, recovered: true, bufferedAgeMs: 5000, payload: { key: 'new' } }), entry);
  assert.equal(entry.lastSequence, 3); assert.equal(accepted[0].context.recovered, true);
  assert.equal(accepted[0].context.bufferedAgeMs, 5000);
});
