// "Use a stage from Esportra" (28 Nov, read only): what Esportra sends for a battle royale stage
// (GET /api/air/br/stages and /api/air/br/stages/{id}, esportra-backend PR #12), read tolerantly, and how it maps onto a
// lobby: one lobby per group, the group's lobbies' games as matches, days from their dates, the points table as scoring.
// Pure: src/main/esportra-stages.ts does the work with it. Nothing here, or there, sends anything to Esportra.
import { SCORING_PRESETS, validScoring, type Scoring, type Tiebreak } from './br.ts';
import type { GameId } from './games.ts';

export interface StageSummary {
  stageId: string; stageName: string; tournamentId: string; tournamentName: string;
  /** Air's game for it (PUBG MOBILE, Free Fire), or null when Esportra has none stored: it counts as the game Air is set to. */
  game: GameId | null;
  /** What Esportra stored, for the message when it is not a game Air can produce. */
  gameRaw: string | null;
  startsAt: string | null; groupCount: number; lobbyCount: number;
  /** Air can produce this stage's game. */
  supported: boolean;
}
export interface StagePlayer { id: string | null; name: string; ign: string | null; role: 'starter' | 'substitute' | 'registered' }
export interface StageTeam { teamId: string; name: string; tag: string; logoUrl: string | null; players: StagePlayer[] }
export interface StageGroup { id: string; name: string; order: number; teams: StageTeam[] }
export interface StageGame { id: string; number: number; map: string | null; scheduledAt: string | null; status: string }
export interface StageLobby { id: string; wave: number; index: number; groupIds: string[]; map: string | null; scheduledAt: string | null; status: string; games: StageGame[] }
export interface StageConfig { placements: number[]; killPoints: number; killCap: number | null; tiebreakers: string[]; gamesPerLobby: number | null; format: string }
export interface StageRead { stage: StageSummary; config: StageConfig; groups: StageGroup[]; lobbies: StageLobby[] }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');
const num = (v: unknown, fallback = 0) => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : fallback; };
export const stageIdOk = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(v);
const idOf = (v: unknown) => { const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''; return stageIdOk(s) ? s : ''; };
const when = (v: unknown) => { const s = str(v, 40); return s && !Number.isNaN(Date.parse(s)) ? s : null; };
/** Esportra's own picture links only: https, or plain http on this PC (the dev host's stand-in). */
export const picture = (v: unknown) => { const s = typeof v === 'string' ? v.trim() : ''; return /^https:\/\/\S+$/i.test(s) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/\S*$/i.test(s) ? s.slice(0, 1000) : null; };

/** Esportra's game name as stored ("pubgm", "PUBG MOBILE", …) as one of Air's lobby games. */
export function gameFrom(raw: unknown): GameId | null {
  const k = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (['pubgm', 'pubgmobile'].includes(k)) return 'pubgm';
  if (['freefire', 'garenafreefire'].includes(k)) return 'freefire';
  return null;
}

export function readSummary(raw: unknown): StageSummary | null {
  const x = obj(raw);
  const stageId = idOf(x.stageId);
  if (!stageId) return null;
  const gameRaw = str(x.game, 40) || null;
  const game = gameFrom(gameRaw);
  return {
    stageId, stageName: str(x.stageName, 80) || 'Stage', tournamentId: idOf(x.tournamentId), tournamentName: str(x.tournamentName, 80) || 'Tournament',
    game, gameRaw, startsAt: when(x.startsAt), groupCount: Math.max(0, Math.round(num(x.groupCount))), lobbyCount: Math.max(0, Math.round(num(x.lobbyCount))),
    supported: gameRaw === null || game !== null,
  };
}

export function readStages(input: unknown): StageSummary[] {
  const list = obj(input).stages;
  return (Array.isArray(list) ? list : []).map(readSummary).filter((s): s is StageSummary => s !== null);
}

