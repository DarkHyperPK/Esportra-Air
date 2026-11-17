// What Esportra sends for a match Air produces (15 Nov), read into Air's own shapes. Pure.
//   POST /api/air/broadcast/matches/{id}/prepare → { id, version, configurationJson } where
//     configurationJson is a JSON *string*: teams[].roster (registered lineup with verified Riot ids),
//     teams[].seriesScore, veto, mapPool, sponsors, casters, bracketSnapshot.
//   GET  /api/air/broadcast/matches/{id}/veto    → { status, bestOf, steps, mapPool } while teams ban and pick.
//   GET  /api/air/broadcast/matches/{id}/bracket → the bracket snapshot on its own.
// Anything malformed is skipped, never thrown: Esportra data only ever adds to a match Air can run without it.

import { DEFAULT_POOL, VALORANT_MAPS, orderOf, validOrder, validVeto, type BracketMatch, type MapName, type StandingsRow, type VetoOrderStep, type VetoStep } from './match-data.ts';

export interface EsportraPlayer {
  /** The name shown on air: the Riot name without its #tag, else the registered name. */
  name: string;
  /** The player's Riot PUUID when Esportra has verified it (seats the player before the game lists them). */
  gameId: string;
}

export interface EsportraSponsor { name: string; logoUrl: string; assetId: string }
export interface EsportraCaster { name: string; role: string }

export interface EsportraPackage {
  packageId: string;
  version: number;
  lineups: [EsportraPlayer[], EsportraPlayer[]];
  series: [number, number];
  /** The veto as Esportra has it so far (Air's map names; unknown maps dropped). */
  veto: RawVetoStep[];
  /** The order this match's veto follows on Esportra (null: unknown). */
  vetoOrder: VetoOrderStep[] | null;
  /** Maps in Esportra's veto that Air does not know (shown as a warning, never on air). */
  unknownMaps: string[];
  mapPool: MapName[];
  sponsors: EsportraSponsor[];
  casters: EsportraCaster[];
  bracket: unknown;
}

export interface RawVetoStep { team: number; action: string; map: MapName; side?: 'ATK' | 'DEF'; sideTeam?: 0 | 1 }
/** Whose turn it is on Esportra; `endsAt` is when the turn's time runs out (ms since epoch), or null. */
export interface VetoTurn { team: 0 | 1; action: 'ban' | 'pick' | 'pick_side'; endsAt: number | null }
export interface VetoToss { pending: boolean; winner: 0 | 1 | null }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Bind", "bind", "BIND" → BIND; maps Air does not know → null. */
export function mapOf(v: unknown): MapName | null {
  const m = str(v, 40).toUpperCase().replace(/\s+/g, '');
  return (VALORANT_MAPS as readonly string[]).includes(m) ? (m as MapName) : null;
}

export function readVetoSteps(input: unknown): RawVetoStep[] {
  const out: RawVetoStep[] = [];
  for (const raw of arr(input).slice(0, 20)) {
    const r = obj(raw);
    const map = mapOf(r.map);
    const action = str(r.action, 10).toLowerCase();
    if (!map || !['ban', 'pick', 'decider'].includes(action)) continue;
    const team = Number(r.team ?? r.pickedByTeam);
    const side = r.side === 'ATK' || r.side === 'DEF' ? r.side : undefined;
    const sideTeam = side && (r.sideTeam === 0 || r.sideTeam === 1) ? r.sideTeam : undefined;
    out.push({ team: team === 0 || team === 1 ? team : -1, action, map, ...(side ? { side } : {}), ...(sideTeam !== undefined ? { sideTeam } : {}) });
  }
  return out;
}

/** Map names in Esportra's veto that Air's catalog does not have. */
export function unknownVetoMaps(input: unknown): string[] {
  return [...new Set(arr(input).map(obj).map((r) => str(r.map, 40)).filter((m) => m && !mapOf(m)))];
}

/** The order Esportra's veto follows, or null when it sends none Air can use. */
export function readOrder(input: unknown): VetoOrderStep[] | null {
  try { return arr(input).length ? validOrder(arr(input).map(obj)) : null; } catch { return null; }
}

/** Whose turn it is on Esportra. The time left is kept as an end time on this PC's clock. */
export function readTurn(input: unknown, now: number): VetoTurn | null {
  const r = obj(input);
  const team = Number(r.team);
  const action = str(r.action, 10);
  if ((team !== 0 && team !== 1) || !['ban', 'pick', 'pick_side'].includes(action)) return null;
  const started = Date.parse(str(r.startedAt, 40));
  const seconds = Number(r.seconds);
  const endsAt = Number.isFinite(started) && seconds > 0 && seconds <= 600 ? Math.min(started + seconds * 1000, now + seconds * 1000) : null;
  return { team, action: action as VetoTurn['action'], endsAt };
}

