// Battle royale lobbies (20 Nov): many teams, several games, scored by placement and eliminations
// (src/shared/br.ts). Kept beside matches, never inside them: a lobby is not a two-team match. The selected
// lobby's room gets one field, `br`, that the lobby graphics read: teams, games, scoring and the standings.

import { randomUUID } from 'node:crypto';
import type { LibTeam, LibPlayer, Lobby } from '../shared/api.ts';
import { SCORING_PRESETS, champion, standings, validResults, validScoring, type LobbyGame, type LobbyTeam, type Scoring, type TeamResult } from '../shared/br.ts';
import type { GameFeed } from '../shared/br-stats.ts';
import { gameOf, type GameId } from '../shared/games.ts';
import type { Store } from './store.ts';

export interface LobbyContext {
  store: Store;
  /** Writes fields into a room of the graphics engine (no-op while it is stopped). */
  patch: (code: string, fields: Record<string, unknown>) => Promise<void>;
  /** True while this lobby is on air (its game data or a test runs): it can't be deleted then. */
  live: (lobbyId: string) => boolean;
  log: (text: string) => void;
  changed: () => void;
  /** Room fields the lobby graphics read besides `br` (src/main/br-graphics.ts). */
  extra?: (lobby: Lobby) => Record<string, unknown>;
}

const MAX_TEAMS = 25, MAX_GAMES = 24;
const text = (v: unknown, max: number, what: string, required = true) => {
  const s = typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '';
  if (required && !s) throw new Error(`${what} is missing.`);
  return s;
};

export class Lobbies {
  private readonly ctx: LobbyContext;
  constructor(ctx: LobbyContext) { this.ctx = ctx; }

  private get data() { return this.ctx.store.data; }
  list(): Lobby[] { return this.data.lobbies ?? []; }
  get selected(): Lobby | null { return this.list().find((l) => l.id === this.data.selectedLobbyId) ?? null; }
  find(id: string) {
    const l = this.list().find((x) => x.id === id);
    if (!l) throw new Error('That lobby is gone.');
    return l;
  }

  private put(next: Lobby) {
    this.data.lobbies = this.list().map((l) => (l.id === next.id ? next : l));
    this.ctx.store.save();
    this.ctx.changed();
    if (this.data.selectedLobbyId === next.id) void this.publish();
  }

