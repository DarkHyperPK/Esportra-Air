// Match data a producer prepares or edits in Air (15 Nov): the map veto and the maps it makes, the
// Starting soon / Break / Ending text, the champion, and the event's standings, ticker and bracket.
// Pure: the checks and how the data becomes the room fields the graphics already read
// (core/hud.js: veto, mapPool, series, map.number, holding, champion, standings, ticker, bracket).

/** The game's maps, as the HUD catalog names them (core/catalog.js; kept equal by test/match-data.test.ts). */
export const VALORANT_MAPS = ['ABYSS', 'ASCENT', 'BIND', 'BREEZE', 'CORRODE', 'FRACTURE', 'HAVEN', 'ICEBOX', 'LOTUS', 'PEARL', 'SPLIT', 'SUMMIT', 'SUNSET'] as const;
export type MapName = (typeof VALORANT_MAPS)[number];

export type VetoAction = 'ban' | 'pick' | 'decider';
export interface VetoStep {
  /** The team that acted (0 or 1); -1 for the decider. */
  team: 0 | 1 | -1;
  action: VetoAction;
  map: MapName;
  /** For a pick or the decider: the side the other team chose to start on. */
  side?: 'ATK' | 'DEF';
  /** The team that chose that side, when known (Esportra records it). */
  sideTeam?: 0 | 1;
}

/** One step of the order a veto follows: Esportra can set a match's own order. */
export interface VetoOrderStep { action: VetoAction; team: 0 | 1 | -1 }

export type HoldingMode = 'auto' | 'starting' | 'brb' | 'ending';
export interface ShowText {
  /** Which Starting soon / Break / Ending text the holding page shows; auto follows the series. */
  mode: HoldingMode;
  message: string;
  /** Countdown to a time of day (epoch ms), or 0 to count down `minutes` from when it shows. */
  target: number;
  minutes: number;
}

export interface MatchData {
  mapPool: MapName[];
  veto: VetoStep[];
  /** The order this match's veto follows, when it is not the best-of's usual one (from Esportra). */
  vetoOrder: VetoOrderStep[] | null;
  /** Where the veto comes from: entered in Air, or followed from Esportra as the teams make it. */
  vetoSource: 'air' | 'esportra';
  /** The team that acts first in the best-of's usual order (chosen, or by coin toss). */
  vetoFirst: 0 | 1;
  show: ShowText;
  /** -1: the series winner; 0 or 1 forces the champion. */
  champion: -1 | 0 | 1;
}

/** One row of the standings table: team, W–L, maps, round difference (as the HUD reads it). */
export type StandingsRow = [string, string, string, string];
/** One bracket match: team A, score A, team B, score B. */
export type BracketMatch = [string, number, string, number];
export interface EventData {
  standings: StandingsRow[];
  ticker: string[];
  bracket: { qf: BracketMatch[]; sf: BracketMatch[]; gf: BracketMatch[] };
  handle: string;
  site: string;
}

/** What a player has done before this match, for Player profile and the pre-match matchup. */
export interface PlayerPrep {
  maps: number | null;
  rating: string;
  kpr: string;
  acs: number | null;
  hs: string;
  clutches: number | null;
  quote: string;
}

export const DEFAULT_POOL: MapName[] = ['ABYSS', 'ASCENT', 'BIND', 'CORRODE', 'HAVEN', 'LOTUS', 'SUNSET'];
export const emptyMatchData = (): MatchData => ({ mapPool: [...DEFAULT_POOL], veto: [], vetoOrder: null, vetoSource: 'air', vetoFirst: 0, show: { mode: 'auto', message: '', target: 0, minutes: 10 }, champion: -1 });
export const emptyEventData = (): EventData => ({ standings: [], ticker: [], bracket: { qf: [], sf: [], gf: [] }, handle: '', site: '' });
export const emptyPrep = (): PlayerPrep => ({ maps: null, rating: '', kpr: '', acs: null, hs: '', clutches: null, quote: '' });

/** The veto's order for a best-of (the same as core/hud.js `vetoSteps`). */
export const VETO_ORDER: Record<1 | 3 | 5, VetoAction[]> = {
  1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
  3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
  5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
};

