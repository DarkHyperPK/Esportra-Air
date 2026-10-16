const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { HistoryWindow, IncidentTracker, actionMetadata } = require('../src/production-history');
const { ShowRunner } = require('../src/show-runner');
const { load, quiet } = require('./helpers.cjs');
const showId = '00000000-0000-4000-8000-000000000061';
test('one-hour history stays bounded and isolates the selected show', () => {
  let now = 4000000; const history = new HistoryWindow({ now: () => now, limit: 2 });
  history.append({ ts: 1, type: 'SegmentTake', showId });
  for (let i = 0; i < 3; i++) history.append({ ts: now, type: 'SegmentTake', showId });
  assert.equal(history.snapshot(showId).items.length, 2); assert.equal(history.snapshot(showId).truncated, true);
  assert.equal(history.snapshot('another-show').items.length, 0);
  now += 3600001; assert.equal(history.snapshot(showId).items.length, 0);
});
test('incident transitions log once with actor/time, and local correction reasons stay out of metadata', () => {
  const events = [], tracker = new IncidentTracker({ record: entry => events.push(entry), now: () => 1000 });
  tracker.update('stale_feed', false, showId); tracker.update('stale_feed', true, showId); tracker.update('stale_feed', true, showId); tracker.update('stale_feed', false, showId);
  assert.deepEqual(events.map(entry => entry.data.status), ['opened','resolved']);
  assert.equal(events[0].data.wallClockMs, 1000);
  const metadata = actionMetadata({ type: 'fix_data', actor: 'operator', ts: 1000, showId, data: { reason: 'private operator note', onAirApplied: false } });
  assert.equal(metadata.data.action, 'data_fix_queued'); assert.equal(JSON.stringify(metadata).includes('private'), false);
});
test('a take enters the confirmed timeline only after matching OBS Program tally', async () => {
  const runner = new ShowRunner({ logger: quiet }); const confirmed = [];
  runner.on('takeConfirmed', event => confirmed.push(event));
  runner.loadRundown([{ id: 'opening', name: 'Opening', scene: 'ESA_Casters' }]); runner.start();
  await runner.take('opening'); assert.equal(confirmed.length, 0);
  runner._onTallyChanged({ program: 'Unrelated scene' }); assert.equal(confirmed.length, 0);
  runner._onTallyChanged({ program: 'ESA_Casters' }); assert.equal(confirmed.length, 1); assert.equal(confirmed[0].actor, 'operator');
  runner.loadRundown([]);
});
test('recent local timeline restores after restart without re-enqueuing historical records', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-history-'));
  t.after(() => { assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith('air-history-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const Logger = load('event-logger.js', { electron: { app: { getPath: () => directory } } });
  const queued = [], first = new Logger({ now: () => 4000000, logger: quiet, offlineQueue: { enqueue: value => queued.push(value) } });
  first.setShowId(showId); first.log({ type: 'cmd_hold', actor: 'operator', data: { secret: 'never sent' } });
  assert.equal(queued.length, 1); assert.equal(queued[0].event.type, 'ProductionAction'); assert.equal(JSON.stringify(queued[0]).includes('secret'), false);
  const restored = new Logger({ now: () => 4001000, logger: quiet, offlineQueue: { enqueue: () => { throw new Error('Historical replay must not enqueue'); } } });
  assert.equal(restored.getTimeline(showId).items.length, 2);
});
