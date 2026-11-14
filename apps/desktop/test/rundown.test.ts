import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRundown, hudRow, migrate, presetRows, rundownScreens, sortRows, validPreset, validRow } from '../src/main/autopilot/rundown.ts';
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
  assert.deepEqual(presetRows('empty', 3), [hudRow()], 'Empty is the in-game HUD row only');
  assert.deepEqual(buildRundown(3, presetRows('empty', 3)), [], 'the HUD row is not a step');
  assert.equal(validPreset('empty'), 'empty');
  assert.throws(() => validPreset('wild'), /Standard, Results only, Manual or Empty/);
});

test('a row from the interface is checked against its section and the data Air has', () => {
  const all = ['standings', 'champion', 'casters', 'holding', 'in-game', 'match-intro'];
  const ok: RowInput = { section: 'between', show: 'standings', trigger: 'manual', map: 2, forSeconds: 20, delaySeconds: 12, transition: 'stinger', holdMode: 'window', holdSeconds: 5 };
  const row = validRow(ok, 'r1', 3, all);
  assert.deepEqual([row.section, row.holdMode, row.holdSeconds, row.enabled], ['between', 'manual', 0, true], 'I press Take always waits for the Take');
  assert.throws(() => validRow(ok, 'r1', 3, []), /one of the screens/);
  assert.throws(() => validRow({ ...ok, show: 'Esportra · Gameplay' }, 'r1', 3, ['Esportra · Gameplay']), /does not go in this part/, 'OBS scene names are not screens');
  assert.throws(() => validRow({ ...ok, section: 'pre', show: 'champion' }, 'r1', 3, all), /does not go in this part/, 'no champion before the show');
  assert.throws(() => validRow({ ...ok, section: 'later' as never }, 'r1', 3, all), /Pre-show, Game, Between maps or Post-show/);
  for (const sec of ['pre', 'between', 'post'] as const) assert.equal(validRow({ ...ok, section: sec, show: 'casters' }, 'd', 3, all).section, sec, 'Desk goes in three sections');
  const desk = validRow({ ...ok, section: 'post', show: 'casters', trigger: 'round_live' }, 'd', 3, all);
  assert.deepEqual([desk.trigger, desk.map, desk.holdMode], ['manual', 'every', 'manual'], 'a scene row has no rule: it is switched in OBS');
  assert.throws(() => validRow({ ...ok, trigger: 'spike_planted' as never }, 'r1', 3, all), /when it comes up/, 'spike stays in the HUD');
  assert.throws(() => validRow({ ...ok, map: 4 }, 'r1', 3, all), /map 1 to 3/);
  assert.equal(validRow({ ...ok, section: 'game', show: null, forSeconds: 20 }, 'r2', 3, all).forSeconds, 0, 'back to the game has no time on screen');
});

test('scene rows and the HUD row never become steps; rows run in section order; only the rows go to OBS', () => {
  const all = ['casters', 'holding', 'in-game', 'match-intro', 'champion'];
  const v = (section: RowInput['section'], show: string, id: string) => validRow({ section, show, trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'cut', holdMode: 'manual', holdSeconds: 0 }, id, 1, all);
  const rows = [v('post', 'champion', 'c'), v('pre', 'holding', 'soon'), hudRow(), v('pre', 'match-intro', 'i'), v('between', 'casters', 'desk')];
  assert.deepEqual(sortRows(rows).map((r) => r.id), ['soon', 'i', 'hud', 'desk', 'c']);
  assert.deepEqual(buildRundown(1, rows).map((s) => s.id), ['map1-i', 'map1-c']);
  const obs = rundownScreens(rows);
  for (const id of ['in-game', 'stinger', 'fullscreen', 'holding', 'ticker', 'casters', 'match-intro', 'champion']) assert.ok(obs.has(id), id);
  assert.ok(!obs.has('standings'), 'a screen not in the Rundown is not installed');
  assert.ok(!rundownScreens([hudRow()]).has('ticker'), 'the ticker comes with Starting soon / Break');
});

test('an older save becomes rows: untouched saves get the preset rows, edited ones keep each step on its map', () => {
  assert.deepEqual(migrate({ order: [], edits: {}, preset: 'minimal' } as never, 3), { rows: presetRows('minimal', 3), startedFrom: 'minimal' });
  const m = migrate({ order: ['map1-live', 'intro'], edits: { 'map1-live': { holdSeconds: 12, show: 'cam-grid', forSeconds: 8 }, intro: { mode: 'automatic' } } } as never, 1);
  assert.deepEqual(m.rows.map((r) => r.id).filter((id) => id === 'map1-live' || id === 'intro'), ['intro', 'map1-live'], 'pre-show first');
  const live = m.rows.find((r) => r.id === 'map1-live')!;
  assert.equal(live.section, 'between', 'now showing Player cams, so between maps');
  assert.deepEqual([live.map, live.holdSeconds, live.show, live.forSeconds], [1, 12, 'cam-grid', 8]);
  assert.equal(m.rows.find((r) => r.id === 'champion')!.map, 'series');
  assert.deepEqual(buildRundown(1, m.rows).slice(0, 2).map((s) => s.id), ['intro', 'map1-live'], 'same step ids as before, in show order');
});

