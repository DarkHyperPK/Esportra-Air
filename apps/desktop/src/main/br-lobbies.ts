// Battle royale lobbies (20 Nov): many teams, several games, scored by placement and eliminations
// (src/shared/br.ts). Kept beside matches, never inside them: a lobby is not a two-team match. The selected
// lobby's room gets one field, `br`, that the lobby graphics read: teams, games, scoring and the standings.

import { randomUUID } from 'node:crypto';
import type { LibTeam, LibPlayer, Lobby } from '../shared/api.ts';
import { SCORING_PRESETS, champion, gamePoints, gameState, standings, validResults, validScoring, type GameChecks, type LobbyGame, type LobbyTeam, type Scoring, type TeamResult } from '../shared/br.ts';
import { cleanUid } from '../shared/uid.ts';
import { currentMatch, isBusy, liveMatch, normalizeLobby, standingsView, targetMatch } from '../shared/br-run.ts';
import { playerTotals, teamTotals, type GameFeed } from '../shared/br-stats.ts';
import { patchShow, showOf } from '../shared/br-rundown.ts';
import { gameOf, isCoach, type GameId } from '../shared/games.ts';
import type { Store } from './store.ts';
import type { EventJournal } from './event-journal.ts';

export interface LobbyContext {
  store: Store;
  /** Writes fields into a room of the graphics engine (no-op while it is stopped). */
  patch: (code: string, fields: Record<string, unknown>) => Promise<void>;
  /** True while this lobby is on air (its game data or a test runs): it can't be deleted then. */
  live: (lobbyId: string) => boolean;
  log: (text: string) => void;
  changed: () => void;
  /** A match got its first results typed by the producer (the post-game Rundown can run). */
  typed?: (lobby: Lobby, game: number) => void;
  /** Room fields the lobby graphics read besides `br` (src/main/br-graphics.ts). */
  extra?: (lobby: Lobby) => Record<string, unknown>;
  /** The event journal (27 Nov): every change to a lobby's structure or results is also written there. */
  journal?: EventJournal;
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

