// Map records (approved mock, 15 Nov): when a map ends (or the producer closes it) Air keeps that map's
// final data, so Breakdown, Victory and the post-game graphics can show map 1 while map 2 is live.
// Pure: a record from the room state and what Air counted from the map's kill events, and the whole
// series added up. Only what the game's data really has: K, D, A, first kills and deaths, multi-kills,
// aces, HS% (from kills), rounds won on attack and defence, pistols, plants, defuses, clutches. ADR only
// with player PCs; ACS is not in the game's data.

export interface KillTally {
  /** First deaths, multi-kills (3+ in a round), aces (5 in a round), kills and headshot kills, per player. */
  fd: number; multi: number; aces: number; kills: number; hs: number;
}
/** What Air counted from the map's kill events, by [team][slot]. `partial`: counting began mid-map. */
export interface MapTally { players: [KillTally[], KillTally[]]; partial: boolean }

export interface RecordPlayer {
  name: string; agent: string; gameId: string;
  k: number; d: number; a: number; fk: number;
  /** null when Air did not see the whole map (counting began mid-map). */
  fd: number | null; multi: number | null; aces: number | null; hsPct: number | null;
  /** Only with player PCs; null otherwise. */
  adr: number | null;
}
export interface TeamPerf {
  firstKills: number; multi: number | null; aces: number | null; clutches: number; plants: number; defuses: number;
  /** [won, played] */
  attack: [number, number]; defence: [number, number]; pistols: [number, number];
}
export interface MapRecord {
  map: number;
  name: string;
  score: [number, number];
  /** 0 or 1; -1 when the map was closed without a winner. */
  winner: 0 | 1 | -1;
  teams: [RecordTeam, RecordTeam];
  players: [RecordPlayer[], RecordPlayer[]];
  perf: [TeamPerf, TeamPerf];
  /** from the game, counted by the producer, or closed by hand. */
  how: 'game' | 'producer' | 'closed';
  closedAt: number;
  partial: boolean;
  /** The map's rounds and starting sides, for Map breakdown (absent on records kept before 16 Nov and on the series). */
  rounds?: Array<{ w: 0 | 1; how: string }>;
  firstSide?: ['ATK' | 'DEF', 'ATK' | 'DEF'];
}
export interface RecordTeam { name: string; tag: string; color: string; logo: string }

export const emptyTally = (): KillTally => ({ fd: 0, multi: 0, aces: 0, kills: 0, hs: 0 });
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Team `t`'s side in round `r` (1-based): first half, second half, then overtime alternating (as the parser does). */
export function sideOf(firstSide: unknown, t: 0 | 1, r: number): 'ATK' | 'DEF' {
  const f = Array.isArray(firstSide) && (firstSide[t] === 'ATK' || firstSide[t] === 'DEF') ? firstSide[t] : t === 0 ? 'ATK' : 'DEF';
  const o = f === 'ATK' ? 'DEF' : 'ATK';
  return r <= 12 ? f : r <= 24 ? o : (r - 25) % 2 ? o : f;
}

/** A map's record from the room state as the map ended, and Air's tally of its kill events. */
export function buildRecord(state: any, map: number, scores: [number, number], winner: 0 | 1 | -1, how: MapRecord['how'], tally: MapTally | null, now: number): MapRecord {
  const rounds: Array<{ w: number }> = Array.isArray(state?.rounds) ? state.rounds : [];
  const partial = !tally || tally.partial;
  const teams = [0, 1].map((t) => { const x = state?.teams?.[t] ?? {}; return { name: str(x.name), tag: str(x.tag, 6), color: str(x.color, 20), logo: str(x.logo, 500) }; }) as [RecordTeam, RecordTeam];
  const players = [0, 1].map((t) => (Array.isArray(state?.players?.[t]) ? state.players[t] : []).slice(0, 5).map((p: any, i: number) => {
    const c = tally?.players[t]?.[i];
    return {
      name: str(p?.name), agent: str(p?.agent, 20), gameId: str(p?.puuid ?? p?.gameId, 100),
      k: n(p?.k), d: n(p?.d), a: n(p?.a), fk: n(p?.fk),
      fd: partial || !c ? null : c.fd, multi: partial || !c ? null : c.multi, aces: partial || !c ? null : c.aces,
      hsPct: partial || !c || !c.kills ? null : Math.round((c.hs / c.kills) * 100),
      adr: Number.isFinite(Number(p?.adr)) && p?.adr !== null ? Math.round(Number(p.adr)) : null,
    } as RecordPlayer;
  })) as [RecordPlayer[], RecordPlayer[]];
  const perf = [0, 1].map((t) => {
    const ts = state?.teamStats?.[t] ?? {};
    const won = (pick: (r: number) => boolean) => {
      let w = 0, p = 0;
      rounds.forEach((x, i) => { if (!pick(i + 1)) return; p++; if (x?.w === t) w++; });
      return [w, p] as [number, number];
    };
    const sum = (k: 'multi' | 'aces') => (partial ? null : players[t]!.reduce((a, p) => a + (p[k] ?? 0), 0));
    return {
      firstKills: n(ts.firstKills) || players[t]!.reduce((a, p) => a + p.fk, 0),
      multi: sum('multi'), aces: sum('aces'), clutches: n(ts.clutches), plants: n(ts.plants), defuses: n(ts.defuses),
      attack: won((r) => sideOf(state?.firstSide, t as 0 | 1, r) === 'ATK'),
      defence: won((r) => sideOf(state?.firstSide, t as 0 | 1, r) === 'DEF'),
      pistols: won((r) => r === 1 || r === 13),
    } as TeamPerf;
  }) as [TeamPerf, TeamPerf];
  const fs = state?.firstSide;
  const firstSide = Array.isArray(fs) && ['ATK', 'DEF'].includes(fs[0]) && ['ATK', 'DEF'].includes(fs[1]) ? [fs[0], fs[1]] as ['ATK' | 'DEF', 'ATK' | 'DEF'] : undefined;
  const kept = rounds.slice(0, 60).filter((x) => x?.w === 0 || x?.w === 1).map((x: any) => ({ w: x.w as 0 | 1, how: str(x.how, 10) }));
  return { map, name: str(state?.map?.name, 20), score: scores, winner, teams, players, perf, how, closedAt: now, partial, rounds: kept, ...(firstSide ? { firstSide } : {}) };
}

