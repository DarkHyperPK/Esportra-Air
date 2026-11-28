// The PUBG MOBILE observer feed (24 Nov): Air polls the observer PC's PCOB API (official "PC OB API" v3.0.0,
// read by src/shared/pcob.ts), only after the producer ticks consent and only on this PC or the local network.
// While a game runs it writes `brLive` into the selected lobby's room every poll (an engine restart heals within a
// second); when the game ends it saves the match by itself: places and team kills as the results, and every
// player's final numbers, the kill feed and the circles as the game's feed. Typing results stays as the fallback
// and the producer's edits win (src/main/br-lobbies.ts keeps the game's own copy).
import type { Lobby } from '../shared/api.ts';
import { NO_META, PCOB_ROUTES, allButOnePlaced, finishedValid, hasAfterMatch, mergeKills, mergeMeta, proposeResults, readCircle, readGlobal, readInGame, readKills, readMeta, readPlayers, readTeams, seatTeams, toBrLive, weakerReading, type PcobMeta, type BrLive, type PcobCircle, type PcobGlobal, type PcobKill, type PcobPlayer, type PcobTeamList } from '../shared/pcob.ts';
import { NO_DATA_MS, PCOB_OFF, localHost, type PcobStatus } from '../shared/pcob-status.ts';
import type { GameChecks, MatchState } from '../shared/br.ts';
import { gameChecks, type BrCheckpoint } from '../shared/br-run.ts';
import { MVP_WEIGHTS, mvpRating, statOf, type GameFeed } from '../shared/br-stats.ts';
import { MOMENT_SECONDS, showOf, type BrMomentKind, type BrMomentShown } from '../shared/br-rundown.ts';
import { standings } from '../shared/br.ts';

export interface BrLiveContext {
  /** The lobby on the graphics. */
  lobby: () => Lobby | null;
  /** Writes fields into the lobby's room. */
  patch: (code: string, fields: Record<string, unknown>) => Promise<void>;
  /** Saves a finished game as provisional (results may be null when not every team got a place; `draft` then has what the game gave). */
  save: (lobbyId: string, game: number, results: Array<{ team: string; place: number; elims: number }> | null, feed: GameFeed, extra: { draft: Array<{ team: string; place: number | null; elims: number }>; checks: GameChecks; at: number }) => void;
  /** The match Air saves into: the armed one (or the one already live), by number. Nothing armed: the data is only kept in memory. */
  target: (lobby: Lobby) => { n: number; state: MatchState } | null;
  /** The feed's match went live (a game started in the armed match), or a winner is known and it is finishing. */
  state: (lobbyId: string, n: number, to: 'live' | 'finishing', at: number) => void;
  /** Live state saved every 2 s (null clears it once the match is saved or the feed stops). */
  checkpoint?: (cp: Omit<BrCheckpoint, 'matchId' | 'attempt'> | null) => void;
  /** Teams/Players learns each seated player's OpenID. */
  learn: (lobbyId: string, players: Array<{ team: string; name: string; openId: string }>) => void;
  /** Moments for the lobby's Rundown and autopilot. */
  event?: (name: BrMoment, data: Record<string, unknown>) => void;
  log: (text: string) => void;
  changed: () => void;
  fetch?: typeof fetch;
  /** Record PCOB: every raw answer (status 0 = no answer, body = the error text), exactly as received. */
  tap?: (route: string, status: number, body: string) => void;
  /** Record PCOB: Air's own decisions (game start, game end, results saved). */
  air?: (event: Record<string, unknown>) => void;
  /** True while Record PCOB is on: every route is then read every second. */
  recording?: () => boolean;
  now?: () => number;
  /** Tests drive `tick()` themselves. */
  manual?: boolean;
}
export type BrMoment = 'game.start' | 'plane' | 'first.blood' | 'team.out' | 'zone' | 'final.teams' | 'wwcd' | 'game.end';