export function readStage(input: unknown): StageRead {
  const x = obj(input);
  const stage = readSummary(x.stage);
  if (!stage) throw new Error('Esportra sent a stage Air cannot read.');
  const c = obj(x.config);
  const config: StageConfig = {
    placements: (Array.isArray(c.placements) ? c.placements : []).slice(0, 32).map((p) => num(p)),
    killPoints: num(c.killPoints), killCap: c.killCap === null || c.killCap === undefined ? null : num(c.killCap, 0),
    tiebreakers: (Array.isArray(c.tiebreakers) ? c.tiebreakers : []).map((t) => str(t, 30)).filter(Boolean),
    gamesPerLobby: c.gamesPerLobby === null || c.gamesPerLobby === undefined ? null : Math.round(num(c.gamesPerLobby)), format: str(c.format, 40),
  };
  const groups = (Array.isArray(x.groups) ? x.groups : []).map((g, i): StageGroup | null => {
    const o = obj(g), id = idOf(o.id);
    if (!id) return null;
    const teams = (Array.isArray(o.teams) ? o.teams : []).map((t): StageTeam | null => {
      const q = obj(t), teamId = idOf(q.teamId), name = str(q.name, 40);
      if (!teamId || !name) return null;
      const players = (Array.isArray(q.players) ? q.players : []).map((p): StagePlayer | null => {
        const r = obj(p), pname = str(r.name, 32), ign = str(r.ign, 32);
        if (!pname && !ign) return null;
        return { id: idOf(r.id) || null, name: pname || ign, ign: ign || null, role: r.role === 'substitute' ? 'substitute' : r.role === 'starter' ? 'starter' : 'registered' };
      }).filter((p): p is StagePlayer => p !== null);
      return { teamId, name, tag: str(q.tag, 5).toUpperCase(), logoUrl: picture(q.logoUrl), players };
    }).filter((t): t is StageTeam => t !== null);
    return { id, name: str(o.name, 60) || `Group ${i + 1}`, order: num(o.order, i), teams };
  }).filter((g): g is StageGroup => g !== null).sort((a, b) => a.order - b.order);
  const lobbies = (Array.isArray(x.lobbies) ? x.lobbies : []).map((l, i): StageLobby | null => {
    const o = obj(l), id = idOf(o.id);
    if (!id) return null;
    const games = (Array.isArray(o.games) ? o.games : []).map((g, k): StageGame | null => {
      const q = obj(g), gid = idOf(q.id);
      return gid ? { id: gid, number: Math.round(num(q.number, k + 1)), map: str(q.map, 30) || null, scheduledAt: when(q.scheduledAt), status: str(q.status, 20) } : null;
    }).filter((g): g is StageGame => g !== null);
    return { id, wave: num(o.wave), index: num(o.index, i), groupIds: (Array.isArray(o.groupIds) ? o.groupIds : []).map(idOf).filter(Boolean), map: str(o.map, 30) || null, scheduledAt: when(o.scheduledAt), status: str(o.status, 20), games };
  }).filter((l): l is StageLobby => l !== null);
  return { stage, config, groups, lobbies };
}

// ── points table ──

export interface MappedScoring { scoring: Scoring; notes: string[] }

/**
 * Esportra's config as Air's points table. What Air has no setting for is said in `notes`, never dropped quietly:
 *  · `killCap` is read as a number of kills (its name); Air caps elimination points, so it becomes cap × points per kill;
 *  · `avg_placement` has no Air tiebreak; Air's closest is "Placement points" (it rewards the same finishes);
 *  · "points" is the first tiebreak by definition and has no entry.
 */
