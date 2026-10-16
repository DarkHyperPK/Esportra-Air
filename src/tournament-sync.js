'use strict';
const scopeKey = scope => scope ? `${scope.token}:${scope.config.showId}:${scope.config.selectedMatchId}:${scope.config.matchCode}` : null;
function eligibleChoices(current, incoming) {
  if (incoming.showId !== current.showId || incoming.selectedMatchId !== current.selectedMatchId || !Array.isArray(incoming.matches) || incoming.matches.length > 200) throw new Error('Match context changed. Current output is retained.');
  const matches = incoming.matches.filter(match => ['pending', 'scheduled', 'in_progress'].includes(match.status));
  if (matches.some(match => !/^[A-Za-z0-9_-]{1,20}$/.test(match.matchCode))) throw new Error('Invalid match choices. Current output is retained.');
  return { ...current, matches, matchHistory:incoming.matchHistory || current.matchHistory || [] };
}
function mergeMatchContext(current, incoming) {
  if (incoming.showId !== current.showId || incoming.match?.matchId !== current.selectedMatchId || incoming.match?.matchCode !== current.matchCode) throw new Error('Selected match changed. Current output is retained.');
  if (!Array.isArray(incoming.match.teams) || incoming.match.teams.length !== 2) throw new Error('Match teams are incomplete. Current output is retained.');
  const changed = incoming.match.teams.some((team, index) => current.teams?.[index]?.teamId ? current.teams[index].teamId !== team.teamId : current.teams?.[index]?.name !== team.name);
  if (changed) throw new Error('Match participants changed. Stop production and reload its setup before applying the new teams.');
  const config = { ...current, teams: incoming.match.teams, veto: incoming.match.veto || [], seriesTotal: incoming.match.bestOf, scheduledAt: incoming.match.scheduledAt || null };
  for (const field of ['eventLabel', 'tournamentId', 'game', 'casters', 'sponsors', 'mapPool', 'appearance', 'schedule','matchHistory']) if (Object.hasOwn(incoming, field)) config[field] = incoming[field];
  config.matches = Array.isArray(incoming.matches) ? eligibleChoices(current, { ...incoming, selectedMatchId: current.selectedMatchId }).matches : current.matches.map(match => match.matchId === current.selectedMatchId ? incoming.match : match);
  return config;
}
class TournamentSync {
  constructor({ getScope, fetchContext, apply, applyIneligible = async () => {}, now = Date.now, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
    Object.assign(this, { getScope, fetchContext, apply, applyIneligible, now, setIntervalFn, clearIntervalFn });
    this.health = { intervalSeconds: 5, lastSuccessAt: null, error: null };
    this.busy = false; this.generation = 0;
  }
  start() { this.stop(); this.timer = this.setIntervalFn(() => { void this.tick(); }, 5000); this.timer?.unref?.(); void this.tick(); }
  stop() { this.generation++; if (this.timer) this.clearIntervalFn(this.timer); this.timer = null; }
  status() { return { ...this.health }; }
  async tick() {
    const scope = this.getScope();
    if (!scope || this.busy) return;
    const generation = this.generation, key = scopeKey(scope);
    if (this.lastScope !== key) { this.lastScope = key; this.health = { intervalSeconds: 5, lastSuccessAt: null, error: null }; }
    const valid = () => generation === this.generation && key === scopeKey(this.getScope());
    this.busy = true;
    try {
      const incoming = await this.fetchContext(scope);
      if (!valid()) return;
      if (incoming.eligible === false) {
        eligibleChoices(this.getScope().config, incoming);
        if (incoming.match) mergeMatchContext(this.getScope().config, incoming);
        await this.applyIneligible(incoming, valid);
        if (valid()) this.health.error = 'The selected match is no longer eligible. Current output is retained; choose the next match when ready.';
        return;
      }
      // Validate participant identity before any local mutation; no fallback to another match.
      mergeMatchContext(this.getScope().config, incoming);
      await this.apply(incoming, valid);
      if (valid()) this.health = { intervalSeconds: 5, lastSuccessAt: this.now(), error: null };
    } catch (error) { if (valid()) this.health.error = error.message || 'Tournament updates unavailable. Current output is retained.'; }
    finally { this.busy = false; }
  }
}
module.exports = { TournamentSync, mergeMatchContext, eligibleChoices };
