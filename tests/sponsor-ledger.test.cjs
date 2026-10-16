const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../src/sponsor-ledger');
const { load } = require('./helpers.cjs');
const showId = '00000000-0000-4000-8000-000000000061', sponsorId = '00000000-0000-4000-8000-000000000062';

test('sponsor placements survive restart and end against their original show', () => {
  let saved = [], now = 1000; const records = [];
  const options = { config: { get: () => saved, set: (_, value) => { saved = value; } }, queue: () => ({ enqueue: value => records.push(value) }), now: () => now };
  const ledger = new Ledger(options), show = { showId, sponsors: [{ sponsorId }] };
  ledger.record(show, { action: 'start', sponsorId, slotType: 'lower_third' });
  assert.throws(() => ledger.record(show, { action: 'start', sponsorId, slotType: 'lower_third' }), /already active/);
  now = 5000; const restored = new Ledger(options);
  restored.record({ showId: 'another-show' }, { action: 'end', sponsorId, slotType: 'lower_third' });
  assert.equal(records.length, 2); assert.equal(records[1].showId, showId);
  assert.equal(records[0].impression.startedAt, records[1].impression.startedAt);
  assert.equal(records[1].impression.endedAt, new Date(5000).toISOString());
  assert.equal(saved.length, 0);
  assert.throws(() => restored.record(show, { action: 'end', sponsorId, slotType: 'lower_third' }), /No matching/);
});

test('proof delivery retains original show and retries use acknowledged existing rows', async () => {
  const requests = [], retained = [];
  const HubClient = load('hub-client.js', { 'node-fetch': async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ accepted: 0, acknowledged: 1 }) }; } });
  const proof = { type: 'SponsorProof', showId, impression: { sponsorId, startedAt: new Date(1000).toISOString(), endedAt: new Date(5000).toISOString(), slotType: 'lower_third' } };
  const queue = { drain: async send => { if (!await send(proof, { ts: 5000 })) retained.push(proof); } };
  const client = new HubClient({ hubUrl: 'https://fixture.invalid/hubs/broadcast', offlineQueue: queue, logger: { info() {}, warn() {}, error() {} } });
  client._connected = true; client._nodeToken = 'fixture';
  await client._drainQueue();
  assert.equal(retained.length, 0); assert.equal(requests[0].url, `https://fixture.invalid/api/broadcast/shows/${showId}/sponsor-impressions`);
  assert.equal(requests[0].body.impressions[0].startedAt, proof.impression.startedAt);
});

test('failed queue persistence cannot silently create an active proof slot', () => {
  const ledger = new Ledger({ config: { get: () => [], set() {} }, queue: () => ({ enqueue() { throw new Error('disk full'); } }) });
  assert.throws(() => ledger.record({ showId, sponsors: [{ sponsorId }] }, { action: 'start', sponsorId, slotType: 'custom' }), /disk full/);
  assert.equal(ledger.active.size, 0);
});