export function mapScoring(config: StageConfig): MappedScoring {
  const notes: string[] = [];
  let placement = config.placements.map((p) => Math.max(0, Math.min(100, Math.round(p))));
  if (!placement.length) { placement = [...SCORING_PRESETS.pmgc.scoring.placement]; notes.push('Esportra sent no points for places, so Air uses the PMGC table.'); }
  let perElim = Math.round(config.killPoints);
  if (!Number.isInteger(config.killPoints) || config.killPoints < 0 || config.killPoints > 10) {
    perElim = Math.max(0, Math.min(10, perElim));
    notes.push(`Esportra gives ${config.killPoints} points per kill; Air keeps whole points (0 to 10) and uses ${perElim}.`);
  }
  const out: Record<string, unknown> = { placement, perElim };
  if (config.killCap !== null && config.killCap > 0) {
    out.elimCap = Math.max(0, Math.min(100, Math.round(config.killCap * perElim)));
    notes.push(`Esportra counts at most ${config.killCap} kill${config.killCap === 1 ? '' : 's'} per game; Air caps kill points at ${out.elimCap}.`);
  }
  const tie: Tiebreak[] = [];
  for (const t of config.tiebreakers) {
    const k = t.toLowerCase();
    if (k === 'points') continue;
    const to: Tiebreak | null = k === 'wins' ? 'wins' : k === 'kills' ? 'elims' : k === 'avg_placement' ? 'placementPts' : null;
    if (k === 'avg_placement') notes.push('Esportra breaks ties by average placement; Air has no such tiebreak and uses Placement points, the closest.');
    else if (!to) notes.push(`Esportra's tiebreak “${t}” is not one Air has, so it is left out.`);
    if (to && !tie.includes(to)) tie.push(to);
  }
  out.tiebreak = tie;
  return { scoring: validScoring(out), notes };
}

// ── groups, lobbies, days ──

export interface PlannedGame { id: string; map: string; scheduledAt: string | null }
/** `date` is '' when no game of the stage has a time (the lobby then has one day, dated when it is made). */
export interface PlannedDay { date: string; title: string; games: PlannedGame[] }
export interface GroupPlan { group: StageGroup; games: PlannedGame[]; days: PlannedDay[]; notes: string[] }

/** The date a time falls on, on this PC (what the producer reads as the day). */
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The group's lobbies' games in wave, index, game-number order (a game without its own map or time takes its lobby's). */
export function planGroup(read: StageRead, group: StageGroup, maxGames = 24): GroupPlan {
  const notes: string[] = [];
  const lobbies = read.lobbies.filter((l) => l.groupIds.includes(group.id)).sort((a, b) => a.wave - b.wave || a.index - b.index);
  let games: PlannedGame[] = lobbies.flatMap((l) => [...l.games].sort((a, b) => a.number - b.number).map((g) => ({ id: g.id, map: g.map ?? l.map ?? '', scheduledAt: g.scheduledAt ?? l.scheduledAt })));
  if (games.length > maxGames) { notes.push(`${group.name} has ${games.length} games on Esportra; Air keeps the first ${maxGames}.`); games = games.slice(0, maxGames); }
  return { group, games, days: planDays(games), notes };
}

/** Days from the games' dates, in order of first appearance; a game without a time joins the day before it (one day when none has a time). */
export function planDays(games: PlannedGame[]): PlannedDay[] {
  const days: PlannedDay[] = [];
  let current: PlannedDay | null = null;
  const pending: PlannedGame[] = [];
  for (const g of games) {
    if (!g.scheduledAt) { if (current) current.games.push(g); else pending.push(g); continue; }
    const date = localDate(g.scheduledAt);
    current = days.find((d) => d.date === date) ?? null;
    if (!current) { current = { date, title: `Day ${days.length + 1}`, games: [] }; days.push(current); }
    if (pending.length) { current.games.push(...pending); pending.length = 0; }
    current.games.push(g);
  }
  if (!days.length && games.length) days.push({ date: '', title: 'Day 1', games: [...games] });
  return days;
}

/** A role in Esportra's words as Teams/Players' squad roles (registered, with no lineup mark, counts as a player). */
export const roleOf = (r: StagePlayer['role']) => (r === 'substitute' ? 'Sub' : 'Player');

export const playerCount = (read: StageRead) => read.groups.reduce((n, g) => n + g.teams.reduce((m, t) => m + t.players.length, 0), 0);
