// PUBG MOBILE observer client (PCOB) live data, as the official "PC OB API" document (v3.0.0) describes it: the
// observer PC serves http://<host>:10086/<route> once "API Enable" is on. Pure readers for each route, tolerant of
// what the document itself shows: numbers sent as strings ("ResultHealthStatus": "1"), two spellings of a field
// (`survivalTime` in the field list, `surviceTime` in the JSON sample; `isOutsideBlueCircle`/`isOutSideBlueCircle`),
// and end-of-game stats that read 0 until the match ends. Then the lobby side: which PCOB team is which lobby
// team (`seatTeams`), and the room's `brLive` the graphics read (`toBrLive`).

/** The routes Air polls. */
export const PCOB_ROUTES = {
  players: 'gettotalplayerlist',
  teams: 'getteaminfolist',
  inGame: 'isingame',
  kills: 'getkillinfo',
  circle: 'setcircleinfo',
  global: 'getgameglobalinfo',
  observing: 'getobservingplayer',
} as const;
export const PCOB_PORT = 10086;

/** liveState, as the document's live status table numbers it. */
export const LIVE_STATE = ['normal', 'plane', 'parachute', 'vehicle', 'knocked', 'dead', 'disconnected'] as const;
export type LiveState = (typeof LIVE_STATE)[number];

export interface PcobPlayer {
  uid: string; openId: string; name: string; teamId: number; teamName: string;
  health: number; healthMax: number; state: LiveState;
  kills: number; killsBeforeDie: number; knockouts: number; assists: number; damage: number; damageTaken: number;
  heal: number; headshots: number; rescues: number; survival: number; maxKillDistance: number; airdrops: number;
  vehicleKills: number; grenadeKills: number; driveDistance: number; walkDistance: number;
  /** The team's place once it is out; 0 while it is still playing. */
  rank: number;
  outsideZone: boolean; outsideZoneTime: number; poisonDamage: number;
  grenades: { frag: number; smoke: number; burn: number; flash: number };
  weaponId: number;
}
export interface PcobTeam { teamId: number; name: string; kills: number; alive: number; logo: string }
export interface PcobTeamList { teams: PcobTeam[]; gameTime: number | null; fightingStart: number | null; finishedStart: number | null; gameId: string; currentTime: number | null }
export interface PcobKill { causer: string; victim: string; kind: 'knock' | 'kill'; time: number; distance: number }
export interface PcobCircle { time: number; status: 'wait' | 'delay' | 'move'; index: number; counter: number; max: number }
export interface PcobGlobal { circles: Array<{ x: number; y: number; size: number }>; plane: { from: { x: number; y: number }; to: { x: number; y: number } } | null }

// ── tolerant values ──
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** The first key present, in any letter case. */
function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in o) return o[k];
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) { const hit = lower.get(k.toLowerCase()); if (hit !== undefined) return o[hit]; }
  return undefined;
}
/** A finite number from a number or a numeric string; otherwise the fallback. */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
const optNum = (v: unknown) => { const n = num(v, NaN); return Number.isFinite(n) ? n : null; };
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';
/** A list given as the array itself or under one of its documented names. */
function list(raw: unknown, ...names: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = obj(raw);
  for (const n of names) { const v = pick(o, n); if (Array.isArray(v)) return v; }
  return [];
}

// ── routes ──

