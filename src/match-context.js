'use strict';

// Pure module — no I/O, no requires with side effects.
// Migrated and extended from buildHudPatch() in src/main.js (lines 238-254).
//
// buildHudPatch() original shape:
//   { teams: [{ name, tag, color, roster: [{ name, agent }] }],
//     series: { format, currentMap } }
//
// buildShowPatch() replaces it with the richer ShowConfig-aware shape
// (see P0 architecture §4), compatible with PATCH /api/{matchCode}
// (RFC 7386 merge patch, validated by HUD server's state.schema.js).
//
// roster is intentionally omitted from buildShowPatch — agent assignments
// are written by GEP events (ow-electron capture) and must not be
// overwritten by a ShowConfig merge patch.

/**
 * Build a full HUD state merge patch from a ShowConfig object.
 * Called when ShowConfig arrives from BroadcastHub or on OPS_SELECT_MATCH IPC.
 *
 * @param {object} showConfig - ShowConfig shape (P0 architecture §4)
 * @returns {object} RFC 7386 merge patch for PATCH /api/{matchCode}
 */
function buildShowPatch(showConfig) {
  const teams = Array.isArray(showConfig.teams) ? showConfig.teams : [];
  const veto = Array.isArray(showConfig.veto) ? showConfig.veto : [];
  const bracketPosition = showConfig.bracketPosition || null;

  const team0Score = teams.length > 0 && typeof teams[0].seriesScore === 'number'
    ? teams[0].seriesScore : 0;
  const team1Score = teams.length > 1 && typeof teams[1].seriesScore === 'number'
    ? teams[1].seriesScore : 0;
  const mapsPlayed = team0Score + team1Score;

  return {
    event: {
      name: showConfig.eventLabel || '',
      stage: bracketPosition ? (bracketPosition.roundLabel || '') : '',
      bestOf: typeof showConfig.seriesTotal === 'number' ? showConfig.seriesTotal : 1,
    },
    teams: teams.map(t => ({
      name: t.name || '',
      tag: t.tag || t.abbreviation || '',
      ...(t.color ? { color: t.color } : {}),
      ...(t.logoUrl ? { logo: t.logoUrl } : {}),
      series: typeof t.seriesScore === 'number' ? t.seriesScore : 0,
    })),
    veto,
    // Populate series map list only when at least one map has been played.
    series: mapsPlayed > 0 ? _picksToSeriesMaps(veto) : null,
  };
}

/**
 * Build a merge patch for a single map result update.
 * Called when the organizer submits a map score via the production node UI.
 * Replaces the full series array (required by RFC 7386 array semantics).
 *
 * @param {object} showConfig  - Current ShowConfig (for map/team context)
 * @param {number} mapIndex    - 1-based map index within the series
 * @param {number} teamAScore  - Rounds/points won by team A on this map
 * @param {number} teamBScore  - Rounds/points won by team B on this map
 * @returns {object} RFC 7386 merge patch for PATCH /api/{matchCode}
 */
function buildMapResultPatch(showConfig, mapIndex, teamAScore, teamBScore) {
  const teams = Array.isArray(showConfig.teams) ? showConfig.teams : [];
  const veto = Array.isArray(showConfig.veto) ? showConfig.veto : [];

  // Start from the veto-derived baseline (map names only).
  const seriesMaps = _picksToSeriesMaps(veto);

  // Ensure the array is long enough to hold this map index (1-based).
  while (seriesMaps.length < mapIndex) {
    seriesMaps.push({});
  }

  const slotIndex = mapIndex - 1;
  seriesMaps[slotIndex] = {
    map: seriesMaps[slotIndex].map || '',
    score: [teamAScore, teamBScore],
    winner: teamAScore > teamBScore ? 0 : teamBScore > teamAScore ? 1 : -1,
  };

  return {
    // Carry forward current series scores (team wins in the series).
    teams: teams.map(t => ({
      series: typeof t.seriesScore === 'number' ? t.seriesScore : 0,
    })),
    series: seriesMaps,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract picked/decider maps from the veto sequence and return a series array.
 * Each entry has { map: string } — scores are filled in by buildMapResultPatch.
 */
function _picksToSeriesMaps(veto) {
  return veto
    .filter(v => v.action === 'pick' || v.action === 'decider')
    .map(v => ({
      map: v.map || '',
      pick: v.action === 'decider' ? -1 : (typeof v.pickedByTeam === 'number' ? v.pickedByTeam : 0),
      winner: null,
    }));
}

module.exports = { buildShowPatch, buildMapResultPatch };
