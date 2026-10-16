'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class PlayerSource {
  constructor({ role = 'observer', playerId = '', now = Date.now } = {}) {
    if (!['observer', 'player'].includes(role) || (playerId && !UUID.test(playerId))) throw new Error('Invalid player capture settings.');
    this.role = role; this.playerId = playerId; this.now = now; this.pending = [];
  }
  prepare(message) {
    if (this.role !== 'player') return [message];
    const me = message?.info?.me;
    const key = message?.feature === 'me' || message?.category === 'me' ? message.key : null;
    const identity = me?.player_id || (key === 'player_id' ? message.data ?? message.value : null);
    if (typeof identity === 'string' && UUID.test(identity)) this.playerId = identity;
    if (!me && !key) return [];
    const packet = { ...message };
    if (!this.playerId) {
      this.pending = this.pending.filter(item => this.now() - item.at < 60000).slice(-99);
      this.pending.push({ at: this.now(), packet }); return [];
    }
    const pending = this.pending.filter(item => this.now() - item.at < 60000); this.pending = [];
    return [...pending.map(item => ({ ...item.packet, playerId: this.playerId })), { ...packet, playerId: this.playerId }];
  }
  heartbeat() { return this.role === 'player' && this.playerId ? { playerId: this.playerId, captureHeartbeat: true } : null; }
  reset() { this.pending = []; this.playerId = ''; }
}
module.exports = { PlayerSource, UUID };