export function readPlayers(raw: unknown): PcobPlayer[] {
  return list(raw, 'playerInfoList', 'TotalPlayerList').map((x) => {
    const p = obj(x);
    const state = LIVE_STATE[Math.trunc(num(pick(p, 'liveState'), 0))] ?? 'normal';
    return {
      uid: str(pick(p, 'uID', 'uId', 'playerKey')), openId: str(pick(p, 'playerOpenId')), name: str(pick(p, 'playerName')).trim(),
      teamId: num(pick(p, 'teamId')), teamName: str(pick(p, 'teamName')).trim(),
      health: num(pick(p, 'health')), healthMax: num(pick(p, 'healthMax'), 100), state,
      kills: num(pick(p, 'killNum')), killsBeforeDie: num(pick(p, 'killNumBeforeDie')), knockouts: num(pick(p, 'knockouts')),
      assists: num(pick(p, 'assists')), damage: num(pick(p, 'damage')), damageTaken: num(pick(p, 'inDamage')),
      heal: num(pick(p, 'heal')), headshots: num(pick(p, 'headShotNum')), rescues: num(pick(p, 'rescueTimes')),
      survival: num(pick(p, 'survivalTime', 'surviceTime')),
      maxKillDistance: Math.round(num(pick(p, 'maxKillDistance')) / 100), // cm → m
      airdrops: num(pick(p, 'gotAirDropNum')), vehicleKills: num(pick(p, 'killNumInVehicle')), grenadeKills: num(pick(p, 'killNumByGrenade')),
      driveDistance: num(pick(p, 'driveDistance')), walkDistance: num(pick(p, 'marchDistance')),
      rank: num(pick(p, 'rank')),
      outsideZone: bool(pick(p, 'isOutsideBlueCircle', 'isOutSideBlueCircle')), outsideZoneTime: num(pick(p, 'outsideBlueCircleTime')),
      poisonDamage: num(pick(p, 'PoisonTotalDamage')),
      grenades: { frag: num(pick(p, 'useFragGrenadeNum')), smoke: num(pick(p, 'useSmokeGrenadeNum')), burn: num(pick(p, 'useBurnGrenadeNum')), flash: num(pick(p, 'useFlashGrenadeNum')) },
      weaponId: num(pick(p, 'curWeaponID')),
    };
  }).filter((p) => p.name || p.uid);
}

export function readTeams(raw: unknown): PcobTeamList {
  const teams = list(raw, 'teamInfoList', 'TeamInfoList').map((x) => {
    const t = obj(x);
    return { teamId: num(pick(t, 'teamId')), name: str(pick(t, 'teamName')).trim(), kills: num(pick(t, 'killNum')), alive: num(pick(t, 'liveMemberNum')), logo: str(pick(t, 'logoPicUrl')) };
  });
  const m = readMeta(raw);
  return { teams, gameTime: m.gameTime, fightingStart: m.fightingStart, finishedStart: m.finishedStart, gameId: m.gameId, currentTime: optNum(pick(obj(raw), 'CurrentTime')) };
}

/**
 * GameID, GameStartTime, FightingStartTime and FinishedStartTime (28 Nov, open question 1): the document does not say
 * which route carries them, so any route's answer is read for them: at the top level, or one object down (for example
 * under `gameGlobalInfo`). Each one is optional; what is missing is null or ''.
 */
export interface PcobMeta { gameId: string; gameTime: number | null; fightingStart: number | null; finishedStart: number | null }
export const NO_META: PcobMeta = { gameId: '', gameTime: null, fightingStart: null, finishedStart: null };
export function readMeta(raw: unknown): PcobMeta {
  const top = obj(raw);
  const levels = [top, ...Object.values(top).map(obj).filter((o) => Object.keys(o).length)];
  const find = (...keys: string[]) => { for (const o of levels) { const v = pick(o, ...keys); if (v !== undefined && v !== null && v !== '') return v; } return undefined; };
  return { gameId: str(find('GameID', 'GameId')), gameTime: optNum(find('GameStartTime')), fightingStart: optNum(find('FightingStartTime')), finishedStart: optNum(find('FinishedStartTime')) };
}
/** Newer readings win; a field a route leaves out keeps what an earlier route gave. */
export function mergeMeta(prev: PcobMeta, next: PcobMeta): PcobMeta {
  const gameTime = next.gameTime ?? prev.gameTime;
  const fresh = { finishedStart: next.finishedStart, gameTime };
  // A valid winner time stays once seen (a later route that leaves it out or says 0 does not take it back).
  const finishedStart = finishedValid(fresh) ? next.finishedStart : finishedValid(prev) ? prev.finishedStart : next.finishedStart ?? prev.finishedStart;
  return { gameId: next.gameId || prev.gameId, gameTime, fightingStart: next.fightingStart ?? prev.fightingStart, finishedStart };
}
/**
 * Is the game finished by PCOB's own clock (open question 3)? Only a real winner time counts: 0, "", null, a missing
 * field, or a time before GameStartTime all mean "not finished".
 */
export function finishedValid(m: { finishedStart: number | null; gameTime: number | null }): boolean {
  const f = m.finishedStart;
  if (f === null || !(f > 0)) return false;
  return m.gameTime === null || !(m.gameTime > 0) || f >= m.gameTime;
}

export const readInGame = (raw: unknown) => bool(pick(obj(raw), 'isInGame'));

