import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRundown, template, validateEdit } from '../src/main/autopilot/rundown.ts';

test('a Bo3 rundown walks intro, three maps with results and breaks, then the series', () => {
  const ids = buildRundown(3).map((s) => s.id);
  assert.deepEqual(ids, ['starting-soon', 'intro', 'map1-live', 'map1-result', 'break1', 'map2-live', 'map2-result', 'break2', 'map3-live', 'map3-result', 'series', 'casters', 'ending']);
  assert.equal(buildRundown(1).filter((s) => s.id.startsWith('break')).length, 0);
  assert.equal(buildRundown(5).filter((s) => s.id.endsWith('-live')).length, 5);
});

test('map segments are automatic with a window; the desk and series stay manual', () => {
  const rundown = buildRundown(3);
  const live = rundown.find((s) => s.id === 'map2-live')!;
  assert.deepEqual([live.mode, live.trigger, live.holdMode, live.holdSeconds, live.mapNumber, live.transition], ['automatic', 'round_live', 'window', 5, 2, 'stinger']);
  for (const id of ['series', 'casters', 'starting-soon', 'break1']) assert.equal(rundown.find((s) => s.id === id)!.mode, 'manual', id);
  assert.equal(rundown.find((s) => s.id === 'map1-result')!.graphic, 'map-result');
});

test('saved edits and order apply; a manual trigger cannot be automatic', () => {
  const rundown = buildRundown(1, { order: ['intro', 'starting-soon'], edits: { 'map1-live': { holdSeconds: 12, scene: 'My Gameplay' }, intro: { mode: 'automatic' } } });
  assert.deepEqual(rundown.slice(0, 2).map((s) => s.id), ['intro', 'starting-soon']);
  const live = rundown.find((s) => s.id === 'map1-live')!;
  assert.deepEqual([live.holdSeconds, live.scene], [12, 'My Gameplay']);
  assert.equal(rundown.find((s) => s.id === 'intro')!.mode, 'manual');
});

test('edits from the interface are validated', () => {
  assert.throws(() => validateEdit({ holdSeconds: 99 }), /valid/);
  assert.throws(() => validateEdit({ trigger: 'nonsense' as never }), /valid/);
  assert.throws(() => validateEdit({ holdMode: 'window', holdSeconds: 0 }), /1–60/);
  assert.deepEqual(validateEdit({ holdMode: 'manual', transition: 'cut' }), { holdMode: 'manual', transition: 'cut' });
  assert.equal(template(3).length, 13);
});
