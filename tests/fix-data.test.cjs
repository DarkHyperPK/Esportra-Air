const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const showId = '5e182c34-49f8-40d3-bf6c-88b576c20c45';
function fixture() {
  const calls = [], queued = [];
  const { fixData } = load('fix-data.js', {
    'node-fetch': async (...args) => { calls.push(args); return { ok: true }; },
    './match-context': { buildMapResultPatch: () => ({ score: {} }) },
  });
  const context = { showConfig: { showId }, hudPort: 5300, hudKey: 'fixture-key', offlineQueue: { enqueue: item => queued.push(item) } };
  return { fixData, context, calls, queued };
}
test('invalid numeric and match inputs never touch HUD or queue', async () => {
  for (const input of [null, { mapIndex: 1, teamAScore: NaN, teamBScore: 0 }, { mapIndex: 1, teamAScore: Infinity, teamBScore: 0 }, { mapIndex: 1, teamAScore: -1, teamBScore: 0 }, { mapIndex: 1, teamAScore: 1.5, teamBScore: 0 }, { matchCode: '../health', mapIndex: 1, teamAScore: 1, teamBScore: 0 }]) {
    const { fixData, context, calls, queued } = fixture();
    const result = await fixData(input, context);
    assert.equal(result.ok, false); assert.equal(calls.length, 0); assert.equal(queued.length, 0);
  }
});
test('valid local correction persists original show identity for later delivery', async () => {
  const { fixData, context, queued } = fixture();
  const result = await fixData({ mapIndex: 3, teamAScore: 13, teamBScore: 10 }, context);
  assert.equal(result.ok, true); assert.equal(result.queued, true);
  assert.equal(queued[0].showId, showId);
  assert.match(queued[0].idempotencyKey, /^[0-9a-f-]{36}$/);
});
test('official review queues original match and team identities without granting a bracket write', async () => {
  const { fixData, context, queued, calls } = fixture();
  const matchId = '00000000-0000-4000-8000-000000000061', team1Id = '00000000-0000-4000-8000-000000000062', team2Id = '00000000-0000-4000-8000-000000000063';
  context.showConfig.selectedMatchId = matchId;
  context.showConfig.matches = [{ matchId, bestOf: 3, teams: [{ teamId: team1Id }, { teamId: team2Id }] }];
  const input = { scope: 'air_and_bracket', context: { nodeId: showId }, mapIndex: 1, teamAScore: 13, teamBScore: 7, reason: 'Checked scoreboard' };
  const invalid = await fixData({ ...input, mapIndex: 4 }, context);
  assert.equal(invalid.ok, false); assert.equal(calls.length, 0); assert.equal(queued.length, 0);
  assert.equal((await fixData(input, context)).queued, true);
  assert.equal(queued[0].type, 'ResultProposal'); assert.equal(queued[0].matchId, matchId);
  assert.equal(queued[0].team1Id, team1Id); assert.equal(queued[0].team2Id, team2Id); assert.equal(queued[0].nodeId, showId);
});
