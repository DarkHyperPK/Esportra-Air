// Use a stage from Esportra (28 Nov, READ ONLY): a battle royale stage's groups become lobbies, its teams and players go
// into Teams/Players, its games become the run sheet's matches, its points table becomes the lobby's scoring. Air then
// reads the stage again every 60 s while the event is open and updates the parts the producer has not edited.
//
// Nothing here sends anything to Esportra: no results, adjustments or status. Results, match states and confirmed matches
// are never touched by a re-read; a live match's lobby is not touched at all. A part the producer edits in Air
// (`Lobby.source.esportra.edited`: schedule, roster, scoring) is Air's from then on, like the veto's `vetoSource`, until
// "Follow Esportra again". Offline keeps the last read (`unreachableSince`). HTTP is src/main/esportra.ts (`brStages`,
// `brStage`, `image`); the reading and the mapping are src/shared/esportra-stage.ts.
import { randomUUID } from 'node:crypto';
import type { LibPlayer, LibTeam, Lobby } from '../shared/api.ts';
import { gameState, type LobbyGame, type LobbyDay, type Scoring, type StagePart } from '../shared/br.ts';
import { targetMatch, isBusy } from '../shared/br-run.ts';
import {
  localDate, localTime, mapScoring, planGroup, playerCount, readStage, readStages, roleOf, stageIdOk,
  type GroupPlan, type StageGroup, type StageRead, type StageSummary,
} from '../shared/esportra-stage.ts';
import { gameOf, type GameId } from '../shared/games.ts';
import type { EventInfo } from '../shared/model.ts';
import type { EsportraAccount, EsportraError } from './esportra.ts';
import { newEvent } from './event-model.ts';
import type { Lobbies } from './br-lobbies.ts';
import type { Store } from './store.ts';
import { COLORS, tagFor } from './team-tags.ts';

const READ_EVERY = 60_000;
const MAX_TEAMS = 25, MAX_GAMES = 24;

/** A stage this PC has read for an event (kept in `store.data.esportraStages`). */
export interface StageFollow {
  stageId: string; stageName: string; tournamentId: string; tournamentName: string; eventId: string; game: GameId;
  /** Re-read every minute while the event is open. Stop following turns it off; the lobbies stay as they are. */
  following: boolean;
  usedAt: number;
  /** When Air last read the stage (null: never completed). */
  readAt: number | null;
  /** Since when Esportra could not be reached (the last read is kept). */
  unreachableSince: number | null;
  /** Why the last read failed, in plain words. */
  error: string | null;
  /** What Air could not map exactly (kill cap, a tiebreak), as sentences. */
  notes: string[];
  /** What the last read left alone and why (a match is live, matches already played). */
  held: string[];
}

export interface StagesView {
  followed: Array<StageFollow & { lobbies: Array<{ lobbyId: string; title: string; groupId: string; edited: Partial<Record<StagePart, true>> }> }>;
}
export interface StageList { stages: StageSummary[]; /** Stages of games Air cannot produce, left out. */ hidden: number }
export interface StageDetail {
  read: StageRead;
  scoring: Scoring;
  notes: string[];
  plans: Array<{ groupId: string; name: string; teams: number; games: Array<{ map: string; scheduledAt: string | null }>; days: Array<{ date: string; title: string; games: number; firstAt: string | null }> }>;
  players: number;
  /** Players Esportra has no UID for (it sends none): the producer adds them in Teams and players. */
  uidMissing: number;
  /** Already used in this PC's events. */
  used: { eventId: string; lobbies: number } | null;
}

