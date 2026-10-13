const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, quiet } = require('./helpers.cjs');
const showId = '5e182c34-49f8-40d3-bf6c-88b576c20c45';
test('observer packets retain their original show and match routing', () => {
  const { acceptsGep } = require('../src/gep-route');
  const current = { showId, matchCode: 'GF1' };
  assert.equal(acceptsGep({ showId, matchCode: 'gf1' }, current), true);
  assert.equal(acceptsGep({ showId, matchCode: 'GF2' }, current), false);
  assert.equal(acceptsGep({ showId: 'another-show', matchCode: 'GF1' }, current), false);
  assert.equal(acceptsGep({ matchCode: 'GF1' }, current), false);
  assert.equal(acceptsGep({ matchCode: 'MAIN' }, null), true);
});

test('show selection chooses real configured teams and rejects path-like codes', () => {
  const { selectShowMatch } = require('../src/show-selection');
  const config = { showId, matches: [{ matchCode: 'MAIN', teams: [{ name: 'A' }, { name: 'B' }] }, { matchCode: 'GF2', bestOf: 3, teams: [{ name: 'C' }, { name: 'D' }] }] };
  const selected = selectShowMatch(config, 'GF2'); assert.equal(selected.matchCode, 'GF2'); assert.equal(selected.teams[0].name, 'C'); assert.equal(selected.seriesTotal, 3);
  assert.throws(() => selectShowMatch({ ...config, matches: [{ matchCode: '../bad' }] }));
});

test('tournament veto follows the selected match into the existing HUD', () => {
  const { selectShowMatch } = require('../src/show-selection');
  const { buildShowPatch } = require('../src/match-context');
  const first = [{ team: 0, action: 'ban', map: 'Ascent' }];
  const second = [{ team: 1, pickedByTeam: 1, action: 'pick', map: 'Haven', side: 'DEF' }];
  const selected = selectShowMatch({ showId, eventLabel: 'Invitational', mapPool: ['Ascent', 'Haven'], veto: first, matches: [{ matchCode: 'GF1', veto: first }, { matchCode: 'GF2', veto: second }] }, 'GF2');
  const patch = buildShowPatch(selected);
  assert.deepEqual(patch.veto, second);
  assert.deepEqual(patch.mapPool, ['Ascent', 'Haven']);
  assert.equal(patch.event.name, 'Invitational');
});

test('empty veto on a different match clears the previous match veto', () => {
  const { selectShowMatch } = require('../src/show-selection');
  const veto = [{ team: 0, action: 'ban', map: 'Ascent' }];
  assert.deepEqual(selectShowMatch({ showId, veto, matches: [{ matchCode: 'GF2', veto: [] }] }, 'GF2').veto, []);
});
test('LAN relay rejects browser origins and unauthorized external consumers', () => {
  const LanRelay = require('../src/lan-relay');
  const key = 'a'.repeat(64), relay = new LanRelay({ mode: 'observer', sharedKey: key });
  const req = (address, headers = {}) => ({ socket: { remoteAddress: address }, headers });
  assert.equal(relay._authorize(req('127.0.0.1')), true);
  assert.equal(relay._authorize(req('127.0.0.1', { origin: 'https://untrusted.invalid' })), false);
  assert.equal(relay._authorize(req('192.168.1.20')), false);
  assert.equal(relay._authorize(req('192.168.1.20', { 'x-esportra-relay-key': 'b'.repeat(64) })), false);
  assert.equal(relay._authorize(req('192.168.1.20', { 'x-esportra-relay-key': key })), true);
});
function queueFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-product-batches-'));
  t.after(() => { assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('air-product-batches-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const Queue = load('offline-queue.js', { electron: { app: { getPath: () => dir } } });
  return new Queue({ nodeToken: 'fixture-token', logger: quiet });
}
test('250 events use three bounded batches and retain records appended during delivery', async t => {
  const queue = queueFixture(t), batches = [];
  for (let index = 0; index < 250; index++) queue.enqueue({ index });
  await queue.drainBatches(async records => { batches.push(records); if (batches.length === 1) queue.enqueue({ index: 250 }); return true; });
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 50]); assert.equal(queue.getPendingCount(), 1);
});
test('batch partial rejection retains all records for idempotent retry', async t => {
  const queue = queueFixture(t); queue.enqueue({ index: 1 }); queue.enqueue({ index: 2 });
  await queue.drainBatches(async () => false); assert.equal(queue.getPendingCount(), 2);
});
test('acknowledged batches never mix originating shows', async t => {
  const queue = queueFixture(t), requests = [];
  const otherShow = 'cf507ae4-9468-4f40-96aa-5a5ff01459c5';
  for (const originalShow of [showId, showId, otherShow]) queue.enqueue({ type: 'BroadcastEvent', event: { type: 'SegmentTake', showId: originalShow, ts: 1700000000000, data: {} } });
  const Hub = load('hub-client.js', { 'node-fetch': async (url, options) => { const body = JSON.parse(options.body); requests.push({ url, body }); return { ok: true, json: async () => ({ accepted: body.events.length, rejected: 0 }) }; } });
  const client = new Hub({ hubUrl: 'https://fixture.invalid/hubs/broadcast', offlineQueue: queue, logger: quiet }); client._connected = true; client._nodeToken = 'fixture-token';
  await client._drainQueue(); assert.equal(queue.getPendingCount(), 0); assert.equal(requests.length, 2); assert.equal(requests[0].body.events.length, 2); assert.ok(requests[0].url.includes(showId)); assert.ok(requests[1].url.includes(otherShow));
});
test('legacy event without its original show remains queued', async t => {
  const queue = queueFixture(t); queue.enqueue({ type: 'BroadcastEvent', event: { type: 'SegmentTake', data: {} } });
  const Hub = load('hub-client.js', { 'node-fetch': async () => { throw Error('No request should be made'); } });
  const client = new Hub({ hubUrl: 'https://fixture.invalid/hubs/broadcast', offlineQueue: queue, logger: quiet }); client._connected = true; client._nodeToken = 'fixture-token';
  await client._drainQueue(); assert.equal(queue.getPendingCount(), 1);
});
