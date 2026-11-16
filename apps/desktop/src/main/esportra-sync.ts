// Esportra while a match from it is the match on this PC (15 Nov):
//  · apply   — prepare's package into the match: veto and map pool, standings and bracket, and the
//              event's sponsors and casters only when the producer has none (never overwritten);
//  · veto    — polled every 5 s before the match (30 s while not started) until the decider is in,
//              so the veto graphic follows the teams as they ban and pick on Esportra;
//  · results — a counted map goes back as a result proposal for the organizer to review. Kept in an
//              outbox and retried while Esportra is unreachable; the same map and score is the same
//              proposal (idempotent `clientKey`). Air never writes scores itself;
//  · heartbeat every 60 s, and the bracket every 2 min;
//  · while access is refused, access is checked again every 60 s (a grant on Esportra needs no restart).
// Production gives it a small context; HTTP is src/main/esportra.ts, the reading is src/shared/esportra-package.ts.
import { createHash } from 'node:crypto';
import type { Match } from '../shared/api.ts';
import type { EventInfo } from '../shared/model.ts';
import { nextVetoStep, type EventData, type MatchData, type VetoStep } from '../shared/match-data.ts';
import {
  bracketFrom, flipVeto, readOrder, readPool, readToss, readTurn, readVetoSteps, talentRole, unknownVetoMaps, vetoFrom,
  type EsportraPackage, type EsportraResult, type EsportraResultsView, type EsportraVetoView, type RawVetoStep, type VetoToss, type VetoTurn,
} from '../shared/esportra-package.ts';
import type { MapName, VetoOrderStep } from '../shared/match-data.ts';
import type { EsportraAccount, EsportraError } from './esportra.ts';
import { upsertSponsor, upsertTalent } from './event-model.ts';
import type { Store } from './store.ts';

export interface SavedResult extends EsportraResult {
  packageId: string;
  reason: string;
  tries: number;
  /** Esportra's official score for that map when last read (a review must quote it). */
  current: [number | null, number | null];
}
export interface SavedResults { canReview: boolean; items: SavedResult[] }

export interface Health { appVersion: string; obsConnected: boolean; captureActive: boolean; productionActive: boolean; feedState: 'waiting' | 'live' | 'stale' | 'offline' }

export interface EsportraSyncContext {
  account(): EsportraAccount | undefined;
  store: Store;
  /** The selected match. */
  match(): Match | null;
  matchData: { of(match: Match): MatchData; setVeto(veto: VetoStep[], mapPool?: string[], vetoOrder?: VetoOrderStep[] | null): Promise<void>; eventData(eventId: string | null): EventData; saveEvent(eventId: string, input: unknown): Promise<void> };
  /** Game data or a test round is running (the veto is over). */
  live(): boolean;
  health(): Health;
  event(id: string): EventInfo | undefined;
  putEvent(event: EventInfo): Promise<void>;
  /** Writes fields into the selected match's room (the veto's turn and coin toss). */
  patch(fields: Record<string, unknown>): Promise<void>;
  /** Takes the match from Esportra again (its best-of changed there). */
  reprepare(matchId: string): Promise<void>;
  /** Stores a logo in the engine and returns its URL. */
  storeImage(bytes: Buffer, type: string): Promise<string>;
  save(): void;
  log(text: string): void;
  changed(): void;
  now(): number;
}

const VETO_EVERY = 2_000;
const VETO_IDLE_EVERY = 30_000;
const RESULTS_EVERY = 30_000;
const HEARTBEAT_EVERY = 60_000;
/** While access is refused, ask again this often, so a grant on Esportra reaches Air without a restart. */
const ACCESS_EVERY = 60_000;
const BRACKET_EVERY = 120_000;