test('rows from before sections get their section, the HUD row and the screens that were in My show', () => {
  const old = presetRows('standard', 3).filter((r) => r.id !== 'hud').map(({ section: _s, ...r }) => r);
  const m = migrate({ rows: old, startedFrom: 'standard' } as never, 3, ['standings', 'match-intro']);
  assert.deepEqual(m.rows.map((r) => [r.id, r.section]), [['intro', 'pre'], ['live', 'game'], ['hud', 'game'], ['half', 'between'], ['result', 'between'], ['series', 'between'], ['add-standings', 'between'], ['champion', 'post']]);
  assert.equal(m.rows.find((r) => r.id === 'add-standings')!.trigger, 'manual', 'added from My show as a Take');
  assert.deepEqual(buildRundown(3, m.rows).map((s) => s.id).filter((id) => !id.includes('standings')), buildRundown(3).map((s) => s.id), 'saved progress still matches');
  assert.equal(migrate(m, 3), m, 'a migrated save is left as it is');
});

test('a row can show its graphic over the game; only graphics that have that version keep it', () => {
  const all = ['map-veto', 'champion', 'casters'];
  const base: RowInput = { section: 'pre', show: 'map-veto', trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 };
  assert.equal(validRow({ ...base, style: 'band' }, 'v', 1, all).style, 'band');
  assert.equal(validRow(base, 'v', 1, all).style, 'full', 'full screen unless chosen');
  assert.equal(validRow({ ...base, section: 'post', show: 'champion', style: 'band' }, 'c', 1, all).style, 'full', 'Champion has no over-the-game version');
  assert.throws(() => validRow({ ...base, style: 'sideways' as never }, 'v', 1, all), /full screen or over the game/);
  const steps = buildRundown(1, [validRow({ ...base, style: 'band' }, 'v', 1, all)]);
  assert.equal(steps[0]!.style, 'band', 'autopilot takes it over the game');
});

test('the screens ticked in New match become the rundown, with the starting point’s rules', async () => {
  const { rowsForScreens } = await import('../src/main/autopilot/rundown.ts');
  const rows = rowsForScreens(['holding', 'match-intro', 'map-veto', 'in-game', 'halftime', 'map-result', 'series', 'casters', 'champion'], 'standard', 3);
  assert.deepEqual(rows.map((r) => `${r.section}:${r.show ?? 'game'}`), [
    'pre:match-intro', 'pre:holding', 'pre:map-veto',
    'game:in-game', 'game:game',
    'between:halftime', 'between:map-result', 'between:series', 'between:casters',
    'post:champion',
  ]);
  assert.equal(rows.find((r) => r.show === 'halftime')!.trigger, 'halftime', 'Standard keeps halftime automatic');
  assert.equal(rows.find((r) => r.show === 'map-veto')!.trigger, 'manual', 'a screen Standard has no rule for waits for Take');
  const results = rowsForScreens(['in-game', 'halftime', 'map-result'], 'minimal', 3);
  assert.equal(results.find((r) => r.show === 'halftime')!.trigger, 'manual', 'Results only: only the result comes up by itself');
  assert.equal(results.find((r) => r.show === 'map-result')!.trigger, 'map_end');
  assert.deepEqual(rowsForScreens(['in-game'], 'standard', 1).map((r) => r.show), ['in-game'], 'just the HUD: no Back to the game row');
});

test('a design of your own takes the rule of the screen it stands for', async () => {
  const { rowsForScreens, ruleOf } = await import('../src/main/autopilot/rundown.ts');
  const rows = rowsForScreens(['in-game', 'own:abc'], 'standard', 3, () => 'between', (show) => (show === 'own:abc' ? 'map-result' : null));
  const mine = rows.find((r) => r.show === 'own:abc')!;
  assert.deepEqual([mine.section, mine.trigger, mine.map], ['between', 'map_end', 'every']);
  assert.ok(rows.some((r) => r.show === null), 'back to the game comes with it');
  assert.equal(ruleOf('', 'standard', 3).trigger, 'manual', '"Anything" waits for Take');
  assert.equal(ruleOf('halftime', 'minimal', 3).trigger, 'manual', 'Results only: only the result comes up by itself');
});
