'use strict';
// Synthetic fixture. No player identities or captured telemetry.
const BASE = {
  airContext: { simulation: true }, airDiagnostics: { feedPaused: false },
  event: { name: 'REHEARSAL · SAMPLE DATA', stage: 'Practice broadcast', bestOf: 1 },
  teams: [
    { name: 'North', tag: 'NTH', side: 'ATK', color: '#ff6845', score: 0, series: 0 },
    { name: 'South', tag: 'STH', side: 'DEF', color: '#64d4ff', score: 0, series: 0 },
  ],
  round: { number: 1, phase: 'buy', duration: 30 }, map: { name: 'HAVEN', number: 1 },
  spike: { planted: false }, show: { scorebug: true, players: true, lowerThird: false, roundRecap: false },
};
const events = [
  { ts: 0, type: 'round.phase', phase: 'buy', patch: { round: { number: 1, phase: 'buy', duration: 30 } } },
  { ts: 30000, type: 'round.phase', phase: 'live', patch: { round: { phase: 'live', duration: 100 } } },
  { ts: 38000, type: 'kill', killer: [0, 0] },
  { ts: 39000, type: 'kill', killer: [0, 0] },
  { ts: 40000, type: 'kill', killer: [0, 0] },
  { ts: 60000, type: 'spike.planted', patch: { round: { phase: 'planted', duration: 45 }, spike: { planted: true, site: 'A', duration: 45 } } },
  { ts: 90000, type: 'round.won', winner: 0, patch: { round: { phase: 'end' }, spike: { planted: false }, teams: BASE.teams.map((team, i) => ({ ...team, score: i === 0 ? 1 : 0 })) } },
  { ts: 100000, type: 'round.phase', phase: 'buy', patch: { round: { number: 2, phase: 'buy', duration: 30 } } },
  { ts: 130000, type: 'round.phase', phase: 'live', patch: { round: { phase: 'live', duration: 100 } } },
  { ts: 160000, type: 'round.won', winner: 1, patch: { round: { phase: 'end' }, teams: BASE.teams.map(team => ({ ...team, score: 1 })) } },
  { ts: 165000, type: 'rehearsal.end' },
];
function merge(target, patch) { for (const [key, value] of Object.entries(patch || {})) target[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(target[key] || {}, value) : structuredClone(value); return target; }
function snapshot(history, now = Date.now()) {
  const state = structuredClone(BASE);
  for (const event of history) merge(state, event.patch);
  state.round.startedAt = now; state.spike.plantedAt = state.spike.planted ? now : null;
  return state;
}
module.exports = { events, snapshot };
