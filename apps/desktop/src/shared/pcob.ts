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
  const o = obj(raw);
  const teams = list(raw, 'teamInfoList', 'TeamInfoList').map((x) => {
    const t = obj(x);
    return { teamId: num(pick(t, 'teamId')), name: str(pick(t, 'teamName')).trim(), kills: num(pick(t, 'killNum')), alive: num(pick(t, 'liveMemberNum')), logo: str(pick(t, 'logoPicUrl')) };
  });
  return { teams, gameTime: optNum(pick(o, 'GameStartTime')), fightingStart: optNum(pick(o, 'FightingStartTime')), finishedStart: optNum(pick(o, 'FinishedStartTime')), gameId: str(pick(o, 'GameID')), currentTime: optNum(pick(o, 'CurrentTime')) };
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

export interface LobbyTeamRef { id: string; name: string; tag: string; players: string[]; openIds?: string[] }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Which lobby team each PCOB team is. The producer's own pairs win; then a team name or tag that matches; then the
 * lobby team owning most of that PCOB team's players, by the OpenIDs Teams/Players learned or by in-game name (two
 * or more). Each lobby team is used once.
 */
export function seatTeams(teams: PcobTeam[], players: PcobPlayer[], lobby: LobbyTeamRef[], manual: Record<string, string> = {}): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  const ids = new Set(lobby.map((t) => t.id));
  const pcobIds = [...new Set([...teams.map((t) => t.teamId), ...players.map((p) => p.teamId)])].sort((a, b) => a - b);
  for (const id of pcobIds) { const m = manual[String(id)]; if (m && ids.has(m) && !used.has(m)) { out.set(id, m); used.add(m); } }
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
  const phase = input.teams.finishedStart ? 'finished' : players.some((p) => p.state === 'plane') ? 'plane' : input.teams.fightingStart ? 'fighting' : 'lobby';
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
