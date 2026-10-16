'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class RoundChapters {
  constructor() { this.seen = new Set(); }
  record(event, state, show, captureAt = Date.now()) {
    const type = event.type === 'round.phase' && event.phase === 'live' ? 'RoundStarted' : event.type === 'round.won' ? 'RoundEnded' : null;
    const matchId = show?.selectedMatchId, roundNumber = state.round?.number, mapNumber = state.map?.number || 1;
    if (!type || !UUID.test(matchId || '') || !Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 500 || !Number.isInteger(mapNumber) || mapNumber < 1 || mapNumber > 9) return null;
    const mapKey = String(state.map?.name || `MAP${mapNumber}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || `MAP${mapNumber}`;
    const segmentId = `round:${matchId}:${mapKey}:${roundNumber}`, key = `${show.showId}:${type}:${segmentId}`;
    if (this.seen.has(key)) return null;
    this.seen.add(key); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    return { type, showId: show.showId, actor: 'game-feed', data: { segmentId, segmentName: `${mapKey} · Round ${roundNumber}`, segmentType: 'round', wallClockMs: captureAt } };
  }
}
module.exports = RoundChapters;
