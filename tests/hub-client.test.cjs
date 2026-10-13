const test = require('node:test');
const assert = require('node:assert/strict');
const { load, quiet } = require('./helpers.cjs');
const id = 'cf507ae4-9468-4f40-96aa-5a5ff01459c5';
const showId = '5e182c34-49f8-40d3-bf6c-88b576c20c45';
function fixture(payload, answer = { accepted: 1, rejected: 0 }) {
  const requests = [], retained = [];
  const queue = { async drain(send) { if (await send(payload, { id, ts: 1700000000000 }) === false) retained.push(payload); } };
  const Hub = load('hub-client.js', { 'node-fetch': async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => answer }; } });
  const client = new Hub({ hubUrl: 'wss://fixture.invalid/hubs/broadcast', apiBase: 'https://fixture.invalid', offlineQueue: queue, logger: quiet });
  client._connected = true; client._nodeToken = 'fixture-token'; client._connection = { invoke: async () => {} };
  return { client, requests, retained };
}
test('legacy websocket URL is normalized for the installed SignalR builder', async () => {
  const Hub = load('hub-client.js');
  const client = new Hub({ hubUrl: 'wss://fixture.invalid/hubs/broadcast', offlineQueue: {}, logger: quiet });
  const connection = client._buildConnection('fixture-token');
  assert.equal(connection.baseUrl, 'https://fixture.invalid/hubs/broadcast');
});
test('events use stable queue ID and acknowledged HTTP drain', async () => {
  const { client, requests } = fixture({ type: 'BroadcastEvent', event: { showId: '5e182c34-49f8-40d3-bf6c-88b576c20c45', type: 'SegmentTake', ts: 1700000000000, data: { segmentId: 'segment-1' } } });
  await client._drainQueue();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://fixture.invalid/api/broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/events/drain');
  const event = JSON.parse(requests[0].options.body).events[0];
  assert.equal(event.eventId, id); assert.equal(event.payload.segmentId, 'segment-1');
  await client._drainQueue();
  assert.equal(JSON.parse(requests[1].options.body).events[0].eventId, id);
});
test('server rejection retains event instead of treating HTTP 200 as delivered', async () => {
  const { client, retained } = fixture({ type: 'BroadcastEvent', event: { showId: '5e182c34-49f8-40d3-bf6c-88b576c20c45', type: 'SegmentTake' } }, { accepted: 0, rejected: 1 });
  await client._drainQueue(); assert.equal(retained.length, 1);
});
test('correction uses its original show and existing typed endpoint', async () => {
  const { client, requests } = fixture({ type: 'BroadcastCorrection', showId, matchCode: 'MAIN', mapIndex: 3, teamAScore: 12, teamBScore: 11, idempotencyKey: id, ts: 1700000000000 }, { inserted: 1 });
  await client._drainQueue(); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://fixture.invalid/api/broadcast/shows/${showId}/corrections`);
  const correction = JSON.parse(requests[0].options.body).corrections[0];
  assert.equal(correction.idempotencyKey, id); assert.equal(correction.teamAScore, 12);
  assert.equal(correction.ts, '2023-11-14T22:13:20.000Z');
});
test('legacy correction without original show identity is retained without guessing', async () => {
  const { client, requests, retained } = fixture({ type: 'BroadcastCorrection', matchCode: 'MAIN' });
  await client._drainQueue(); assert.equal(requests.length, 0); assert.equal(retained.length, 1);
});
test('local-only operator records are retained without invalid remote delivery', async () => {
  const { client, requests, retained } = fixture({ type: 'BroadcastEvent', event: { type: 'cmd_hold' } });
  await client._drainQueue(); assert.equal(requests.length, 0); assert.equal(retained.length, 1);
});
test('initial connection failure schedules retry without unhandled error emission', async () => {
  const Hub = load('hub-client.js');
  const client = new Hub({ hubUrl: 'https://fixture.invalid/hubs/broadcast', offlineQueue: {}, logger: quiet });
  client._connection = { start: async () => { throw Error('fixture offline'); }, stop: async () => {} };
  client._startConnection();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(client._initialRetryTimer);
  await client.disconnect(); assert.equal(client._initialRetryTimer, null);
});
test('historical non-UUID queue identity maps to the same valid UUID on retry', async () => {
  const { client } = fixture({});
  const first = client._legacyEventId('legacy-node-1700000000000-abcdef');
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(client._legacyEventId('legacy-node-1700000000000-abcdef'), first);
});
