const test = require('node:test');
const assert = require('node:assert/strict');
const { DisplayFixes } = require('../esportra-valorant-hud/server/display-fixes');
const state = () => ({ airContext: { showId: 'show', matchId: 'match' }, map: { name: 'Haven' }, round: { number: 1 }, teams: [{ name: 'North', tag: 'N', score: 2, side: 'ATK' }, { name: 'South', tag: 'S', score: 1, side: 'DEF' }], players: [[{ id: 'north-1', name: 'Sample player' }, { id: 'north-2', name: 'Sample two' }], [{ id: 'south-1', name: 'Sample player' }]], observed: [1, 0] });
test('on-air scores mask the latest source without changing it, and clear/Undo use current data', () => {
  const source = state(), fixes = new DisplayFixes();
  fixes.change({ action: 'set', field: 'scores', value: [5, 4], until: 'cleared', reason: 'Operator correction' }, source);
  source.teams[0].score = 3;
  assert.equal(fixes.view(source).teams[0].score, 5); assert.equal(source.teams[0].score, 3);
  fixes.change({ action: 'clear', field: 'scores' }, source); assert.equal(fixes.view(source).teams[0].score, 3);
  fixes.change({ action: 'undo' }, source); assert.equal(fixes.view(source).teams[0].score, 5);
  fixes.change({ action: 'undo' }, source); assert.equal(fixes.view(source).teams[0].score, 3);
});
test('next-round locks ignore older recovered packets and cannot be undone into a later round', () => {
  let now = 1000; const source = state(), fixes = new DisplayFixes({ now: () => now });
  fixes.change({ action: 'set', field: 'scores', value: [5, 4], until: 'next_round', reason: 'Bad source score' }, source);
  source.round.number = 2; source.teams[0].score = 4; fixes.sync(source, 900);
  assert.equal(fixes.view(source).teams[0].score, 5);
  now = 1100; fixes.sync(source, now); assert.equal(fixes.view(source).teams[0].score, 4);
  assert.equal(fixes.status(source).canUndo, false); assert.throws(() => fixes.change({ action: 'undo' }, source));
});
test('names/sides persist until clear, focus follows player identity, and another match clears them', () => {
  const source = state(); let saved;
  const fixes = new DisplayFixes({ save: data => { saved = data; } });
  fixes.change({ action: 'set', field: 'names', value: [{ name: 'North display', tag: 'ND' }, { name: 'South display', tag: 'SD' }], until: 'cleared', reason: 'Display spelling' }, source);
  fixes.change({ action: 'set', field: 'sides', value: ['DEF', 'ATK'], until: 'cleared', reason: 'Sides reversed' }, source);
  fixes.change({ action: 'set', field: 'observed', value: [0, 0], until: 'cleared', reason: 'Camera focus' }, source);
  source.players[0].reverse(); assert.deepEqual(fixes.view(source).observed, [0, 1]);
  const restored = new DisplayFixes({ saved }); restored.sync(source);
  assert.equal(restored.view(source).teams[0].name, 'North display'); assert.equal(restored.view(source).teams[0].side, 'DEF');
  source.airContext.matchId = 'another'; restored.sync(source);
  assert.equal(restored.status(source).active.length, 0); assert.equal(restored.view(source).teams[0].name, 'North');
});
test('invalid values and failed writes do not apply; expiry storage errors do not block game data', () => {
  let fail = false, now = 1000; const source = state();
  const fixes = new DisplayFixes({ now: () => now, save: () => { if (fail) throw new Error('Synthetic disk failure'); } });
  assert.throws(() => fixes.change({ action: 'set', field: 'names', value: [{ name: '<script>', tag: 'N' }, { name: 'South', tag: 'S' }], until: 'cleared', reason: 'Invalid' }, source));
  assert.throws(() => fixes.change({ action: 'set', field: 'observed', value: [0, 4], until: 'cleared', reason: 'Missing player' }, source));
  fail = true; assert.throws(() => fixes.change({ action: 'set', field: 'scores', value: [5, 4], until: 'next_round', reason: 'Test' }, source));
  assert.equal(fixes.status(source).active.length, 0); assert.equal(fixes.status(source).canUndo, false);
  fail = false; fixes.change({ action: 'set', field: 'scores', value: [5, 4], until: 'next_round', reason: 'Test' }, source);
  fail = true; now = 1200; source.round.number = 2; assert.doesNotThrow(() => fixes.sync(source, now));
  assert.equal(fixes.view(source).teams[0].score, 2); assert.match(fixes.status(source).storageWarning, /cleared in memory/);
});
test('series and map fixes preserve source values, survive same-round updates and Undo restores source', () => {
  const source = state(), fixes = new DisplayFixes();
  source.teams[0].series = 0; source.teams[1].series = 1; source.series = [{ map: 'ASCENT', score: [9, 13] }];
  fixes.change({ action: 'set', field: 'series', value: [2, 1], until: 'next_round', reason: 'Broadcast wins' }, source);
  fixes.change({ action: 'set', field: 'map_result', value: [{ mapIndex: 1, score: 13 }, { mapIndex: 1, score: 7 }], until: 'next_round', reason: 'Map correction' }, source);
  source.series[0].score = [10, 13]; fixes.sync(source);
  assert.deepEqual(fixes.view(source).series[0].score, [13, 7]); assert.deepEqual(source.series[0].score, [10, 13]);
  assert.equal(fixes.view(source).teams[0].series, 2);
  fixes.change({ action: 'undo' }, source); assert.deepEqual(fixes.view(source).series[0].score, [10, 13]);
  fixes.change({ action: 'undo' }, source); assert.equal(fixes.view(source).teams[0].series, 0);
});
test('player display name follows the received identity without replacing its source Riot name', () => {
  const source = state(), fixes = new DisplayFixes();
  const originalName = source.players[0][0].name;
  fixes.change({ action: 'set', field: 'player_name', value: [0, { index: 0, name: 'Broadcast player' }], until: 'next_round', reason: 'Display name' }, source);
  source.players[0].reverse();
  assert.equal(fixes.view(source).players[0][1].name, 'Broadcast player'); assert.equal(source.players[0][1].name, originalName);
  fixes.change({ action: 'set', field: 'player_name', value: [0, { index: 0, name: 'Second broadcast player' }], until: 'next_round', reason: 'Second display name' }, source);
  assert.equal(fixes.view(source).players[0][1].name, 'Broadcast player'); assert.equal(fixes.view(source).players[0][0].name, 'Second broadcast player');
  fixes.change({ action: 'undo' }, source); assert.equal(fixes.view(source).players[0][1].name, 'Broadcast player');
  fixes.change({ action: 'undo' }, source); assert.equal(fixes.view(source).players[0][1].name, originalName);
});
test('player focus and display-name fixes share the original identity when the feed has no player ID', () => {
  const source = state(), fixes = new DisplayFixes(); delete source.players[0][0].id; source.observed = [1, 0];
  fixes.change({ action: 'set', field: 'player_name', value: [0, { index: 0, name: 'Broadcast name' }], until: 'next_round', reason: 'Name' }, source);
  fixes.change({ action: 'set', field: 'observed', value: [0, 0], until: 'next_round', reason: 'Camera' }, source);
  assert.equal(fixes.view(source).players[0][0].name, 'Broadcast name');
  assert.deepEqual(fixes.view(source).observed, [0, 0]);
});
