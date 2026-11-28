// The run sheet (27 Nov): days of matches, a match's state, what is official and what is provisional, the checks
// before Confirm, and the day summary. Pure; src/main/br-run.ts does the work with it.
//
// The producer's rule is "verified PCOB data only, assume nothing", so every check below reads a field the PCOB
// document defines (rank, killNum per player and per team, liveState, uID/openId, teamId) and nothing is guessed:
//  · each place used once;
//  · a team's kills (getteaminfolist killNum) equal the sum of its players' killNum;
//  · a team PCOB still ranks 0 when the game ends is marked "typed by the producer";
//  · a player not on a team's roster is counted to the team's seat (their teamId) and flagged;
//  · a player with liveState 6 is shown as disconnected.
import type { Lobby } from './api.ts';
import { gameState, standings, validResults, type Adjustment, type GameChecks, type LobbyDay, type LobbyGame, type LobbyTeam, type MatchState, type Standing, type TeamResult } from './br.ts';
import { playerTotals } from './br-stats.ts';
import type { PcobPlayer, PcobTeamList } from './pcob.ts';

export const STATE_LABEL: Record<MatchState, string> = {
  scheduled: 'Scheduled', armed: 'Armed', live: 'Live', finishing: 'Finishing', provisional: 'Provisional', confirmed: 'Confirmed', void: 'Void',
};
/** What each state means, in the words the run sheet shows. */
export const STATE_WHAT: Record<MatchState, string> = {
  scheduled: 'On the run sheet, not armed yet.',
  armed: 'Air will save game data into this match, and only this one.',
  live: 'The game is being read now.',
  finishing: 'A winner is known; Air is waiting for the end-of-game numbers.',
  provisional: 'Saved from the game, not yet confirmed. Shown marked on standings.',
  confirmed: 'Locked. Counts in the official standings.',
  void: 'Cancelled on purpose. Not counted, and the day can still close.',
};

export const ymd = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const uuid = () => globalThis.crypto.randomUUID();

/** A lobby with days, match ids and states. Older lobbies become one day with every match; matches with results are confirmed. */
export function normalizeLobby(l: Lobby): Lobby {
  const listed = (l.days ?? []).flatMap((d) => d.matchIds);
  const ok = l.days?.length && listed.length === l.games.length && l.games.every((g) => g.id && g.state && g.dayId && listed.includes(g.id) && l.days!.some((d) => d.id === g.dayId && d.matchIds.includes(g.id!)));
  if (ok && l.adjustments) return l;
  const days: LobbyDay[] = (l.days ?? []).map((d) => ({ ...d, matchIds: [...d.matchIds] }));
  if (!days.length) days.push({ id: uuid(), date: ymd(l.createdAt || Date.now()), title: 'Day 1', matchIds: [] });
  const games = l.games.map((g): LobbyGame => {
    const id = g.id ?? uuid();
    const dayId = g.dayId && days.some((d) => d.id === g.dayId) ? g.dayId : days.at(-1)!.id;
    const time = g.scheduledAt ?? (g.startsAt && /^\d{1,2}:\d{2}$/.test(g.startsAt.trim()) ? g.startsAt.trim() : undefined);
    return { ...g, id, dayId, state: g.state ?? gameState(g), attempts: g.attempts ?? [], ...(time ? { scheduledAt: time } : {}) };
  });
  const ids = new Set(games.map((g) => g.id!));
  for (const d of days) d.matchIds = d.matchIds.filter((id) => ids.has(id) && games.find((g) => g.id === id)!.dayId === d.id);
  for (const g of games) { const d = days.find((x) => x.id === g.dayId)!; if (!d.matchIds.includes(g.id!)) d.matchIds.push(g.id!); }
  return { ...l, games, days, adjustments: l.adjustments ?? [] };
}

