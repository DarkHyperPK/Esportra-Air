const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { normalizeRundown } = require('../src/rundown-config');
const { normalizePlan } = require('../src/segment-plan');
const { ShowRunner } = require('../src/show-runner');
const plan = { trigger: 'round_live', mode: 'automatic', holdMode: 'window', holdSeconds: 1, graphics: ['ingame'], transition: { mode: 'current' }, mapNumber: 2 };
test('typed item settings map the selected screen, transition, scene and manual/automatic mode', () => {
  const item = normalizeRundown([{ id: 'map', title: 'Map 2', type: 'match', plan: { ...plan, scene: 'My game', transition: { mode: 'fade', name: 'Fade', durationMs: 300 } } }])[0];
  assert.equal(item.autoTake, true); assert.equal(item.holdWindowMs, 1000); assert.equal(item.scene, 'My game');
  assert.equal(item.mapNumber, 2); assert.equal(item.overlay, 'ingame'); assert.deepEqual(item.transition, { mode: 'fade', name: 'Fade', durationMs: 300 });
  assert.equal(normalizeRundown([{ id: 'map', title: 'Map', type: 'match', plan: { ...plan, mode: 'manual' } }])[0].autoTake, false);
  for (const invalid of [{ ...plan, trigger: 'veto_complete' }, { ...plan, holdSeconds: 0 }, { ...plan, graphics: ['../control'] }]) assert.throws(() => normalizePlan(invalid));
});
test('live matching cues open one automatic window, wrong-map cues and repeated cues do not', async () => {
  const obs = new EventEmitter(); let takes = 0; obs.take = async () => { takes++; return { ok: true }; };
  const runner = new ShowRunner({ obsController: obs, logger: { error() {} } });
  runner.loadRundown(normalizeRundown([{ id: 'map', title: 'Map 2', type: 'match', plan }])); runner.start();
  runner.processGepEvent({ type: 'round.phase', phase: 'live', state: { map: { number: 1 } } });
  assert.equal(runner.getState().activeSegment.state, 'armed');
  runner.processGepEvent({ type: 'round.phase', phase: 'live', state: { map: { number: 2 } } });
  assert.equal(runner.getState().activeSegment.state, 'holding'); assert.ok(runner.getState().holdCountdown > 0);
  runner.hold('map'); runner.processGepEvent({ type: 'round.phase', phase: 'live', state: { map: { number: 2 } } });
  await new Promise(resolve => setTimeout(resolve, 1050)); assert.equal(takes, 0);
  assert.equal((await runner.take('map')).ok, true); obs.emit('tally-changed', { program: 'ESA_Gameplay' });
  assert.equal(runner.getState().onAirSegment.id, 'map'); runner.loadRundown([]);
});
test('pause drops live cues and immediate mode still requires an explicit configured cue', async () => {
  const obs = new EventEmitter(); let takes = 0; obs.take = async () => { takes++; return { ok: true }; };
  const runner = new ShowRunner({ obsController: obs, logger: { error() {} } });
  runner.loadRundown(normalizeRundown([{ id: 'result', title: 'Results', type: 'post_show', plan: { ...plan, trigger: 'map_end', mapNumber: null, graphics: ['map-result'], holdMode: 'immediate' } }]));
  runner.start(); runner.techPause(); runner.processGepEvent({ type: 'match.end' }); runner.resume();
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(takes, 0);
  runner.processGepEvent({ type: 'match.end' }); await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(takes, 1);
  obs.emit('tally-changed', { program: 'ESA_Screen_map_result' }); runner.loadRundown([]);
});
