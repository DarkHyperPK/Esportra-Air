'use strict';
function normalizeCaptureSettings(input = {}) {
  const role = input.captureRole || 'observer';
  if (!['observer', 'player'].includes(role)) throw new Error('Choose Observer PC or My player PC.');
  if (input.playerId && (typeof input.playerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.playerId))) throw new Error('Player identity must be a valid Riot player ID.');
  return { captureRole: role, playerId: role === 'player' ? input.playerId || '' : '' };
}
module.exports = { normalizeCaptureSettings };
