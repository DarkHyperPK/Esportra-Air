// The run sheet at work (27 Nov): arm a match, follow its state, remake, void, end, confirm, edit with a reason,
// adjust points, open and close days, and keep what is needed to resume after a restart. Every action is journalled
// (src/main/event-journal.ts) and refused when it would change the wrong match while one is live.
//
// A match moves one step at a time: Scheduled → Armed → Live → Finishing → Provisional → Confirmed. Remake sends a
// live or provisional match back to Armed (the attempt is kept for the record) and Void is the other way out. The
// observer feed (src/main/br-live.ts) writes only to the armed match, and what it saves is provisional until Confirm.
import { randomUUID } from 'node:crypto';
import type { Lobby } from '../shared/api.ts';
import { gameState, validResults, type Adjustment, type Attempt, type LobbyDay, type LobbyGame } from '../shared/br.ts';
import { closeProblems, confirmProblems, dayOf, daySummary, gameById, isBusy, liveMatch, matchesOfDay, nextOfDay, rosterChanges, standingsView, STATE_LABEL, validAdjustment, ymd, type BrCheckpoint, type BrResume, type DaySummary, type RosterChange } from '../shared/br-run.ts';
import type { PcobStatus } from '../shared/pcob-status.ts';
import type { GameFeed } from '../shared/br-stats.ts';
import type { EventJournal } from './event-journal.ts';
import type { Lobbies } from './br-lobbies.ts';
import type { Store } from './store.ts';
import type { SavedAutopilot } from './br-autopilot.ts';

/** The part of the observer feed the run sheet drives. */
export interface FeedControl {
  endNow(): Promise<boolean>;
  remade(): void;
  partialFeed(lobby: Lobby): GameFeed | null;
  resume(cp: Omit<BrCheckpoint, 'matchId' | 'attempt'> | null): void;
}

export interface BrRunContext {
  lobbies: Lobbies;
  store: Store;
  feed: FeedControl;
  /** The journal, to read roster changes for Start day. */
  journal?: EventJournal | null;
  /** What the observer feed and a test round are doing (Start day's checks). */
  pcob: () => PcobStatus;
  testRunning?: () => boolean;
  /** Who confirms (the signed-in account's name, if any). */
  user?: () => string | undefined;
  log: (text: string) => void;
  changed: () => void;
  now?: () => number;
  /** The autopilot's saved run, offered with the resume prompt. */
  autopilot?: { pending: () => SavedAutopilot | null; resume: () => Promise<void>; discard: () => void };
}

export interface DayStart {
  day: LobbyDay;
  /** Official standings carried in (rank, total, each team's name). */
  standingsIn: Array<{ team: string; name: string; rank: number; total: number }>;
  roster: Array<RosterChange & { name: string }>;
  matches: Array<{ id: string; n: number; map: string; time: string; state: string }>;
  problems: string[];
  data: { pcob: string; consent: boolean; test: boolean };
  started: boolean;
}

const reasonText = (v: unknown, what: string) => {
  const r = typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, 200) : '';
  if (!r) throw new Error(`Say why. ${what} is kept with the match so everyone can see it later.`);
  return r;
};

export class BrRun {
  private readonly ctx: BrRunContext;
  private resumeDismissed = false;
  constructor(ctx: BrRunContext) { this.ctx = ctx; }
  private get now() { return (this.ctx.now ?? Date.now)(); }
  private get lobbies() { return this.ctx.lobbies; }

  private match(lobbyId: string, matchId: string): { l: Lobby; g: LobbyGame } {
    const l = this.lobbies.find(lobbyId);
    const g = gameById(l, matchId) ?? l.games.find((x) => x.n === Number(matchId));
    if (!g) throw new Error('That match is not in this lobby.');
    return { l, g };
  }
  private setGame(l: Lobby, g: LobbyGame, patch: Partial<LobbyGame>, kind: string, data: Record<string, unknown> = {}) {
    const next = { ...l, games: l.games.map((x) => (x.id === g.id ? { ...x, ...patch } : x)) };
    this.lobbies.commit(next, kind, { game: g.n, matchId: g.id, ...data });
    return this.lobbies.find(l.id);
  }
  /** A game with a field removed (results, feed…), keeping everything else. */
  private strip(g: LobbyGame, ...keys: Array<keyof LobbyGame>): LobbyGame {
    const out = { ...g } as Record<string, unknown>;
    for (const k of keys) delete out[k];
    return out as unknown as LobbyGame;
  }