const text = (v: unknown, max: number, what: string): string => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (s.length > max) throw new Error(`${what} is longer than ${max} characters.`);
  return s;
};
const num = (v: unknown, max: number, what: string): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${what} must be a number from 0 to ${max}.`);
  return Math.round(n * 100) / 100;
};
const mapName = (v: unknown): MapName => {
  const m = String(v ?? '').toUpperCase();
  if (!(VALORANT_MAPS as readonly string[]).includes(m)) throw new Error(`${String(v)} is not a map Air knows.`);
  return m as MapName;
};

/** The order a veto follows: the match's own (from Esportra) or the best-of's usual one. */
export function orderOf(bestOf: 1 | 3 | 5, order?: VetoOrderStep[] | null): VetoOrderStep[] {
  return order?.length ? order : VETO_ORDER[bestOf].map((action) => ({ action, team: action === 'decider' ? -1 : 0 }) as VetoOrderStep);
}

/** Checks a veto order from Esportra: bans, picks and at most one decider, last. */
export function validOrder(input: unknown): VetoOrderStep[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input) || input.length < 1 || input.length > 15) throw new Error('A veto order has 1 to 15 steps.');
  const out = input.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (!['ban', 'pick', 'decider'].includes(String(r.action))) throw new Error('A veto order has bans, picks and a decider.');
    const action = r.action as VetoAction;
    return { action, team: action === 'decider' ? -1 : r.team === 1 ? 1 : 0 } as VetoOrderStep;
  });
  if (out.slice(0, -1).some((o) => o.action === 'decider')) throw new Error('The decider is the last step of a veto.');
  return out;
}

/** Checks a veto against its order (the match's own, else the best-of's): bans and picks in turn, one map once, from the pool. */
export function validVeto(input: unknown, bestOf: 1 | 3 | 5, pool: MapName[], vetoOrder?: VetoOrderStep[] | null): VetoStep[] {
  if (!Array.isArray(input)) throw new Error('The veto must be a list of steps.');
  const order = orderOf(bestOf, vetoOrder).map((o) => o.action);
  if (input.length > order.length) throw new Error(`${vetoOrder?.length ? 'This match\'s' : `A best of ${bestOf}`} veto has ${order.length} steps.`);
  const used = new Set<string>();
  return input.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const action = order[i]!;
    if (r.action !== action) throw new Error(`Step ${i + 1} of ${vetoOrder?.length ? 'this match\'s veto' : `a best of ${bestOf}`} is a ${action}.`);
    const map = mapName(r.map);
    if (!pool.includes(map)) throw new Error(`${map} is not in this match's map pool.`);
    if (used.has(map)) throw new Error(`${map} is already in the veto.`);
    used.add(map);
    const team = action === 'decider' ? -1 : r.team === 0 || r.team === 1 ? r.team : null;
    if (team === null) throw new Error(`Choose which team ${action === 'ban' ? 'banned' : 'picked'} ${map}.`);
    const side = r.side === 'ATK' || r.side === 'DEF' ? r.side : undefined;
    if (side && action === 'ban') throw new Error('A banned map has no side.');
    const sideTeam = side && (r.sideTeam === 0 || r.sideTeam === 1) ? r.sideTeam : undefined;
    return { team, action, map, ...(side ? { side } : {}), ...(sideTeam !== undefined ? { sideTeam } : {}) } as VetoStep;
  });
}

/** The next step of a veto in progress: its action, and the team whose turn it is (as the HUD works it out). */
export function nextVetoStep(veto: VetoStep[], bestOf: 1 | 3 | 5, vetoOrder?: VetoOrderStep[] | null, vetoFirst: 0 | 1 = 0): { action: VetoAction; team: 0 | 1 | -1 } | null {
  const order = orderOf(bestOf, vetoOrder);
  if (veto.length >= order.length) return null;
  const step = order[veto.length]!;
  if (step.action === 'decider') return { action: 'decider', team: -1 };
  if (vetoOrder?.length) return { action: step.action, team: step.team };
  const first = veto[0] && (veto[0].team === 0 || veto[0].team === 1) ? veto[0].team : vetoFirst;
  return { action: step.action, team: (((first + veto.length) % 2) as 0 | 1) };
}

export function validMatchData(input: unknown, bestOf: 1 | 3 | 5): MatchData {
  const r = (input ?? {}) as Record<string, unknown>;
  const pool = Array.isArray(r.mapPool) ? [...new Set(r.mapPool.map(mapName))] : [...DEFAULT_POOL];
  const vetoOrder = validOrder(r.vetoOrder);
  const need = orderOf(bestOf, vetoOrder).length;
  if (pool.length < need) throw new Error(`${vetoOrder ? 'This match\'s' : `A best of ${bestOf}`} veto needs ${need} maps in the pool.`);
  const s = (r.show ?? {}) as Record<string, unknown>;
  const mode = (['auto', 'starting', 'brb', 'ending'] as const).find((m) => m === s.mode) ?? 'auto';
  const target = Number(s.target) || 0;
  if (target < 0) throw new Error('Choose a countdown time.');
  return {
    mapPool: pool,
    veto: validVeto(r.veto ?? [], bestOf, pool, vetoOrder),
    vetoOrder,
    vetoSource: r.vetoSource === 'esportra' ? 'esportra' : 'air',
    vetoFirst: r.vetoFirst === 1 ? 1 : 0,
    show: { mode, message: text(s.message, 120, 'The message'), target, minutes: num(s.minutes, 240, 'The countdown') ?? 10 },
    champion: r.champion === 0 || r.champion === 1 ? r.champion : -1,
  };
}

