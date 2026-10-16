'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function correctionScope(config, nodeId) {
  if (![config?.showId, config?.selectedMatchId, nodeId].every(value => UUID.test(value || '')) || !/^[A-Za-z0-9_-]{1,20}$/.test(config?.matchCode || '')) throw new Error('Pair Air and select a tournament match before correcting a map result.');
  return { showId: config.showId, matchId: config.selectedMatchId, matchCode: config.matchCode, nodeId };
}
function validateCorrectionScope(input, expected) {
  if (!input || !Object.keys(expected).every(field => input[field] === expected[field])) throw new Error('The selected match or pairing changed. Reopen the correction before applying it.');
}
module.exports = { correctionScope, validateCorrectionScope };