  // ── arming ──

  /** Points Air at this match: the observer feed writes into it and nothing else. */
  arm(lobbyId: string, matchId: string) {
    const { l, g } = this.match(lobbyId, matchId);
    const live = liveMatch(l);
    if (live) throw new Error(`Match ${live.n} is live. Confirm, remake or end it before arming another.`);
    const state = gameState(g);
    if (state === 'armed') return;
    if (state !== 'scheduled' && state !== 'void') throw new Error(`Match ${g.n} is ${STATE_LABEL[state].toLowerCase()}; only a scheduled match can be armed.`);
    const day = dayOf(l, g);
    if (day?.closedAt) throw new Error(`${day.title} is closed. Reopen it first.`);
    const games = l.games.map((x) => (x.id === g.id ? { ...this.strip(x, 'voidReason'), state: 'armed' as const } : gameState(x) === 'armed' ? { ...x, state: 'scheduled' as const } : x));
    this.lobbies.commit({ ...l, games }, 'match.arm', { game: g.n, matchId: g.id });
    this.ctx.log(`${l.title}: match ${g.n} armed`);
  }

  disarm(lobbyId: string) {
    const l = this.lobbies.find(lobbyId);
    const a = l.games.find((g) => gameState(g) === 'armed');
    if (!a) return;
    this.setGame(l, a, { state: 'scheduled' }, 'match.disarm');
  }

  /** The feed says a game started in the armed match, or that a winner is known. */
  onFeedState(lobbyId: string, n: number, to: 'live' | 'finishing', at: number) {
    const l = this.lobbies.find(lobbyId);
    const g = l.games.find((x) => x.n === n);
    if (!g) return;
    if (to === 'live') {
      const attempts: Attempt[] = [...(g.attempts ?? []), { n: (g.attempts?.length ?? 0) + 1, startedAt: at }];
      this.setGame(l, g, { state: 'live', attempts }, 'match.live', { attempt: attempts.length });
    } else if (gameState(g) === 'live') this.setGame(l, g, { state: 'finishing' }, 'match.finishing');
  }

  /** After Confirm or Void: the next scheduled match of the same day is armed, when nothing else is. */
  private armNext(lobbyId: string, after: LobbyGame) {
    const l = this.lobbies.find(lobbyId);
    if (isBusy(l) || l.games.some((g) => gameState(g) === 'armed')) return;
    const next = nextOfDay(l, after);
    if (next?.id) this.arm(lobbyId, next.id);
  }

  // ── what happens to a match ──

  /** Remake: the attempt is kept for the record and the match is armed for a clean new one; only the last attempt counts. */
  remake(lobbyId: string, matchId: string) {
    const { l, g } = this.match(lobbyId, matchId);
    const state = gameState(g);
    if (!['live', 'finishing', 'provisional'].includes(state)) throw new Error(`Match ${g.n} is ${STATE_LABEL[state].toLowerCase()}; only a live or provisional match can be remade.`);
    const open = (g.attempts ?? []).at(-1);
    const kept: Attempt = { n: open?.n ?? (g.attempts?.length ?? 0) + 1, startedAt: open?.startedAt ?? this.now, endedAt: this.now, reason: 'remake', ...(g.feed ?? this.ctx.feed.partialFeed(l) ? { feed: g.feed ?? this.ctx.feed.partialFeed(l)! } : {}), ...(g.results?.length ? { results: g.results } : {}) };
    const attempts = [...(g.attempts ?? []).filter((a) => a.n !== kept.n), kept];
    const clean = this.strip(g, 'results', 'feed', 'draft', 'checks', 'source', 'finishedAt', 'gameResults');
    const other = l.games.map((x) => (x.id === g.id ? { ...clean, state: 'armed' as const, attempts } : gameState(x) === 'armed' ? { ...x, state: 'scheduled' as const } : x));
    if (g.results?.length) this.lobbies.note(l, 'result.clear', { game: g.n });
    this.lobbies.commit({ ...l, games: other }, 'match.remake', { game: g.n, matchId: g.id, attempt: kept.n });
    this.ctx.feed.remade();
    this.ctx.log(`${l.title}: match ${g.n} remade (attempt ${kept.n} kept for the record)`);
  }

