// A stand-in PUBG MOBILE observer client (24 Nov) for the dev host, tests and recordings: serves the routes of the
// official "PC OB API" document (v3.0.0) at http://127.0.0.1:<port>/<route>, in the document's shapes and with its
// quirks (the JSON sample's `surviceTime`, kill feed and circle values as strings, end-of-game stats at 0 until the
// game ends, rank 0 while a team still plays). One seeded game is planned in full when it starts (plane, drops,
// knocks, kills, revives, circles, team wipes, a winner) and each request reads it at the current game time, so a
// run is the same every time and tests can step the clock.
import { createServer, type Server } from 'node:http';

export interface FakeTeam { name: string; players: string[] }
export interface FakePcobOptions {
  teams: FakeTeam[];
  seed?: number;
  /** Game seconds per real second. */
  speed?: number;
  /** How long a game lasts in game seconds (plane to the winner). */
  length?: number;
  /** Give PCOB's own "TeamN" names instead of the real ones (seating then goes by player names). */
  genericNames?: boolean;
  now?: () => number;
}

type Ev =
  | { t: number; kind: 'knock'; by: number; victim: number; dist: number; dmg: number }
  | { t: number; kind: 'kill'; by: number; victim: number; dist: number; dmg: number }
  | { t: number; kind: 'revive'; victim: number; by: number }
  | { t: number; kind: 'hit'; by: number; victim: number; dmg: number };