export interface StagesContext {
  account(): EsportraAccount | undefined;
  store: Store;
  lobbies: Lobbies;
  /** The game Air is set to. */
  game(): GameId | null;
  /** The event open on this PC (the selected lobby's), whose followed stages are re-read. */
  eventOpen(): string | null;
  storeImage(bytes: Buffer, type: string): Promise<string>;
  libraryChanged(): Promise<void>;
  save(): void;
  log(text: string): void;
  changed(): void;
  now(): number;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const lobbyIdOf = (l: Lobby) => l.source?.esportra;
const hasResults = (l: Lobby) => l.games.some((g) => g.results?.length || ['provisional', 'confirmed'].includes(gameState(g)));
/** A game that is not simply waiting on the run sheet: the follow never changes it. */
const locked = (g: LobbyGame) => gameState(g) !== 'scheduled' || !!g.results?.length || !!g.feed;

export class EsportraStages {
  private readonly ctx: StagesContext;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private readonly polled = new Map<string, number>();

  constructor(ctx: StagesContext) { this.ctx = ctx; }
  private get data() { return this.ctx.store.data; }
  private get follows() { return (this.data.esportraStages ??= {}); }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private account() {
    const a = this.ctx.account();
    if (!a) throw new Error('Esportra sign-in is not available in this build.');
    if (!a.view().email) throw new Error('Sign in to Esportra first.');
    if (a.view().state === 'denied') throw new Error(a.view().warning ?? 'Esportra has not confirmed Air access for this PC.');
    return a;
  }

  // ── reading ──

  async list(): Promise<StageList> {
    const all = readStages(await this.account().brStages());
    return { stages: all.filter((s) => s.supported), hidden: all.filter((s) => !s.supported).length };
  }

  /** One stage as the picker shows it: what Esportra has, and what Air would make of it. */
  async detail(stageId: string): Promise<StageDetail> {
    if (!stageIdOk(stageId)) throw new Error('Choose a stage.');
    const read = readStage(await this.account().brStage(stageId));
    const mapped = mapScoring(read.config);
    const plans = read.groups.map((g) => planGroup(read, g, MAX_GAMES));
    const people = this.data.players ?? [];
    const uidMissing = read.groups.flatMap((g) => g.teams.flatMap((t) => t.players)).filter((p) => !people.some((x) => x.uid && ((p.id && x.esportraId === p.id) || (!p.id && same(x.name, p.name))))).length;
    const f = this.follows[stageId];
    return {
      read, scoring: mapped.scoring, notes: [...mapped.notes, ...plans.flatMap((p) => p.notes)], players: playerCount(read), uidMissing,
      plans: plans.map((p) => ({
        groupId: p.group.id, name: p.group.name, teams: p.group.teams.length, games: p.games.map((g) => ({ map: g.map, scheduledAt: g.scheduledAt })),
        days: p.days.map((d) => ({ date: d.date, title: d.title, games: d.games.length, firstAt: d.games.find((g) => g.scheduledAt)?.scheduledAt ?? null })),
      })),
      used: f ? { eventId: f.eventId, lobbies: this.lobbiesOf(stageId).length } : null,
    };
  }

  // ── using it ──

  /** "Use this stage": makes the lobbies for the groups (or brings the ones made earlier up to date) and follows the stage. */
  async use(stageId: string, eventId?: string | null) {
    const game = this.ctx.game();
    if (!game || gameOf(game)?.shape !== 'lobby') throw new Error('Switch to PUBG MOBILE (or Free Fire) from the top bar first. A stage is for a battle royale game.');
    const read = readStage(await this.account().brStage(stageId));
    if (!read.stage.supported) throw new Error(`Air cannot produce this stage's game (${read.stage.gameRaw}).`);
    if (read.stage.game && read.stage.game !== game) throw new Error(`This stage is ${gameOf(read.stage.game)?.name} and Air is set to ${gameOf(game)?.name}. Switch game from the top bar first.`);
    const had = this.follows[stageId];
    const event = had ? this.data.events.find((e) => e.id === had.eventId) ?? this.pickEvent(read, eventId) : this.pickEvent(read, eventId);
    const follow: StageFollow = had && had.eventId === event.id ? { ...had, following: true } : {
      stageId, stageName: read.stage.stageName, tournamentId: read.stage.tournamentId, tournamentName: read.stage.tournamentName, eventId: event.id,
      game, following: true, usedAt: this.ctx.now(), readAt: null, unreachableSince: null, error: null, notes: [], held: [],
    };
    this.follows[stageId] = follow;
    await this.sync(follow, read);
    this.ctx.log(`Stage from Esportra · ${read.stage.tournamentName} · ${read.stage.stageName}: ${read.groups.length} group${read.groups.length === 1 ? '' : 's'}, ${read.groups.reduce((n, g) => n + g.teams.length, 0)} teams`);
  }