/** Polls: players, teams and in-game every second; the kill feed, circle and map info every other second. */
const FAST = 1000;
/**
 * After the game is over, wait for the end-of-game numbers (they read 0 until the game ends): until they turn non-zero and one
 * more reading has come (PCOB pushes every 2 s), and never longer than NUMBERS_MAX (open question 9). The match is provisional
 * either way, and Update from game refills them later.
 */
const NUMBERS_SETTLE = 2000;
const NUMBERS_MAX = 15000;

export class BrLiveFeed {
  private readonly ctx: BrLiveContext;
  private base: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tickNo = 0;
  private busy = false;
  status: PcobStatus = { ...PCOB_OFF };
  /** The last `brLive` written, for Live › Insights (kept until the next game starts). */
  last: BrLive | null = null;
  // The current game.
  private inGame = false;
  private game: number | null = null;
  private gameId = '';
  /** GameID and the times, from whichever routes carry them (open question 1). */
  private meta: PcobMeta = NO_META;
  private numbersAt: number | null = null;
  private prevKills = new Map<string, number>();
  private killsObserved = false;
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
  // Verified-data rules (27 Nov): when a number last changed, the last checkpoint, and a restart to resume from.
  private signature = '';
  private lastChange: number | null = null;
  private lastCp = 0;
  private resumeCp: Omit<BrCheckpoint, 'matchId' | 'attempt'> | null = null;
  // Moments over the HUD: one at a time, each for MOMENT_SECONDS, the rest wait their turn.
  private queue: BrMomentShown[] = [];
  private current: BrMomentShown | null = null;
  private leader: { name: string; at: number } | null = null;

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
    this.ctx.checkpoint?.(null);
  }

  /** After a restart: the next game this feed sees in that live match carries on from the checkpoint (placed teams, moments shown). */
  resume(cp: Omit<BrCheckpoint, 'matchId' | 'attempt'> | null) {
    this.resumeCp = cp;
    // Already reading that match (Game data connected before Resume was pressed): restore its memory now.
    if (cp && this.game === cp.n && this.inGame && !this.saved) { this.placed = new Set(cp.placed); this.said = new Set(cp.moments); this.resumeCp = null; }
  }

  get live() { return this.status.state === 'live'; }

  /** The players and teams of the game being read now (the roster check; no players while PCOB lists none yet), or null when no game is on. */
  gameNow(): { players: PcobPlayer[]; teams: PcobTeamList['teams'] } | null {
    return this.status.state === 'live' && this.inGame ? { players: this.players, teams: this.teams.teams } : null;
  }

  /** The producer pairs a PCOB team slot with a lobby team (null clears the pair). */
  seats(lobby: Lobby): Record<string, string> { return lobby.pcobSeats ?? {}; }

  private schedule(ms: number) {
    if (!this.base || this.ctx.manual) return;
    this.timer = setTimeout(() => void this.tick(), ms);
    this.timer.unref?.();
  }

  private async get(route: string) {
    let status = 0, text = '';
    try {
      const r = await this.fetch(`${this.base}/${route}`, { signal: AbortSignal.timeout(1500) });
      status = r.status;
      text = await r.text();
    } catch (e) {
      this.ctx.tap?.(route, 0, e instanceof Error ? e.message : String(e));
      throw e;
    }
    this.ctx.tap?.(route, status, text);
    if (status < 200 || status > 299) throw new Error(`PCOB answered ${status} for ${route}`);
    return JSON.parse(text) as unknown;
  }

  async tick() {
    if (!this.base || this.busy) return;
    this.busy = true;
    const slow = this.tickNo++ % 2 === 0;
    try {
      const inGameRaw = await this.get(PCOB_ROUTES.inGame);
      const inGame = readInGame(inGameRaw);
      if (inGame && !this.inGame) this.forgetReading();
      if (inGame) {
        this.noteMeta(inGameRaw);
        const [players, teams] = await Promise.all([this.get(PCOB_ROUTES.players), this.get(PCOB_ROUTES.teams)]);
        this.noteMeta(players); this.noteMeta(teams);
        // A blank or emptier answer (PCOB going quiet after the end) never replaces the last full reading.
        const nextPlayers = readPlayers(players), nextTeams = readTeams(teams);
        if (!weakerReading(this.players, nextPlayers, this.finishedAt !== null)) this.players = nextPlayers;
        if (nextTeams.teams.length || !this.teams.teams.length) this.teams = nextTeams;
        if (slow) {
          const [kills, circle, global] = await Promise.allSettled([this.get(PCOB_ROUTES.kills), this.get(PCOB_ROUTES.circle), this.get(PCOB_ROUTES.global)]);
          if (kills.status === 'fulfilled') { this.noteMeta(kills.value); this.kills = mergeKills(this.kills, readKills(kills.value)); }
          if (circle.status === 'fulfilled') { this.noteMeta(circle.value); this.circle = readCircle(circle.value) ?? this.circle; }
          if (global.status === 'fulfilled') { this.noteMeta(global.value); this.global = readGlobal(global.value) ?? this.global; }
        }
        this.teams = { ...this.teams, gameTime: this.meta.gameTime, fightingStart: this.meta.fightingStart, finishedStart: this.meta.finishedStart, gameId: this.meta.gameId };
      }
      if (this.ctx.recording?.()) await this.readRest(inGame, slow);
      this.status = { ...this.status, lastAt: this.now, error: null };
      if (inGame) this.noteChange();
      await this.step(inGame);
      this.watchData();
    } catch (e) {
      this.status = { ...this.status, state: 'error', error: e instanceof Error ? e.message.replace(/^fetch failed$/, 'No answer from the observer PC') : String(e) };
      this.watchData();
      this.ctx.changed();
    } finally {
      this.busy = false;
      // Back off to 3 s while PCOB does not answer.
      this.schedule(this.status.state === 'error' ? 3000 : FAST);
    }
  }

  /** A new game: nothing of the last one's readings is kept (an empty answer must not bring them back). */
  private forgetReading() {
    this.players = []; this.kills = []; this.circle = null; this.global = null;
    this.teams = { teams: [], gameTime: null, fightingStart: null, finishedStart: null, gameId: '', currentTime: null };
    this.meta = NO_META; this.gameId = ''; this.prevKills = new Map(); this.killsObserved = false; this.numbersAt = null;
  }

  /**
   * GameID and the times from whichever route carries them (open question 1). A GameID that changes while the match is live
   * only adds the remake hint (question 2), and only when a GameID was seen before; nothing is ended, saved or cleared.
   */
  private noteMeta(raw: unknown) {
    this.meta = mergeMeta(this.meta, readMeta(raw));
    const id = this.meta.gameId;
    if (!id) return;
    if (!this.gameId) { this.gameId = id; return; }
    if (id !== this.gameId) {
      this.gameId = id;
      if (this.game !== null && !this.saved) {
        this.status = { ...this.status, restarted: true };
        this.ctx.log(`Game data: the game's ID changed while Match ${this.game} was live. Remake it if the earlier game was thrown away.`);
        this.ctx.changed();
      }
    }
  }

  /** While recording: every route every second, whether or not a game runs (what the routes say between games is one of the open questions). */
  private async readRest(inGame: boolean, slow: boolean) {
    const done = new Set<string>([PCOB_ROUTES.inGame]);
    if (inGame) { done.add(PCOB_ROUTES.players); done.add(PCOB_ROUTES.teams); }
    if (inGame && slow) { done.add(PCOB_ROUTES.kills); done.add(PCOB_ROUTES.circle); done.add(PCOB_ROUTES.global); }
    await Promise.allSettled(Object.values(PCOB_ROUTES).filter((r) => !done.has(r)).map((r) => this.get(r)));
  }

  /** The game's lifecycle from one poll. */
  private async step(inGame: boolean) {
    const lobby = this.ctx.lobby();
    if (inGame && !this.inGame) this.startGame(lobby);
    if (!inGame && this.inGame) { this.leftGame(lobby); this.inGame = false; }
    if (!inGame) { this.setState('waiting'); return; }
    this.setState('live');
    // A game is on with nothing armed: keep reading, and adopt the match the moment the producer arms it.
    if (lobby && this.game === null) this.attach(lobby);
    if (!lobby || this.game === null) return;
    const seats = seatTeams(this.teams.teams, this.players, lobby.teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, openIds: t.openIds, uids: t.uids })), this.seats(lobby));
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
    const teamOf = (name: string) => seats.get(this.players.find((p) => p.name === name)?.teamId ?? -1) ?? null;
    // First blood comes from the players' killNum (verified), not from the kill feed; the feed only names the victim and distance.
    const grew = this.noteKills();
    if (grew.length && this.moment('first.blood', { causer: grew[0]!.name }, 'fb')) {
      const line = this.kills.find((k) => k.kind === 'kill' && grew.some((p) => p.name === k.causer)) ?? this.kills.find((k) => grew.some((p) => p.name === k.causer));
      const causer = line?.causer ?? grew[0]!.name;
      this.show(lobby, { kind: 'first.blood', team: teamOf(causer) ?? undefined, causer, ...(line ? { victim: line.victim, distance: Math.round(line.distance) || undefined } : {}) });
    }
    const on = showOf(lobby).moments;
    const live = toBrLive({ game: this.game, players: this.players, teams: this.teams, kills: this.kills, circle: this.circle, global: this.global, seats, lastOut: on['team.out'] ? this.lastOut : null, rate: (p) => mvpRating(p, MVP_WEIGHTS) });
    if (live.teamsAlive > 0 && live.teamsAlive <= 4 && live.teamsAlive < seats.size && this.moment('final.teams', { teams: live.teamsAlive }, `final:${live.teamsAlive}`) && live.teamsAlive === 4) {
      this.show(lobby, { kind: 'final.teams', teams: Object.entries(live.teams).filter(([, t]) => t.place === null && /[ak]/.test(t.players)).map(([id]) => id) });
    }
    this.killLeader(lobby, live.players);
    const z = this.circle;
    if (z && z.status === 'move' && z.index >= 3 && this.moment('zone', { index: z.index }, `zone:${z.index}`)) this.show(lobby, { kind: 'zone' });
    this.last = { ...live, moment: this.nextMoment() };
    await this.ctx.patch(lobby.code, { brLive: this.last });
    // The game is over when PCOB sets a valid winner time, every seated team has a place, or every team but one has one
    // (open question 3). The producer's End match is the other way and never needs PCOB to say anything.
    const proposal = proposeResults(this.players, this.teams, seats);
    const complete = !!proposal.rows && !proposal.lastStanding;
    const timeUp = finishedValid(this.teams), lastOne = allButOnePlaced(this.players, this.teams);
    if ((timeUp || complete || lastOne) && this.finishedAt === null) {
      this.finishedAt = this.now;
      this.status = { ...this.status, noWinner: false };
      this.ctx.state(lobby.id, this.game, 'finishing', this.now);
      const win = proposal.draft.find((r) => r.place === 1);
      this.ctx.air?.({ name: 'game.end.detected', why: timeUp ? (complete ? 'finishedStart and every place' : 'finishedStart') : complete ? 'every place' : 'every team but one placed', winner: win?.team ?? null, lastStanding: proposal.lastStanding });
    }
    // WWCD once, as soon as the game is over and a winner is known (rank 1, or the one team left when PCOB writes no rank 1).
    const winner = this.finishedAt !== null ? proposal.draft.find((r) => r.place === 1) : undefined;
    if (winner) this.moment('wwcd', { team: winner.team, ...(proposal.lastStanding ? { lastStanding: true } : {}) }, 'wwcd');
    if (this.finishedAt !== null && !this.saved) {
      // Wait for the end-of-game numbers (they read 0 until the end): until they turn non-zero and one more reading came, 15 s at most.
      if (this.numbersAt === null && hasAfterMatch(this.players)) this.numbersAt = this.now;
      if ((this.numbersAt !== null && this.now - this.numbersAt >= NUMBERS_SETTLE) || this.now - this.finishedAt >= NUMBERS_MAX) await this.endGame(lobby, 'finished');
      else this.checkpoint(lobby);
    } else this.checkpoint(lobby);
  }

  /**
   * Players whose killNum went up since the last reading (the verified source for First blood and kill counts). The first
   * reading of a game that already has kills is a game joined late: nothing is announced for kills Air did not see.
   */
  private noteKills(): PcobPlayer[] {
    const grew: PcobPlayer[] = [];
    const first = !this.killsObserved;
    for (const p of this.players) {
      const k = p.uid || p.name;
      if (p.kills > (this.prevKills.get(k) ?? 0)) grew.push(p);
      this.prevKills.set(k, p.kills);
    }
    if (!this.players.length) return [];
    this.killsObserved = true;
    if (first && grew.length) { this.said.add('fb'); return []; }
    return grew;
  }

  /** PCOB left the game. With a winner the match saves now; without one Air only asks whether to remake (the producer decides). */
  private leftGame(lobby: Lobby | null) {
    this.ctx.air?.({ name: 'game.end.detected', why: 'isingame false', winner: this.finishedAt !== null });
    if (this.finishedAt !== null) { void this.endGame(lobby, 'left'); return; }
    if (this.game === null) return;
    this.status = { ...this.status, noWinner: true };
    this.ctx.log(`Game data: the game ended before a winner. Remake Match ${this.game}? (Air never remakes by itself)`);
    this.ctx.changed();
  }

  /** Records a change in the game's own numbers (PCOB pushes changed data every 2 s). */
  private noteChange() {
    const sig = JSON.stringify([this.players.map((p) => [p.uid, p.state, p.kills, p.damage, p.rank, Math.round(p.health)]), this.teams.teams.map((t) => [t.teamId, t.kills, t.alive]), this.kills.length, this.circle?.index, this.circle?.status, this.teams.gameTime]);
    if (sig !== this.signature || this.lastChange === null) { this.signature = sig; this.lastChange = this.now; }
  }

  /** The "No data for 10 s" warning, only while a game is on; it never ends the match. */
  private watchData() {
    const on = this.inGame && this.game !== null;
    const noData = on && this.lastChange !== null && this.now - this.lastChange >= NO_DATA_MS;
    if (noData !== this.status.noData || (on && this.status.lastChangeAt !== this.lastChange)) {
      this.status = { ...this.status, noData, lastChangeAt: on ? this.lastChange : null };
      this.ctx.changed();
    }
  }

  private checkpoint(lobby: Lobby) {
    if (this.game === null || this.saved || this.now - this.lastCp < 2000) return;
    this.lastCp = this.now;
    this.ctx.checkpoint?.({ lobbyId: lobby.id, n: this.game, placed: [...this.placed], kills: this.players.reduce((n, p) => n + p.kills, 0), moments: [...this.said], lastDataAt: this.lastChange, savedAt: this.now });
  }

  /** Points the feed at the armed match (or the live one it resumes); false when nothing is armed. */
  private attach(lobby: Lobby): boolean {
    const t = this.ctx.target(lobby);
    if (!t) return false;
    this.game = t.n;
    this.status = { ...this.status, game: t.n, unarmed: false };
    const cp = this.resumeCp;
    if (cp && cp.lobbyId === lobby.id && cp.n === t.n && t.state !== 'armed') {
      // Carrying on after a restart: the teams already out and the moments already shown stay as they were.
      this.placed = new Set(cp.placed); this.said = new Set(cp.moments); this.resumeCp = null;
      this.ctx.log(`Game data: resumed match ${t.n} of ${lobby.title} (${cp.placed.length} teams out, ${cp.moments.length} moments already shown)`);
      return true;
    }
    if (t.state === 'armed') this.ctx.state(lobby.id, t.n, 'live', this.now);
    else { this.status = { ...this.status, restarted: true }; this.ctx.log(`Game data: a new game started while Match ${t.n} was still live. Remake it if the earlier game was thrown away.`); }
    const game = lobby.games.find((g) => g.n === t.n);
    this.ctx.log(`Game data: match ${t.n} of ${lobby.title} started${game?.map ? ` · ${game.map}` : ''}`);
    this.moment('game.start', { game: t.n }, 'start');
    // Match point: the team on top is already at the line, so a win takes the title.
    const mp = lobby.scoring.matchPoint, top = standings(lobby)[0];
    if (mp && top && top.total >= mp) this.show(lobby, { kind: 'match.point', team: top.team });
    return true;
  }

  /** The producer remade the match: this attempt's memory is cleared (placed teams, moments) and the next game starts clean. */
  remade() {
    this.lastOut = null; this.placed = new Set(); this.finishedAt = null; this.saved = false; this.said = new Set();
    this.queue = []; this.current = null; this.leader = null; this.last = null; this.resumeCp = null;
    this.signature = ''; this.lastChange = null;
    this.game = null;
    this.status = { ...this.status, game: null, noWinner: false, restarted: false, noData: false, lastChangeAt: null, unarmed: false };
    this.ctx.checkpoint?.(null);
    this.ctx.changed();
  }

  /** What the feed has read of the current game so far, for an attempt that is kept (a remake). Null before any data. */
  partialFeed(lobby: Lobby): GameFeed | null {
    if (!this.players.length) return null;
    const seats = this.seatsOf(lobby);
    return { source: 'pcob', gameId: this.meta.gameId || this.gameId, stats: this.players.map((p) => statOf(p, seats.get(p.teamId) ?? null)), kills: this.kills, circles: this.global?.circles ?? [], plane: this.global?.plane ?? null, savedAt: this.now };
  }

  /** The producer ends the match: what the feed has becomes the provisional results; teams without a place are typed. False without data. */
  async endNow(): Promise<boolean> {
    const lobby = this.ctx.lobby();
    if (!lobby || this.game === null || !this.players.length || this.saved) return false;
    await this.endGame(lobby, 'producer');
    return true;
  }

  /** A fresh reading of the game's players (Update from game): never stored here, null when Air is not connected. Throws when PCOB does not answer. */
  async readNow(): Promise<{ players: PcobPlayer[]; gameId: string } | null> {
    if (!this.base) return null;
    const [players, teams] = await Promise.all([this.get(PCOB_ROUTES.players), this.get(PCOB_ROUTES.teams)]);
    const meta = mergeMeta(mergeMeta(NO_META, readMeta(players)), readMeta(teams));
    return { players: readPlayers(players), gameId: meta.gameId };
  }

  private seatsOf(lobby: Lobby) { return seatTeams(this.teams.teams, this.players, lobby.teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, openIds: t.openIds, uids: t.uids })), this.seats(lobby)); }

  private startGame(lobby: Lobby | null) {
    this.inGame = true;
    this.ctx.air?.({ name: 'game.start', lobby: lobby?.title ?? null });
    this.signature = ''; this.lastChange = null; this.lastCp = 0;
    // A new PCOB game while the same match is still live (no remake): the memory stays until the producer remakes.
    const held = lobby ? this.ctx.target(lobby) : null;
    if (lobby && held && held.state !== 'armed' && this.game === held.n && !this.saved) {
      this.status = { ...this.status, restarted: true, noWinner: false };
      this.ctx.log(`Game data: a new game started while Match ${held.n} was still live. Remake it if the earlier game was thrown away.`);
      return;
    }
    // The poll that saw the game start already read this game's players, teams and feed: keep them.
    const keepMemory = !!(this.resumeCp && lobby && held && this.resumeCp.lobbyId === lobby.id && this.resumeCp.n === held.n);
    if (!keepMemory) { this.lastOut = null; this.placed = new Set(); this.said = new Set(); }
    this.finishedAt = null; this.saved = false;
    this.queue = []; this.current = null; this.leader = null; if (!keepMemory) this.last = null;
    this.game = null;
    this.status = { ...this.status, game: null, unarmed: false, noWinner: false, restarted: false };
    if (!lobby) { this.ctx.log('Game data: a game started, but no lobby is on the graphics'); return; }
    if (!this.attach(lobby)) {
      this.status = { ...this.status, unarmed: true };
      this.ctx.log('Game data: a game started but no match is armed. Arm a match to save it; the data is only kept in memory until then.');
    }
    this.ctx.changed();
  }

  /** A new kill leader (five or more, alone on top), at most once a minute. */
  private killLeader(lobby: Lobby, players: Array<{ team: string; name: string; elims: number }>) {
    const [a, b] = players;
    if (!a || a.elims < 5 || (b && b.elims >= a.elims) || this.leader?.name === a.name || this.said.has(`leader:${a.name}`)) return;
    if (this.leader && this.now - this.leader.at < 60_000) return;
    this.leader = { name: a.name, at: this.now };
    this.said.add(`leader:${a.name}`);
    this.show(lobby, { kind: 'kill.leader', team: a.team, name: a.name, kills: a.elims });
  }

  /** Queues a moment for the HUD when the lobby has it switched on. */
  private show(lobby: Lobby, m: Omit<BrMomentShown, 'at' | 'for'>) {
    if (!showOf(lobby).moments[m.kind as BrMomentKind]) return;
    if (this.queue.length >= 3) this.queue.shift();
    this.queue.push({ ...m, at: 0, for: MOMENT_SECONDS });
  }

  /** The moment on the HUD now: the current one until its time is up, then the next waiting. */
  private nextMoment(): BrMomentShown | null {
    if (this.current && this.now - this.current.at >= this.current.for * 1000 + 400) this.current = null;
    if (!this.current && this.queue.length) this.current = { ...this.queue.shift()!, at: this.now };
    return this.current;
  }

  /** Saves the game once, as provisional: on the settled end, with what Air has when PCOB leaves a finished game, or when the producer ends it. */
  private async endGame(lobby: Lobby | null, why: 'finished' | 'left' | 'producer') {
    if (this.saved || !lobby || this.game === null || !this.players.length) return;
    this.saved = true;
    const seats = this.seatsOf(lobby);
    // Rank 1 when PCOB writes it; else the one team left alive is proposed 1st and marked for the producer (open question 6).
    const { rows: results, draft, lastStanding } = proposeResults(this.players, this.teams, seats);
    const feed = this.partialFeed(lobby)!;
    const checks = gameChecks(this.players, this.teams, seats, lobby.teams, lastStanding);
    this.ctx.save(lobby.id, this.game, results, feed, { draft, checks, at: this.now });
    this.ctx.checkpoint?.(null);
    this.ctx.learn(lobby.id, feed.stats.filter((s) => s.team && s.openId).map((s) => ({ team: s.team!, name: s.name, openId: s.openId })));
    this.status = { ...this.status, saved: { game: this.game, at: this.now }, noWinner: false, restarted: false, noData: false };
    this.ctx.air?.({ name: 'results.saved', game: this.game, why, results: results ?? null, lastStanding, state: 'provisional' });
    this.ctx.log(results ? `Game data: match ${this.game} saved from the game as provisional (places, kills and every player's numbers${lastStanding ? '; 1st place is the last team standing, from the alive count' : ''}). Confirm it to make it official.` : `Game data: match ${this.game} ended ${why === 'finished' ? '' : 'early '}without a place for every team; it is provisional, type the missing places.`);
    this.moment('game.end', { game: this.game, results: !!results }, 'end');
    this.ctx.changed();
  }

  /** Says a moment once per game (for the Rundown and the log); true the first time. */
  private moment(name: BrMoment, data: Record<string, unknown>, once: string) {
    if (this.said.has(once)) return false;
    this.said.add(once);
    this.ctx.event?.(name, data);
    return true;
  }

  private setState(state: PcobStatus['state']) {
    if (this.status.state !== state) { this.status = { ...this.status, state, ...(state === 'waiting' ? { game: null, unarmed: false, noData: false, lastChangeAt: null } : {}) }; this.ctx.changed(); }
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