export const gameById = (l: Lobby, id: string) => l.games.find((g) => g.id === id);
export const gameByN = (l: Lobby, n: number) => l.games.find((g) => g.n === n);
const where = (l: Lobby, states: MatchState[]) => l.games.find((g) => states.includes(gameState(g))) ?? null;
/** The match being read now (live, or waiting for its end-of-game numbers). */
export const liveMatch = (l: Lobby) => where(l, ['live', 'finishing']);
export const armedMatch = (l: Lobby) => where(l, ['armed']);
/** The match Air saves into: the live one, else the armed one. */
export const targetMatch = (l: Lobby) => liveMatch(l) ?? armedMatch(l);
/** The match the graphics call current: the one being played or armed, else the next scheduled. */
export const currentMatch = (l: Lobby) => targetMatch(l) ?? where(l, ['scheduled']);
export const matchesOfDay = (l: Lobby, day: LobbyDay) => day.matchIds.map((id) => gameById(l, id)).filter((g): g is LobbyGame => !!g);
export const dayOf = (l: Lobby, g: LobbyGame) => l.days?.find((d) => d.id === g.dayId) ?? null;
/** The next scheduled match of the same day, in run order (the one auto-armed after Confirm). */
export function nextOfDay(l: Lobby, g: LobbyGame): LobbyGame | null {
  const day = dayOf(l, g);
  if (!day) return null;
  const list = matchesOfDay(l, day), at = list.findIndex((x) => x.id === g.id);
  return list.slice(at + 1).find((x) => gameState(x) === 'scheduled') ?? null;
}
export const isBusy = (l: Lobby) => !!liveMatch(l);
export const matchTitle = (g: LobbyGame) => `Match ${g.n}`;

// ── results ──

