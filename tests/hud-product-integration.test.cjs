const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { start } = require('../esportra-valorant-hud/server/server');
async function fixture(t, callbacks = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-hud-product-'));
  const server = await start({ port: 0, key: 'fixture-hud-key', root: path.resolve(__dirname, '../esportra-valorant-hud'), dataDir, ...callbacks });
  t.after(async () => { server.stop(); await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(path.dirname(dataDir), os.tmpdir()); assert.ok(path.basename(dataDir).startsWith('air-hud-product-')); fs.rmSync(dataDir, { recursive: true, force: true }); });
  async function request(route = '', body, key = 'fixture-hud-key') {
    return fetch(`http://127.0.0.1:${server.port}/api/GF1${route}`, { method: body ? (route ? 'POST' : 'PATCH') : 'GET', headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': key }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  return { request, state: async () => (await (await request()).json()).state };
}
const config = { airContext: { showId: 'show-a', matchId: 'match-a' }, event: { name: 'Final' }, teams: [{ name: 'A', tag: 'A', series: 0 }, { name: 'B', tag: 'B', series: 0 }], casters: [{ name: 'Caster' }] };
test('fresh runtime rooms contain clean data rather than sample team scores', async t => {
  const { state } = await fixture(t), current = await state();
  assert.equal(current.teams[0].name, ''); assert.equal(current.teams[0].score, 0); assert.equal(current.killfeed.length, 0);
});
test('map correction bound to an old show cannot alter a new show sharing the same room code', async t => {
  const { request, state } = await fixture(t); await request('/config', config);
  await request('/config', { ...config, airContext: { showId: 'new-show', matchId: 'new-match' } });
  const before = (await state()).series;
  assert.equal((await request('/map-result', { mapIndex: 1, teamAScore: 13, teamBScore: 9, airContext: config.airContext })).status, 409);
  assert.deepEqual((await state()).series, before);
});
test('fresh platform context updates only presentation and series while preserving game state and local overrides', async t => {
  const { request, state } = await fixture(t); await request('/config', config);
  await request('', { teams: [{ name: 'A', score: 12, series: 0 }, { name: 'B', score: 10, series: 0 }], players: [[{ name: 'Live player', hp: 47 }], []], round: { number: 23, phase: 'live' } });
  await request('/display-fixes', { action: 'set', field: 'scores', value: [13, 10], until: 'cleared', reason: 'Synthetic correction' });
  const response = await request('/config', { ...config, sync: true, teams: [{ name: 'A display', color: '#123456', series: 1 }, { name: 'B', series: 0 }], layout: { bannerTheme: 'compact', sponsorRotation: false, sponsorSeconds: 15 }, show: { eventBug: false }, registeredRoster: [[{ name: 'Registered player', role: 'starter' }], []], schedule: [{ a: 'A', b: 'B', time: '16:00' }] });
  assert.equal(response.status, 200); const updated = await state();
  assert.equal(updated.teams[0].series, 1); assert.equal(updated.teams[0].score, 13); assert.equal(updated.teams[0].color, '#123456'); assert.equal(updated.players[0][0].hp, 47); assert.equal(updated.round.number, 23);
  assert.equal(updated.layout.bannerTheme, 'compact'); assert.equal(updated.layout.sponsorRotation, false); assert.equal(updated.show.eventBug, false);
  assert.equal(updated.registeredRoster[0][0].name, 'Registered player'); assert.equal(updated.schedule[0].time, '16:00');
  assert.equal((await request('/config', { ...config, sync: true, airContext: { showId: 'another', matchId: 'another' } })).status, 409);
  assert.equal((await state()).teams[0].name, 'A display');
  await request('/display-fixes', { action: 'clear', field: 'scores' }); assert.equal((await state()).teams[0].score, 12);
});

test('display fixes require private access and mask HTTP output while GEP remains the source of truth', async t => {
  const received = [];
  const { request, state } = await fixture(t, { onGep: (_code, source) => received.push(source.teams.map(team => team.score)) });
  await request('/config', config);
  assert.equal((await request('/display-fixes', undefined, 'wrong-key')).status, 401);
  const fixed = await request('/display-fixes', { action: 'set', field: 'scores', value: [5, 4], until: 'next_round', reason: 'Synthetic correction' });
  assert.equal(fixed.status, 200); assert.equal((await state()).teams[0].score, 5);
  await request('/ingest/valorant', { info: { match_info: { round_number: '2', round_phase: 'combat' } } });
  assert.equal(received.at(-1)[0], 0); assert.equal((await state()).teams[0].score, 0);
  const status = await (await request('/display-fixes')).json(); assert.equal(status.canUndo, false); assert.equal(status.active.length, 0);
});

test('pause panels are scope bound, old clear requests cannot remove a newer panel, and frames show current policy', async t => {
  const { request, state } = await fixture(t); await request('/config', config);
  const panel = id => ({ id, kind: 'technical', startedAt: Date.now(), scope: config.airContext });
  const first = '00000000-0000-4000-8000-000000000061', next = '00000000-0000-4000-8000-000000000062';
  assert.equal((await request('/pause-panel', { action: 'show', panel: panel(first) }, 'wrong-key')).status, 401);
  assert.equal((await request('/pause-panel', { action: 'show', panel: { ...panel(first), scope: { showId: 'another' } } })).status, 409);
  await request('/pause-panel', { action: 'show', panel: panel(first) }); await request('/pause-panel', { action: 'show', panel: panel(next) });
  await request('/pause-panel', { action: 'clear', id: first }); assert.equal((await state()).airPause.id, next);
  await request('/pause-panel', { action: 'clear', id: next }); assert.equal((await state()).airPause, undefined);
});
test('resending configuration preserves live rounds, rosters and series wins', async t => {
  const { request, state } = await fixture(t);
  assert.equal((await request('/config', config)).status, 200);
  await request('', { teams: [{ name: 'A', score: 12, series: 1 }, { name: 'B', score: 9, series: 0 }], players: [[{ name: 'Observer player', kills: 12 }]], round: { number: 22 } });
  await request('/config', { ...config, teams: [{ ...config.teams[0], name: 'A renamed' }, config.teams[1]] });
  const current = await state(); assert.equal(current.teams[0].name, 'A renamed'); assert.equal(current.teams[0].score, 12); assert.equal(current.teams[0].series, 1); assert.equal(current.players[0][0].name, 'Observer player'); assert.equal(current.round.number, 22);
});
test('changing show context clears previous match game state', async t => {
  const { request, state } = await fixture(t);
  await request('/config', config); await request('', { teams: [{ score: 12 }, { score: 10 }] });
  await request('/config', { ...config, airContext: { showId: 'show-b', matchId: 'match-b' } });
  assert.equal((await state()).teams[0].score, 0);
});
test('atomic map corrections preserve other maps and complete team identity', async t => {
  const { request, state } = await fixture(t);
  await request('/config', config); await request('', { series: [{ map: 'Ascent', score: [13, 4], winner: 0 }, { map: 'Haven', pick: 1 }] });
  await request('/map-result', { mapIndex: 2, teamAScore: 8, teamBScore: 13 });
  const current = await state(); assert.deepEqual(current.series[0].score, [13, 4]); assert.equal(current.series[1].pick, 1); assert.deepEqual(current.series[1].score, [8, 13]); assert.equal(current.teams[0].name, 'A');
});
test('configuration and map corrections require the write credential and bounded map input', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/config', config, 'wrong-key')).status, 401);
  assert.equal((await request('/map-result', { mapIndex: 2147483647, teamAScore: 13, teamBScore: 1 })).status, 400);
});
test('authorized GEP ingestion delivers parsed events to production for same-PC and relay consumers', async t => {
  const updates = [];
  const { request } = await fixture(t, { onGep: (code, state, events, features) => updates.push({ code, phase: state.round.phase, events, features }) });
  const packet = { info: { match_info: { round_phase: 'combat', round_number: '2' } } };
  assert.equal((await request('/ingest/valorant', packet, 'wrong-key')).status, 401); assert.equal(updates.length, 0);
  assert.equal((await request('/ingest/valorant', packet)).status, 200);
  assert.equal(updates[0].phase, 'live'); assert.equal(updates[0].events[0].type, 'round.phase');
  assert.deepEqual(updates[0].features, ['round']);
});
test('player-PC data before observer identification merges into the real roster slot', async t => {
  const { request, state } = await fixture(t);
  const playerId = '5e182c34-49f8-40d3-bf6c-88b576c20c45';
  await request('/ingest/valorant', { playerId, info: { me: { health: '64', abilities: { C: true, Q: false, E: true } } }, feature: 'me' });
  await request('/ingest/valorant', { key: 'scoreboard_0', feature: 'match_info', value: JSON.stringify({ player_id: playerId, name: 'Fixture player', alive: true, team: 0, money: 3000 }) });
  const player = (await state()).players[0].find(player => player.puuid === playerId);
  assert.equal(player.hp, 64); assert.equal(player.hpKnown, true);
  assert.deepEqual(player.abilityAvailability, [true, false, true]); assert.equal(player.chargesKnown, false);
});
