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
export interface LobbyTeam { teamId: string | null; id: string; name: string; tag: string; color: string; logo: string; players: string[] }
export interface LobbyGame { n: number; map: string; startsAt?: string; results?: TeamResult[]; finishedAt?: number }
export interface LobbyCore { teams: LobbyTeam[]; games: LobbyGame[]; scoring: Scoring }

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
}

const placePts = (s: Scoring, place: number) => s.placement[place - 1] ?? 0;
const elimPts = (s: Scoring, elims: number) => Math.min(elims * s.perElim, s.elimCap ?? Infinity);

/** One team's points in one game. */
export function gamePoints(r: TeamResult, s: Scoring) {
  const p = placePts(s, r.place), e = elimPts(s, r.elims);
  return { placementPts: p, elimPts: e, total: p + e };
}

/** Finished games in order (a game counts once it has results). */
const played = (lobby: LobbyCore) => lobby.games.filter((g) => g.results?.length).sort((a, b) => a.n - b.n);

export function standings(lobby: LobbyCore): Standing[] {
  const s = lobby.scoring;
  const by = new Map<string, Standing>(lobby.teams.map((t) => [t.id, { team: t.id, rank: 0, total: 0, placementPts: 0, elims: 0, elimPts: 0, wins: 0, played: 0, bestPlace: null, lastPlace: null, matchPoint: false }]));
  for (const g of played(lobby)) {
    for (const r of g.results!) {
      const row = by.get(r.team); if (!row) continue;
      const pts = gamePoints(r, s);
      row.total += pts.total; row.placementPts += pts.placementPts; row.elimPts += pts.elimPts; row.elims += r.elims;
      row.played++; if (r.place === 1) row.wins++;
      row.bestPlace = row.bestPlace === null ? r.place : Math.min(row.bestPlace, r.place);
      row.lastPlace = r.place;
    }
  }
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
