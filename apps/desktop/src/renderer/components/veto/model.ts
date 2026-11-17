// What the veto panel shows, worked out from the match data (pure, so the panel's parts stay simple).
import type { Match, Snapshot } from '../../../shared/api.ts';
import { deciderSideTeam, firstTeamOf, nextVetoStep, orderOf, orderTeam, seriesMaps, vetoNeedsSide, type MapName, type MatchData, type VetoStep } from '../../../shared/match-data.ts';

export const title = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();
export const other = (t: 0 | 1) => (t === 0 ? 1 : 0) as 0 | 1;

export interface VetoModel {
  m: Match;
  md: MatchData;
  /** The team that acts first. */
  first: 0 | 1;
  next: ReturnType<typeof nextVetoStep>;
  /** Index of the step waiting for its side, or -1. */
  sideAt: number;
  /** The team choosing that side. */
  sideTeam: 0 | 1 | null;
  /** Maps still open in the pool. */
  open: MapName[];
  used: Map<MapName, VetoStep & { index: number }>;
  maps: ReturnType<typeof seriesMaps>;
  order: ReturnType<typeof orderOf>;
  linked: boolean;
}

export function vetoModel(s: Snapshot, md: MatchData): VetoModel {
  const m = s.match!;
  // The team acting first: with Esportra's own order, worked out from it (its teams are relative to who acts first).
  const first = md.vetoOrder?.length ? firstTeamOf(md.veto, md.vetoOrder, md.vetoFirst ?? 0) : (md.veto[0] && md.veto[0].team !== -1 ? md.veto[0].team : md.vetoFirst ?? 0) as 0 | 1;
  const sideAt = vetoNeedsSide(md.veto);
  const waiting = md.veto[sideAt];
  const sideTeam = !waiting ? null : waiting.action === 'decider' ? deciderSideTeam(m.bestOf, first) : other(waiting.team as 0 | 1);
  const used = new Map(md.veto.map((v, index) => [v.map, { ...v, index }]));
  return {
    m, md, first, next: nextVetoStep(md.veto, m.bestOf, md.vetoOrder, md.vetoFirst), sideAt, sideTeam,
    open: md.mapPool.filter((x) => !used.has(x)), used, maps: seriesMaps(md.veto), order: orderOf(m.bestOf, md.vetoOrder),
    linked: !!s.esportraVeto?.outbox,
  };
}

/** The team acting at step i of the order (the match's own order names it; the usual one alternates from the first). */
export function teamAt(v: VetoModel, i: number): 0 | 1 | -1 {
  const o = v.order[i];
  if (!o || o.action === 'decider') return -1;
  return v.md.vetoOrder?.length ? (orderTeam(o.team, v.first) as 0 | 1) : (((v.first + i) % 2) as 0 | 1);
}
