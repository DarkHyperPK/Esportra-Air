const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { start } = require('../esportra-valorant-hud/server/server');
async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-hud-product-'));
  const server = await start({ port: 0, key: 'fixture-hud-key', root: path.resolve(__dirname, '../esportra-valorant-hud'), dataDir });
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
