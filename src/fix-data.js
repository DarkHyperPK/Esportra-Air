'use strict';
const crypto = require('crypto');
const fetch = require('node-fetch');
const { buildMapResultPatch } = require('./match-context');

/**
 * Apply an on-air map score correction.
 *
 * 1. Derives a HUD merge patch via buildMapResultPatch.
 * 2. PATCHes the HUD server immediately (best-effort).
 * 3. Queues a correction tied to its original show for the existing typed drain.
 *    Queue acceptance is separate from server delivery or an official result.
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
  if (!correction || typeof correction !== 'object' || Array.isArray(correction)) {
    return { ok: false, patch: null, queued: false, error: 'correction must be an object' };
  }
  const {
    matchCode  = 'MAIN',
    mapIndex,
    teamAScore,
    teamBScore,
    reason     = '',
  } = correction;

  if (!Number.isSafeInteger(mapIndex) || mapIndex < 1 || mapIndex > 9) {
    return { ok: false, patch: null, queued: false, error: 'mapIndex must be an integer from 1 to 9' };
  }
  if (![teamAScore, teamBScore].every(score => Number.isSafeInteger(score) && score >= 0 && score <= 2147483647)) {
    return { ok: false, patch: null, queued: false, error: 'scores must be non-negative integers' };
  }
  if (typeof matchCode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(matchCode)) {
    return { ok: false, patch: null, queued: false, error: 'invalid matchCode' };
  }
  if (typeof reason !== 'string' || reason.length > 500) {
    return { ok: false, patch: null, queued: false, error: 'reason must be a string up to 500 characters' };
  }

  let patch  = buildMapResultPatch(showConfig || {}, mapIndex, teamAScore, teamBScore);
  let   hudOk  = false;

  try {
    const res = await fetch(`http://127.0.0.1:${hudPort}/api/${matchCode}/map-result`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': hudKey },
      body:    JSON.stringify({ mapIndex, teamAScore, teamBScore }),
      timeout: 3000,
    });
    hudOk = res.ok;
    if (hudOk && res.json) patch = (await res.json()).patch || patch;
    if (!hudOk) console.warn('[fix-data] HUD PATCH rejected, status:', res.status);
  } catch (err) {
    console.warn('[fix-data] HUD PATCH error:', err.message);
  }

  let queued = false;
  if (offlineQueue) {
    try {
      offlineQueue.enqueue({
        type:           'BroadcastCorrection',
        showId:         showConfig?.showId || null,
        matchCode,
        mapIndex,
        teamAScore,
        teamBScore,
        reason,
        patch,
        idempotencyKey: crypto.randomUUID(),
        ts:             Date.now(),
      });
      queued = true;
    } catch (err) {
      console.warn('[fix-data] enqueue error:', err.message);
    }
  }

  return { ok: hudOk, patch, queued };
}

module.exports = { fixData };
