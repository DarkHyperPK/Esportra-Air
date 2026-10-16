const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const LanRelay = require('../src/lan-relay');
const { quiet } = require('./helpers.cjs');
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Relay fixture timed out'); }
test('authenticated LAN consumer receives buffered capture and marker, then acknowledges live packets', async t => {
  const key = 'a'.repeat(64), observer = new LanRelay({ mode: 'observer', port: 0, sharedKey: key, logger: quiet });
  observer.start(); await until(() => observer.getStatus().listening);
  const port = observer.getStatus().port, target = `127.0.0.1:${port}`;
  const source = new WebSocket(`ws://${target}`); await new Promise(resolve => source.once('open', resolve));
  t.after(() => { source.terminate(); observer.stop(); });
  source.send(JSON.stringify({ type: 'valorant', message: { key: 'round_number', value: '2' }, match: 'FINAL', showId: 'show' }));
  await until(() => observer.getStatus().retainedMessages === 1);
  observer.sendMarker('flag', { matchCode: 'FINAL', showId: 'show' });
  const received = [], markers = [];
  const producer = new LanRelay({ mode: 'production', targets: [target], targetKeys: { [target]: key }, logger: quiet, onGepState: async (packet, context) => received.push({ packet, context }), onMarker: async marker => markers.push(marker) });
  t.after(() => producer.stop()); producer.start();
  await until(() => received.length === 1 && markers.length === 1);
  assert.equal(received[0].context.recovered, true); assert.equal(markers[0].kind, 'flag');
  source.send(JSON.stringify({ type: 'valorant', message: { key: 'round_number', value: '3' }, match: 'FINAL', showId: 'show' }));
  await until(() => received.length === 2 && observer.getStatus().ackLatencyMs !== null);
  assert.equal(received[1].context.recovered, false);
  source.send(JSON.stringify({ type: 'valorant', message: { key: 'round_number', value: '1' }, match: 'FINAL', showId: 'show', recovered: true, bufferedAgeMs: 5000 }));
  await until(() => received.length === 3);
  assert.equal(received[2].context.bufferedAgeMs, 5000); assert.equal(received[2].context.recovered, true);
});
