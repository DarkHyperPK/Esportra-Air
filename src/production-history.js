'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = { cmd_hold: 'hold', cmd_skip: 'skip', cmd_take: 'take_requested', manual_scene_take: 'manual_take', cmd_resume: 'resume', cmd_tech_pause: 'technical_pause', cmd_timeout_started: 'timeout_started', cmd_timeout_ended: 'timeout_ended', fix_data: 'data_fixed' };
const ACTORS = new Set(['operator', 'automation', 'observer', 'game-feed', 'system']);
function actionMetadata(entry) {
  const action = entry.type === 'fix_data' && entry.data?.onAirApplied === false ? 'data_fix_queued' : ACTIONS[entry.type];
  if (!action || !UUID.test(entry.showId || '')) return null;
  return { type: 'ProductionAction', showId: entry.showId, data: { action, actorKind: ACTORS.has(entry.actor) ? entry.actor : 'operator', cause: 'manual', wallClockMs: entry.ts } };
}
class HistoryWindow {
  constructor({ now = Date.now, limit = 10000 } = {}) { this.now = now; this.limit = limit; this.items = []; this.truncated = false; this.lastPruneAt = null; }
  append(entry) {
    if (!entry || !Number.isFinite(entry.ts) || typeof entry.type !== 'string') return;
    const now = this.now(); if (entry.ts < now - 3600000 || entry.ts > now + 5000) return;
    this.items.push(entry); this.prune();
    if (this.items.length > this.limit) { this.truncated = true; this.items = this.items.slice(-this.limit); }
  }
  prune(force = false) { const now = this.now(); if (!force && this.lastPruneAt !== null && now - this.lastPruneAt < 1000) return; this.lastPruneAt = now; this.items = this.items.filter(entry => entry.ts >= now - 3600000 && entry.ts <= now + 5000); }
  snapshot(showId) { this.prune(true); return { since: this.now() - 3600000, until: this.now(), truncated: this.truncated, items: this.items.filter(entry => entry.showId === showId) }; }
}
class IncidentTracker {
  constructor({ record, now = Date.now }) { this.record = record; this.now = now; this.states = new Map(); }
  update(kind, active, showId, { actorKind = 'system', cause = 'connection', outputId = null } = {}) {
    if (!UUID.test(showId || '')) return;
    const key = `${showId}:${kind}:${outputId || ''}`, previous = this.states.get(key);
    this.states.set(key, active); if (this.states.size > 500) this.states.delete(this.states.keys().next().value);
    if (previous === active || previous === undefined && !active) return;
    this.record({ type: 'ProductionIncident', showId, actor: actorKind, data: { kind, status: active ? 'opened' : 'resolved', actorKind, cause, wallClockMs: this.now(), ...(outputId ? { outputId } : {}) } });
  }
}
module.exports = { HistoryWindow, IncidentTracker, actionMetadata };