  /** Void: cancelled on purpose, never counted; the day can still close. */
  voidMatch(lobbyId: string, matchId: string, reason: unknown) {
    const { l, g } = this.match(lobbyId, matchId);
    const why = reasonText(reason, 'The reason');
    const state = gameState(g);
    if (state === 'void') return;
    const wasLive = state === 'live' || state === 'finishing';
    const open = (g.attempts ?? []).at(-1);
    const attempts = wasLive && open && !open.endedAt ? [...(g.attempts ?? []).slice(0, -1), { ...open, endedAt: this.now, reason: 'void' as const, ...(this.ctx.feed.partialFeed(l) ? { feed: this.ctx.feed.partialFeed(l)! } : {}) }] : g.attempts ?? [];
    const edits = state === 'confirmed' ? [...(g.edits ?? []), { at: this.now, reason: `Voided: ${why}`, before: g.results ?? [], after: [] }] : g.edits;
    const clean = this.strip(g, 'results', 'feed', 'draft', 'checks', 'source', 'finishedAt', 'gameResults', 'confirmedAt', 'confirmedBy');
    if (g.results?.length) this.lobbies.note(l, 'result.clear', { game: g.n });
    this.lobbies.commit({ ...l, games: l.games.map((x) => (x.id === g.id ? { ...clean, state: 'void' as const, voidReason: why, attempts, ...(edits ? { edits } : {}) } : x)) }, 'match.void', { game: g.n, matchId: g.id, reason: why });
    if (wasLive) this.ctx.feed.remade();
    this.ctx.log(`${l.title}: match ${g.n} voided (${why})`);
    // A game that was live is thrown away but may still be running in PCOB: the next match is not armed for it, the producer arms it.
    if (!wasLive) this.armNext(lobbyId, g);
  }

  /** The producer ends a live match: what the game gave becomes provisional and the missing places are typed. */
  async endMatch(lobbyId: string, matchId: string) {
    const { l, g } = this.match(lobbyId, matchId);
    const state = gameState(g);
    if (state !== 'live' && state !== 'finishing') throw new Error(`Match ${g.n} is ${STATE_LABEL[state].toLowerCase()}; only a live match can be ended.`);
    if (await this.ctx.feed.endNow()) return;
    // No game data at all (PCOB lost, or typed show): the match is provisional with every place still to type.
    const open = (g.attempts ?? []).at(-1);
    const attempts = open && !open.endedAt ? [...(g.attempts ?? []).slice(0, -1), { ...open, endedAt: this.now, reason: 'ended' as const }] : g.attempts ?? [];
    this.setGame(l, g, { state: 'provisional', attempts, draft: l.teams.map((t) => ({ team: t.id, place: null, elims: 0 })), checks: { unplaced: l.teams.map((t) => t.id), teamKills: [], unknown: [], disconnected: [] } }, 'match.end', { reason: 'producer, no game data' });
    this.ctx.log(`${l.title}: match ${g.n} ended without game data; type the places`);
  }

  /** Confirm: results must be valid and complete. Locks the match, adds it to the official standings and arms the next one. */
  confirm(lobbyId: string, matchId: string) {
    const { l, g } = this.match(lobbyId, matchId);
    const problems = confirmProblems(l, g);
    if (problems.length) throw new Error(problems[0]);
    const by = this.ctx.user?.();
    const next = this.setGame(l, g, { state: 'confirmed', confirmedAt: this.now, ...(by ? { confirmedBy: by } : {}) }, 'match.confirm', { results: g.results, ...(by ? { by } : {}) });
    this.ctx.log(`${l.title}: match ${g.n} confirmed · ${standingsView(next).official[0] ? `${next.teams.find((t) => t.id === standingsView(next).official[0]!.team)?.name} leads` : 'standings updated'}`);
    this.armNext(lobbyId, g);
  }

