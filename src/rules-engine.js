"use strict";
const DEFAULT_DURATIONS = Object.freeze({ recapMs: 4000, multiKillMs: 5000, clutchMs: 4800, flawlessMs: 4500, aceMs: 5500 });
function validateDurations(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(DEFAULT_DURATIONS, key))) throw new Error('Unknown graphics duration.');
  const result = { ...DEFAULT_DURATIONS, ...input };
  if (Object.values(result).some(value => !Number.isInteger(value) || value < 1000 || value > 30000)) throw new Error('Every graphics duration must be 1,000–30,000 milliseconds.');
  return result;
}
const DEFAULT_RULES = [
  { name: 'economy', event: 'round.phase', action: async (event, _runner, ctx) => ctx.hudPatch(ctx.matchCode, { show: { economy: 'auto', ...(event.phase === 'buy' ? { roundRecap: false, lowerThird: false } : {}) } }) },
  { name: 'spike_timer', event: 'spike.planted', action: async (_event, _runner, ctx) => ctx.hudPatch(ctx.matchCode, { show: { spikeTimer: true } }) },
  { name: 'round_recap', event: 'round.won', action: async (event, _runner, ctx) => {
    await ctx.hudPatch(ctx.matchCode, { show: { roundRecap: true } });
    ctx.dismiss('recap', ctx.durations.recapMs, { show: { roundRecap: false } });
    const durations = { clutch: ctx.durations.clutchMs, flawless: ctx.durations.flawlessMs, ace: ctx.durations.aceMs, teamace: ctx.durations.aceMs };
    const banner = event.state?.banner;
    if (banner && Object.hasOwn(durations, banner.type)) await ctx.hudPatch(ctx.matchCode, { banner: { hold: durations[banner.type] } });
  } },
  { name: 'multi_kill', event: 'kill', action: async (event, _runner, ctx) => {
    if (!Array.isArray(event.killer)) return;
    const key = `${ctx.matchCode}:${event.state?.round?.number}:${event.killer.join(':')}`;
    const count = (ctx.kills.get(key) || 0) + 1; ctx.kills.set(key, count);
    if (count < 3 || count > 4 || ['ace', 'teamace'].includes(event.state?.banner?.type)) return;
    await ctx.hudPatch(ctx.matchCode, { lowerThird: { kind: 'generic', title: `${count} KILLS`, sub: '', team: event.killer[0], player: event.killer[1] }, show: { lowerThird: true } });
    ctx.dismiss('multi-kill', ctx.durations.multiKillMs, { show: { lowerThird: false } });
  } },
  { name: 'ace', event: 'banner.ace', action: async (_event, _runner, ctx) => ctx.hudPatch(ctx.matchCode, { banner: { hold: ctx.durations.aceMs } }) },
];
class RulesEngine {
  constructor({ hudPatch, logger = console, durations = {}, setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout }) {
    this._hudPatch = hudPatch; this._logger = logger; this._rules = [...DEFAULT_RULES];
    this._durations = validateDurations(durations); this._timers = new Map(); this._kills = new Map();
    this._schedule = schedule; this._cancel = cancel; this._queue = Promise.resolve(); this._generation = 0;
  }
  setDurations(input) { this._durations = validateDurations(input); }
  getDurations() { return { ...this._durations }; }
  loadRules(rules) { this.dispose(); this._rules = rules; }
  dispose() { this._generation += 1; for (const timer of this._timers.values()) this._cancel(timer); this._timers.clear(); this._kills.clear(); }
  processEvent(event, runner, matchCode = 'MAIN') {
    const generation = this._generation;
    this._queue = this._queue.catch(() => {}).then(async () => {
      if (generation !== this._generation) return;
      if (event.type === 'round.phase' && event.phase === 'buy') { this._kills.clear(); for (const timer of this._timers.values()) this._cancel(timer); this._timers.clear(); }
      const ctx = { hudPatch: this._hudPatch, matchCode, durations: this._durations, kills: this._kills, dismiss: (name, ms, patch) => this._dismiss(`${matchCode}:${name}`, ms, matchCode, patch, generation) };
      for (const rule of this._rules) {
        if (rule.event !== event.type || (rule.condition && !rule.condition(event))) continue;
        try { await rule.action(event, runner, ctx); }
        catch (_) { this._logger.error(`[rules-engine] Could not apply ${rule.name}. Check the local HUD.`); }
      }
    });
    return this._queue;
  }
  _dismiss(key, ms, matchCode, patch, generation) {
    this._cancel(this._timers.get(key));
    const timer = this._schedule(async () => {
      if (generation !== this._generation || this._timers.get(key) !== timer) return;
      this._timers.delete(key);
      try { await this._hudPatch(matchCode, patch); } catch (_) { this._logger.error('[rules-engine] Could not dismiss the graphic.'); }
    }, ms);
    this._timers.set(key, timer);
  }
}
module.exports = { RulesEngine, DEFAULT_RULES, DEFAULT_DURATIONS, validateDurations };
