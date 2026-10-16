const { test } = require('node:test');
const assert = require('node:assert/strict');
const Chapters = require('../src/round-chapters');
test('round chapters carry only metadata, deduplicate reconnects and distinguish maps', () => {
  const chapters = new Chapters();
  const show = { showId: 'show', selectedMatchId: '00000000-0000-4000-8000-000000000061' };
  const state = { round: { number: 1 }, map: { name: 'HAVEN', number: 1 } };
  const event = { type: 'round.phase', phase: 'live' };
  const start = chapters.record(event, state, show, 1000);
  assert.equal(start.type, 'RoundStarted'); assert.equal(start.data.wallClockMs, 1000);
  assert.equal(chapters.record(event, state, show, 2000), null);
  assert.equal(chapters.record({ type: 'round.won' }, state, show, 3000).type, 'RoundEnded');
  const nextMap = chapters.record(event, { ...state, map: { name: 'SPLIT' } }, show, 4000);
  assert.notEqual(nextMap.data.segmentId, start.data.segmentId);
  assert.deepEqual(Object.keys(start.data).sort(), ['segmentId', 'segmentName', 'segmentType', 'wallClockMs']);
});
