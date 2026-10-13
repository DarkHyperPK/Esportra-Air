const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, quiet } = require('./helpers.cjs');
test('operator-only records stay local while contracted broadcast records queue', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esportra-air-log-test-'));
  t.after(() => {
    assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('esportra-air-log-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const Logger = load('event-logger.js', { electron: { app: { getPath: () => dir } } });
  const records = [], logger = new Logger({ offlineQueue: { enqueue: p => records.push(p) }, logger: quiet });
  logger.log({ type: 'cmd_hold', actor: 'operator' });
  logger.log({ type: 'SegmentTake', data: { segmentId: 'segment-1' } });
  assert.equal(logger.getLog().length, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'event-log.ndjson'), 'utf8').trim().split('\n').length, 2);
  assert.equal(records.length, 1); assert.equal(records[0].event.type, 'SegmentTake');
});
