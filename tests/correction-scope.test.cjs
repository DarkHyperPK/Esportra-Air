const test = require('node:test');
const assert = require('node:assert/strict');
const { correctionScope, validateCorrectionScope } = require('../src/correction-scope');
const first = '00000000-0000-4000-8000-000000000061', second = '00000000-0000-4000-8000-000000000062';
test('an open map correction cannot follow another show or pairing even when both use MAIN', () => {
  const opened = correctionScope({ showId: first, selectedMatchId: first, matchCode: 'MAIN' }, first);
  assert.doesNotThrow(() => validateCorrectionScope(opened, { ...opened }));
  assert.throws(() => validateCorrectionScope(opened, { ...opened, showId: second, matchId: second }), /pairing changed/);
  assert.throws(() => validateCorrectionScope(opened, { ...opened, nodeId: second }), /pairing changed/);
  assert.throws(() => validateCorrectionScope(null, opened));
  assert.throws(() => correctionScope({ showId: first, matchCode: 'MAIN' }, first), /select a tournament match/);
});
