const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const OutputRegistry = require('../src/output-registry');
const { normalizeRundown, applyRundown } = require('../src/rundown-config');
function registry() {
  let outputs = [];
  return new OutputRegistry({ config: { get: () => outputs, set: (_key, value) => { outputs = value; } }, hudRoot: path.join(__dirname, '../esportra-valorant-hud'), port: 5300 });
}
test('output catalogue, create and remove use existing overlays without secrets', () => {
  const store = registry(); assert.ok(store.catalogue().length >= 40);
  const item = store.add({ name: 'Gameplay', overlay: 'ingame', matchCode: 'GF1' });
  assert.equal(store.list()[0].url, 'http://localhost:5300/o/' + item.id);
  assert.ok(!store.list()[0].url.includes('key=')); store.remove(item.id); assert.equal(store.list().length, 0);
});
test('output creation rejects traversal, missing overlay and invalid match code', () => {
  const store = registry();
  for (const input of [{ name: 'Bad', overlay: '../control' }, { name: 'Bad', overlay: 'missing' }, { name: 'Bad', overlay: 'ingame', matchCode: 'MAIN?key=bad' }]) assert.throws(() => store.add(input));
  assert.equal(store.list().length, 0);
});
test('published planning types map to local scenes with manual take', () => {
  const segments = normalizeRundown([{ id: 'segment-1', title: 'Grand final', type: 'match' }]);
  assert.equal(segments[0].scene, 'ESA_Gameplay'); assert.equal(segments[0].autoTake, false); assert.equal(segments[0].holdWindowMs, 30000);
});
test('invalid and duplicate segment definitions are rejected before loading', () => {
  assert.throws(() => normalizeRundown([{ id: '1', title: 'First', type: 'scene' }]));
  assert.throws(() => normalizeRundown([{ id: '1', title: 'First', type: 'match' }, { id: '1', title: 'Second', type: 'break' }]));
});
test('configuration cannot replace an armed or on-air rundown', () => {
  for (const state of ['armed', 'holding', 'taking', 'on_air']) {
    let calls = 0;
    const result = applyRundown({ rundown: [] }, { getState: () => ({ segments: [{ state }] }), loadRundown: () => { calls++; } });
    assert.equal(result.applied, false); assert.equal(calls, 0);
  }
});
test('idle producer receives the web rundown without starting it', () => {
  let loaded;
  const result = applyRundown({ rundown: [{ id: '1', title: 'Opening', type: 'pre_show' }] }, { getState: () => ({ segments: [] }), loadRundown: items => { loaded = items; } });
  assert.equal(result.applied, true); assert.equal(loaded[0].scene, 'ESA_Casters');
});