  /** A confirmed match corrected, with the reason, the old and the new results kept. */
  editConfirmed(lobbyId: string, matchId: string, rows: unknown, reason: unknown) {
    const { l, g } = this.match(lobbyId, matchId);
    if (gameState(g) !== 'confirmed') throw new Error(`Match ${g.n} is not confirmed. Type its results in Results instead.`);
    const why = reasonText(reason, 'The reason for the change');
    const after = validResults(rows, l.teams);
    if (after.length !== l.teams.length) throw new Error('Every team needs a place.');
    const before = g.results ?? [];
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error('Nothing changed.');
    this.setGame(l, g, { results: after, source: 'producer', edits: [...(g.edits ?? []), { at: this.now, reason: why, before, after }] }, 'match.edit', { results: after, before, reason: why });
    this.ctx.log(`${l.title}: match ${g.n} edited after confirm (${why})`);
  }

  // ── adjustments ──

  adjust(lobbyId: string, team: unknown, points: unknown, reason: unknown) {
    const l = this.lobbies.find(lobbyId);
    const a = validAdjustment(l, { team, points, reason });
    const open = l.days?.find((d) => d.startedAt && !d.closedAt) ?? [...(l.days ?? [])].reverse().find((d) => matchesOfDay(l, d).some((g) => gameState(g) === 'confirmed')) ?? l.days?.[0];
    const item: Adjustment = { id: randomUUID(), ...a, at: this.now, ...(open ? { dayId: open.id } : {}) };
    this.lobbies.commit({ ...l, adjustments: [...(l.adjustments ?? []), item] }, 'adjust', { ...item });
    const t = l.teams.find((x) => x.id === a.team)!;
    this.ctx.log(`${l.title}: ${a.points > 0 ? '+' : ''}${a.points} for ${t.name} (${a.reason})`);
  }

  removeAdjustment(lobbyId: string, id: string) {
    const l = this.lobbies.find(lobbyId);
    const a = (l.adjustments ?? []).find((x) => x.id === id);
    if (!a) throw new Error('That adjustment is gone.');
    this.lobbies.commit({ ...l, adjustments: (l.adjustments ?? []).filter((x) => x.id !== id) }, 'adjust.remove', { id, team: a.team, points: a.points, reason: a.reason });
  }

  // ── days ──

  dayAdd(lobbyId: string, input: { date?: unknown; title?: unknown; opensAt?: unknown }) {
    const l = this.lobbies.find(lobbyId);
    const date = this.date(input.date ?? ymd(this.now));
    const n = (l.days?.length ?? 0) + 1;
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.replace(/[<>]/g, '').trim().slice(0, 40) : `Day ${n}`;
    const day: LobbyDay = { id: randomUUID(), date, title, ...(this.time(input.opensAt) ? { opensAt: this.time(input.opensAt)! } : {}), matchIds: [] };
    this.lobbies.commit({ ...l, days: [...(l.days ?? []), day] }, 'day.add', { dayId: day.id, date, title });
    return day.id;
  }

  /** Changes a day's date, title or doors-open time, and the matches in it (in run order; a match listed here leaves its old day). */
  dayEdit(lobbyId: string, dayId: string, patch: { date?: unknown; title?: unknown; opensAt?: unknown; matchIds?: unknown; reopen?: unknown }) {
    const l = this.lobbies.find(lobbyId);
    const day = l.days?.find((d) => d.id === dayId);
    if (!day) throw new Error('That day is not in this lobby.');
    const next: LobbyDay = { ...day };
    if (patch.date !== undefined) next.date = this.date(patch.date);
    if (patch.title !== undefined) { const t = String(patch.title).replace(/[<>]/g, '').trim().slice(0, 40); if (!t) throw new Error('The day needs a name.'); next.title = t; }
    if (patch.opensAt !== undefined) { const t = this.time(patch.opensAt); if (patch.opensAt && !t) throw new Error('Doors open at a time like 15:30.'); if (t) next.opensAt = t; else delete next.opensAt; }
    if (patch.reopen === true) delete next.closedAt;
    let games = l.games;
    if (Array.isArray(patch.matchIds)) {
      const ids = patch.matchIds.map(String);
      for (const id of ids) {
        const g = gameById(l, id);
        if (!g) throw new Error('A match in the list is not in this lobby.');
        if (['live', 'finishing'].includes(gameState(g))) throw new Error(`Match ${g.n} is live and cannot move.`);
      }
      games = l.games.map((g) => (ids.includes(g.id!) ? { ...g, dayId } : g));
      next.matchIds = ids;
    }
    const days = (l.days ?? []).map((d) => (d.id === dayId ? next : { ...d, matchIds: d.matchIds.filter((id) => !(next.matchIds ?? []).includes(id)) }));
    this.lobbies.commit({ ...l, days, games }, 'day.edit', { dayId, fields: { date: next.date, title: next.title, opensAt: next.opensAt ?? null, matchIds: next.matchIds, reopen: patch.reopen === true } });
  }