  private pickEvent(read: StageRead, eventId?: string | null): EventInfo {
    const data = this.data;
    const tid = read.stage.tournamentId || null;
    let event: EventInfo | undefined;
    if (eventId) {
      event = data.events.find((e) => e.id === eventId);
      if (!event) throw new Error('That event is gone.');
      if (event.tournamentId && tid && event.tournamentId !== tid) throw new Error(`${event.name} is linked to another Esportra tournament. Open the event of ${read.stage.tournamentName}, or start one for it.`);
    } else {
      event = (tid ? data.events.find((e) => e.tournamentId === tid) : undefined) ?? undefined;
    }
    if (!event) {
      event = newEvent(read.stage.tournamentName, tid);
      data.events = [...data.events, event];
    } else if (!event.tournamentId && tid) {
      data.events = data.events.map((e) => (e.id === event!.id ? (event = { ...e, tournamentId: tid }) : e));
    }
    return event;
  }

  private lobbiesOf(stageId: string) { return this.ctx.lobbies.list().filter((l) => lobbyIdOf(l)?.stageId === stageId); }

  /** Reads the stage again now (the Refresh button). */
  async refresh(stageId: string) {
    const f = this.follows[stageId];
    if (!f) throw new Error('This stage is not in use here yet.');
    await this.readAgain(f, true);
  }

  /** Follow Esportra again: `all` takes every part back (and starts following), a part takes only that one, `off` stops following. */
  async follow(stageId: string, part: StagePart | 'all' | 'off' = 'all') {
    const f = this.follows[stageId];
    if (!f) throw new Error('This stage is not in use here yet.');
    if (part === 'off') { f.following = false; this.ctx.save(); this.ctx.changed(); this.ctx.log(`Stopped following ${f.stageName} on Esportra`); return; }
    const parts: StagePart[] = part === 'all' ? ['schedule', 'roster', 'scoring'] : [part];
    for (const l of this.lobbiesOf(stageId)) {
      const e = l.source!.esportra;
      if (!e.edited || !parts.some((p) => e.edited![p])) continue;
      const edited = { ...e.edited };
      for (const p of parts) delete edited[p];
      this.ctx.lobbies.commit({ ...l, source: { esportra: { ...e, ...(Object.keys(edited).length ? { edited } : { edited: undefined }) } } });
    }
    if (part === 'all') f.following = true;
    await this.readAgain(f, true);
  }

  // ── the loop ──

  async tick() {
    if (this.busy) return;
    const a = this.ctx.account();
    if (!a?.view().email || a.view().state === 'denied' || a.view().state === 'signed-out') return;
    const now = this.ctx.now();
    const open = this.ctx.eventOpen();
    const due = Object.values(this.follows).filter((f) => f.following && f.eventId === open && now - (this.polled.get(f.stageId) ?? 0) >= READ_EVERY);
    if (!due.length) return;
    this.busy = true;
    try { for (const f of due) await this.readAgain(f, false); } finally { this.busy = false; }
  }