/** Why a match cannot be confirmed yet; empty means it can. */
export function confirmProblems(l: Lobby, g: LobbyGame): string[] {
  const state = gameState(g);
  if (state === 'confirmed') return [`${matchTitle(g)} is already confirmed.`];
  if (state !== 'provisional') return [`${matchTitle(g)} is ${STATE_LABEL[state].toLowerCase()}; only a provisional match can be confirmed.`];
  if (!g.results?.length) return ['Type the missing places first.'];
  try { validResults(g.results, l.teams); } catch (e) { return [e instanceof Error ? e.message : String(e)]; }
  const missing = l.teams.filter((t) => !g.results!.some((r) => r.team === t.id));
  if (missing.length) return [`${missing.map((t) => t.name).join(', ')} ${missing.length === 1 ? 'has' : 'have'} no place yet.`];
  return [];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** What Air checks in the game's own numbers when a match ends (verified PCOB fields only). */
export function gameChecks(players: PcobPlayer[], teams: PcobTeamList, seats: Map<number, string>, lobbyTeams: LobbyTeam[], lastStanding: string | null = null): GameChecks {
  const out: GameChecks = { unplaced: [], teamKills: [], unknown: [], disconnected: [], ...(lastStanding ? { lastStanding: [lastStanding] } : {}) };
  for (const [pcobId, team] of seats) {
    const mine = players.filter((p) => p.teamId === pcobId);
    if (!Math.max(0, ...mine.map((p) => p.rank)) && team !== lastStanding) out.unplaced.push(team);
    const t = teams.teams.find((x) => x.teamId === pcobId);
    const sum = mine.reduce((n, p) => n + p.kills, 0);
    if (t && t.kills !== sum) out.teamKills.push({ team, teamKills: t.kills, playerKills: sum });
    const lt = lobbyTeams.find((x) => x.id === team);
    const names = new Set((lt?.players ?? []).map(norm)), opens = new Set((lt?.openIds ?? []).filter(Boolean)), uids = new Set((lt?.uids ?? []).filter(Boolean));
    for (const p of mine) {
      if (p.state === 'disconnected') out.disconnected.push({ team, name: p.name });
      // Nothing to compare with when the lobby team has no roster: then nobody is "unknown".
      if (names.size && !(p.uid && uids.has(p.uid)) && !names.has(norm(p.name)) && !(p.openId && opens.has(p.openId))) out.unknown.push({ team, name: p.name, uid: p.uid });
    }
  }
  return out;
}

export interface Check { id: string; level: 'ok' | 'warn' | 'info'; title: string; detail: string; team?: string }

/** The checks the provisional panel lists, all from what was saved with the match. */
export function provisionalChecks(l: Lobby, g: LobbyGame): Check[] {
  const name = (id: string) => l.teams.find((t) => t.id === id)?.name ?? 'A team';
  const out: Check[] = [];
  const rows = g.results ?? [];
  const places = rows.map((r) => r.place);
  const dup = [...new Set(places.filter((p, i) => places.indexOf(p) !== i))];
  const missing = l.teams.filter((t) => !rows.some((r) => r.team === t.id));
  if (dup.length) out.push({ id: 'places', level: 'warn', title: 'A place is used twice', detail: `Place ${dup.join(', ')} appears more than once.` });
  else if (missing.length) out.push({ id: 'places', level: 'warn', title: `${missing.length} ${missing.length === 1 ? 'team has' : 'teams have'} no place`, detail: `${missing.map((t) => t.name).join(', ')} — typed by the producer.` });
  else out.push({ id: 'places', level: 'ok', title: 'Each place once', detail: `1st to ${l.teams.length}th, none missing, none twice.` });
  const c = g.checks;
  if (c) {
    for (const t of c.lastStanding ?? []) out.push({ id: `standing:${t}`, level: 'warn', team: t, title: `${name(t)}: 1st place from the alive count`, detail: 'Last team standing, from alive count. The game wrote no rank 1, so Air counted the one team still alive as the winner. Confirm it if that is right.' });
    for (const t of c.unplaced) out.push({ id: `unplaced:${t}`, level: 'warn', team: t, title: `${name(t)}: place typed by producer`, detail: 'The game still showed this team as playing (rank 0) when it ended. Type the place, then confirm.' });
    if (c.teamKills.length) for (const k of c.teamKills) out.push({ id: `kills:${k.team}`, level: 'warn', team: k.team, title: `${name(k.team)}: team kills differ from players`, detail: `The game says ${k.teamKills} team kills; its players add up to ${k.playerKills}. Air saved the team figure.` });
    else out.push({ id: 'kills', level: 'ok', title: 'Team kills equal the players’ kills', detail: 'Each team’s kills match the sum of its players’ kills, as the game reports them.' });
    for (const u of c.unknown) out.push({ id: `unknown:${u.uid || u.name}`, level: 'warn', team: u.team, title: `1 unknown player counted to ${name(u.team)}`, detail: `“${u.name}” is not on ${name(u.team)}’s roster. They were in its slot, so their numbers count to the team. Add them in Teams/Players if they play for it.` });
    for (const d of c.disconnected) out.push({ id: `dc:${d.name}`, level: 'info', team: d.team, title: `${d.name} disconnected`, detail: `${name(d.team)}’s player was shown as disconnected by the game, not as out.` });
  }
  if ((g.attempts?.length ?? 0) > 1) {
    const kept = g.attempts!.slice(0, -1);
    out.push({ id: 'remake', level: 'info', title: `Remade ${kept.length === 1 ? 'once' : `${kept.length} times`}`, detail: `${kept.length} earlier ${kept.length === 1 ? 'attempt is' : 'attempts are'} kept for the record and not counted. This is attempt ${g.attempts!.length}.` });
  }
  return out;
}
export const hasWarnings = (cs: Check[]) => cs.some((c) => c.level === 'warn');

/** The table of a provisional match: placed teams from results, the rest from the draft (place null = to type). */
export function matchRows(l: Lobby, g: LobbyGame): Array<{ team: string; place: number | null; elims: number }> {
  const rows = g.results?.length ? g.results : (g.draft ?? []);
  const have = new Set(rows.map((r) => r.team));
  const rest = l.teams.filter((t) => !have.has(t.id)).map((t) => ({ team: t.id, place: null, elims: 0 }));
  return [...rows, ...rest].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
}

// ── standings, official and provisional ──

export interface StandingsView {
  official: Standing[];
  /** Official plus the provisional matches; null when none is provisional. */
  provisional: Standing[] | null;
  provisionalGames: number[];
  /** Rank change from official to provisional (positive = up). */
  move: Record<string, number>;
}
export function standingsView(l: Lobby): StandingsView {
  const official = standings(l);
  const provisionalGames = l.games.filter((g) => gameState(g) === 'provisional' && g.results?.length).map((g) => g.n);
  if (!provisionalGames.length) return { official, provisional: null, provisionalGames, move: {} };
  const provisional = standings(l, { provisional: true });
  const was = new Map(official.map((r) => [r.team, r.rank]));
  const move = Object.fromEntries(provisional.map((r) => [r.team, (was.get(r.team) ?? r.rank) - r.rank]));
  return { official, provisional, provisionalGames, move };
}

// ── adjustments ──

export function validAdjustment(l: Lobby, input: { team: unknown; points: unknown; reason: unknown }): Omit<Adjustment, 'id' | 'at'> {
  const team = String(input.team ?? '');
  if (!l.teams.some((t) => t.id === team)) throw new Error('Choose a team of this lobby.');
  const points = Number(input.points);
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) throw new Error('Points must be a whole number other than 0 (negative takes points away).');
  const reason = typeof input.reason === 'string' ? input.reason.replace(/[<>]/g, '').trim().slice(0, 200) : '';
  if (!reason) throw new Error('Say why (a DQ, a late start, a rule breach…). The reason is kept with the adjustment.');
  return { team, points, reason };
}

// ── days ──

export interface RosterChange { at: number; team: string; added: string[]; removed: string[] }