  async create(input: { eventId: string; game: GameId; title?: string; games?: number; maps?: string[] }) {
    const game = gameOf(input.game);
    if (!game || game.shape !== 'lobby') throw new Error('Choose a battle royale game.');
    if (!this.data.events.some((e) => e.id === input.eventId)) throw new Error('Choose the event first.');
    const count = Math.max(1, Math.min(MAX_GAMES, Number(input.games) || 6));
    const maps = Array.isArray(input.maps) ? input.maps : [];
    const id = randomUUID();
    const lobby: Lobby = {
      id, code: `L${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, eventId: input.eventId, game: input.game,
      title: text(input.title ?? 'Lobby', 60, 'Lobby name'), stage: '', teams: [],
      games: Array.from({ length: count }, (_, i) => ({ n: i + 1, map: text(maps[i] ?? '', 30, 'Map', false) })),
      scoring: structuredClone(SCORING_PRESETS[game.scoring ?? 'pmgc'].scoring), createdAt: Date.now(),
    };
    this.data.lobbies = [...this.list(), lobby];
    this.data.selectedLobbyId ??= id;
    this.ctx.store.save();
    this.ctx.changed();
    await this.publish();
    return lobby;
  }

  update(id: string, patch: { title?: unknown; stage?: unknown; scoring?: unknown; games?: unknown }) {
    const l = this.find(id);
    const next: Lobby = { ...l };
    if (patch.title !== undefined) next.title = text(patch.title, 60, 'Lobby name');
    if (patch.stage !== undefined) next.stage = text(patch.stage, 40, 'Stage', false);
    if (patch.scoring !== undefined) next.scoring = validScoring(patch.scoring);
    if (patch.games !== undefined) {
      if (!Array.isArray(patch.games) || !patch.games.length || patch.games.length > MAX_GAMES) throw new Error(`A lobby plays 1 to ${MAX_GAMES} games.`);
      // Changing the schedule keeps every result already entered for a game that stays.
      next.games = patch.games.map((g, i) => {
        const x = (g ?? {}) as Record<string, unknown>;
        const had = l.games.find((o) => o.n === i + 1);
        return { ...(had ?? {}), n: i + 1, map: text(x.map, 30, 'Map', false), ...(typeof x.startsAt === 'string' && x.startsAt ? { startsAt: text(x.startsAt, 20, 'Time', false) } : {}) };
      });
    }
    this.put(next);
  }

  /** The lobby's teams, picked from Teams/Players (in order); results for teams taken out are dropped. */
  setTeams(id: string, teamIds: unknown) {
    const l = this.find(id);
    if (!Array.isArray(teamIds) || teamIds.length > MAX_TEAMS) throw new Error(`A lobby has up to ${MAX_TEAMS} teams.`);
    const lib = this.data.teams ?? [];
    const picked = [...new Set(teamIds.map(String))].map((tid) => {
      const t = lib.find((x) => x.id === tid);
      if (!t) throw new Error('A team is no longer in Teams/Players.');
      return this.lobbyTeam(t, l.teams.find((x) => x.teamId === tid)?.id);
    });
    const ids = new Set(picked.map((t) => t.id));
    const games = l.games.map((g) => (g.results ? { ...g, results: g.results.filter((r) => ids.has(r.team)) } : g));
    this.put({ ...l, teams: picked, games });
  }

  private lobbyTeam(t: LibTeam, keepId?: string): LobbyTeam {
    const roster = (this.data.players ?? []).filter((p: LibPlayer) => p.teamId === t.id);
    const players = roster.map((p) => p.gameId || p.name);
    const photos = roster.map((p) => p.photo || '');
    const openIds = roster.map((p) => p.openId || '');
    return { id: keepId ?? randomUUID(), teamId: t.id, name: t.name, tag: t.tag, color: t.color, logo: t.logo, players, ...(photos.some(Boolean) ? { photos } : {}), ...(openIds.some(Boolean) ? { openIds } : {}) };
  }

  /** Teams/Players changed: every lobby follows its teams' names, colours, logos and players. */
  refresh() {
    const lib = new Map((this.data.teams ?? []).map((t) => [t.id, t]));
    let any = false;
    this.data.lobbies = this.list().map((l) => {
      const teams = l.teams.map((t) => { const lt = t.teamId ? lib.get(t.teamId) : null; return lt ? this.lobbyTeam(lt, t.id) : t; });
      if (JSON.stringify(teams) === JSON.stringify(l.teams)) return l;
      any = true;
      return { ...l, teams };
    });
    if (any) { this.ctx.store.save(); this.ctx.changed(); void this.publish(); }
  }

  /** One game's results (place and elims per team). Saving them puts the new standings on air. */
  setResult(id: string, n: number, rows: unknown) {
    const l = this.find(id);
    const game = l.games.find((g) => g.n === n);
    if (!game) throw new Error('That game is not in this lobby.');
    const results = validResults(rows, l.teams);
    // Typed by the producer; a game the feed filled keeps its own copy beside the edit.
    const mark = (g: LobbyGame): LobbyGame => ({ ...g, results, finishedAt: Date.now(), source: 'producer', ...(g.source === 'pcob' && g.results ? { gameResults: g.results } : {}) });
    const next = { ...l, games: l.games.map((g) => (g.n === n ? mark(g) : g)) };
    this.put(next);
    const top = standings(next)[0];
    const lead = top ? l.teams.find((t) => t.id === top.team) : null;
    this.ctx.log(`${l.title}: results of ${gameOf(l.game)?.words?.game.toLowerCase() ?? 'game'} ${n} saved${lead ? ` · ${lead.name} leads on ${top!.total}` : ''}`);
    const won = champion(next);
    if (won && !champion(l)) this.ctx.log(`${l.title}: ${l.teams.find((t) => t.id === won.team)?.name ?? 'A team'} took the title in game ${won.game} (match point)`);
  }

  /**
   * A game the observer feed finished (src/main/br-live.ts): its results go in unless the producer already typed
   * this game (then the game's copy is kept beside them), and its players' numbers are kept either way.
   */
  saveFeed(id: string, n: number, rows: TeamResult[] | null, feed: GameFeed) {
    const l = this.find(id);
    const game = l.games.find((g) => g.n === n);
    if (!game) throw new Error('That game is not in this lobby.');
    const results = rows ? validResults(rows, l.teams) : null;
    const next = (g: LobbyGame): LobbyGame => {
      if (g.source === 'producer' && g.results?.length) return { ...g, feed, ...(results ? { gameResults: results } : {}) };
      return results ? { ...g, results, source: 'pcob', finishedAt: Date.now(), feed } : { ...g, feed };
    };
    this.put({ ...l, games: l.games.map((g) => (g.n === n ? next(g) : g)) });
  }

  /** The producer pairs a PCOB team slot with a lobby team (null: back to automatic). */
  setSeat(id: string, pcobTeamId: number, team: string | null) {
    const l = this.find(id);
    if (team !== null && !l.teams.some((t) => t.id === team)) throw new Error('That team is not in this lobby.');
    const seats = { ...(l.pcobSeats ?? {}) };
    for (const [k, v] of Object.entries(seats)) if (v === team) delete seats[k];
    if (team === null) delete seats[String(pcobTeamId)]; else seats[String(pcobTeamId)] = team;
    this.put({ ...l, pcobSeats: seats });
  }

  /** Teams/Players learns each seated player's OpenID (matched by in-game name, then name, within the team). */
  learnOpenIds(id: string, seen: Array<{ team: string; name: string; openId: string }>) {
    const l = this.find(id);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let any = false;
    for (const s of seen) {
      const teamId = l.teams.find((t) => t.id === s.team)?.teamId;
      if (!teamId) continue;
      const p = (this.data.players ?? []).find((x) => x.teamId === teamId && (norm(x.gameId) === norm(s.name) || norm(x.name) === norm(s.name)));
      if (p && p.openId !== s.openId && !(this.data.players ?? []).some((x) => x.openId === s.openId && x.id !== p.id)) { p.openId = s.openId; any = true; }
    }
    if (any) { this.ctx.store.save(); this.refresh(); }
  }

  /** How the lobby's graphics look (validated by br-graphics.ts `validLook`). */
  setLook(id: string, look: Lobby['look']) { this.put({ ...this.find(id), look }); }

  clearResult(id: string, n: number) {
    const l = this.find(id);
    // The results go; what the observer feed gave (its own results and the players' numbers) stays with the game.
    const keep = (g: LobbyGame): LobbyGame => ({ n: g.n, map: g.map, ...(g.startsAt ? { startsAt: g.startsAt } : {}), ...(g.feed ? { feed: g.feed } : {}), ...(g.source === 'pcob' && g.results ? { gameResults: g.results } : g.gameResults ? { gameResults: g.gameResults } : {}) });
    this.put({ ...l, games: l.games.map((g) => (g.n === n ? keep(g) : g)) });
  }

  async select(id: string | null) {
    if (id !== null) this.find(id);
    this.data.selectedLobbyId = id;
    this.ctx.store.save();
    this.ctx.changed();
    await this.publish();
  }

  remove(id: string) {
    const l = this.find(id);
    if (this.ctx.live(id)) throw new Error('This lobby is live. Stop its data or test before deleting it.');
    this.data.lobbies = this.list().filter((x) => x.id !== l.id);
    if (this.data.selectedLobbyId === id) this.data.selectedLobbyId = null;
    this.ctx.store.save();
    this.ctx.changed();
  }

  /** What the lobby graphics read from the room. */
  static roomField(l: Lobby, scoring: Scoring = l.scoring) {
    const lobby = { ...l, scoring };
    const table = standings(lobby);
    const next = l.games.find((g) => !g.results?.length) ?? null;
    return {
      br: {
        title: l.title, stage: l.stage, game: l.game,
        teams: l.teams.map(({ id, name, tag, color, logo, players, photos }) => ({ id, name, tag, color, logo, players, photos: photos ?? [] })),
        games: l.games.map((g) => ({ n: g.n, map: g.map, startsAt: g.startsAt ?? null, done: !!g.results?.length, results: g.results ?? [] })),
        scoring, standings: table, current: next?.n ?? null, played: l.games.filter((g) => g.results?.length).length,
        champion: champion(lobby),
      },
    };
  }

  async publish() {
    const l = this.selected;
    if (l) await this.ctx.patch(l.code, { ...(this.ctx.extra?.(l) ?? {}), ...Lobbies.roomField(l) });
  }
}