export function readToss(input: unknown): VetoToss | null {
  if (!input || typeof input !== 'object') return null;
  const r = obj(input);
  const w = Number(r.winner);
  return { pending: r.pending === true, winner: r.winner === null || r.winner === undefined || (w !== 0 && w !== 1) ? null : w };
}

/** Swaps the teams of everything veto-shaped, for a match whose sides in Air are the other way round from Esportra's. */
export function flipVeto<T extends { team: number; sideTeam?: number }>(steps: T[]): T[] {
  return steps.map((v) => ({ ...v, team: v.team === 0 || v.team === 1 ? 1 - v.team : v.team, ...(v.sideTeam === 0 || v.sideTeam === 1 ? { sideTeam: 1 - v.sideTeam } : {}) }));
}

export function readPool(input: unknown): MapName[] {
  return [...new Set(arr(input).map(mapOf).filter((m): m is MapName => m !== null))];
}

/** The lineup that plays: starters (or the registered names of an older registration), up to five. */
export function readLineup(input: unknown): EsportraPlayer[] {
  const rows = arr(input).map(obj);
  const starters = rows.filter((r) => ['starter', 'registered', ''].includes(str(r.role, 20).toLowerCase()));
  return starters.slice(0, 5).map((r) => {
    const riot = str(r.inGameName, 60);
    const name = (riot.split('#')[0] ?? '').trim() || str(r.name, 40);
    return { name: name.slice(0, 40), gameId: str(r.gameId, 100) };
  }).filter((p) => p.name);
}