  private date(v: unknown) {
    const s = String(v ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error('A date looks like 2026-12-06.');
    return s;
  }
  private time(v: unknown) { const s = typeof v === 'string' ? v.trim() : ''; return /^\d{1,2}:\d{2}$/.test(s) ? s : null; }

  /** Start day: the checklist (standings carried in, roster changes since the last day, the matches, data checks); with `go` the day starts and its first match is armed. */
  dayStart(lobbyId: string, dayId: string, go = false): DayStart {
    const l = this.lobbies.find(lobbyId);
    const day = l.days?.find((d) => d.id === dayId);
    if (!day) throw new Error('That day is not in this lobby.');
    const name = (id: string) => l.teams.find((t) => t.id === id)?.name ?? 'A team';
    const days = l.days ?? [];
    const prev = [...days.slice(0, days.indexOf(day))].reverse().find((d) => d.closedAt || d.startedAt);
    const since = prev?.closedAt ?? prev?.startedAt ?? 0;
    const roster = rosterChanges(this.ctx.journal?.read(l.eventId) ?? [], l.id, since).map((c) => ({ ...c, name: name(c.team) }));
    const pcob = this.ctx.pcob();
    const problems: string[] = [];
    if (liveMatch(l)) problems.push(`Match ${liveMatch(l)!.n} is live.`);
    if (day.closedAt) problems.push(`${day.title} is already closed. Reopen it to start it again.`);
    const early = days.slice(0, days.indexOf(day)).filter((d) => !d.closedAt && matchesOfDay(l, d).some((g) => !['confirmed', 'void'].includes(gameState(g))));
    for (const d of early) problems.push(`${d.title} still has matches that are not confirmed or void.`);
    if (!matchesOfDay(l, day).length) problems.push(`${day.title} has no matches.`);
    const result: DayStart = {
      day, standingsIn: standingsView(l).official.map((r) => ({ team: r.team, name: name(r.team), rank: r.rank, total: r.total })), roster,
      matches: matchesOfDay(l, day).map((g) => ({ id: g.id!, n: g.n, map: g.map, time: g.scheduledAt ?? g.startsAt ?? '', state: gameState(g) })),
      problems, data: { pcob: pcob.state, consent: pcob.state !== 'off', test: !!this.ctx.testRunning?.() }, started: !!day.startedAt,
    };
    if (!go) return result;
    if (problems.length) throw new Error(problems[0]);
    this.lobbies.commit({ ...l, days: days.map((d) => (d.id === dayId ? { ...d, startedAt: this.now } : d)) }, 'day.start', { dayId, standings: result.standingsIn.map((r) => [r.team, r.total]), roster: roster.length });
    const first = matchesOfDay(this.lobbies.find(lobbyId), day).find((g) => gameState(g) === 'scheduled');
    if (first?.id && !this.lobbies.find(lobbyId).games.some((g) => gameState(g) === 'armed')) this.arm(lobbyId, first.id);
    this.ctx.log(`${l.title}: ${day.title} started`);
    return { ...result, started: true };
  }

  /** What Close day shows: the summary and anything that stops it. */
  dayCloseCheck(lobbyId: string, dayId: string): DaySummary & { problems: string[] } {
    const l = this.lobbies.find(lobbyId);
    const day = l.days?.find((d) => d.id === dayId);
    if (!day) throw new Error('That day is not in this lobby.');
    return { ...daySummary(l, dayId), problems: closeProblems(l, day) };
  }

  /** Closes the day: every match confirmed or void. Returns the summary (also what the printed page shows). */
  dayClose(lobbyId: string, dayId: string): DaySummary {
    const l = this.lobbies.find(lobbyId);
    const day = l.days?.find((d) => d.id === dayId);
    if (!day) throw new Error('That day is not in this lobby.');
    const problems = closeProblems(l, day);
    if (problems.length) throw new Error(problems[0]);
    this.lobbies.commit({ ...l, days: (l.days ?? []).map((d) => (d.id === dayId ? { ...d, closedAt: this.now } : d)) }, 'day.close', { dayId });
    this.ctx.log(`${l.title}: ${day.title} closed`);
    return daySummary(this.lobbies.find(lobbyId), dayId);
  }

  // ── checkpoints and resume ──

  /** The feed's live state, saved every 2 s. */
  checkpoint(cp: Omit<BrCheckpoint, 'matchId' | 'attempt'> | null) {
    const data = this.ctx.store.data;
    if (cp === null) { if (data.brCheckpoint) { data.brCheckpoint = null; this.ctx.store.save(); } return; }
    const l = this.lobbies.list().find((x) => x.id === cp.lobbyId);
    const g = l?.games.find((x) => x.n === cp.n);
    if (!g || !['live', 'finishing'].includes(gameState(g))) return;
    data.brCheckpoint = { ...cp, matchId: g.id!, attempt: g.attempts?.length ?? 1 };
    this.ctx.store.save();
  }

  /** After a restart: the match that was live and the autopilot run that was in progress. */
  resumeOffer(): BrResume | null {
    if (this.resumeDismissed) return null;
    const cp = this.ctx.store.data.brCheckpoint ?? null;
    const l = cp ? this.lobbies.list().find((x) => x.id === cp.lobbyId) : null;
    const g = cp && l ? l.games.find((x) => x.id === cp.matchId) : null;
    const live = !!g && ['live', 'finishing'].includes(gameState(g));
    const auto = this.ctx.autopilot?.pending() ?? null;
    if (!live && !auto) return null;
    const al = auto ? this.lobbies.list().find((x) => x.id === auto.lobbyId) : null;
    return {
      lobbyId: live ? cp!.lobbyId : auto!.lobbyId, matchId: live ? cp!.matchId : null, n: live ? cp!.n : null, title: (live ? l : al)?.title ?? 'Lobby',
      placed: live ? cp!.placed.length : 0, kills: live ? cp!.kills : 0, moments: live ? cp!.moments.length : 0, savedAt: live ? cp!.savedAt : auto?.savedAt ?? null,
      autopilot: auto ? [...(auto.now ? [auto.now] : []), ...auto.left].map((r) => r.screen) : [],
    };
  }

  /** Resume: the same match is read again (consent for game data is still asked), moments already shown do not fire again, autopilot carries on. */
  async resume() {
    const offer = this.resumeOffer();
    if (!offer) return;
    const cp = this.ctx.store.data.brCheckpoint;
    if (offer.matchId && cp) this.ctx.feed.resume({ lobbyId: cp.lobbyId, n: cp.n, placed: cp.placed, kills: cp.kills, moments: cp.moments, lastDataAt: cp.lastDataAt, savedAt: cp.savedAt });
    this.ctx.log(`Resumed ${offer.title}${offer.n ? ` · match ${offer.n}` : ''}${offer.autopilot.length ? ' · autopilot carries on' : ''}`);
    this.resumeDismissed = true;
    if (offer.autopilot.length) await this.ctx.autopilot?.resume();
    this.ctx.changed();
  }

  /** Not now: the match stays live (end or remake it), the saved autopilot run is dropped. */
  dismissResume() {
    this.resumeDismissed = true;
    this.ctx.autopilot?.discard();
    this.ctx.changed();
  }
}

