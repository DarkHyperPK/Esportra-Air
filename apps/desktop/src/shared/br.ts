// Battle royale (20 Nov): a lobby of teams plays several games; each game gives every team a placement and
// eliminations, and the event's scoring rule turns them into points. Pure: standings, tiebreaks and the
// match-point champion rule (PMGC "Smash", FFWS "Champions Rush") are worked out here and nowhere else.

export type Tiebreak = 'wins' | 'placementPts' | 'elims' | 'lastGame';
export interface Scoring {
  /** Points for 1st, 2nd, …; places past the end score 0. */
  placement: number[];
  perElim: number;
  /** Most elimination points one team can score in one game (Apex-style caps); absent: no cap. */
  elimCap?: number;
  /** Match point: a team at or over this total that then wins a game takes the title. */
  matchPoint?: number;
  tiebreak: Tiebreak[];
}

export const SCORING_PRESETS: Record<'pmgc' | 'ffws', { name: string; scoring: Scoring }> = {
  pmgc: { name: 'PMGC (PUBG MOBILE)', scoring: { placement: [10, 6, 5, 4, 3, 2, 1, 1], perElim: 1, tiebreak: ['wins', 'placementPts', 'elims', 'lastGame'] } },
  ffws: { name: 'FFWS (Free Fire)', scoring: { placement: [12, 9, 8, 7, 6, 5, 4, 3, 2, 1], perElim: 1, tiebreak: ['wins', 'elims', 'lastGame'] } },
};

export interface TeamResult { team: string; place: number; elims: number }
export interface LobbyTeam { teamId: string | null; id: string; name: string; tag: string; color: string; logo: string; players: string[]; /** Each player's Teams/Players photo, '' for none (the graphics draw a grey shadow). */ photos?: string[]; /** PCOB OpenIDs Teams/Players has learned for these players (seat the team at once). */ openIds?: string[] }
/** A match's state (27 Nov): Scheduled → Armed → Live → Finishing → Provisional → Confirmed; Void is the other way out. */
export type MatchState = 'scheduled' | 'armed' | 'live' | 'finishing' | 'provisional' | 'confirmed' | 'void';
/** One go at a match. A remake closes the attempt (kept for the record) and starts the next; only the last counts. */
export interface Attempt { n: number; startedAt: number; endedAt?: number; reason?: 'remake' | 'ended' | 'void'; feed?: import('./br-stats.ts').GameFeed; /** What this attempt had saved when it was remade (kept for the record, never counted). */ results?: TeamResult[] }
/** A change to a confirmed match's results, with why. */
export interface ResultEdit { at: number; reason: string; before: TeamResult[]; after: TeamResult[] }
/** What Air checked in the game's own (verified PCOB) numbers when the match ended; the provisional panel lists them. */
export interface GameChecks {
  /** Lobby teams PCOB still showed with rank 0 when the game ended: their place is typed. */
  unplaced: string[];
  /** Teams whose team kills (getteaminfolist killNum) differ from the sum of their players' killNum. */
  teamKills: Array<{ team: string; teamKills: number; playerKills: number }>;
  /** Players on a team's seat who are not on its roster (counted to the seat, flagged). */
  unknown: Array<{ team: string; name: string; uid: string }>;
  /** Players PCOB reported as disconnected (liveState 6) at the end. */
  disconnected: Array<{ team: string; name: string }>;
}
export interface LobbyGame {
  n: number; map: string; startsAt?: string; results?: TeamResult[]; finishedAt?: number;
  /** Stable id (27 Nov): days and the journal name matches by it, `n` is only the position. */
  id?: string; dayId?: string;
  /** ISO date-time or HH:MM. */
  scheduledAt?: string;
  state?: MatchState;
  attempts?: Attempt[];
  confirmedAt?: number; confirmedBy?: string;
  edits?: ResultEdit[];
  voidReason?: string;
  /** Places and team kills the feed had when the game ended without a place for every team (place null: typed). */
  draft?: Array<{ team: string; place: number | null; elims: number }>;
  checks?: GameChecks;
  /** Where the results came from (24 Nov): the observer feed, or the producer (typed, or an edit of the game's). */
  source?: 'pcob' | 'producer';
  /** The game's own results, kept when the producer edits them. */
  gameResults?: TeamResult[];
  /** What the observer feed gave for this game: every player's final numbers, the kill feed, the circles. */
  feed?: import('./br-stats.ts').GameFeed;
}
/** The day a match belongs to (27 Nov): a broadcast session with its date, doors-open time and matches in run order. */
export interface LobbyDay { id: string; date: string; title: string; opensAt?: string; startedAt?: number; closedAt?: number; matchIds: string[] }
/** Points added or taken away from a team with a reason (a DQ, a late start, a rule breach). */
export interface Adjustment { id: string; team: string; points: number; reason: string; at: number; dayId?: string }
export interface LobbyCore { teams: LobbyTeam[]; games: LobbyGame[]; scoring: Scoring; adjustments?: Adjustment[] }