/** Reads prepare's answer. Throws only when it is not a package at all. */
export function readPackage(input: unknown): EsportraPackage {
  const r = obj(input);
  const packageId = str(r.id ?? r.Id, 40);
  if (!UUID.test(packageId)) throw new Error('Esportra did not return a match package.');
  let config: Record<string, unknown>;
  try {
    const raw = r.configurationJson ?? r.ConfigurationJson;
    config = obj(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    throw new Error('Esportra returned a match package Air cannot read.');
  }
  const teams = arr(config.teams).map(obj);
  const sponsors = arr(config.sponsors).map(obj).map((s) => ({
    name: str(s.name, 40),
    logoUrl: /^https:\/\//i.test(str(s.logoUrl, 500)) ? str(s.logoUrl, 500) : '',
    assetId: UUID.test(str(s.assetId, 40)) ? str(s.assetId, 40) : '',
  })).filter((s) => s.name).slice(0, 20);
  const casters = arr(config.casters).map(obj).map((c) => ({ name: str(c.displayName ?? c.name, 40), role: str(c.role, 40) })).filter((c) => c.name).slice(0, 12);
  return {
    packageId,
    version: Math.max(0, Math.floor(Number(r.version ?? r.Version) || 0)),
    lineups: [readLineup(obj(teams[0]).roster), readLineup(obj(teams[1]).roster)],
    series: [0, 1].map((i) => Math.max(0, Math.min(9, Math.floor(Number(obj(teams[i]).seriesScore) || 0)))) as [number, number],
    veto: readVetoSteps(config.veto),
    vetoOrder: readOrder(config.vetoSequence),
    unknownMaps: unknownVetoMaps(config.veto),
    mapPool: readPool(config.mapPool),
    sponsors,
    casters,
    bracket: config.bracketSnapshot ?? null,
  };
}

/**
 * Esportra's veto as Air's match data, checked against the order it follows (Esportra's own for the match,
 * else the best-of's usual one); null when it does not fit (the producer then enters it in Match data). The pool is Esportra's, with the veto's maps added and,
 * when Esportra's pool is too short to hold a full veto, Air's default maps after it.
 */
export function vetoFrom(steps: RawVetoStep[], bestOf: 1 | 3 | 5, pool: MapName[], order?: VetoOrderStep[] | null): { veto: VetoStep[]; mapPool: MapName[] } | null {
  const need = orderOf(bestOf, order).length;
  const mapPool = [...new Set([...pool, ...steps.map((s) => s.map)])];
  for (const m of DEFAULT_POOL) if (mapPool.length < need && !mapPool.includes(m)) mapPool.push(m);
  for (const m of VALORANT_MAPS) if (mapPool.length < need && !mapPool.includes(m)) mapPool.push(m);
  try {
    return { veto: validVeto(steps, bestOf, mapPool, order), mapPool };
  } catch {
    return null;
  }
}

const signed = (n: unknown) => { const v = Math.round(Number(n) || 0); return v > 0 ? `+${v}` : String(v); };
const teamName = (v: unknown) => { const n = str(obj(v).name, 40); return !n || /^to be decided$/i.test(n) ? 'TBD' : n; };

/**
 * The bracket snapshot as the HUD's standings rows and quarter-final / semi-final / grand final slots.
 * Uses the stage this match is in (else the last one). Rounds that do not fit 4 / 2 / 1 matches are left empty.
 */
export function bracketFrom(snapshot: unknown, matchId: string): { standings: StandingsRow[]; bracket: { qf: BracketMatch[]; sf: BracketMatch[]; gf: BracketMatch[] } } | null {
  const s = obj(snapshot);
  const stages = arr(s.stages).map(obj);
  if (!stages.length) return null;
  const results = new Map(arr(s.matches).map(obj).map((m) => [str(m.matchId, 40), m]));
  const stage = stages.find((st) => arr(st.matches).some((m) => str(obj(m).matchId ?? obj(m).id, 40) === matchId)) ?? stages.at(-1)!;
  const table = (stages.find((st) => st === stage && arr(st.standings).length) ?? stages.find((st) => arr(st.standings).length));
  const standings = arr(table?.standings).map(obj).slice(0, 16).map((row) => [
    str(row.teamName, 40), `${Math.round(Number(row.wins) || 0)}–${Math.round(Number(row.losses) || 0)}`, signed(row.scoreDiff), signed(row.roundDiff),
  ] as StandingsRow).filter((row) => row[0]);
  const elimination = arr(stage.matches).map(obj).filter((m) => ['upper', 'final'].includes(str(m.side, 10)));
  const rounds = [...new Set(elimination.map((m) => Number(m.round) || 0))].sort((a, b) => a - b);
  const slot = (round: number | undefined, max: number): BracketMatch[] => {
    if (round === undefined) return [];
    const list = elimination.filter((m) => (Number(m.round) || 0) === round);
    if (list.length > max) return [];
    return list.map((m) => {
      const r = results.get(str(m.matchId ?? m.id, 40)) ?? {};
      const teams = arr(r.teams);
      const scores = arr(r.scores);
      return [teamName(teams[0]), Math.max(0, Number(scores[0]) || 0), teamName(teams[1]), Math.max(0, Number(scores[1]) || 0)] as BracketMatch;
    });
  };
  const last = rounds.length - 1;
  return { standings, bracket: { gf: slot(rounds[last], 1), sf: slot(rounds[last - 1], 2), qf: slot(rounds[last - 2], 4) } };
}

/** Esportra's role words as Air's talent roles. */
export function talentRole(role: string): 'host' | 'play-by-play' | 'analyst' | 'interviewer' | 'guest' {
  const r = role.toLowerCase();
  if (r.includes('host')) return 'host';
  if (r.includes('analy')) return 'analyst';
  if (r.includes('interview')) return 'interviewer';
  if (r.includes('guest')) return 'guest';
  return 'play-by-play';
}

/** A map result Air has sent (or will send) to Esportra for the organizer to review. */
export interface EsportraResult {
  map: number;
  scores: [number, number];
  /** queued: not yet accepted by Esportra (offline, retried); sent; refused: Esportra said no (see error). */
  state: 'queued' | 'sent' | 'refused';
  /** The organizer's decision, once Esportra has it. */
  status: 'pending' | 'applied' | 'rejected' | null;
  error: string | null;
  proposalId: string;
}

export interface EsportraResultsView {
  /** This account can apply or reject results for the match (organizer, or crew allowed to submit). */
  canReview: boolean;
  items: EsportraResult[];
}

export interface EsportraVetoView {
  /** air: the producer's own veto (Esportra is not followed); esportra: following Esportra. */
  source: 'air' | 'esportra';
  /** Esportra's veto status (not_started, pending, toss_choice_pending, in_progress, completed), or null before the first read. */
  status: string | null;
  /** The match left the Esportra schedule: the veto stays as it is and is no longer followed. */
  gone: boolean;
  /** Maps in Esportra's veto that Air does not know. */
  unknownMaps: string[];
  /** Since when Esportra cannot be reached (ms), or null. */
  unreachableSince: number | null;
  /** Veto steps entered in Air on their way to the match room (two-way veto, 16 Nov). */
  outbox?: VetoOutboxView;
}

/** Air's veto steps for the match room: sent in order, kept while Esportra cannot be reached. */
export interface VetoOutboxView {
  /** Steps still to send. */
  waiting: number;
  /** When the last step reached the match room (ms), or null. */
  sentAt: number | null;
  /** Why sending stopped (Esportra's words), or null. */
  error: string | null;
  /** A step was changed after the match room had it: sending the corrected veto replaces the match room's. */
  rewrite: boolean;
  /** The match room's veto moved on while Air's steps waited: the producer picks which veto stands. */
  conflict: { air: VetoStep[]; esportra: VetoStep[] } | null;
  /** The match room waits for a side on this map before the next step can go. */
  needsSide: MapName | null;
  /** Esportra's coin toss: who won it (Air's team order), and whether the winner has still to choose. */
  toss: { winner: 0 | 1 | null; pending: boolean } | null;
}