/** The same map and score always gives the same proposal id (Esportra treats a repeat as the same proposal). */
export function proposalKey(packageId: string, map: number, scores: [number, number]) {
  const h = createHash('sha256').update(`air-result:${packageId}:${map}:${scores[0]}:${scores[1]}`).digest('hex').split('');
  h[12] = '5';
  h[16] = ((parseInt(h[16]!, 16) & 3) | 8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** What Air knows of one match's veto on Esportra. */
interface VetoWatch { status: string | null; gone: boolean; warned: Set<string>; turnKey: string; unknown: string[] }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class EsportraSync {
  private readonly ctx: EsportraSyncContext;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private last = { veto: 0, results: 0, heartbeat: 0, bracket: 0, access: 0 };
  private readonly watches = new Map<string, VetoWatch>();
  private unreachableSince: number | null = null;

  constructor(ctx: EsportraSyncContext) {
    this.ctx = ctx;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private get account() {
    const a = this.ctx.account();
    return a?.signedIn ? a : null;
  }

  private esportraMatch() {
    const m = this.ctx.match();
    return m?.source?.matchId ? m : null;
  }

  // ── the package ──

  private watch(matchId: string): VetoWatch {
    let w = this.watches.get(matchId);
    if (!w) this.watches.set(matchId, (w = { status: null, gone: false, warned: new Set(), turnKey: '', unknown: [] }));
    return w;
  }

  /** The match's sides in Air are the other way round from Esportra's (the producer swapped the teams here). */
  private flipped(match: Match) {
    const names = match.source?.teams;
    return !!names && !same(names[0], names[1]) && same(match.teams[0].name, names[1]) && same(match.teams[1].name, names[0]);
  }

  /** Puts a prepared package into the selected match (it must be the match the package is for). */
  async apply(pkg: EsportraPackage) {
    const match = this.esportraMatch();
    if (!match) return;
    match.source = { ...match.source!, packageId: pkg.packageId, packageVersion: pkg.version };
    this.ctx.save();
    const w = this.watch(match.id);
    w.gone = false;
    w.status = null;
    w.unknown = pkg.unknownMaps;
    await this.applyVeto(match, pkg.veto, pkg.mapPool, pkg.vetoOrder);
    await this.applyBracket(match, pkg.bracket);
    await this.fillEvent(match, pkg);
    this.last.bracket = this.ctx.now();
  }

  /**
   * Esportra's veto replaces Air's whenever it differs, a reset included. A veto the producer entered here
   * is never overwritten until they choose to follow Esportra again.
   */
  private async applyVeto(match: Match, raw: RawVetoStep[], pool: MapName[], order: VetoOrderStep[] | null) {
    const here = this.ctx.matchData.of(match);
    if (here.vetoSource === 'air' && here.veto.length) return false;
    const flip = this.flipped(match);
    const steps = flip ? flipVeto(raw) : raw;
    const vetoOrder = order && flip ? flipVeto(order) : order;
    const converted = vetoFrom(steps, match.bestOf, pool.length ? pool : here.mapPool, vetoOrder);
    const w = this.watch(match.id);
    if (!converted) {
      if (!w.warned.has('order')) this.ctx.log('Esportra’s veto does not fit this match’s order · enter it in Match data');
      w.warned.add('order');
      return false;
    }
    const same = JSON.stringify([converted.veto, vetoOrder ?? here.vetoOrder]) === JSON.stringify([here.veto, here.vetoOrder]);
    if (same && here.vetoSource === 'esportra') return false;
    await this.ctx.matchData.setVeto(converted.veto, converted.mapPool, vetoOrder ?? here.vetoOrder);
    if (same) return false;
    const step = converted.veto.at(-1);
    if (!step) this.ctx.log(here.veto.length ? 'Veto reset on Esportra · cleared here too' : 'Veto · following Esportra');
    else if (converted.veto.length < here.veto.length) this.ctx.log(`Veto changed on Esportra · ${converted.veto.length} step${converted.veto.length === 1 ? '' : 's'} now`);
    else this.ctx.log(`Veto from Esportra · ${step.action === 'decider' ? 'Decider' : `${match.teams[step.team as 0 | 1]?.tag ?? 'Team'} ${step.action}s`} ${step.map}`);
    return true;
  }

  /** Whose turn it is and the coin toss, on air while Esportra's veto is followed and not finished. */
  private async applyTurn(match: Match, turn: VetoTurn | null, toss: VetoToss | null) {
    const md = this.ctx.matchData.of(match);
    const w = this.watch(match.id);
    const follow = md.vetoSource === 'esportra' || !md.veto.length;
    const flip = this.flipped(match);
    const t = follow && turn && w.status === 'in_progress' ? { ...turn, team: (flip ? 1 - turn.team : turn.team) as 0 | 1 } : null;
    const c = follow && toss && w.status !== 'completed' ? { ...toss, winner: toss.winner === null ? null : ((flip ? 1 - toss.winner : toss.winner) as 0 | 1) } : null;
    const key = JSON.stringify([t, c]);
    if (key === w.turnKey) return;
    w.turnKey = key;
    await this.ctx.patch({ vetoTurn: t, vetoToss: c });
  }

  private async applyBracket(match: Match, snapshot: unknown) {
    const fields = bracketFrom(snapshot, match.source!.matchId);
    if (!fields || (!fields.standings.length && !fields.bracket.gf.length && !fields.bracket.sf.length && !fields.bracket.qf.length)) return;
    const ev = this.ctx.matchData.eventData(match.eventId);
    if (JSON.stringify([ev.standings, ev.bracket]) === JSON.stringify([fields.standings, fields.bracket])) return;
    await this.ctx.matchData.saveEvent(match.eventId, { ...ev, standings: fields.standings, bracket: fields.bracket });
  }

  /** Sponsors and casters from Esportra, only into an event that has none of its own. */
  private async fillEvent(match: Match, pkg: EsportraPackage) {
    let event = this.ctx.event(match.eventId);
    if (!event) return;
    let added = 0;
    if (!event.sponsors.length) {
      for (const s of pkg.sponsors) {
        let logo = s.logoUrl;
        if (!logo && s.assetId) {
          try {
            const { bytes, type } = await this.account!.asset(s.assetId);
            logo = await this.ctx.storeImage(bytes, type);
          } catch { logo = ''; }
        }
        try { event = upsertSponsor(event, { name: s.name, logo }); added++; } catch { /* a sponsor Air cannot keep is skipped */ }
      }
    }
    if (!event.talent.length) {
      for (const c of pkg.casters) {
        try { event = upsertTalent(event, { name: c.name, role: talentRole(c.role) }); added++; } catch { /* skipped */ }
      }
    }
    if (added) {
      await this.ctx.putEvent(event);
      this.ctx.log(`From Esportra · ${added} sponsor${added === 1 ? '' : 's'} and talent added to ${event.name}`);
    }
  }

  // ── the loop ──

  async tick() {
    if (this.busy) return;
    const account = this.account;
    if (!account) return;
    this.busy = true;
    const now = this.ctx.now();
    try {
      // Access can come back through the heartbeat's own check or through ours: either way, reload the matches.
      const wasDenied = account.view().state === 'denied';
      if (now - this.last.heartbeat >= HEARTBEAT_EVERY) {
        this.last.heartbeat = now;
        await account.heartbeat(this.ctx.health()).catch(() => {});
      }
      if (account.view().state === 'denied') {
        if (now - this.last.access < ACCESS_EVERY) return;
        this.last.access = now;
        await account.checkAccess().catch(() => {});
        if (account.view().state === 'denied') return;
      }
      if (wasDenied) {
        this.ctx.log('Esportra turned on Air for this account');
        await account.refreshMatches().catch(() => {});
      }
      const match = this.esportraMatch();
      const w = match ? this.watch(match.id) : null;
      if (match && this.vetoWanted(match) && now - this.last.veto >= (w?.status === 'in_progress' ? VETO_EVERY : VETO_IDLE_EVERY)) {
        this.last.veto = now;
        await this.pollVeto(match).catch(() => {});
      }
      if (match && now - this.last.bracket >= BRACKET_EVERY) {
        this.last.bracket = now;
        await account.bracket(match.source!.matchId).then((b) => this.applyBracket(match, b)).catch(() => {});
      }
      if (now - this.last.results >= RESULTS_EVERY) {
        this.last.results = now;
        await this.flush();
        if (match) await this.readResults(match).catch(() => {});
      }
    } finally {
      this.busy = false;
    }
  }

  private vetoWanted(match: Match) {
    const w = this.watch(match.id);
    if (w.gone || this.ctx.live()) return false;
    const md = this.ctx.matchData.of(match);
    if (md.vetoSource === 'air' && md.veto.length) return false;
    return !(w.status === 'completed' && nextVetoStep(md.veto, match.bestOf, md.vetoOrder) === null);
  }

  /** Reads the match's veto on Esportra and follows it. */
  async pollVeto(match: Match) {
    const w = this.watch(match.id);
    let v: Awaited<ReturnType<EsportraAccount['veto']>>;
    try {
      v = await this.account!.veto(match.source!.matchId);
    } catch (error) {
      const status = (error as EsportraError).status ?? 0;
      if (status === 404) {
        w.gone = true;
        this.ctx.log('This match is no longer in your Esportra schedule · its veto stays as it is');
        await this.applyTurn(match, null, null);
      } else if (status === 0 || status >= 500) this.unreachableSince ??= this.ctx.now();
      this.ctx.changed();
      throw error;
    }
    this.unreachableSince = null;
    const bestOf = Number(v.bestOf);
    if ([1, 3, 5].includes(bestOf) && bestOf !== match.bestOf && !w.warned.has(`bestOf:${bestOf}`)) {
      w.warned.add(`bestOf:${bestOf}`);
      this.ctx.log(`Best of ${bestOf} on Esportra · taking the match again`);
      await this.ctx.reprepare(match.source!.matchId);
      // Read the veto again for the match as it is now (once: the same best-of is not taken twice).
      const again = this.esportraMatch();
      if (again) await this.pollVeto(again);
      return;
    }
    const before = w.status;
    w.status = typeof v.status === 'string' ? v.status : null;
    const unknown = unknownVetoMaps(v.steps);
    for (const m of unknown) if (!w.warned.has(`map:${m}`)) { w.warned.add(`map:${m}`); this.ctx.log(`Esportra’s veto has ${m}, a map Air does not know · it is left out`); }
    w.unknown = unknown;
    const changed = await this.applyVeto(match, readVetoSteps(v.steps), readPool(v.mapPool), readOrder(v.sequence));
    await this.applyTurn(match, readTurn(v.turn, this.ctx.now()), readToss(v.toss));
    if (changed || before !== w.status) this.ctx.changed();
  }

  /** What the interface shows about the selected match's veto on Esportra. */
  vetoView(match: Match | null): EsportraVetoView | null {
    if (!match?.source?.matchId) return null;
    const w = this.watch(match.id);
    return { source: this.ctx.matchData.of(match).vetoSource, status: w.status, gone: w.gone, unknownMaps: w.unknown, unreachableSince: this.unreachableSince };
  }

  /** The producer hands the veto back to Esportra: read it now. */
  async followAgain(match: Match) {
    this.watch(match.id).warned.delete('order');
    this.last.veto = 0;
    await this.pollVeto(match).catch(() => {});
  }

  // ── results ──

  private results(matchId: string): SavedResults {
    const all = (this.ctx.store.data.esportraResults ??= {});
    return (all[matchId] ??= { canReview: false, items: [] });
  }

  /** A map Air counted: queued for Esportra and sent as soon as it can be. */
  async propose(match: Match, map: number, scores: [number, number], how: string) {
    const packageId = match.source?.packageId;
    if (!packageId || scores[0] === scores[1]) return;
    const saved = this.results(match.id);
    const proposalId = proposalKey(packageId, map, scores);
    if (saved.items.some((i) => i.proposalId === proposalId)) return;
    saved.items.push({ map, scores, state: 'queued', status: null, error: null, proposalId, packageId, reason: `Map ${map} ${how} · counted by Esportra Air`.slice(0, 500), tries: 0, current: [null, null] });
    this.ctx.save();
    this.ctx.log(`Map ${map} ${scores[0]}–${scores[1]} · queued for Esportra review`);
    await this.flush();
    this.ctx.changed();
  }

  /** Sends queued proposals. A refusal is kept with Esportra's reason; anything else is retried later. */
  async flush() {
    const account = this.account;
    const all = this.ctx.store.data.esportraResults;
    if (!account || !all) return;
    let changed = false;
    for (const saved of Object.values(all)) {
      for (const item of saved.items.filter((i) => i.state === 'queued')) {
        item.tries++;
        try {
          await account.proposeResult(item.packageId, { clientKey: item.proposalId, mapNumber: item.map, teamAScore: item.scores[0], teamBScore: item.scores[1], reason: item.reason });
          Object.assign(item, { state: 'sent', status: 'pending', error: null });
        } catch (error) {
          const status = (error as EsportraError).status ?? 0;
          if (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) Object.assign(item, { state: 'refused', error: (error as Error).message });
          else item.error = (error as Error).message;
        }
        changed = true;
      }
    }
    if (changed) { this.ctx.save(); this.ctx.changed(); }
  }

  /** The organizer's decisions, and whether this account may make them. */
  async readResults(match: Match) {
    const packageId = match.source?.packageId;
    const account = this.account;
    if (!packageId || !account) return;
    const list = await account.results(packageId);
    const saved = this.results(match.id);
    saved.canReview = list.canReview === true;
    for (const row of list.proposals ?? []) {
      const id = String(row.id ?? row.Id ?? '');
      const item = saved.items.find((i) => i.proposalId === id);
      if (!item) continue;
      const status = String(row.status ?? row.Status ?? 'pending');
      item.status = status === 'apply' ? 'applied' : status === 'reject' ? 'rejected' : 'pending';
      item.state = 'sent';
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      item.current = [n(row.currentTeamAScore ?? row.CurrentTeamAScore), n(row.currentTeamBScore ?? row.CurrentTeamBScore)];
    }
    this.ctx.save();
    this.ctx.changed();
  }

  /** Applies or rejects a proposal on Esportra (organizers and crew allowed to submit results). */
  async review(proposalId: string, decision: 'apply' | 'reject') {
    const match = this.esportraMatch();
    if (!match) throw new Error('Choose the Esportra match first.');
    const account = this.account;
    if (!account) throw new Error('Sign in to Esportra first.');
    await this.readResults(match);
    const saved = this.results(match.id);
    if (!saved.canReview) throw new Error('This Esportra account cannot review results for this match.');
    const item = saved.items.find((i) => i.proposalId === proposalId);
    if (!item || item.state !== 'sent') throw new Error('That result has not reached Esportra yet.');
    if (item.status !== 'pending') throw new Error('That result was already reviewed.');
    await account.reviewResult(item.packageId, proposalId, { decision, currentTeamAScore: item.current[0], currentTeamBScore: item.current[1] });
    item.status = decision === 'apply' ? 'applied' : 'rejected';
    this.ctx.save();
    this.ctx.log(`Map ${item.map} ${item.scores[0]}–${item.scores[1]} · ${decision === 'apply' ? 'applied on Esportra' : 'rejected on Esportra'}`);
    this.ctx.changed();
  }

  view(match: Match | null): EsportraResultsView | null {
    if (!match?.source?.matchId) return null;
    const saved = this.ctx.store.data.esportraResults?.[match.id];
    return { canReview: saved?.canReview ?? false, items: (saved?.items ?? []).map(({ map, scores, state, status, error, proposalId }) => ({ map, scores, state, status, error, proposalId })) };
  }
}
