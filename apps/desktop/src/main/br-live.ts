// The PUBG MOBILE observer feed (24 Nov): Air polls the observer PC's PCOB API (official "PC OB API" v3.0.0,
// read by src/shared/pcob.ts), only after the producer ticks consent and only on this PC or the local network.
// While a game runs it writes `brLive` into the selected lobby's room every poll (an engine restart heals within a
// second); when the game ends it saves the match by itself: places and team kills as the results, and every
// player's final numbers, the kill feed and the circles as the game's feed. Typing results stays as the fallback
// and the producer's edits win (src/main/br-lobbies.ts keeps the game's own copy).
import type { Lobby } from '../shared/api.ts';
import { PCOB_ROUTES, finalResults, readCircle, readGlobal, readInGame, readKills, readPlayers, readTeams, seatTeams, toBrLive, type BrLive, type PcobCircle, type PcobGlobal, type PcobKill, type PcobPlayer, type PcobTeamList } from '../shared/pcob.ts';
import { PCOB_OFF, localHost, type PcobStatus } from '../shared/pcob-status.ts';
import { MVP_WEIGHTS, mvpRating, statOf, type GameFeed } from '../shared/br-stats.ts';

export interface BrLiveContext {
  /** The lobby on the graphics. */
  lobby: () => Lobby | null;
  /** Writes fields into the lobby's room. */
  patch: (code: string, fields: Record<string, unknown>) => Promise<void>;
  /** Saves a finished game (results may be null when not every team got a place). */
  save: (lobbyId: string, game: number, results: Array<{ team: string; place: number; elims: number }> | null, feed: GameFeed) => void;
  /** Teams/Players learns each seated player's OpenID. */
  learn: (lobbyId: string, players: Array<{ team: string; name: string; openId: string }>) => void;
  /** Moments for the lobby's Rundown and autopilot. */
  event?: (name: BrMoment, data: Record<string, unknown>) => void;
  log: (text: string) => void;
  changed: () => void;
  fetch?: typeof fetch;
  now?: () => number;
  /** Tests drive `tick()` themselves. */
  manual?: boolean;
}
export type BrMoment = 'game.start' | 'plane' | 'first.blood' | 'team.out' | 'final.teams' | 'wwcd' | 'game.end';

/** Polls: players, teams and in-game every second; the kill feed, circle and map info every other second. */
const FAST = 1000;
/** After the winner, wait this long for the end-of-game numbers (they read 0 until the game ends). */
const SETTLE = 5000;

export class BrLiveFeed {
  private readonly ctx: BrLiveContext;
  private base: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tickNo = 0;
  private busy = false;
  status: PcobStatus = { ...PCOB_OFF };
  // The current game.
  private inGame = false;
  private game: number | null = null;
  private gameId = '';
  private players: PcobPlayer[] = [];
  private teams: PcobTeamList = { teams: [], gameTime: null, fightingStart: null, finishedStart: null, gameId: '', currentTime: null };
  private kills: PcobKill[] = [];
  private circle: PcobCircle | null = null;
  private global: PcobGlobal | null = null;
  private lastOut: BrLive['lastOut'] = null;
  private placed = new Set<string>();
  private finishedAt: number | null = null;
  private saved = false;
  private said = new Set<string>();
  private shownAt = 0;

  constructor(ctx: BrLiveContext) { this.ctx = ctx; }
  private get now() { return (this.ctx.now ?? Date.now)(); }
  private get fetch() { return this.ctx.fetch ?? fetch; }

  /** Starts polling the observer PC (consent is required every time). */
  connect(host: string, consent: boolean) {
    if (!consent) throw new Error('Tick the box to let Air read game data from the observer PC.');
    const at = localHost(host);
    if (!at) throw new Error('Use the observer PC’s address on your network, for example 192.168.1.20 or 127.0.0.1.');
    this.stop();
    this.base = `http://${at.host}:${at.port}`;
    this.status = { ...PCOB_OFF, state: 'connecting', host: `${at.host}:${at.port}` };
    this.ctx.log(`Game data: reading PCOB at ${at.host}, port ${at.port}`);
    this.ctx.changed();
    this.schedule(0);
  }