/** Roster changes since a time, from the journal's `roster.change` lines (by lobby). */
export function rosterChanges(lines: Array<{ at: number; kind: string; data: Record<string, unknown> }>, lobbyId: string, since: number): RosterChange[] {
  return lines.filter((x) => x.kind === 'roster.change' && x.data.lobbyId === lobbyId && x.at > since).map((x) => ({
    at: x.at, team: String(x.data.team ?? ''), added: Array.isArray(x.data.added) ? x.data.added.map(String) : [], removed: Array.isArray(x.data.removed) ? x.data.removed.map(String) : [],
  }));
}

export interface DaySummary {
  day: LobbyDay;
  matches: Array<{ n: number; map: string; state: MatchState; winner: string | null; kills: number; edits: number; attempts: number }>;
  /** Official standings after the day, with each team's points in this day's matches. */
  table: Array<{ team: string; rank: number; total: number; today: number; adjusted: number }>;
  mvp: { name: string; team: string | null; kills: number; damage: number } | null;
  fraggers: Array<{ name: string; team: string | null; kills: number }>;
  adjustments: Adjustment[];
  edits: Array<{ n: number; at: number; reason: string }>;
}

/** The standings after a day, who gained what in it, its MVP and top fraggers, every adjustment and edit. */
export function daySummary(l: Lobby, dayId: string): DaySummary {
  const day = l.days?.find((d) => d.id === dayId);
  if (!day) throw new Error('That day is not in this lobby.');
  const games = matchesOfDay(l, day);
  const counted = games.filter((g) => gameState(g) === 'confirmed' && g.results?.length);
  // Points of the day alone: the standings with only this day's matches, no adjustments.
  const today = new Map(standings({ ...l, games: counted, adjustments: [] }).map((r) => [r.team, r.total]));
  const table = standings(l).map((r) => ({ team: r.team, rank: r.rank, total: r.total, today: today.get(r.team) ?? 0, adjusted: r.adjusted }));
  const fed = counted.filter((g) => g.feed?.stats.length).map((g) => g.feed!);
  const totals = fed.length ? playerTotals(fed) : [];
  const byRating = [...totals].sort((a, b) => b.rating - a.rating);
  const mvp = byRating[0] ? { name: byRating[0].name, team: byRating[0].team, kills: byRating[0].kills, damage: byRating[0].damage } : null;
  const fraggers = [...totals].sort((a, b) => b.kills - a.kills).slice(0, 5).map((p) => ({ name: p.name, team: p.team, kills: p.kills }));
  return {
    day,
    matches: games.map((g) => ({
      n: g.n, map: g.map, state: gameState(g), winner: g.results?.find((r) => r.place === 1)?.team ?? null,
      kills: (g.results ?? []).reduce((n, r) => n + r.elims, 0), edits: g.edits?.length ?? 0, attempts: g.attempts?.length ?? 0,
    })),
    table, mvp, fraggers,
    adjustments: (l.adjustments ?? []).filter((a) => a.dayId === dayId),
    edits: games.flatMap((g) => (g.edits ?? []).map((e) => ({ n: g.n, at: e.at, reason: e.reason }))),
  };
}

// ── day standings (28 Nov) ──

/** One team's line on the Day N standings graphic. */
export interface DayRow {
  team: string;
  rank: number;
  /** Places gained (positive) or lost since the end of the previous day; null on the first day. */
  move: number | null;
  total: number;
  /** Points per day, first day to the shown day (adjustments count in the day they belong to), so they add up to `total`. */
  days: number[];
  /** Points of the shown day alone. */
  today: number;
  /** Part of `today` from matches not yet confirmed (only when provisional matches are counted). */
  prov: number;
  wins: number;
  elims: number;
}
export interface DayStandings {
  /** The shown day: its position (Day 1, Day 2 …), id and title. */
  n: number;
  id: string;
  title: string;
  /** Days up to and including the shown one. */
  dayCount: number;
  /** The shown day's matches (void ones left out), the confirmed ones among them, and those counted while not confirmed. */
  matches: number;
  confirmed: number;
  provisionalGames: number[];
  /** Matches counted in total, up to and including the shown day. */
  played: number;
  rows: DayRow[];
}

/** Which day an adjustment belongs to: its own `dayId`, else the latest day that had started when it was made, else the first. */
export function adjustmentDay(l: Pick<Lobby, 'days'>, a: Adjustment): number {
  const days = l.days ?? [];
  const own = days.findIndex((d) => d.id === a.dayId);
  if (own >= 0) return own;
  let at = 0;
  days.forEach((d, i) => { if (d.startedAt !== undefined && d.startedAt <= a.at) at = i; });
  return at;
}

