import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRundown, migrate, presetRows, validPreset, validRow } from '../src/main/autopilot/rundown.ts';
import type { RowInput } from '../src/shared/autopilot.ts';

test('Standard show: intro on map 1, then on every map back to the game, halftime, result and series, then the champion after the series', () => {
  const ids = buildRundown(3).map((s) => s.id);
  assert.deepEqual(ids, ['intro', 'map1-live', 'map1-half', 'map1-result', 'map1-series', 'map2-live', 'map2-half', 'map2-result', 'map2-series', 'map3-live', 'map3-half', 'map3-result', 'map3-series', 'champion'], 'the same ids as before rows, so saved progress still matches');
  assert.equal(buildRundown(1).filter((s) => s.id.endsWith('-series')).length, 0, 'a Bo1 has no series graphic');
  assert.equal(buildRundown(5).filter((s) => s.id.endsWith('-live')).length, 5);
  const champion = buildRundown(3).at(-1)!;
  assert.deepEqual([champion.afterSeries, champion.mapNumber, champion.mode], [true, null, 'manual']);
  assert.equal(buildRundown(3).find((s) => s.id === 'map2-half')!.name, 'Map 2 · Halftime');
  assert.equal(buildRundown(1).find((s) => s.id === 'map1-half')!.name, 'Halftime', 'a Bo1 needs no map number');
});

test('a row on one map runs only there; a switched-off row is left out', () => {
  const rows = [...presetRows('empty', 3), { ...presetRows('standard', 3)[2]!, id: 'x', map: 2 as const }, { ...presetRows('standard', 3)[3]!, id: 'off', enabled: false }];
  const steps = buildRundown(3, rows);
  assert.deepEqual(steps.map((s) => [s.id, s.mapNumber]), [['x', 2]]);
});

test('starting points: Results only keeps the result and the return to the game; Manual and Empty take nothing by themselves', () => {
  const auto = (p: 'standard' | 'minimal' | 'manual' | 'empty') => buildRundown(3, presetRows(p, 3)).filter((s) => s.mode === 'automatic').map((s) => s.id);
  assert.equal(auto('standard').length, 12);
  assert.deepEqual(auto('minimal'), ['map1-live', 'map1-result', 'map2-live', 'map2-result', 'map3-live', 'map3-result']);
  assert.deepEqual(auto('manual'), []);
  assert.deepEqual(presetRows('empty', 3), []);
  assert.equal(validPreset('empty'), 'empty');
  assert.throws(() => validPreset('wild'), /Standard, Results only, Manual or Empty/);
});

test('a row from the interface is checked against My show and the data Air has', () => {
  const ok: RowInput = { show: 'standings', trigger: 'manual', map: 2, forSeconds: 20, delaySeconds: 12, transition: 'stinger', holdMode: 'window', holdSeconds: 5 };
  const row = validRow(ok, 'r1', 3, ['standings']);
  assert.deepEqual([row.holdMode, row.holdSeconds, row.enabled], ['manual', 0, true], 'I press Take always waits for the Take');
  assert.throws(() => validRow(ok, 'r1', 3, []), /in My show/);
  assert.throws(() => validRow({ ...ok, show: 'Esportra · Gameplay' }, 'r1', 3, ['Esportra · Gameplay']), /in My show/, 'OBS scene names are not screens');
  assert.throws(() => validRow({ ...ok, trigger: 'spike_planted' as never }, 'r1', 3, ['standings']), /when it comes up/, 'spike stays in the HUD');
  assert.throws(() => validRow({ ...ok, map: 4 }, 'r1', 3, ['standings']), /map 1 to 3/);
  assert.equal(validRow({ ...ok, show: null, forSeconds: 20 }, 'r2', 3, []).forSeconds, 0, 'back to the game has no time on screen');
});

test('an older save becomes rows: untouched saves get the preset rows, edited ones keep each step on its map', () => {
  assert.deepEqual(migrate({ order: [], edits: {}, preset: 'minimal' } as never, 3), { rows: presetRows('minimal', 3), startedFrom: 'minimal' });
  const m = migrate({ order: ['map1-live', 'intro'], edits: { 'map1-live': { holdSeconds: 12, show: 'cam-grid', forSeconds: 8 }, intro: { mode: 'automatic' } } } as never, 1);
  assert.deepEqual(m.rows.slice(0, 2).map((r) => r.id), ['map1-live', 'intro']);
  const live = m.rows[0]!;
  assert.deepEqual([live.map, live.holdSeconds, live.show, live.forSeconds], [1, 12, 'cam-grid', 8]);
  assert.equal(m.rows.find((r) => r.id === 'champion')!.map, 'series');
  assert.deepEqual(buildRundown(1, m.rows).slice(0, 2).map((s) => s.id), ['map1-live', 'intro'], 'same step ids as before');
});