export function validEventData(input: unknown): EventData {
  const r = (input ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(r.standings) ? r.standings : [];
  if (rows.length > 32) throw new Error('Standings hold up to 32 teams.');
  const standings = rows.map((row, i) => {
    const c = Array.isArray(row) ? row : [];
    return [text(c[0], 40, `Team ${i + 1}`), text(c[1], 12, 'W–L'), text(c[2], 12, 'Maps'), text(c[3], 8, 'Round difference')] as StandingsRow;
  }).filter((row) => row[0]);
  const ticker = (Array.isArray(r.ticker) ? r.ticker : []).map((t, i) => text(t, 160, `Ticker line ${i + 1}`)).filter(Boolean);
  if (ticker.length > 20) throw new Error('The ticker holds up to 20 lines.');
  const b = (r.bracket ?? {}) as Record<string, unknown>;
  const round = (v: unknown, n: number, what: string): BracketMatch[] => (Array.isArray(v) ? v : []).slice(0, n).map((m) => {
    const c = Array.isArray(m) ? m : [];
    return [text(c[0], 40, `${what} team`), num(c[1], 99, `${what} score`) ?? 0, text(c[2], 40, `${what} team`), num(c[3], 99, `${what} score`) ?? 0] as BracketMatch;
  });
  return {
    standings,
    ticker,
    bracket: { qf: round(b.qf, 4, 'Quarter-final'), sf: round(b.sf, 2, 'Semi-final'), gf: round(b.gf, 1, 'Grand final') },
    handle: text(r.handle, 40, 'The handle'),
    site: text(r.site, 60, 'The website'),
  };
}

export function validPrep(input: unknown): PlayerPrep {
  const r = (input ?? {}) as Record<string, unknown>;
  return {
    maps: num(r.maps, 999, 'Maps'), rating: text(r.rating, 8, 'Rating'), kpr: text(r.kpr, 8, 'KPR'), acs: num(r.acs, 999, 'ACS'),
    hs: text(r.hs, 8, 'HS%'), clutches: num(r.clutches, 999, 'Clutches'), quote: text(r.quote, 160, 'The quote'),
  };
}

/** The maps of the series in play order, from the veto: the picks, then the decider. */
export function seriesMaps(veto: VetoStep[]): Array<{ map: MapName; pick: 0 | 1 | -1; side?: 'ATK' | 'DEF' }> {
  return veto.filter((v) => v.action !== 'ban').map((v) => ({ map: v.map, pick: v.team, ...(v.side ? { side: v.side } : {}) }));
}

/** Which holding text shows: the producer's choice, or auto from the series (before, between, after). */
export function holdingMode(mode: HoldingMode, mapsPlayed: number, seriesWon: boolean): Exclude<HoldingMode, 'auto'> {
  if (mode !== 'auto') return mode;
  return seriesWon ? 'ending' : mapsPlayed > 0 ? 'brb' : 'starting';
}

/**
 * The room fields the graphics read, from the match data, the event data and how far the series is.
 * `series` keeps any score and winner the room already has for each map (results come from the game
 * as display fixes, which sit on top and are not affected).
 */
export function roomFields(md: MatchData, ev: EventData, progress: { mapsPlayed: number; seriesWon: boolean }) {
  const maps = seriesMaps(md.veto);
  const fields: Record<string, unknown> = {
    veto: md.veto.map((v) => ({ team: v.team, action: v.action, map: v.map, ...(v.side ? { side: v.side } : {}), ...(v.sideTeam !== undefined ? { sideTeam: v.sideTeam } : {}) })),
    vetoOrder: md.vetoOrder,
    vetoFirst: md.vetoFirst ?? 0,
    mapPool: md.mapPool,
    holding: { mode: holdingMode(md.show.mode, progress.mapsPlayed, progress.seriesWon), message: md.show.message, target: md.show.target, minutes: md.show.minutes },
    champion: { team: md.champion },
    standings: ev.standings,
    ticker: ev.ticker,
    bracket: ev.bracket,
    event: { handle: ev.handle, site: ev.site },
  };
  // A veto followed from Esportra and then reset there leaves no maps: the old ones leave the graphics too.
  if (!maps.length && md.vetoSource === 'esportra') fields.series = [];
  if (maps.length) {
    fields.series = maps.map((m) => ({ map: m.map, pick: m.pick, score: [0, 0], winner: null }));
    const current = Math.min(progress.mapsPlayed + 1, maps.length);
    fields.map = { number: current, name: maps[current - 1]!.map };
  }
  return fields;
}
