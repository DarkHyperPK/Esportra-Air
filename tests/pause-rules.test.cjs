const test = require('node:test');
const assert = require('node:assert/strict');
const { PauseRules, validatePauseRules } = require('../src/pause-rules');
const scope = { showId: 'show', matchId: 'match', matchCode: 'FINAL', nodeId: 'node' };
function fixture(config = {}) {
  let current = scope, tally = { program: 'Game' }; const jobs = [], patches = [], records = [], takes = [];
  const obs = { getState: () => ({ connected: true }), getTally: () => tally, inspect: async () => ({ connected: true, scenes: ['Game', 'Break'] }), take: async (scene, _transition, options) => { if (!options.stillAllowed()) return { ok: false }; takes.push(scene); return { ok: true }; } };
  const rules = new PauseRules({ config, getScope: () => current, getObs: () => obs, patch: async (code, input) => patches.push({ code, input }), record: item => records.push(item), setTimeout: (run, delay) => { jobs.push({ run, delay }); return jobs.length; }, clearTimeout: () => {} });
  return { rules, jobs, patches, records, takes, obs, setScope: value => { current = value; }, setTally: value => { tally = { program: value }; rules.tally(tally); } };
}
test('manual pauses show delayed panels while OBS disconnection alone never declares a game pause', async () => {
  const f = fixture(); f.rules.update({ techPaused: true, pauseSource: 'obs_disconnected' }); assert.equal(f.jobs.length, 0);
  f.rules.update({ techPaused: true, pauseSource: 'operator' }); assert.equal(f.jobs[0].delay, 3000);
  f.jobs[0].run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.patches[0].input.panel.kind, 'technical'); assert.equal(f.takes.length, 0);
  f.rules.update({ timeoutPaused: true }); f.jobs[1].run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.patches.at(-1).input.panel.kind, 'timeout');
  assert.equal(f.patches[1].input.action, 'clear');
});
test('only an explicitly configured pause scene can take, and only actual Program confirms its record', async () => {
  const f = fixture({ scene: 'Break' }); f.rules.update({ techPaused: true, pauseSource: 'operator' });
  f.jobs[0].run(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.takes, ['Break']); assert.equal(f.records.length, 0);
  f.setTally('Break'); assert.equal(f.records[0].type, 'SegmentTake'); assert.equal(f.records[0].showId, 'show');
  f.rules.update({ techPaused: false }); assert.equal(f.takes.length, 1);
  f.setTally('Game'); assert.equal(f.records[1].type, 'SegmentDone');
});
test('resume, a changed pairing, and unavailable scenes cancel pending automatic work', async () => {
  const f = fixture({ scene: 'Missing' }); f.rules.update({ techPaused: true }); f.rules.update({ techPaused: false });
  f.jobs[0].run(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.patches.length, 0);
  f.rules.update({ techPaused: true }); f.setScope({ ...scope, nodeId: 'new-node' }); f.jobs[1].run(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.patches.length, 0);
  f.rules.update({ techPaused: true }); f.jobs[2].run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.takes.length, 0); assert.match(f.rules.status().notice, /unavailable/);
  assert.throws(() => validatePauseRules({ delayMs: 0 })); assert.throws(() => validatePauseRules({ scene: 'bad\nscene' }));
});