export function readKills(raw: unknown): PcobKill[] {
  return list(raw, 'killInfo').map((x) => {
    const k = obj(x);
    return { causer: str(pick(k, 'CauserName')).trim(), victim: str(pick(k, 'VictimName')).trim(), kind: num(pick(k, 'ResultHealthStatus')) === 2 ? 'kill' as const : 'knock' as const, time: num(pick(k, 'CurGameTime')), distance: num(pick(k, 'Distance')) };
  }).filter((k) => k.victim);
}

export function readCircle(raw: unknown): PcobCircle | null {
  const c = obj(raw);
  if (pick(c, 'CircleIndex') === undefined && pick(c, 'CircleStatus') === undefined) return null;
  return { time: num(pick(c, 'GameTime')), status: (['wait', 'delay', 'move'] as const)[num(pick(c, 'CircleStatus'))] ?? 'wait', index: num(pick(c, 'CircleIndex')), counter: num(pick(c, 'Counter')), max: num(pick(c, 'MaxTime')) };
}

export function readGlobal(raw: unknown): PcobGlobal | null {
  const g = obj(pick(obj(raw), 'gameGlobalInfo'));
  if (!Object.keys(g).length) return null;
  const circles = list(pick(g, 'CircleArray')).map((x) => { const c = obj(x); return { x: num(pick(c, 'X')), y: num(pick(c, 'Y')), size: num(pick(c, 'Size')) }; });
  const ps = [pick(g, 'PlaneStartLocX'), pick(g, 'PlaneStartLocY'), pick(g, 'PlaneStopLocX'), pick(g, 'PlaneStopLocY')].map((v) => optNum(v));
  const plane = ps.every((v) => v !== null) ? { from: { x: ps[0]!, y: ps[1]! }, to: { x: ps[2]!, y: ps[3]! } } : null;
  return { circles, plane };
}

/** The observed player's id (the document's sample key is "WinOB's ID"; any one value is taken). */
export function readObserving(raw: unknown): string | null {
  const o = obj(pick(obj(raw), 'observingPlayer'));
  const v = Object.values(o)[0];
  return v === undefined || v === null || v === '' ? null : str(v);
}

// ── the lobby side ──

export interface LobbyTeamRef { id: string; name: string; tag: string; players: string[]; openIds?: string[]; /** Character IDs, same order as `players` ('' for none). */ uids?: string[] }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface RosterEntry { name: string; uid?: string; openId?: string }
export type MatchedBy = 'uid' | 'openId' | 'name';
/**
 * Which roster entry a PCOB player is: the Character ID first (PCOB's `uID` is the Character ID), then the OpenID
 * Teams/Players learned, then the in-game name. Null when none of the three matches.
 */
export function matchPlayer(p: { uid: string; openId: string; name: string }, roster: RosterEntry[]): { index: number; by: MatchedBy } | null {
  if (p.uid) { const i = roster.findIndex((r) => r.uid && r.uid === p.uid); if (i >= 0) return { index: i, by: 'uid' }; }
  if (p.openId) { const i = roster.findIndex((r) => r.openId && r.openId === p.openId); if (i >= 0) return { index: i, by: 'openId' }; }
  const n = norm(p.name);
  if (n) { const i = roster.findIndex((r) => norm(r.name) === n); if (i >= 0) return { index: i, by: 'name' }; }
  return null;
}
export const normName = (s: string) => norm(s);

/**
 * Which lobby team each PCOB team is. The producer's own pairs win; then the Character IDs (PCOB `uID`) that a lobby
 * team's roster lists, the team with the most; then the OpenIDs Teams/Players learned; then a team name or tag that
 * matches (PCOB's `teamName` is optional and never needed); then the lobby team owning most of that PCOB team's
 * players by in-game name (two or more). Each lobby team is used once.
 */
