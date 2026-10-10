'use strict';
const fetch = require('node-fetch');
const { buildMapResultPatch } = require('./match-context');

/**
 * Apply an on-air map score correction.
 *
 * 1. Derives a HUD merge patch via buildMapResultPatch.
 * 2. PATCHes the HUD server immediately (best-effort).
 * 3. Enqueues a BroadcastCorrection in the offline-queue for P3 drain to
 *    /api/broadcast/corrections — the backend endpoint does not exist yet.
 *
 * @param {object} correction
 * @param {string} [correction.matchCode='MAIN']
 * @param {number} correction.mapIndex    1-based map index
 * @param {number} correction.teamAScore
 * @param {number} correction.teamBScore
 * @param {string} [correction.reason]
 * @param {object} ctx
 * @param {object} ctx.showConfig     Current ShowConfig (for team / veto context)
 * @param {number} ctx.hudPort
 * @param {string} ctx.hudKey
 * @param {object} [ctx.offlineQueue] OfflineQueue instance
 * @returns {Promise<{ ok: boolean, patch: object|null, queued: boolean, error?: string }>}
 */
async function fixData(correction, { showConfig, hudPort, hudKey, offlineQueue }) {
  const {
    matchCode  = 'MAIN',
    mapIndex,
    teamAScore,
    teamBScore,
    reason     = '',
  } = correction;

  if (typeof mapIndex !== 'number' || !Number.isInteger(mapIndex) || mapIndex < 1) {
    return { ok: false, patch: null, queued: false, error: 'mapIndex must be a positive integer' };
  }
  if (typeof teamAScore !== 'number' || typeof teamBScore !== 'number') {
    return { ok: false, patch: null, queued: false, error: 'scores must be numbers' };
  }

  const patch  = buildMapResultPatch(showConfig || {}, mapIndex, teamAScore, teamBScore);
  let   hudOk  = false;

  try {
    const res = await fetch(`http://127.0.0.1:${hudPort}/api/${matchCode}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': hudKey },
      body:    JSON.stringify(patch),
    });
    hudOk = res.ok;
    if (!hudOk) console.warn('[fix-data] HUD PATCH rejected, status:', res.status);
  } catch (err) {
    console.warn('[fix-data] HUD PATCH error:', err.message);
  }

  let queued = false;
  if (offlineQueue) {
    try {
      offlineQueue.enqueue({
        type:       'BroadcastCorrection',
        matchCode,
        mapIndex,
        teamAScore,
        teamBScore,
        reason,
        patch,
        ts:         Date.now(),
      });
      queued = true;
    } catch (err) {
      console.warn('[fix-data] enqueue error:', err.message);
    }
  }

  return { ok: hudOk, patch, queued };
}

module.exports = { fixData };
