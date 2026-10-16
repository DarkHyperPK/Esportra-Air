const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PlayerSource } = require('../esportra-valorant-hud/capture/overwolf-valorant/player-source');
const Coverage = require('../esportra-valorant-hud/adapters/player-coverage');
const { load } = require('./helpers.cjs');
const id = '5e182c34-49f8-40d3-bf6c-88b576c20c45';

test('health and abilities from the previous round become unknown until refreshed', () => {
  const coverage = new Coverage();
  const state = { map: { name: 'HAVEN' }, round: { number: 1 }, players: [[{ name: 'Player', puuid: id }], []] };
  const data = [{ key: 'health', value: 0 }, { key: 'abilities', value: { C: false, Q: false, E: false } }];
  coverage.record(id, data, false, 1000); coverage.apply(state, 1000);
  assert.equal(state.players[0][0].hpKnown, true);
  state.round.number = 2; coverage.apply(state, 2000);
  assert.equal(state.players[0][0].hpKnown, false); assert.equal(state.players[0][0].abilitiesKnown, false);
  coverage.record(id, [{ key: 'health', value: 100 }], false, 2100); coverage.apply(state, 2100);
  assert.equal(state.players[0][0].hp, 100); assert.equal(state.players[0][0].hpKnown, true);
});
test('player mode detects GEP identity and tags pending health without sending match-wide events', () => {
  const source = new PlayerSource({ role: 'player' });
  assert.deepEqual(source.prepare({ feature: 'me', key: 'health', value: '64' }), []);
  const packets = source.prepare({ info: { me: { player_id: id } }, feature: 'me' });
  assert.equal(packets.length, 2); assert.equal(packets[0].playerId, id);
  assert.equal(packets[0].value, '64');
  assert.deepEqual(source.prepare({ info: { match_info: { match_score: {} } } }), []);
  assert.equal(source.heartbeat().playerId, id);
});
test('player data arriving before roster stays available and availability is not reported as exact charges', () => {
  const coverage = new Coverage();
  coverage.record(id, [{ key: 'health', value: '64' }, { key: 'abilities', value: { C: true, Q: false, E: true, X: false } }], false, 1000);
  const state = { players: [[{ name: 'Player', puuid: id }], []] };
  coverage.apply(state);
  assert.equal(state.players[0][0].hp, 64);
  assert.deepEqual(state.players[0][0].abilityAvailability, [true, false, true]);
  assert.equal(state.players[0][0].chargesKnown, false);
  coverage.record(id, [], true, 4000); coverage.apply(state);
  assert.equal(state.players[0][0].captureCoverage.lastSeenAt, 4000);
});
test('invalid player health and identities cannot overwrite known data', () => {
  const coverage = new Coverage();
  coverage.record('../player', [{ key: 'health', value: 64 }], true, 1000);
  assert.equal(coverage.players.size, 0);
  coverage.record(id, [{ key: 'health', value: 'NaN' }, { key: 'abilities', value: { C: 'bad', Q: false, E: false } }], false, 1000);
  assert.equal(coverage.players.size, 0);
});
test('Air launches player capture using an explicit safe child environment', async () => {
  let options;
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 123; child.exitCode = null;
  const capture = load('broadcast-gep.js', { electron: { app: { isPackaged: false } }, fs: { existsSync: () => true }, child_process: { spawn: (_binary, _args, input) => { options = input; return child; } } });
  assert.equal((await capture.start({ hudKey: 'fixture-key', captureRole: 'player', playerId: id })).ok, true);
  assert.equal(options.env.ESPORTRA_CAPTURE_ROLE, 'player'); assert.equal(options.env.ESPORTRA_PLAYER_ID, id);
  assert.equal(options.env.ESPORTRA_API_URL, ''); assert.equal(capture.getStatus().captureRole, 'player');
});