/** The state of a game; a game from before states existed counts as confirmed once it has results. */
export const gameState = (g: LobbyGame): MatchState => g.state ?? (g.results?.length ? 'confirmed' : 'scheduled');

export interface Standing {
  team: string;
  rank: number;
  total: number;
  placementPts: number;
  elims: number;
  elimPts: number;
  wins: number;
  played: number;
  bestPlace: number | null;
  lastPlace: number | null;
  /** At or over the match-point threshold (always false without one). */
  matchPoint: boolean;
  /** Points added or taken away by the organiser (already in `total`). */
  adjusted: number;
}

const placePts = (s: Scoring, place: number) => s.placement[place - 1] ?? 0;
const elimPts = (s: Scoring, elims: number) => Math.min(elims * s.perElim, s.elimCap ?? Infinity);

/** One team's points in one game. */
export function gamePoints(r: TeamResult, s: Scoring) {
  const p = placePts(s, r.place), e = elimPts(s, r.elims);
  return { placementPts: p, elimPts: e, total: p + e };
}

/** Games that count, in order: confirmed ones (official), plus provisional ones when asked. */
const played = (lobby: LobbyCore, provisional = false) => lobby.games.filter((g) => g.results?.length && (gameState(g) === 'confirmed' || (provisional && gameState(g) === 'provisional'))).sort((a, b) => a.n - b.n);

/** Official standings: confirmed matches and adjustments. `provisional` adds matches saved but not yet confirmed. */
export function standings(lobby: LobbyCore, opts: { provisional?: boolean } = {}): Standing[] {
  const s = lobby.scoring;
  const by = new Map<string, Standing>(lobby.teams.map((t) => [t.id, { team: t.id, rank: 0, total: 0, placementPts: 0, elims: 0, elimPts: 0, wins: 0, played: 0, bestPlace: null, lastPlace: null, matchPoint: false, adjusted: 0 }]));
  for (const g of played(lobby, opts.provisional)) {
    for (const r of g.results!) {
      const row = by.get(r.team); if (!row) continue;
      const pts = gamePoints(r, s);
      row.total += pts.total; row.placementPts += pts.placementPts; row.elimPts += pts.elimPts; row.elims += r.elims;
      row.played++; if (r.place === 1) row.wins++;
      row.bestPlace = row.bestPlace === null ? r.place : Math.min(row.bestPlace, r.place);
      row.lastPlace = r.place;
    }
  }
  for (const a of lobby.adjustments ?? []) { const row = by.get(a.team); if (row) { row.total += a.points; row.adjusted += a.points; } }
  const rows = [...by.values()];
  for (const r of rows) r.matchPoint = s.matchPoint !== undefined && r.total >= s.matchPoint;
  const cmp = (a: Standing, b: Standing) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const t of s.tiebreak) {
      const d = t === 'wins' ? b.wins - a.wins : t === 'placementPts' ? b.placementPts - a.placementPts : t === 'elims' ? b.elims - a.elims
        : (a.lastPlace ?? 99) - (b.lastPlace ?? 99);
      if (d) return d;
    }
    return 0;
  };
  rows.sort(cmp);
  // Teams still level after every tiebreak share a rank.
  rows.forEach((r, i) => { r.rank = i > 0 && cmp(rows[i - 1]!, r) === 0 ? rows[i - 1]!.rank : i + 1; });
  return rows;
}