const counts = (g: LobbyGame, provisional: boolean) => !!g.results?.length && (gameState(g) === 'confirmed' || (provisional && gameState(g) === 'provisional'));

/** The day the graphic shows: the latest day with a match that counts (the current day once it has one, else the last closed). */
export function focusDay(l: Lobby, provisional = false): number {
  const days = l.days ?? [];
  for (let i = days.length - 1; i >= 0; i--) if (matchesOfDay(l, days[i]!).some((g) => counts(g, provisional))) return i;
  return -1;
}

/**
 * Standings after a day, built only from official data (confirmed matches and adjustments); `provisional` also counts
 * matches saved but not yet confirmed, marked per team in `prov`. Each team's points per day add up to its total, and the
 * move is its rank now against its rank at the end of the previous day. Null while no match counts yet.
 */
export function dayStandings(l: Lobby, opts: { provisional?: boolean } = {}): DayStandings | null {
  const prov = opts.provisional === true;
  const f = focusDay(l, prov);
  if (f < 0) return null;
  const days = l.days!.slice(0, f + 1);
  const upTo = (k: number): Lobby => ({
    ...l,
    games: days.slice(0, k + 1).flatMap((d) => matchesOfDay(l, d)),
    adjustments: (l.adjustments ?? []).filter((a) => adjustmentDay(l, a) <= k),
  });
  const only = (k: number, keep: (g: LobbyGame) => boolean = () => true): Lobby => ({
    ...l,
    games: matchesOfDay(l, days[k]!).filter(keep),
    adjustments: (l.adjustments ?? []).filter((a) => adjustmentDay(l, a) === k),
  });
  const total = standings(upTo(f), { provisional: prov });
  const before = f > 0 ? new Map(standings(upTo(f - 1), { provisional: prov }).map((r) => [r.team, r.rank])) : null;
  const perDay = days.map((_, k) => new Map(standings(only(k), { provisional: prov }).map((r) => [r.team, r.total])));
  const unconfirmed = new Map(standings({ ...only(f, (g) => gameState(g) === 'provisional'), adjustments: [] }, { provisional: true }).map((r) => [r.team, r.total]));
  const today = days[f]!;
  const games = matchesOfDay(l, today).filter((g) => gameState(g) !== 'void');
  return {
    n: f + 1, id: today.id, title: today.title, dayCount: f + 1,
    matches: games.length,
    confirmed: games.filter((g) => counts(g, false)).length,
    provisionalGames: prov ? games.filter((g) => gameState(g) === 'provisional' && g.results?.length).map((g) => g.n) : [],
    played: upTo(f).games.filter((g) => counts(g, prov)).length,
    rows: total.map((r) => {
      const d = perDay.map((m) => m.get(r.team) ?? 0);
      return { team: r.team, rank: r.rank, move: before ? (before.get(r.team) ?? r.rank) - r.rank : null, total: r.total, days: d, today: d[f]!, prov: prov ? unconfirmed.get(r.team) ?? 0 : 0, wins: r.wins, elims: r.elims };
    }),
  };
}

/** Is there anything to mark: matches saved but not confirmed, anywhere in the lobby. */
export const hasProvisional = (l: Pick<Lobby, 'games'>) => l.games.some((g) => gameState(g) === 'provisional' && !!g.results?.length);

/** Why a day cannot close; empty means it can. */
export function closeProblems(l: Lobby, day: LobbyDay): string[] {
  if (day.closedAt) return [`${day.title} is already closed.`];
  return matchesOfDay(l, day).filter((g) => !['confirmed', 'void'].includes(gameState(g))).map((g) => `${matchTitle(g)} is ${STATE_LABEL[gameState(g)].toLowerCase()}. Confirm it or void it first.`);
}

export type { TeamResult };

/** The live state Air saves every 2 s while a match is live, so a restart can offer to resume it. */
export interface BrCheckpoint {
  lobbyId: string; matchId: string; n: number; attempt: number;
  /** Lobby teams already out, the kills seen, and the moments already shown (they do not fire again after a resume). */
  placed: string[]; kills: number; moments: string[];
  lastDataAt: number | null; savedAt: number;
}
/** What Live offers after a restart: the match that was live, and the autopilot run that was in progress. */
export interface BrResume {
  lobbyId: string; matchId: string | null; n: number | null; title: string;
  placed: number; kills: number; moments: number; savedAt: number | null;
  autopilot: string[];
}