  disconnect() {
    if (!this.base) return;
    this.stop();
    this.status = { ...PCOB_OFF, saved: this.status.saved };
    this.ctx.log('Game data: PCOB disconnected');
    this.ctx.changed();
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.base = null; this.inGame = false;
  }

  get live() { return this.status.state === 'live'; }

  /** The producer pairs a PCOB team slot with a lobby team (null clears the pair). */
  seats(lobby: Lobby): Record<string, string> { return lobby.pcobSeats ?? {}; }

  private schedule(ms: number) {
    if (!this.base || this.ctx.manual) return;
    this.timer = setTimeout(() => void this.tick(), ms);
    this.timer.unref?.();
  }

  private async get(route: string) {
    const r = await this.fetch(`${this.base}/${route}`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new Error(`PCOB answered ${r.status} for ${route}`);
    return r.json();
  }

  async tick() {
    if (!this.base || this.busy) return;
    this.busy = true;
    const slow = this.tickNo++ % 2 === 0;
    try {
      const inGame = readInGame(await this.get(PCOB_ROUTES.inGame));
      if (inGame) {
        const [players, teams] = await Promise.all([this.get(PCOB_ROUTES.players), this.get(PCOB_ROUTES.teams)]);
        this.players = readPlayers(players);
        this.teams = readTeams(teams);
        if (slow) {
          const [kills, circle, global] = await Promise.allSettled([this.get(PCOB_ROUTES.kills), this.get(PCOB_ROUTES.circle), this.get(PCOB_ROUTES.global)]);
          if (kills.status === 'fulfilled') this.kills = readKills(kills.value);
          if (circle.status === 'fulfilled') this.circle = readCircle(circle.value);
          if (global.status === 'fulfilled') this.global = readGlobal(global.value) ?? this.global;
        }
      }
      this.status = { ...this.status, lastAt: this.now, error: null };
      await this.step(inGame);
    } catch (e) {
      this.status = { ...this.status, state: 'error', error: e instanceof Error ? e.message.replace(/^fetch failed$/, 'No answer from the observer PC') : String(e) };
      this.ctx.changed();
    } finally {
      this.busy = false;
      // Back off to 3 s while PCOB does not answer.
      this.schedule(this.status.state === 'error' ? 3000 : FAST);
    }
  }

  /** The game's lifecycle from one poll. */
  private async step(inGame: boolean) {
    const lobby = this.ctx.lobby();
    if (inGame && !this.inGame) this.startGame(lobby);
    if (!inGame && this.inGame) { await this.endGame(lobby, 'left'); this.inGame = false; }
    if (!inGame) { this.setState('waiting'); return; }
    this.setState('live');
    if (!lobby || this.game === null) return;
    const seats = seatTeams(this.teams.teams, this.players, lobby.teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, openIds: t.openIds })), this.seats(lobby));
    const slots = this.slots(lobby, seats);
    // Live shows the slots and "last data N s ago": tell it when the pairs change, else every few seconds.
    if (JSON.stringify(slots) !== JSON.stringify(this.status.slots) || this.now - this.shownAt >= 3000) {
      this.status = { ...this.status, slots };
      this.shownAt = this.now;
      this.ctx.changed();
    }
    // A team that reaches a place is out: the newest one is Team eliminated.
    for (const [pcobId, lobbyId] of seats) {
      const rank = Math.max(0, ...this.players.filter((p) => p.teamId === pcobId).map((p) => p.rank));
      if (rank > 1 && !this.placed.has(lobbyId)) { this.placed.add(lobbyId); this.lastOut = { team: lobbyId, place: rank, at: this.now }; this.moment('team.out', { team: lobbyId, place: rank }, `${lobbyId}:${rank}`); }
    }
    if (this.players.some((p) => p.state === 'plane')) this.moment('plane', {}, 'plane');
    const firstKill = this.kills.find((k) => k.kind === 'kill');
    if (firstKill) this.moment('first.blood', { causer: firstKill.causer, victim: firstKill.victim }, 'fb');
    const live = toBrLive({ game: this.game, players: this.players, teams: this.teams, kills: this.kills, circle: this.circle, global: this.global, seats, lastOut: this.lastOut, rate: (p) => mvpRating(p, MVP_WEIGHTS) });
    if (live.teamsAlive > 0 && live.teamsAlive <= 4 && live.teamsAlive < seats.size) this.moment('final.teams', { teams: live.teamsAlive }, `final:${live.teamsAlive}`);
    await this.ctx.patch(lobby.code, { brLive: live });
    // The game is over when PCOB sets the WWCD time or every seated team has a place.
    const results = finalResults(this.players, this.teams, seats);
    if ((this.teams.finishedStart || results) && this.finishedAt === null) {
      this.finishedAt = this.now;
      const win = results?.find((r) => r.place === 1);
      if (win) this.moment('wwcd', { team: win.team }, 'wwcd');
    }
    if (this.finishedAt !== null && !this.saved && this.now - this.finishedAt >= SETTLE) await this.endGame(lobby, 'finished');
  }

  private startGame(lobby: Lobby | null) {
    this.inGame = true;
    // The poll that saw the game start already read this game's players, teams and feed: keep them.
    this.lastOut = null; this.placed = new Set(); this.finishedAt = null; this.saved = false; this.said = new Set();
    // The next match without results; none left means the feed shows live data but saves nothing.
    const next = lobby?.games.find((g) => !g.results?.length) ?? null;
    this.game = next?.n ?? null;
    this.gameId = '';
    this.status.game = this.game;
    if (!lobby) this.ctx.log('Game data: a game started, but no lobby is on the graphics');
    else if (!next) this.ctx.log(`Game data: a game started, but every match of ${lobby.title} has results. Add a match to save it.`);
    else { this.ctx.log(`Game data: match ${next.n} of ${lobby.title} started${next.map ? ` · ${next.map}` : ''}`); this.moment('game.start', { game: next.n }, 'start'); }
  }

  /** Saves the game once: on the settled end, or with what Air has when PCOB leaves the game early. */
  private async endGame(lobby: Lobby | null, why: 'finished' | 'left') {
    if (this.saved || !lobby || this.game === null || !this.players.length) return;
    this.saved = true;
    const seats = seatTeams(this.teams.teams, this.players, lobby.teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, openIds: t.openIds })), this.seats(lobby));
    const results = finalResults(this.players, this.teams, seats);
    const feed: GameFeed = {
      source: 'pcob', gameId: this.teams.gameId || this.gameId,
      stats: this.players.map((p) => statOf(p, seats.get(p.teamId) ?? null)),
      kills: this.kills, circles: this.global?.circles ?? [], plane: this.global?.plane ?? null, savedAt: this.now,
    };
    this.ctx.save(lobby.id, this.game, results, feed);
    this.ctx.learn(lobby.id, feed.stats.filter((s) => s.team && s.openId).map((s) => ({ team: s.team!, name: s.name, openId: s.openId })));
    this.status.saved = { game: this.game, at: this.now };
    this.ctx.log(results ? `Game data: match ${this.game} saved from the game (places, kills and every player's numbers)` : `Game data: match ${this.game} ended ${why === 'left' ? 'early' : ''} without a place for every team; its players' numbers are saved, type the results`);
    this.moment('game.end', { game: this.game, results: !!results }, 'end');
    this.ctx.changed();
  }

  private moment(name: BrMoment, data: Record<string, unknown>, once: string) {
    if (this.said.has(once)) return;
    this.said.add(once);
    this.ctx.event?.(name, data);
  }

  private setState(state: PcobStatus['state']) {
    if (this.status.state !== state) { this.status = { ...this.status, state, ...(state === 'waiting' ? { game: null } : {}) }; this.ctx.changed(); }
  }

  private slots(lobby: Lobby, seats: Map<number, string>) {
    const manual = this.seats(lobby);
    const ids = [...new Set([...this.teams.teams.map((t) => t.teamId), ...this.players.map((p) => p.teamId)])].sort((a, b) => a - b);
    return ids.map((id) => ({
      teamId: id,
      name: this.teams.teams.find((t) => t.teamId === id)?.name || this.players.find((p) => p.teamId === id)?.teamName || `Team ${id}`,
      players: this.players.filter((p) => p.teamId === id).map((p) => p.name),
      seat: seats.get(id) ?? null, manual: !!manual[String(id)],
    }));
  }
}
