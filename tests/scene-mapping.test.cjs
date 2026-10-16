const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSceneMappings, missingScenes } = require('../src/scene-mapping');
const { normalizeRundown } = require('../src/rundown-config');
const segments = [{ id: 'map', title: 'Map', type: 'match' }, { id: 'break', title: 'Break', type: 'break' }];
const inspection = { connected: true, scenes: ['My gameplay', 'Desk'], transitions: [{ transitionName: 'Fade', transitionKind: 'fade_transition' }] };
const rows = [{ id: 'map', scene: 'My gameplay', transition: { mode: 'fade', name: 'Fade', durationMs: 250 } }, { id: 'break', scene: 'Desk' }];
test('mapped rundown uses real operator scenes and per-item transition settings', () => {
  const saved = validateSceneMappings(rows, segments, inspection);
  const result = normalizeRundown(segments, saved);
  assert.equal(result[0].scene, 'My gameplay'); assert.equal(result[0].transition.durationMs, 250);
  assert.deepEqual(missingScenes(result, inspection.scenes), []);
});
test('missing scenes, transitions, duplicate IDs and stale items block mapping save', () => {
  assert.throws(() => validateSceneMappings(rows, segments, { ...inspection, scenes: [] }), /missing/);
  assert.throws(() => validateSceneMappings(rows, segments, { ...inspection, transitions: [] }), /transition/);
  assert.throws(() => validateSceneMappings([rows[0], rows[0]], segments, inspection), /changed/);
  assert.throws(() => validateSceneMappings([{ ...rows[0], id: 'old' }, rows[1]], segments, inspection), /changed/);
  assert.throws(() => validateSceneMappings(rows, segments, { ...inspection, inspectionIncomplete: true }), /refresh/);
});
