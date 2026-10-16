'use strict';
const { randomUUID } = require('node:crypto');
const DEFAULTS = Object.freeze({ enabled: true, delayMs: 3000, scene: null });
function validatePauseRules(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(DEFAULTS, key))) throw new Error('Choose valid pause settings.');
  const result = { ...DEFAULTS, ...input };
  if (typeof result.enabled !== 'boolean' || !Number.isInteger(result.delayMs) || result.delayMs < 1000 || result.delayMs > 30000) throw new Error('Pause delay must be 1–30 seconds.');
  if (result.scene != null && (typeof result.scene !== 'string' || !result.scene.trim() || result.scene.length > 256 || /[\x00-\x1f\x7f]/.test(result.scene))) throw new Error('Choose an existing OBS scene, or keep the current Program.');
  return result;
}
class PauseRules {
  constructor({ getScope, getObs, patch, record, config = {}, setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout }) {
    this.getScope = getScope; this.getObs = getObs; this.patch = patch; this.record = record;
    this.schedule = schedule; this.cancel = cancel; this.config = validatePauseRules(config);
    this.key = ''; this.timer = null; this.generation = 0; this.notice = ''; this.visible = null;
    this.pending = null; this.onAir = null;
  }
  configure(input) { this.config = validatePauseRules(input); this.key = ''; this.cancel(this.timer); this.generation++; }
  update(state) {
    const scope = this.getScope();
    const kind = state.techPaused && state.pauseSource !== 'obs_disconnected' ? 'technical' : state.timeoutPaused ? 'timeout' : null;
    const key = JSON.stringify([scope?.showId, scope?.matchCode, scope?.nodeId, kind, this.config]);
    if (key === this.key) return;
    this.key = key; this.cancel(this.timer); const generation = ++this.generation; this.pending = null;
    if (this.visible) { void this.patch(this.visible.matchCode, { action: 'clear', id: this.visible.panelId }).catch(() => {}); this.visible = null; }
    if (!scope || !kind || !this.config.enabled) return;
    this.timer = this.schedule(() => { void this.show(scope, kind, generation); }, this.config.delayMs);
  }
  current(scope, generation) { const latest = this.getScope(); return this.generation === generation && latest?.showId === scope.showId && latest?.matchCode === scope.matchCode && latest?.nodeId === scope.nodeId; }
  async show(scope, kind, generation) {
    if (!this.current(scope, generation)) return;
    try {
      const panelId = randomUUID();
      await this.patch(scope.matchCode, { action: 'show', panel: { id: panelId, kind, startedAt: Date.now(), scope: { showId: scope.showId, matchId: scope.matchId } } });
      if (!this.current(scope, generation)) { await this.patch(scope.matchCode, { action: 'clear', id: panelId }); return; }
      this.visible = { ...scope, panelId };
      if (kind === 'technical' && this.config.scene) await this.takePauseScene(scope, generation);
    } catch (_) { this.notice = 'Could not show the pause panel. Check the local HUD.'; }
  }
  async takePauseScene(scope, generation) {
    const obs = this.getObs();
    if (!obs?.getState().connected) { this.notice = 'Pause panel is showing; OBS is disconnected, so Program was left unchanged.'; return; }
    const inspection = await obs.inspect();
    if (!this.current(scope, generation)) return;
    if (!inspection.connected || inspection.inspectionIncomplete || !inspection.scenes.includes(this.config.scene)) { this.notice = 'Pause scene unavailable. Prepare it in OBS; Program was left unchanged.'; return; }
    if (obs.getTally().program === this.config.scene) return;
    this.pending = { scope, scene: this.config.scene, id: 'pause:' + randomUUID(), at: Date.now(), generation };
    const result = await obs.take(this.config.scene, null, { stillAllowed: () => this.current(scope, generation) });
    if (!result.ok) { this.pending = null; this.notice = 'OBS did not take the pause scene. Check Program before retrying.'; }
  }
  tally(tally) {
    if (this.onAir && tally.program !== this.onAir.scene) { this.record(this.event('SegmentDone', this.onAir)); this.onAir = null; }
    const pending = this.pending;
    if (!pending || !this.current(pending.scope, pending.generation)) return;
    if (Date.now() - pending.at > 5000) { this.pending = null; this.notice = 'OBS did not confirm the pause scene. Check Program.'; return; }
    if (tally.program !== pending.scene) return;
    this.pending = null; this.onAir = pending; this.record(this.event('SegmentTake', pending));
  }
  event(type, item) { return { type, showId: item.scope.showId, actor: 'automation', data: { segmentId: item.id, segmentName: 'Technical pause', segmentType: 'custom', scene: item.scene, wallClockMs: Date.now(), actorKind: 'automation', cause: 'trigger' } }; }
  status() { if (this.pending && Date.now() - this.pending.at > 5000) { this.pending = null; this.notice = 'OBS did not confirm the pause scene. Check Program.'; } return { config: this.config, panelVisible: this.visible !== null, notice: this.notice }; }
  stop() { this.cancel(this.timer); this.pending = null; this.generation++; }
}
module.exports = { PauseRules, validatePauseRules, DEFAULTS };