export function seatTeams(teams: PcobTeam[], players: PcobPlayer[], lobby: LobbyTeamRef[], manual: Record<string, string> = {}): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  const ids = new Set(lobby.map((t) => t.id));
  const pcobIds = [...new Set([...teams.map((t) => t.teamId), ...players.map((p) => p.teamId)])].sort((a, b) => a - b);
  for (const id of pcobIds) { const m = manual[String(id)]; if (m && ids.has(m) && !used.has(m)) { out.set(id, m); used.add(m); } }
  // A Character ID is exact: one shared id seats the team, and a name that happens to match another team cannot outvote it.
  for (const id of pcobIds) {
    if (out.has(id)) continue;
    const uids = new Set(players.filter((p) => p.teamId === id).map((p) => p.uid).filter(Boolean));
    let best: { id: string; n: number } | null = null;
    for (const t of lobby) {
      if (used.has(t.id)) continue;
      const n = (t.uids ?? []).filter((u) => u && uids.has(u)).length;
      if (n >= 1 && (!best || n > best.n)) best = { id: t.id, n };
    }
    if (best) { out.set(id, best.id); used.add(best.id); }
  }
  // An OpenID is exact too (Teams/Players learned it from an earlier game): one shared id seats the team.
  for (const id of pcobIds) {
    if (out.has(id)) continue;
    const opens = new Set(players.filter((p) => p.teamId === id).map((p) => p.openId).filter(Boolean));
    let best: { id: string; n: number } | null = null;
    for (const t of lobby) {
      if (used.has(t.id)) continue;
      const n = (t.openIds ?? []).filter((o) => o && opens.has(o)).length;
      if (n >= 1 && (!best || n > best.n)) best = { id: t.id, n };
    }
    if (best) { out.set(id, best.id); used.add(best.id); }
  }
  const nameOf = (id: number) => teams.find((t) => t.teamId === id)?.name || players.find((p) => p.teamId === id)?.teamName || '';
  for (const id of pcobIds) {
    if (out.has(id)) continue;
    const n = norm(nameOf(id));
    if (!n) continue;
    const hit = lobby.find((t) => !used.has(t.id) && (norm(t.name) === n || norm(t.tag) === n));
    if (hit) { out.set(id, hit.id); used.add(hit.id); }
  }
  for (const id of pcobIds) {
    if (out.has(id)) continue;
    const mine = players.filter((p) => p.teamId === id);
    const names = new Set(mine.map((p) => norm(p.name))), opens = new Set(mine.map((p) => p.openId).filter(Boolean));
    let best: { id: string; n: number } | null = null;
    for (const t of lobby) {
      if (used.has(t.id)) continue;
      const n = Math.max(t.players.filter((x) => names.has(norm(x))).length, (t.openIds ?? []).filter((o) => o && opens.has(o)).length);
      if (n >= 2 && (!best || n > best.n)) best = { id: t.id, n };
    }
    if (best) { out.set(id, best.id); used.add(best.id); }
  }
  return out;
}

/** One letter per player for the HUD's marks: a alive, k knocked, d out. */
const mark = (p: PcobPlayer) => (p.state === 'knocked' ? 'k' : p.state === 'dead' || p.state === 'disconnected' ? 'd' : 'a');

export interface BrLive {
  game: number; teamsAlive: number; playersAlive: number;
  teams: Record<string, { players: string; elims: number; place: number | null; damage: number }>;
  lastOut: { team: string; place: number; at: number } | null;
  players: Array<{ team: string; name: string; elims: number; damage: number; knockouts: number; assists: number; state: LiveState }>;
  mvp: Array<{ team: string; name: string; elims: number; damage: number; survived: number }>;
  kills: Array<PcobKill & { causerTeam: string | null; victimTeam: string | null }>;
  zone: PcobCircle | null;
  plane: PcobGlobal['plane'];
  phase: 'lobby' | 'plane' | 'fighting' | 'finished';
  /** The moment over the HUD now (src/main/br-live.ts queues them). */
  moment?: import('./br-rundown.ts').BrMomentShown | null;
}

/** MVP order (src/shared/br-stats.ts holds the rating; this is the live order the HUD shows). */
export type Rate = (p: PcobPlayer) => number;

/**
 * The room's `brLive` from one poll. `seats` maps PCOB teams to lobby teams; teams with no seat are left out (the
 * producer pairs them in Live). `lastOut` is the most recent team to reach a place, remembered by the caller.
 */
