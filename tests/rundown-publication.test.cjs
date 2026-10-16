const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { publicationDecision, upcomingDiff } = require('../src/rundown-publication');
const { ShowRunner } = require('../src/show-runner');
test('published versions reject stale and invalid plans while legacy behavior stays explicit', () => {
  const current = { showId: 'show', rundownVersion: 3 };
  assert.equal(publicationDecision(current, { showId: 'show', rundownVersion: 2 }), 'older');
  assert.equal(publicationDecision(current, { showId: 'show' }), 'legacy');
  assert.equal(publicationDecision(current, { showId: 'another', rundownVersion: 1 }), 'new');
  assert.throws(() => publicationDecision(current, { showId: 'show', rundownVersion: 3.5 }));
});
test('boundary replacement preserves actual Program and completed history, with newly ordered future items', async () => {
  const obs = new EventEmitter(); const calls = []; obs.take = async scene => { calls.push(scene); return { ok: true }; };
  const runner = new ShowRunner({ obsController: obs, logger: { error() {} } });
  runner.loadRundown([{ id: 'open', name: 'Opening', scene: 'Opening' }, { id: 'map', name: 'Map', scene: 'Game' }]);
  runner.start(); await runner.take('open');
  assert.equal(runner.replaceUpcoming([]).ok, false);
  obs.emit('tally-changed', { program: 'Opening' });
  const result = runner.replaceUpcoming([{ id: 'open', name: 'Changed opening', scene: 'Wrong' }, { id: 'break', name: 'Break', scene: 'Holding' }]);
  assert.equal(result.ok, true); assert.deepEqual(calls, ['Opening']);
  assert.equal(runner.getState().onAirSegment.name, 'Opening');
  assert.equal(runner.getState().activeSegment.id, 'break');
  runner.hold('break'); assert.equal(runner.replaceUpcoming([]).ok, false);
  runner.skip('break'); assert.equal(runner.replaceUpcoming([{ id: 'open', scene: 'Wrong' }, { id: 'break', scene: 'Wrong' }, { id: 'result', name: 'Results', scene: 'Results' }]).ok, true);
  assert.equal(runner.getState().segments.find(item => item.id === 'break').state, 'done');
  assert.equal(runner.getState().activeSegment.id, 'result'); runner.loadRundown([]);
});
test('change review identifies additions, removals, edits and relative reordering', () => {
  const item = (id, title) => ({ id, title });
  const diff = upcomingDiff({ rundown: [item('a', 'Opening'), item('b', 'Map'), item('c', 'Break')] }, { rundown: [item('b', 'Map two'), item('a', 'Opening'), item('d', 'Results')] });
  assert.deepEqual(diff, { added: ['Results'], removed: ['Break'], changed: ['Map two'], reordered: true });
});