interface P { team: number; name: string; uid: number; openId: string; key: number; state: number; health: number; kills: number; knocks: number; assists: number; damage: number; taken: number; heal: number; hs: number; rescues: number; diedAt: number | null; maxDist: number; airdrops: number }

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export class FakePcob {
  readonly opts: Required<Omit<FakePcobOptions, 'now'>> & { now: () => number };
  private server: Server | null = null;
  port = 0;
  /** Real time the current game started at, or null between games. */
  private startedAt: number | null = null;
  private plan: Ev[] = [];
  private end = 0;
  private gameNo = 0;
  /** After the winner, PCOB keeps reporting "in game" for about 20 real seconds (in game seconds at this speed). */
  private get after() { return 20 * this.opts.speed; }
  readonly requests: string[] = [];

  constructor(o: FakePcobOptions) {
    this.opts = { seed: 7, speed: 1, length: 1500, genericNames: false, ...o, now: o.now ?? (() => Date.now()) };
  }

  get url() { return `http://127.0.0.1:${this.port}`; }

  async listen(port = 0): Promise<this> {
    this.server = createServer((req, res) => {
      const route = (req.url ?? '/').replace(/^\/+/, '').split('?')[0]!.toLowerCase();
      this.requests.push(route);
      const body = this.route(route);
      if (body === undefined) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((r) => this.server!.listen(port, '127.0.0.1', () => r()));
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }
  async close() { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); }

  /** Starts a new game now (the next "match" in the lobby). */
  begin() {
    this.gameNo++;
    this.startedAt = this.opts.now();
    this.planGame(this.opts.seed + this.gameNo * 101);
  }
  /** Between games (the observer is back in the lobby). */
  stop() { this.startedAt = null; }
  /** Game time in seconds, or null between games. */
  time(): number | null { return this.startedAt === null ? null : Math.max(0, ((this.opts.now() - this.startedAt) / 1000) * this.opts.speed); }
  get gameEnd() { return this.end; }

  // ── the game plan ──
  private players(): P[] {
    let uid = 510000000;
    return this.opts.teams.flatMap((t, ti) => t.players.map((name, i) => ({ team: ti + 1, name, uid: ++uid, openId: String(900000 + ti * 10 + i), key: 1253580000 + ti * 10 + i, state: 0, health: 100, kills: 0, knocks: 0, assists: 0, damage: 0, taken: 0, heal: 0, hs: 0, rescues: 0, diedAt: null, maxDist: 0, airdrops: 0 })));
  }
  /** Plans knocks, kills and revives until one team is left. Fights start after the drop (90 s). */
  private planGame(seed: number) {
    const r = rng(seed);
    const ps = this.players();
    const plan: Ev[] = [];
    const dead = new Set<number>(), knocked = new Set<number>();
    const teamsAlive = () => new Set(ps.filter((_, i) => !dead.has(i)).map((p) => p.team));
    const fightStart = 90, span = this.opts.length - fightStart;
    let t = fightStart;
    const total = ps.length;
    while (teamsAlive().size > 1) {
      // More fights late in the game, as the circle closes.
      const left = ps.length - dead.size;
      t += Math.max(2, (span / total) * (0.4 + r() * 1.2) * (left / total + 0.3));
      const alive = ps.map((_, i) => i).filter((i) => !dead.has(i) && !knocked.has(i));
      const victims = alive.length ? alive : [...knocked];
      const victim = victims[Math.floor(r() * victims.length)]!;
      const killers = alive.filter((i) => ps[i]!.team !== ps[victim]!.team);
      if (!killers.length) break;
      const by = killers[Math.floor(r() * killers.length)]!;
      const dist = Math.round(5 + r() * (r() < 0.1 ? 400 : 120));
      plan.push({ t, kind: 'hit', by, victim, dmg: 20 + Math.round(r() * 60) });
      const mates = ps.map((_, i) => i).filter((i) => i !== victim && ps[i]!.team === ps[victim]!.team && !dead.has(i) && !knocked.has(i));
      if (!knocked.has(victim) && mates.length) {
        // Knocked first; revived a third of the time, else finished a few seconds later.
        knocked.add(victim);
        plan.push({ t: t + 0.5, kind: 'knock', by, victim, dist, dmg: 100 });
        if (r() < 0.33) { plan.push({ t: t + 8 + r() * 10, kind: 'revive', victim, by: mates[0]! }); knocked.delete(victim); t += 8; }
        else { const ft = t + 3 + r() * 6; plan.push({ t: ft, kind: 'kill', by, victim, dist, dmg: 0 }); knocked.delete(victim); dead.add(victim); }
      } else {
        // The last of a team (or one already down) goes straight out; knocked teammates bleed out with them.
        plan.push({ t: t + 0.5, kind: 'kill', by, victim, dist, dmg: 100 });
        dead.add(victim); knocked.delete(victim);
        for (const k of [...knocked]) if (ps[k]!.team === ps[victim]!.team && !ps.some((p, i) => p.team === ps[k]!.team && !dead.has(i) && !knocked.has(i))) { plan.push({ t: t + 0.6, kind: 'kill', by, victim: k, dist, dmg: 0 }); dead.add(k); knocked.delete(k); }
      }
    }
    this.plan = plan.sort((a, b) => a.t - b.t);
    this.end = Math.ceil(this.plan.at(-1)?.t ?? fightStart) + 1;
  }

  /** Everyone's state at game time `t`: players, team ranks, the feed. */
  private at(t: number) {
    const ps = this.players();
    const r = rng(this.opts.seed + this.gameNo);
    const feed: Array<{ CauserName: string; VictimName: string; ResultHealthStatus: string; CurGameTime: string; Distance: number }> = [];
    const ranks = new Map<number, number>();
    const teams = this.opts.teams.length;
    for (const e of this.plan) {
      if (e.t > t) break;
      const v = ps[e.victim]!, b = ps[e.by]!;
      if (e.kind === 'hit') { b.damage += e.dmg; v.taken += e.dmg; v.health = Math.max(1, v.health - e.dmg); if (r() < 0.25) b.hs++; continue; }
      if (e.kind === 'revive') { v.state = 0; v.health = 25; b.rescues++; continue; }
      if (e.kind === 'knock') { v.state = 4; v.health = 0; b.knocks++; b.damage += e.dmg; v.taken += e.dmg; b.maxDist = Math.max(b.maxDist, e.dist); feed.push({ CauserName: b.name, VictimName: v.name, ResultHealthStatus: '1', CurGameTime: String(Math.round(e.t)), Distance: e.dist }); continue; }
      v.state = 5; v.health = 0; v.diedAt = e.t; b.kills++; b.damage += e.dmg; v.taken += e.dmg; b.maxDist = Math.max(b.maxDist, e.dist);
      for (const m of ps) if (m !== b && m.team === b.team && m.state !== 5 && r() < 0.3) m.assists++;
      feed.push({ CauserName: b.name, VictimName: v.name, ResultHealthStatus: '2', CurGameTime: String(Math.round(e.t)), Distance: e.dist });
      const teamLeft = ps.some((p) => p.team === v.team && p.state !== 5);
      if (!teamLeft) ranks.set(v.team, teams - ranks.size);
    }
    const alive = new Set(ps.filter((p) => p.state !== 5).map((p) => p.team));
    if (alive.size === 1 && t >= this.end) ranks.set([...alive][0]!, 1);
    for (const p of ps) {
      // Plane, then parachute, then on the ground.
      if (p.state === 0 && t < 60) p.state = 1; else if (p.state === 0 && t < 90) p.state = 2;
      if (p.state === 0 && p.health < 100) p.heal += 0; // heals arrive with the final stats
    }
    return { ps, ranks, feed };
  }

  private route(route: string): unknown {
    const raw = this.time();
    // After the winner PCOB keeps the game for a little while, then goes back to the lobby.
    const t = raw !== null && raw < this.end + this.after ? Math.min(raw, this.end) : null;
    if (route === 'isingame') return { isInGame: t !== null };
    if (t === null) {
      if (route === 'gettotalplayerlist') return { playerInfoList: [] };
      if (route === 'getteaminfolist') return { teamInfoList: [] };
      if (route === 'getkillinfo') return { killInfo: [] };
      if (route === 'setcircleinfo') return {};
      if (route === 'getgameglobalinfo') return { gameGlobalInfo: {} };
      if (route === 'getobservingplayer') return { observingPlayer: {} };
      return undefined;
    }
    const { ps, ranks, feed } = this.at(t);
    const finished = t >= this.end;
    const teamName = (i: number) => (this.opts.genericNames ? `Team${i}` : this.opts.teams[i - 1]!.name);
    if (route === 'gettotalplayerlist') {
      return { playerInfoList: ps.map((p) => {
        const out = p.state === 5;
        const survived = Math.round(out ? p.diedAt! : Math.min(t, this.end));
        return {
          uID: p.uid, playerOpenId: p.openId, playerName: p.name, picUrl: '', showPicUrl: false, teamId: p.team, teamName: teamName(p.team), character: 'None',
          isFiring: false, posX: 0, posY: 0, posZ: 0, health: p.health, healthMax: 100, liveState: p.state, killNum: p.kills, killNumBeforeDie: p.kills,
          playerKey: p.key, gotAirDropNum: p.airdrops, maxKillDistance: p.maxDist * 100, damage: p.damage,
          // These read 0 until the game ends, as the document says.
          inDamage: finished ? p.taken : 0, heal: finished ? Math.round(p.taken * 0.6) : 0, headShotNum: finished ? p.hs : 0,
          killNumInVehicle: 0, surviceTime: finished ? survived : 0, driveDistance: finished ? 1200 + (p.uid % 7) * 300 : 0, marchDistance: finished ? 900 + (p.uid % 5) * 200 : 0,
          assists: finished ? p.assists : 0, killNumByGrenade: 0, rank: ranks.get(p.team) ?? 0, isOutSideBlueCircle: 0, outsideBlueCircleTime: 0,
          useFragGrenadeNum: 0, useSmokeGrenadeNum: 0, curWeaponID: 0, knockouts: finished ? p.knocks : 0, rescueTimes: finished ? p.rescues : 0,
        };
      }) };
    }
    if (route === 'getteaminfolist') {
      return {
        teamInfoList: this.opts.teams.map((_, i) => ({ teamId: i + 1, teamName: teamName(i + 1), isShowLogo: false, logoPicUrl: '', killNum: ps.filter((p) => p.team === i + 1).reduce((n, p) => n + p.kills, 0), liveMemberNum: ps.filter((p) => p.team === i + 1 && p.state !== 5).length })),
        GameStartTime: String(Math.round(t)), FightingStartTime: '0', FinishedStartTime: finished ? String(this.end) : '', GameID: `FAKE-${this.gameNo}`, CurrentTime: Math.round(this.opts.now() / 1000),
      };
    }
    if (route === 'getkillinfo') return { killInfo: feed };
    if (route === 'setcircleinfo') {
      // Nine circles across the game: wait, then delay, then move.
      const per = Math.max(30, (this.end - 90) / 9), since = Math.max(0, t - 90), idx = Math.min(9, Math.floor(since / per) + 1), into = since - (idx - 1) * per;
      const status = into < per * 0.5 ? 0 : into < per * 0.6 ? 1 : 2;
      return { GameTime: String(Math.round(t)), CircleStatus: String(status), CircleIndex: String(idx), Counter: String(Math.max(0, Math.round(per - into))), MaxTime: String(Math.round(per)) };
    }
    if (route === 'getgameglobalinfo') {
      const n = Math.min(9, Math.floor(Math.max(0, t - 90) / Math.max(30, (this.end - 90) / 9)) + 1);
      return { gameGlobalInfo: { CircleArray: Array.from({ length: n }, (_, i) => ({ X: (400000 + i * 9000).toFixed(6), Y: (380000 - i * 7000).toFixed(6), Size: (400000 * Math.pow(0.62, i)).toFixed(6) })), PlaneStartLocX: '679895.125000', PlaneStartLocY: '896956.812500', PlaneStopLocX: '181640.078125', PlaneStopLocY: '-117633.250000' } };
    }
    if (route === 'getobservingplayer') { const p = ps.find((x) => x.state !== 5); return { observingPlayer: p ? { "WinOB's ID": String(p.uid) } : {} }; }
    return undefined;
  }

  /** True once the game has ended and PCOB has stopped reporting it (back in the lobby). */
  get over() { const t = this.time(); return t !== null && t >= this.end + this.after; }
}