export function toBrLive(input: { game: number; players: PcobPlayer[]; teams: PcobTeamList; kills: PcobKill[]; circle: PcobCircle | null; global: PcobGlobal | null; seats: Map<number, string>; lastOut: BrLive['lastOut']; rate: Rate }): BrLive {
  const { players, seats } = input;
  const seat = (teamId: number) => seats.get(teamId) ?? null;
  const teams: BrLive['teams'] = {};
  for (const [pcobId, lobbyId] of seats) {
    const ps = players.filter((p) => p.teamId === pcobId);
    const t = input.teams.teams.find((x) => x.teamId === pcobId);
    const rank = Math.max(0, ...ps.map((p) => p.rank));
    teams[lobbyId] = {
      players: ps.map(mark).sort((a, b) => 'akd'.indexOf(a) - 'akd'.indexOf(b)).join(''),
      elims: t ? t.kills : ps.reduce((n, p) => n + p.kills, 0),
      place: rank > 0 ? rank : null,
      damage: Math.round(ps.reduce((n, p) => n + p.damage, 0)),
    };
  }
  const seated = players.filter((p) => seat(p.teamId));
  const alivePlayers = seated.filter((p) => mark(p) !== 'd').length;
  const teamsAlive = Object.values(teams).filter((t) => t.place === null && /[ak]/.test(t.players)).length;
  const byName = new Map(players.map((p) => [p.name, p]));
  const phase = finishedValid(input.teams) ? 'finished' : players.some((p) => p.state === 'plane') ? 'plane' : input.teams.fightingStart ? 'fighting' : 'lobby';
  return {
    game: input.game, teamsAlive, playersAlive: alivePlayers, teams,
    lastOut: input.lastOut,
    players: seated.map((p) => ({ team: seat(p.teamId)!, name: p.name, elims: p.kills, damage: Math.round(p.damage), knockouts: p.knockouts, assists: p.assists, state: p.state }))
      .sort((a, b) => b.elims - a.elims || b.damage - a.damage),
    mvp: [...seated].sort((a, b) => input.rate(b) - input.rate(a)).slice(0, 4).map((p) => ({ team: seat(p.teamId)!, name: p.name, elims: p.kills, damage: Math.round(p.damage), survived: Math.round(p.survival) })),
    kills: input.kills.slice(-20).map((k) => ({ ...k, causerTeam: seat(byName.get(k.causer)?.teamId ?? -1), victimTeam: seat(byName.get(k.victim)?.teamId ?? -1) })),
    zone: input.circle,
    plane: input.global?.plane ?? null,
    phase,
  };
}

/** Final places and team kills for a finished game, in the shape Results take; null until every seated team has a place. */
export function finalResults(players: PcobPlayer[], teams: PcobTeamList, seats: Map<number, string>): Array<{ team: string; place: number; elims: number }> | null {
  const out: Array<{ team: string; place: number; elims: number }> = [];
  for (const [pcobId, lobbyId] of seats) {
    const ps = players.filter((p) => p.teamId === pcobId);
    const rank = Math.max(0, ...ps.map((p) => p.rank));
    if (!rank) return null;
    const t = teams.teams.find((x) => x.teamId === pcobId);
    out.push({ team: lobbyId, place: rank, elims: t ? t.kills : ps.reduce((n, p) => n + p.kills, 0) });
  }
  out.sort((a, b) => a.place - b.place);
  // Places as the game gave them, unless one is used twice or falls outside the lobby (a team not seated): then
  // the order is kept and the places are numbered 1…n, which is what the lobby's own check accepts.
  const fine = out.every((r, i) => r.place <= out.length && (i === 0 || r.place !== out[i - 1]!.place));
  if (!fine) out.forEach((r, i) => { r.place = i + 1; });
  return out.length ? out : null;
}


// ── open questions 5, 6, 7 and 9 (28 Nov): handled so the show works whichever way PCOB behaves ──

/**
 * The kill feed as a list: lines are kept de-duplicated by (causer, victim, game time), so a feed that repeats the whole
 * game or only the recent lines gives the same list. A knock and a kill of the same player in the same second stay two
 * lines. The list never drives a moment or a count: those come from the players' `killNum`.
 */
export function mergeKills(prev: PcobKill[], next: PcobKill[], cap = 2000): PcobKill[] {
  const key = (k: PcobKill) => `${k.causer}|${k.victim}|${k.time}|${k.kind}`;
  const seen = new Set(prev.map(key));
  const out = prev.slice();
  for (const k of next) { const id = key(k); if (!seen.has(id)) { seen.add(id); out.push(k); } }
  return out.length > cap ? out.slice(out.length - cap) : out;
}