/** During a game: each team's total so far plus this game's live points (place known once a team is out). */
export function liveTable(lobby: LobbyCore, live: Array<{ team: string; elims: number; place?: number | null }>) {
  const base = new Map(standings(lobby).map((r) => [r.team, r]));
  return live.map((l) => {
    const b = base.get(l.team);
    const now = { placementPts: l.place ? placePts(lobby.scoring, l.place) : 0, elimPts: elimPts(lobby.scoring, l.elims) };
    return { team: l.team, before: b?.total ?? 0, game: now.placementPts + now.elimPts, total: (b?.total ?? 0) + now.placementPts + now.elimPts, matchPoint: !!b?.matchPoint };
  }).sort((a, b) => b.total - a.total);
}

/**
 * The champion under a match-point rule: walking the games in order, the first team that was already at match
 * point when a game began and then wins that game. Null until it happens (or without a threshold).
 */
export function champion(lobby: LobbyCore): { team: string; game: number } | null {
  const s = lobby.scoring;
  if (s.matchPoint === undefined) return null;
  const totals = new Map<string, number>();
  for (const g of played(lobby)) {
    const winner = g.results!.find((r) => r.place === 1);
    if (winner && (totals.get(winner.team) ?? 0) >= s.matchPoint) return { team: winner.team, game: g.n };
    for (const r of g.results!) totals.set(r.team, (totals.get(r.team) ?? 0) + gamePoints(r, s).total);
  }
  return null;
}

// ── checks ──

const int = (v: unknown, lo: number, hi: number, what: string) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what} must be a whole number from ${lo} to ${hi}.`);
  return v;
};

export function validScoring(input: unknown): Scoring {
  const s = input as Record<string, unknown>;
  if (!s || typeof s !== 'object' || !Array.isArray(s.placement) || !s.placement.length || s.placement.length > 32) throw new Error('Give points for at least first place.');
  const placement = s.placement.map((p, i) => int(p, 0, 100, `Points for place ${i + 1}`));
  const out: Scoring = { placement, perElim: int(s.perElim ?? 1, 0, 10, 'Points per elimination'), tiebreak: [] };
  if (s.elimCap !== undefined && s.elimCap !== null) out.elimCap = int(s.elimCap, 0, 100, 'Elimination cap');
  if (s.matchPoint !== undefined && s.matchPoint !== null) out.matchPoint = int(s.matchPoint, 1, 1000, 'Match point');
  const tb = Array.isArray(s.tiebreak) ? s.tiebreak : ['wins', 'placementPts', 'elims', 'lastGame'];
  out.tiebreak = [...new Set(tb.filter((t): t is Tiebreak => ['wins', 'placementPts', 'elims', 'lastGame'].includes(t as string)))];
  return out;
}

/** One game's results: each team at most once, each place used once, from 1 to the number of teams. */
export function validResults(input: unknown, teams: LobbyTeam[]): TeamResult[] {
  if (!Array.isArray(input)) throw new Error('Results are missing.');
  const ids = new Set(teams.map((t) => t.id));
  const seenTeam = new Set<string>(), seenPlace = new Map<number, string>();
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  const out = input.map((x) => {
    const r = x as Record<string, unknown>;
    if (typeof r?.team !== 'string' || !ids.has(r.team)) throw new Error('A result names a team that is not in this lobby.');
    if (seenTeam.has(r.team)) throw new Error(`${name(r.team)} has two results in one game.`);
    seenTeam.add(r.team);
    const place = int(r.place, 1, teams.length, `${name(r.team)}'s place`);
    if (seenPlace.has(place)) throw new Error(`${name(r.team)} and ${name(seenPlace.get(place)!)} are both in place ${place}.`);
    seenPlace.set(place, r.team);
    return { team: r.team, place, elims: int(r.elims ?? 0, 0, 99, `${name(r.team)}'s eliminations`) };
  });
  return out.sort((a, b) => a.place - b.place);
}
