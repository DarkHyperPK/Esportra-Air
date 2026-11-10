import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRundown, template, validateEdit, validPreset } from '../src/main/autopilot/rundown.ts';

test('a Bo3 rundown walks intro, then per map: back to the game, halftime, result and series, then the winner', () => {
  const ids = buildRundown(3).map((s) => s.id);
  assert.deepEqual(ids, ['intro', 'map1-live', 'map1-half', 'map1-result', 'map1-series', 'map2-live', 'map2-half', 'map2-result', 'map2-series', 'map3-live', 'map3-half', 'map3-result', 'map3-series', 'champion']);
  assert.equal(buildRundown(1).filter((s) => s.id.endsWith('-series')).length, 0, 'a Bo1 has no series graphic');
  assert.equal(buildRundown(5).filter((s) => s.id.endsWith('-live')).length, 5);
});

test('steps show graphics, never OBS scenes', () => {
  const rundown = buildRundown(3);
  const by = (id: string) => rundown.find((s) => s.id === id)!;
  assert.deepEqual([by('map2-live').show, by('map2-live').trigger, by('map2-live').mode, by('map2-live').transition, by('map2-live').mapNumber], [null, 'round_live', 'automatic', 'cut', 2]);
  assert.deepEqual([by('map1-half').show, by('map1-half').trigger, by('map1-half').forSeconds], ['halftime', 'halftime', 15]);
  assert.deepEqual([by('map1-result').show, by('map1-result').trigger], ['map-result', 'map_end']);
  assert.deepEqual([by('map1-series').show, by('map1-series').trigger, by('map1-series').delaySeconds], ['series', 'delay', 12]);
  for (const id of ['intro', 'champion']) assert.equal(by(id).mode, 'manual', id);
  for (const s of rundown) assert.ok(!('scene' in s) && !('graphic' in s), 'no scene fields');
});

test('presets: minimal keeps results and the return to the game; manual leaves nothing automatic', () => {
  const auto = (preset: 'standard' | 'minimal' | 'manual') => buildRundown(3, { order: [], edits: {}, preset }).filter((s) => s.mode === 'automatic').map((s) => s.id);
  assert.equal(auto('standard').length, 12);
  assert.deepEqual(auto('minimal'), ['map1-live', 'map1-result', 'map2-live', 'map2-result', 'map3-live', 'map3-result']);
  assert.deepEqual(auto('manual'), []);
  assert.equal(validPreset('minimal'), 'minimal');
  assert.throws(() => validPreset('wild'), /Standard, Minimal or Manual/);
});

test('saved edits and order apply; a manual trigger cannot be automatic', () => {
  const rundown = buildRundown(1, { order: ['map1-live', 'intro'], edits: { 'map1-live': { holdSeconds: 12, show: 'cam-grid', forSeconds: 8 }, intro: { mode: 'automatic' } } });
  assert.deepEqual(rundown.slice(0, 2).map((s) => s.id), ['map1-live', 'intro']);
  const live = rundown.find((s) => s.id === 'map1-live')!;
  assert.deepEqual([live.holdSeconds, live.show, live.forSeconds], [12, 'cam-grid', 8]);
  assert.equal(rundown.find((s) => s.id === 'intro')!.mode, 'manual');
});

test('edits from the interface are validated', () => {
  assert.throws(() => validateEdit({ holdSeconds: 99 }), /valid/);
  assert.throws(() => validateEdit({ trigger: 'nonsense' as never }), /valid/);
  assert.throws(() => validateEdit({ show: 'Esportra · Gameplay' }), /valid/, 'OBS scene names are not graphics');
  assert.throws(() => validateEdit({ holdMode: 'window', holdSeconds: 0 }), /1–60/);
  assert.deepEqual(validateEdit({ holdMode: 'manual', transition: 'cut', show: null }), { holdMode: 'manual', transition: 'cut', show: null });
  assert.equal(template(3).length, 14);
});