const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** The whole series so far: each player's numbers added up over the maps (matched by Riot id, else name). */
export function seriesRecord(records: MapRecord[]): MapRecord | null {
  if (!records.length) return null;
  const last = records[records.length - 1]!;
  const wins = [0, 1].map((t) => records.filter((r) => r.winner === t).length) as [number, number];
  const players = [0, 1].map((t) => {
    const out: RecordPlayer[] = [];
    for (const r of records) for (const p of r.players[t]!) {
      const same = out.find((x) => (p.gameId && x.gameId === p.gameId) || (!p.gameId && x.name === p.name));
      if (!same) { out.push({ ...p }); continue; }
      Object.assign(same, {
        k: same.k + p.k, d: same.d + p.d, a: same.a + p.a, fk: same.fk + p.fk,
        fd: add(same.fd, p.fd), multi: add(same.multi, p.multi), aces: add(same.aces, p.aces),
        hsPct: null, adr: null, agent: p.agent || same.agent,
      });
    }
    return out.slice(0, 5);
  }) as [RecordPlayer[], RecordPlayer[]];
  const perf = [0, 1].map((t) => records.map((r) => r.perf[t]!).reduce((a, b) => ({
    firstKills: a.firstKills + b.firstKills, multi: add(a.multi, b.multi), aces: add(a.aces, b.aces), clutches: a.clutches + b.clutches,
    plants: a.plants + b.plants, defuses: a.defuses + b.defuses,
    attack: [a.attack[0] + b.attack[0], a.attack[1] + b.attack[1]], defence: [a.defence[0] + b.defence[0], a.defence[1] + b.defence[1]],
    pistols: [a.pistols[0] + b.pistols[0], a.pistols[1] + b.pistols[1]],
  }))) as [TeamPerf, TeamPerf];
  return { map: 0, name: 'SERIES', score: wins, winner: wins[0] === wins[1] ? -1 : wins[0] > wins[1] ? 0 : 1, teams: last.teams, players, perf, how: last.how, closedAt: last.closedAt, partial: records.some((r) => r.partial) };
}

/** Counts kill events into a map's tally: first deaths, multi-kills, aces and headshots. */
export class MapTallyCounter {
  private round: Array<Array<number>> = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  private firstDone = false;
  tally: MapTally;

  constructor(partial: boolean) {
    this.tally = { players: [Array.from({ length: 5 }, emptyTally), Array.from({ length: 5 }, emptyTally)], partial };
  }

  kill(killer: unknown, victim: unknown, hs: boolean) {
    const at = (x: unknown) => (Array.isArray(x) && (x[0] === 0 || x[0] === 1) && Number.isInteger(x[1]) && x[1] >= 0 && x[1] < 5 ? [x[0] as 0 | 1, x[1] as number] as const : null);
    const k = at(killer), v = at(victim);
    if (v && !this.firstDone) this.tally.players[v[0]][v[1]]!.fd++;
    this.firstDone = true;
    if (!k || (v && v[0] === k[0])) return; // a team kill counts for nobody
    const p = this.tally.players[k[0]][k[1]]!;
    p.kills++;
    if (hs) p.hs++;
    this.round[k[0]]![k[1]]!++;
  }

  /** The round is over: three or more kills is a multi-kill, five an ace. */
  roundEnd() {
    this.round.forEach((team, t) => team.forEach((count, i) => {
      const p = this.tally.players[t as 0 | 1][i]!;
      if (count >= 3) p.multi++;
      if (count >= 5) p.aces++;
    }));
    this.round = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    this.firstDone = false;
  }
}