  private async readAgain(f: StageFollow, manual: boolean) {
    this.polled.set(f.stageId, this.ctx.now());
    let read: StageRead;
    try {
      read = readStage(await this.account().brStage(f.stageId));
    } catch (e) {
      const status = (e as EsportraError).status;
      if (status === 404) { f.error = 'Esportra no longer lists this stage for you. Air keeps what it read.'; f.following = false; }
      else if (status === 0 || status === undefined || status >= 500) { f.unreachableSince ??= this.ctx.now(); f.error = 'Esportra is not reachable. Air keeps the last read.'; }
      else f.error = (e as Error).message;
      this.ctx.save(); this.ctx.changed();
      if (manual) throw e;
      return;
    }
    f.unreachableSince = null; f.error = null;
    await this.sync(f, read);
  }

  // ── making the lobbies ──

  /** Puts one read of the stage into the lobbies, group by group. Never throws for one group's trouble: it is said in `held`. */
  private async sync(f: StageFollow, read: StageRead) {
    const mapped = mapScoring(read.config);
    const plans = read.groups.map((g) => planGroup(read, g, MAX_GAMES));
    const notes = [...mapped.notes, ...plans.flatMap((p) => p.notes)];
    const held: string[] = [];
    const now = this.ctx.now();
    for (const plan of plans) {
      try { await this.syncGroup(f, read, plan, mapped.scoring, held, now); }
      catch (e) { held.push(`${plan.group.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    f.readAt = now; f.notes = notes; f.held = held;
    this.ctx.save();
    this.ctx.changed();
  }

  private async syncGroup(f: StageFollow, read: StageRead, plan: GroupPlan, scoring: Scoring, held: string[], now: number) {
    const lobbies = this.ctx.lobbies;
    let lobby = lobbies.list().find((l) => lobbyIdOf(l)?.stageId === f.stageId && lobbyIdOf(l)?.groupId === plan.group.id);
    const name = plan.group.name;
    if (lobby && isBusy(lobby)) { held.push(`${name}: a match is live, so Air left it as it is.`); return; }
    const edited = lobby ? lobbyIdOf(lobby)!.edited ?? {} : {};
    // Teams and players first (Teams/Players is shared, so a group the producer took over is not touched).
    let ids: string[] | null = null;
    if (!edited.roster) ids = await this.ensureTeams(plan.group, f.game, held);
    if (!lobby) {
      lobby = await lobbies.create({ eventId: f.eventId, game: f.game, title: name, games: Math.max(1, plan.games.length) });
      lobby = { ...lobby, source: { esportra: { stageId: f.stageId, groupId: plan.group.id, readAt: now } } };
    }
    const fresh = !lobbyIdOf(this.ctx.lobbies.find(lobby.id));
    // The roster (own commit: it journals as the teams).
    if (ids) {
      const current = lobbies.find(lobby.id);
      const keep = current.teams.filter((t) => t.teamId && !ids!.includes(t.teamId) && current.games.some((g) => g.results?.some((r) => r.team === t.id))).map((t) => t.teamId!);
      const want = [...ids, ...keep].slice(0, MAX_TEAMS);
      const have = current.teams.map((t) => t.teamId);
      if (JSON.stringify(want) !== JSON.stringify(have)) {
        const stop = targetMatch(current);
        if (stop) held.push(`${name}: Match ${stop.n} is ${gameState(stop)}, so its teams stay as they are for now.`);
        else lobbies.setTeams(lobby.id, want, { fromSource: true });
      }
    }
    // Scoring and schedule in one commit.
    const cur = lobbies.find(lobby.id);
    let next: Lobby = { ...cur, source: lobbyIdOf(lobby) ? { esportra: { ...lobbyIdOf(lobby)!, ...(lobbyIdOf(cur)?.edited ? { edited: lobbyIdOf(cur)!.edited } : {}) } } : cur.source };
    const fields: Record<string, unknown> = {};
    if (!edited.scoring && JSON.stringify(cur.scoring) !== JSON.stringify(scoring)) {
      if (hasResults(cur)) held.push(`${name}: Esportra's points table differs from Air's, but matches are already saved, so Air keeps its table.`);
      else { next = { ...next, scoring }; fields.scoring = scoring; }
    }
    if (!edited.schedule) {
      const s = this.schedule(cur, plan, now);
      if ('blocked' in s) held.push(`${name}: ${s.blocked}`);
      else if (s.games) { next = { ...next, games: s.games, days: s.days }; fields.games = s.games.map((g) => ({ n: g.n, map: g.map, startsAt: g.startsAt ?? null })); }
    }
    if (fresh || Object.keys(fields).length) {
      next = { ...next, source: { esportra: { ...next.source!.esportra, readAt: now } } };
      lobbies.commit(next, 'lobby.update', { fields, stage: { stageId: f.stageId, groupId: plan.group.id } });
    }
  }

  /**
   * The lobby's matches and days for the group's plan. Games are matched by Esportra's game id; a game that is armed,
   * live or played (or whose feed was saved) is never changed, moved or dropped. If the new order would move one of
   * them, the schedule is left alone and the reason said.
   */
  schedule(l: Lobby, plan: GroupPlan, now: number): { games?: LobbyGame[]; days?: LobbyDay[] } | { blocked: string } {
    const byE = new Map(l.games.filter((g) => g.esportraId).map((g) => [g.esportraId!, g]));
    const days: LobbyDay[] = (l.days ?? []).map((d) => ({ ...d, matchIds: [...d.matchIds] }));
    const today = localDate(new Date(now).toISOString());
    const dayFor = (date: string, title: string) => {
      const d = date || days[0]?.date || today;
      let day = days.find((x) => x.date === d);
      if (!day) { day = { id: randomUUID(), date: d, title: title || `Day ${days.length + 1}`, matchIds: [] }; days.push(day); }
      return day;
    };
    const next: LobbyGame[] = [];
    const used = new Set<string>();
    for (const day of plan.days) {
      const target = dayFor(day.date, day.title);
      for (const pg of day.games) {
        const old = byE.get(pg.id);
        if (old) {
          used.add(old.id!);
          if (locked(old)) next.push(old);
          else { const { scheduledAt: _a, startsAt: _s, ...rest } = old; next.push({ ...rest, map: pg.map, ...time(pg.scheduledAt), dayId: target.id }); }
        } else {
          next.push({ n: 0, id: randomUUID(), esportraId: pg.id, map: pg.map, ...time(pg.scheduledAt), dayId: target.id, state: 'scheduled', attempts: [] });
        }
      }
    }
    // Games Esportra no longer lists: waiting ones go, anything played or armed stays.
    for (const g of l.games) if (!used.has(g.id!) && locked(g)) next.push(g);
    if (next.length > MAX_GAMES) return { blocked: `Esportra's schedule plus the matches already played come to more than ${MAX_GAMES}, so Air kept its own.` };
    const out = next.map((g, i) => ({ ...g, n: i + 1 }));
    const moved = out.find((g, i) => locked(g) && l.games.find((o) => o.id === g.id)?.n !== i + 1);
    if (moved) return { blocked: `Esportra changed the order of matches in a way that would move Match ${l.games.find((o) => o.id === moved.id)?.n}, which is already armed or played, so Air kept its own schedule.` };
    for (const d of days) d.matchIds = out.filter((g) => g.dayId === d.id).map((g) => g.id!);
    const kept = days.filter((d) => d.matchIds.length || d.startedAt || d.closedAt).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (sig(l.games, l.days ?? []) === sig(out, kept)) return {};
    return { games: out, days: kept };
  }

  // ── teams and players ──

  /** Teams and players of a group into Teams/Players (by Esportra id, then name); returns the library ids in the group's order. */
  private async ensureTeams(group: StageGroup, game: GameId, held: string[]): Promise<string[]> {
    const data = this.data;
    const teams = (data.teams ??= []);
    const players = (data.players ??= []);
    const before = JSON.stringify([teams, players]);
    const out: string[] = [];
    if (group.teams.length > MAX_TEAMS) held.push(`${group.name} has ${group.teams.length} teams on Esportra; a lobby holds ${MAX_TEAMS}, so Air takes the first ${MAX_TEAMS}.`);
    for (const t of group.teams.slice(0, MAX_TEAMS)) {
      let team: LibTeam | undefined = teams.find((x) => x.esportraId === t.teamId) ?? teams.find((x) => !x.esportraId && same(x.name, t.name));
      if (!team) {
        team = { id: randomUUID(), name: t.name, tag: t.tag || tagFor(t.name), color: COLORS[teams.length % COLORS.length]!, logo: '', esportraId: t.teamId };
        teams.push(team);
      } else if (!team.esportraId) team.esportraId = t.teamId;
      if (t.logoUrl && team.esportraLogo !== t.logoUrl) {
        try {
          const { bytes, type } = await this.ctx.account()!.image(t.logoUrl);
          team.logo = await this.ctx.storeImage(bytes, type);
          team.esportraLogo = t.logoUrl;
        } catch (e) { held.push(`${t.name}'s logo: ${e instanceof Error ? e.message : String(e)}`); }
      }
      const seen = new Set<LibPlayer>();
      for (const p of t.players) {
        const said = p.ign ?? p.name;
        let row = (p.id ? players.find((x) => x.esportraId === p.id) : undefined)
          ?? players.find((x) => x.teamId === team!.id && !x.esportraId && (same(x.name, p.name) || (!!x.gameId && same(x.gameId, said))));
        const role = roleOf(p.role);
        const free = (id: string) => !!id && !players.some((x) => x !== row && x.gameId && same(x.gameId, id));
        if (!row) {
          row = { id: randomUUID(), name: p.name, realName: '', gameId: p.ign && free(p.ign) ? p.ign : '', photo: '', role, teamId: team.id, ...(p.id ? { esportraId: p.id } : {}) };
          players.push(row);
        } else {
          row.teamId = team.id;
          if (p.id && !row.esportraId) row.esportraId = p.id;
          if (!row.role || row.role === 'Player' || row.role === 'Sub') row.role = role;
          if (!row.gameId && p.ign && free(p.ign)) row.gameId = p.ign;
        }
        seen.add(row);
      }
      // Players Esportra brought and no longer lists on this team leave it (never a player the producer added).
      for (const x of players) if (x.teamId === team.id && x.esportraId && !seen.has(x) && t.players.some((p) => !!p.id) ) x.teamId = null;
      out.push(team.id);
    }
    if (JSON.stringify([teams, players]) !== before) { this.ctx.store.save(); await this.ctx.libraryChanged(); }
    return out;
  }

  // ── what the interface reads ──

  view(): StagesView {
    return {
      followed: Object.values(this.follows).map((f) => ({
        ...f,
        lobbies: this.lobbiesOf(f.stageId).map((l) => ({ lobbyId: l.id, title: l.title, groupId: l.source!.esportra.groupId, edited: l.source!.esportra.edited ?? {} })),
      })),
    };
  }
}

/** What a schedule says (key order and other game fields do not count), so an unchanged read writes nothing. */
const sig = (games: LobbyGame[], days: LobbyDay[]) => JSON.stringify([
  games.map((g) => [g.id, g.n, g.esportraId ?? null, g.map, g.dayId ?? null, g.scheduledAt ?? null, g.startsAt ?? null, gameState(g)]),
  days.map((d) => [d.id, d.date, d.title, d.matchIds, d.startedAt ?? null, d.closedAt ?? null]),
]);

/** A game's time as the run sheet keeps it: the ISO time, and HH:MM for the lists (absent when Esportra has none). */
function time(iso: string | null): { scheduledAt?: string; startsAt?: string } {
  return iso ? { scheduledAt: iso, startsAt: localTime(iso) } : {};
}