const teamIdsOf = (players: PcobPlayer[], teams: PcobTeamList) => [...new Set([...teams.teams.map((t) => t.teamId), ...players.map((p) => p.teamId)])];
const rankOf = (players: PcobPlayer[], id: number) => Math.max(0, ...players.filter((p) => p.teamId === id).map((p) => p.rank));
/** Players still in the team: the team list's `liveMemberNum` when it has one, else the players not dead. */
const aliveIn = (players: PcobPlayer[], teams: PcobTeamList, id: number) => {
  const t = teams.teams.find((x) => x.teamId === id);
  const mine = players.filter((p) => p.teamId === id);
  const listed = mine.filter((p) => p.state !== 'dead' && p.state !== 'disconnected').length;
  return mine.length ? listed : t?.alive ?? 0;
};
/** PCOB teams that have no place yet and still have players (every team, seated or not). */
export function teamsStillPlaying(players: PcobPlayer[], teams: PcobTeamList): number[] {
  return teamIdsOf(players, teams).filter((id) => rankOf(players, id) === 0 && aliveIn(players, teams, id) > 0);
}
/** Every team but one has a place (open question 3): the game is over even when PCOB never sets the winner's time. */
export function allButOnePlaced(players: PcobPlayer[], teams: PcobTeamList): boolean {
  const ids = teamIdsOf(players, teams);
  if (ids.length < 2) return false;
  const open = ids.filter((id) => rankOf(players, id) === 0);
  return open.length === 1 && aliveIn(players, teams, open[0]!) > 0;
}

export interface ResultsProposal {
  /** Complete results (every seated team has a place), else null. */
  rows: Array<{ team: string; place: number; elims: number }> | null;
  /** What the game gave per seated team; place null = typed by the producer. */
  draft: Array<{ team: string; place: number | null; elims: number }>;
  /** The lobby team proposed 1st from the alive count because PCOB wrote no rank 1 (open question 6), or null. */
  lastStanding: string | null;
}
/**
 * Places for a game that ended. Rank 1 is used when PCOB writes it. When it does not, and exactly one team still has players
 * while every other team that has a rank is out, that team is proposed 1st and marked as "last team standing, from alive count"
 * for the producer to confirm. Nothing else is guessed: a seated team with no place stays to type.
 */
export function proposeResults(players: PcobPlayer[], teams: PcobTeamList, seats: Map<number, string>): ResultsProposal {
  const ranks = new Map<number, number>();
  for (const id of seats.keys()) ranks.set(id, rankOf(players, id));
  let lastStanding: string | null = null;
  const anyFirst = teamIdsOf(players, teams).some((id) => rankOf(players, id) === 1);
  if (!anyFirst) {
    const playing = teamsStillPlaying(players, teams);
    const sole = playing.length === 1 ? playing[0]! : null;
    if (sole !== null && seats.has(sole) && ranks.get(sole) === 0) { ranks.set(sole, 1); lastStanding = seats.get(sole)!; }
  }
  const elimsOf = (id: number) => teams.teams.find((t) => t.teamId === id)?.kills ?? players.filter((p) => p.teamId === id).reduce((n, p) => n + p.kills, 0);
  const draft = [...seats].map(([id, team]) => ({ team, place: ranks.get(id) || null, elims: elimsOf(id) }));
  let rows: ResultsProposal['rows'] = null;
  if (draft.length && draft.every((d) => d.place !== null)) {
    rows = draft.map((d) => ({ team: d.team, place: d.place!, elims: d.elims })).sort((a, b) => a.place - b.place);
    // Places as the game gave them, unless one is used twice or falls outside the lobby: then the order is kept and numbered 1…n.
    const fine = rows.every((r, i) => r.place <= rows!.length && (i === 0 || r.place !== rows![i - 1]!.place));
    if (!fine) rows.forEach((r, i) => { r.place = i + 1; });
  }
  return { rows, draft, lastStanding };
}

/** The numbers PCOB leaves at 0 until the game is over (the document's list); a game that has them has its after-match numbers. */
export function hasAfterMatch(players: PcobPlayer[]): boolean {
  return players.some((p) => p.survival > 0 || p.damageTaken > 0 || p.heal > 0 || p.headshots > 0 || p.driveDistance > 0 || p.walkDistance > 0 || p.assists > 0 || p.knockouts > 0);
}

/**
 * Is `next` a blank or emptier reading than `prev` for a game that is already read (open question 7)? An empty answer is PCOB
 * going quiet, never news. Once the game is finished, places and kills only go up, so fewer placed teams or fewer kills is
 * quiet too.
 */
export function weakerReading(prev: PcobPlayer[], next: PcobPlayer[], finished = false): boolean {
  if (!prev.length) return false;
  if (!next.length) return true;
  if (!finished) return false;
  const placed = (ps: PcobPlayer[]) => ps.filter((p) => p.rank > 0).length;
  const kills = (ps: PcobPlayer[]) => ps.reduce((n, p) => n + p.kills, 0);
  return next.length < prev.length || placed(next) < placed(prev) || kills(next) < kills(prev);
}
