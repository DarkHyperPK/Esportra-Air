'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class PlayerCoverage {
  constructor() { this.players = new Map(); this.roundKey = null; this.roundAt = -Infinity; }
  record(playerId, infos, heartbeat, now) {
    if (typeof playerId !== 'string' || !UUID.test(playerId)) return;
    if (!this.players.has(playerId) && this.players.size >= 64) return;
    const value = this.players.get(playerId) || {};
    for (const { key, value: input } of infos) {
      if (key === 'health' && input !== null && input !== '' && Number.isFinite(Number(input)) && Number(input) >= 0 && Number(input) <= 1000) {
        value.health = Number(input); value.healthAt = now;
      }
      if (key === 'abilities' && input && typeof input === 'object') {
        const abilities = ['C', 'Q', 'E'].map(key => input[key]);
        if (abilities.every(ability => typeof ability === 'boolean' || ability === 'true' || ability === 'false' || (typeof ability === 'number' && Number.isInteger(ability) && ability >= 0 && ability <= 16))) {
          value.availability = abilities.map(ability => ability === true || ability === 'true' || (typeof ability === 'number' && ability > 0));
          value.exactCharges = abilities.every(ability => typeof ability === 'number') ? abilities : null;
          value.abilitiesAt = now;
        }
      }
    }
    if (heartbeat || value.healthAt === now || value.abilitiesAt === now) value.lastSeenAt = now;
    if (value.lastSeenAt !== undefined) this.players.set(playerId, value);
  }
  apply(state, now = Date.now()) {
    const key = `${state.map?.name}:${state.round?.number}`;
    if (this.roundKey !== null && this.roundKey !== key) this.roundAt = now;
    this.roundKey = key;
    for (const player of state.players.flat()) {
      const data = this.players.get(player.puuid);
      if (!data) continue;
      player.hpKnown = data.healthAt !== undefined && data.healthAt >= this.roundAt;
      if (player.hpKnown) player.hp = data.health;
      player.abilitiesKnown = data.abilitiesAt !== undefined && data.abilitiesAt >= this.roundAt;
      if (player.abilitiesKnown) {
        player.abilityAvailability = data.availability; player.abilitiesKnown = true;
        player.chargesKnown = Array.isArray(data.exactCharges);
        if (data.exactCharges) player.charges = data.exactCharges;
      } else { delete player.abilityAvailability; player.chargesKnown = false; }
      player.captureCoverage = { lastSeenAt: data.lastSeenAt, healthAt: data.healthAt ?? null, abilitiesAt: data.abilitiesAt ?? null };
    }
  }
}
module.exports = PlayerCoverage;