  /**
   * Writes one line to the event's journal. A lobby the journal has not met yet gets a baseline of what it was before
   * this change, so the journal alone can rebuild it. A journal that cannot be written is logged and never stops the change.
   */
  note(l: Lobby, kind: string, data: Record<string, unknown> = {}) {
    const j = this.ctx.journal;
    if (!j) return;
    try {
      if (kind !== 'lobby.create' && !j.knows(l.eventId, l.id)) {
        const results: Record<number, TeamResult[]> = {};
        for (const g of l.games) if (g.results?.length) results[g.n] = g.results;
        j.append(l.eventId, 'lobby.baseline', { lobbyId: l.id, title: l.title, game: l.game, teams: l.teams.map((t) => t.id), games: l.games.length, results });
      }
      j.append(l.eventId, kind, { lobbyId: l.id, ...data });
    } catch (e) {
      this.ctx.log(`Could not write the event journal: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Hook for points added or taken away later (Esportra adjustments): recorded with its reason, standings unchanged. */
  noteAdjustment(id: string, data: Record<string, unknown>) {
    const l = this.find(id);
    this.note(l, 'adjust', data);
  }
  /** Every lobby, with days, match ids and states (older lobbies are brought up to date on first sight). */
  list(): Lobby[] {
    const all = this.data.lobbies ?? [];
    if (all.some((l) => normalizeLobby(l) !== l)) this.data.lobbies = all.map(normalizeLobby);
    return this.data.lobbies ?? [];
  }
  /** The lobby a match is being read in (live or finishing), if any: nothing else may change until it is confirmed or ended. */
  busy(): Lobby | null { return this.list().find(isBusy) ?? null; }
  get selected(): Lobby | null { return this.list().find((l) => l.id === this.data.selectedLobbyId) ?? null; }
  find(id: string) {
    const l = this.list().find((x) => x.id === id);
    if (!l) throw new Error('That lobby is gone.');
    return l;
  }

  /** Saves a changed lobby (journalled under `kind` when given) and puts it on the graphics when selected. */
  commit(next: Lobby, kind?: string, data: Record<string, unknown> = {}) {
    if (kind) this.note(this.find(next.id), kind, data);
    this.put(next);
  }

  private put(raw: Lobby) {
    const next = normalizeLobby(raw);
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
    this.note(lobby, 'lobby.create', { title: lobby.title, game: lobby.game, games: lobby.games.length, teams: [], maps: lobby.games.map((g) => g.map) });
    this.data.lobbies = [...this.list(), normalizeLobby(lobby)];
    this.data.selectedLobbyId ??= id;
    this.ctx.store.save();
    this.ctx.changed();
    await this.publish();
    return this.find(id);
  }

  /** Adds a finished lobby built elsewhere (Copy this lobby): journalled like a new one, put on the graphics when nothing is. */
  async adopt(raw: Lobby) {
    const lobby = normalizeLobby(raw);
    this.note(lobby, 'lobby.create', { title: lobby.title, game: lobby.game, games: lobby.games.length, teams: [], maps: lobby.games.map((g) => g.map) });
    this.data.lobbies = [...this.list(), lobby];
    this.data.selectedLobbyId ??= lobby.id;
    this.ctx.store.save();
    this.ctx.changed();
    await this.publish();
    return this.find(lobby.id);
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
        return { ...(had ?? {}), n: i + 1, map: text(x.map, 30, 'Map', false), ...(typeof x.startsAt === 'string' && x.startsAt ? (() => { const t = text(x.startsAt, 20, 'Time', false); return { startsAt: t, ...(/^\d{1,2}:\d{2}$/.test(t) ? { scheduledAt: t } : {}) }; })() : {}) };
      });
    }
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = next.title;
    if (patch.stage !== undefined) fields.stage = next.stage;
    if (patch.scoring !== undefined) fields.scoring = next.scoring;
    if (patch.games !== undefined) fields.games = next.games.map((g) => ({ n: g.n, map: g.map, startsAt: g.startsAt ?? null }));
    this.note(l, 'lobby.update', { fields });
    this.put(next);
  }

  /** The lobby's teams, picked from Teams/Players (in order); results for teams taken out are dropped. */
  setTeams(id: string, teamIds: unknown) {
    const l = this.find(id);
    const held = targetMatch(l);
    if (held) throw new Error(`Match ${held.n} is ${gameState(held)}. ${gameState(held) === 'armed' ? 'Disarm it' : 'Confirm, remake or end it'} before changing the lobby’s teams.`);
    if (!Array.isArray(teamIds) || teamIds.length > MAX_TEAMS) throw new Error(`A lobby has up to ${MAX_TEAMS} teams.`);
    const lib = this.data.teams ?? [];
    const picked = [...new Set(teamIds.map(String))].map((tid) => {
      const t = lib.find((x) => x.id === tid);
      if (!t) throw new Error('A team is no longer in Teams/Players.');
      return this.lobbyTeam(t, l.teams.find((x) => x.teamId === tid)?.id);
    });
    const ids = new Set(picked.map((t) => t.id));
    const games = l.games.map((g) => (g.results ? { ...g, results: g.results.filter((r) => ids.has(r.team)) } : g));
    this.note(l, 'lobby.teams', { teams: picked.map((t) => t.id) });
    this.put({ ...l, teams: picked, games });
  }

  private lobbyTeam(t: LibTeam, keepId?: string): LobbyTeam {
    // A coach belongs to the team but is never in the game: not on the squad, not counted, not matched.
    const roster = (this.data.players ?? []).filter((p: LibPlayer) => p.teamId === t.id && !isCoach(p.role));
    const players = roster.map((p) => p.gameId || p.name);
    const photos = roster.map((p) => p.photo || '');
    const openIds = roster.map((p) => p.openId || '');
    const uids = roster.map((p) => p.uid || '');
    return { id: keepId ?? randomUUID(), teamId: t.id, name: t.name, tag: t.tag, color: t.color, logo: t.logo, players, playerIds: roster.map((p) => p.id), ...(photos.some(Boolean) ? { photos } : {}), ...(openIds.some(Boolean) ? { openIds } : {}), ...(uids.some(Boolean) ? { uids } : {}) };
  }

  /** Teams/Players changed: every lobby follows its teams' names, colours, logos and players. */
  refresh() {
    const lib = new Map((this.data.teams ?? []).map((t) => [t.id, t]));
    let any = false;
    this.data.lobbies = this.list().map((l) => {
      const teams = l.teams.map((t) => { const lt = t.teamId ? lib.get(t.teamId) : null; return lt ? this.lobbyTeam(lt, t.id) : t; });
      if (JSON.stringify(teams) === JSON.stringify(l.teams)) return l;
      any = true;
      // Roster changes are journalled, so the next day's Start day can list who changed since yesterday.
      for (const [i, t] of teams.entries()) {
        const was = l.teams[i]!.players, added = t.players.filter((p) => !was.includes(p)), removed = was.filter((p) => !t.players.includes(p));
        if (added.length || removed.length) this.note(l, 'roster.change', { team: t.id, name: t.name, added, removed });
      }
      return { ...l, teams };
    });
    if (any) { this.ctx.store.save(); this.ctx.changed(); void this.publish(); }
  }

  /** One game's results (place and elims per team). Saving them puts the new standings on air. */
  setResult(id: string, n: number, rows: unknown) {
    const l = this.find(id);
    const game = l.games.find((g) => g.n === n);
    if (!game) throw new Error('That game is not in this lobby.');
    const state = gameState(game);
    if (state === 'confirmed') throw new Error(`Match ${n} is confirmed. Edit it with a reason instead.`);
    if (state === 'void') throw new Error(`Match ${n} is void. Arm it again to play or type it.`);
    const results = validResults(rows, l.teams);
    // Typed by the producer; a game the feed filled keeps its own copy beside the edit. A match typed without being
    // played (or one that was only armed) becomes provisional: Confirm makes it official.
    const mark = (g: LobbyGame): LobbyGame => ({ ...g, results, finishedAt: Date.now(), source: 'producer', ...(state === 'scheduled' || state === 'armed' ? { state: 'provisional' as const } : {}), ...(g.source === 'pcob' && g.results ? { gameResults: g.results } : {}) });
    const next = { ...l, games: l.games.map((g) => (g.n === n ? mark(g) : g)) };
    this.note(l, 'result.set', { game: n, results, source: 'producer' });
    this.put(next);
    const top = standings(next, { provisional: true })[0];
    const lead = top ? l.teams.find((t) => t.id === top.team) : null;
    this.ctx.log(`${l.title}: results of ${gameOf(l.game)?.words?.game.toLowerCase() ?? 'game'} ${n} saved (provisional)${lead ? ` · ${lead.name} would lead on ${top!.total}` : ''}`);
    if (!game.results?.length) this.ctx.typed?.(next, n);
  }

  /**
   * A game the observer feed finished (src/main/br-live.ts): its results go in unless the producer already typed
   * this game (then the game's copy is kept beside them), and its players' numbers are kept either way.
   */
  saveFeed(id: string, n: number, rows: TeamResult[] | null, feed: GameFeed, extra: { draft?: LobbyGame['draft']; checks?: GameChecks; at?: number } = {}) {
    const l = this.find(id);
    const game = l.games.find((g) => g.n === n);
    if (!game) throw new Error('That game is not in this lobby.');
    if (gameState(game) === 'confirmed' || gameState(game) === 'void') throw new Error(`Match ${n} is ${gameState(game)}; game data is not saved into it.`);
    const results = rows ? validResults(rows, l.teams) : null;
    // What the game gave lands as provisional, never official: the producer confirms it.
    const end = extra.at ?? Date.now();
    const attempts = (game.attempts ?? []).map((a, i, all) => (i === all.length - 1 ? { ...a, endedAt: end, reason: 'ended' as const } : a));
    const next = (g: LobbyGame): LobbyGame => {
      const base: LobbyGame = { ...g, feed, state: 'provisional', attempts, ...(extra.checks ? { checks: extra.checks } : {}), ...(extra.draft && !results ? { draft: extra.draft } : {}) };
      if (g.source === 'producer' && g.results?.length) return { ...base, ...(results ? { gameResults: results } : {}) };
      return results ? { ...base, results, source: 'pcob', finishedAt: end } : base;
    };
    const applied = !!results && !(game.source === 'producer' && game.results?.length);
    this.note(l, 'result.feed', { game: n, results: applied ? results : null, applied, source: 'pcob', state: 'provisional' });
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

  /**
   * The roster check (28 Nov, test games only): writes a Character ID onto a Teams/Players player. Refused while a match
   * is live, so a roster never changes under a game being read; the change is journalled with the player and the id.
   */
  setPlayerUid(id: string, playerId: string, uid: string) {
    const l = this.find(id);
    const live = liveMatch(l);
    if (live) throw new Error(`Match ${live.n} is live. The roster only changes in a test game, never while a match is being read.`);
    const { uid: clean, problem } = cleanUid(uid);
    if (problem || !clean) throw new Error(problem ?? 'Choose a UID.');
    const players = this.data.players ?? [];
    const p = players.find((x) => x.id === playerId);
    if (!p) throw new Error('That player is no longer in Teams/Players.');
    const owner = players.find((x) => x.uid === clean && x.id !== p.id);
    if (owner) throw new Error(`${clean} is already ${owner.name}’s UID.`);
    p.uid = clean;
    this.ctx.store.save();
    const team = l.teams.find((t) => t.teamId === p.teamId);
    this.note(l, 'roster.change', { team: team?.id ?? '', name: team?.name ?? '', added: [`${p.gameId || p.name} (UID ${clean})`], removed: [], uid: clean, player: p.gameId || p.name });
    this.refresh();
  }

  /** Moments, the Rundown, autopilot and the post-game pick (src/shared/br-rundown.ts). */
  setShow(id: string, patch: Record<string, unknown>) {
    const l = this.find(id);
    this.put({ ...l, show: patchShow(showOf(l), patch, l.games.length) });
  }

  /** How the lobby's graphics look (validated by br-graphics.ts `validLook`). */
  setLook(id: string, look: Lobby['look']) { this.put({ ...this.find(id), look }); }

  clearResult(id: string, n: number) {
    const l = this.find(id);
    const state = gameState(l.games.find((g) => g.n === n) ?? { n, map: '' });
    if (state === 'confirmed') throw new Error(`Match ${n} is confirmed. Edit it with a reason instead.`);
    if (state === 'live' || state === 'finishing') throw new Error(`Match ${n} is being played. End or remake it first.`);
    // The results go; what the observer feed gave (its own results and the players' numbers) stays with the game.
    this.note(l, 'result.clear', { game: n });
    const keep = (g: LobbyGame): LobbyGame => {
      const { results: _r, finishedAt: _f, source: _s, gameResults: _gr, draft: _d, checks: _c, ...rest } = g;
      return { ...rest, state: state === 'provisional' ? 'scheduled' : (g.state ?? 'scheduled'), ...(g.source === 'pcob' && g.results ? { gameResults: g.results } : g.gameResults ? { gameResults: g.gameResults } : {}) };
    };
    this.put({ ...l, games: l.games.map((g) => (g.n === n ? keep(g) : g)) });
  }

  async select(id: string | null) {
    if (id !== null) this.find(id);
    const busy = this.busy();
    if (busy && busy.id !== id) throw new Error(`Match ${liveMatch(busy)!.n} of ${busy.title} is live. Confirm, remake or end it before switching lobby.`);
    this.data.selectedLobbyId = id;
    this.ctx.store.save();
    this.ctx.changed();
    await this.publish();
  }

  remove(id: string) {
    const l = this.find(id);
    if (this.ctx.live(id) || isBusy(l)) throw new Error('This lobby is live. Confirm, remake or end its match, or stop its data, before deleting it.');
    this.note(l, 'lobby.delete');
    this.data.lobbies = this.list().filter((x) => x.id !== l.id);
    if (this.data.selectedLobbyId === id) this.data.selectedLobbyId = null;
    this.ctx.store.save();
    this.ctx.changed();
  }

  /** What the lobby graphics read from the room. */
  static roomField(l: Lobby, scoring: Scoring = l.scoring) {
    const lobby = { ...l, scoring };
    // Official standings by default (confirmed matches and adjustments); the provisional view rides along, marked.
    const view = standingsView(lobby);
    const next = currentMatch(lobby);
    return {
      br: {
        title: l.title, stage: l.stage, game: l.game,
        teams: l.teams.map(({ id, name, tag, color, logo, players, photos }) => ({ id, name, tag, color, logo, players, photos: photos ?? [] })),
        games: l.games.map((g) => ({ n: g.n, map: g.map, startsAt: g.startsAt ?? null, done: !!g.results?.length, state: gameState(g), results: g.results ?? [] })),
        scoring, standings: view.official, provisional: view.provisional ? { standings: view.provisional, games: view.provisionalGames } : null,
        adjustments: (l.adjustments ?? []).map(({ team, points, reason }) => ({ team, points, reason })),
        current: next?.n ?? null, played: l.games.filter((g) => gameState(g) === 'confirmed' && g.results?.length).length,
        champion: champion(lobby),
      },
      brStats: Lobbies.stats(lobby), brPick: showOf(l).pick, brLtf: showOf(l).ltf,
    };
  }

  /**
   * The numbers the post-game graphics and Insights read (room field `brStats`): each match the observer feed saved
   * (every player with an MVP rating, every team's totals, the results with points) and the day's totals.
   */
  static stats(l: Lobby) {
    const fed = l.games.filter((g) => g.feed?.stats.length);
    if (!fed.length) return null;
    const pts = (g: LobbyGame) => (g.results ?? []).map((r) => ({ ...r, pts: gamePoints(r, l.scoring).total }));
    const games = fed.map((g) => ({ n: g.n, map: g.map, players: playerTotals([g.feed!]), teams: teamTotals([g.feed!]), results: pts(g) }));
    return { day: playerTotals(fed.map((g) => g.feed!)), teams: teamTotals(fed.map((g) => g.feed!)), games };
  }

  async publish() {
    const l = this.selected;
    if (l) await this.ctx.patch(l.code, { ...(this.ctx.extra?.(l) ?? {}), ...Lobbies.roomField(l) });
  }
}
