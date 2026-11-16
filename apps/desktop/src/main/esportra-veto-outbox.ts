// Two-way veto (16 Nov): at a LAN the teams cannot open the website, so staff collect the veto and the
// producer enters it in Air. For an Esportra match every step entered here also goes to the match room:
//  · each step goes on screen at once and joins this outbox, kept in the store, so it survives a restart;
//  · the outbox sends in order (every 2 s while Esportra answers), each step with a client key (a retry is the
//    same step, never a second one) and the match room's step number Air last saw;
//  · offline, steps wait and go when Esportra is back;
//  · if the match room moved on meanwhile (409), sending stops and the producer picks which veto stands:
//    Esportra's (drop the waiting steps) or Air's (reset the match room and send Air's veto again);
//  · a step changed after the match room had it (undo, edit, swap who starts) is sent as reset and resend,
//    after the producer confirms.
// Esportra's own steps still arrive through esportra-sync.ts; while steps wait here, its poll does not
// overwrite Air's veto.
import { randomUUID } from 'node:crypto';
import type { Match } from '../shared/api.ts';
import type { MapName, MatchData, VetoStep } from '../shared/match-data.ts';
import { flipVeto, readOrder, readPool, readToss, readVetoSteps, vetoFrom, type VetoOutboxView } from '../shared/esportra-package.ts';
import type { EsportraAccount, EsportraError } from './esportra.ts';
import type { Store } from './store.ts';

export type OutboxAction = 'start' | 'toss_choice' | 'ban' | 'pick' | 'pick_side' | 'reset';
/** One action for the match room. `expect` is the match room's step number this action must land on, from Air's own veto when it was entered. */
export interface OutboxEntry { key: string; action: OutboxAction; map?: string; side?: 'ATK' | 'DEF'; goFirst?: boolean; expect?: number }
export interface SavedVetoOutbox {
  queue: OutboxEntry[];
  /** The match room's step number, status and toss winner (Air's team order) as last read. */
  step: number | null;
  status: string | null;
  tossWinner: 0 | 1 | null;
  /** What the match room waits for now (ban, pick, pick_side), as last read. */
  turnAction?: string | null;
  sentAt: number | null;
  error: string | null;
  rewrite: boolean;
  conflict: { air: VetoStep[]; esportra: VetoStep[] } | null;
  needsSide: MapName | null;
}

export interface VetoOutboxContext {
  store: Store;
  account(): EsportraAccount | null;
  matchData: { of(match: Match): MatchData; setVeto(veto: VetoStep[]): Promise<void> };
  /** Air shows the teams the other way round from Esportra. */
  flipped(match: Match): boolean;
  save(): void;
  log(text: string): void;
  changed(): void;
  now(): number;
}

const SEND_EVERY = 2_000;
const fresh = (): SavedVetoOutbox => ({ queue: [], step: null, status: null, tossWinner: null, sentAt: null, error: null, rewrite: false, conflict: null, needsSide: null });
const key = () => `air-${randomUUID()}`;
const sameStep = (a: VetoStep, b: VetoStep) => a.team === b.team && a.action === b.action && a.map === b.map;

/** How many match-room actions Air's steps make: a ban or a pick is one, each side choice (after a pick, on the decider) one more. */
export function roomActions(veto: VetoStep[]): number {
  return veto.reduce((n, v) => n + (v.action === 'decider' ? 0 : 1) + (v.side ? 1 : 0), 0);
}

/** The match room's actions for Air's steps, numbered from the step number the first lands on (a pick or decider without its side sends no side yet). */
export function entriesFor(steps: VetoStep[], first: number): OutboxEntry[] {
  const out: OutboxEntry[] = [];
  let n = first;
  for (const step of steps) {
    if (step.action !== 'decider') out.push({ key: key(), action: step.action, map: step.map, expect: n++ });
    if (step.side) out.push({ key: key(), action: 'pick_side', map: step.map, side: step.side, expect: n++ });
  }
  return out;
}

export class VetoOutbox {
  private readonly ctx: VetoOutboxContext;
  private lastSend = 0;
  private sending = false;

  constructor(ctx: VetoOutboxContext) {
    this.ctx = ctx;
  }

  private box(matchId: string): SavedVetoOutbox {
    return ((this.ctx.store.data.esportraVetoOutbox ??= {})[matchId] ??= fresh());
  }

  /** The veto is linked to the match room: an Esportra match, signed in. */
  linked(match: Match | null): match is Match {
    return !!match?.source?.matchId && !!this.ctx.account()?.signedIn;
  }

  /** Esportra's poll may replace Air's veto only while nothing waits here. */
  holds(match: Match): boolean {
    const b = this.box(match.id);
    return b.queue.length > 0 || b.rewrite || !!b.conflict;
  }

  view(match: Match): VetoOutboxView {
    const b = this.box(match.id);
    const waitsForSide = b.turnAction === 'pick_side' && !b.queue.some((e) => e.action === 'pick_side');
    const unsided = this.ctx.matchData.of(match).veto.findLast((v) => v.action !== 'ban' && !v.side)?.map ?? null;
    return { waiting: b.queue.length, sentAt: b.sentAt, error: b.error, rewrite: b.rewrite, conflict: b.conflict, needsSide: waitsForSide ? unsided : null };
  }

  /** What the match room said, from a poll or an answer: its step number, status and toss winner. */
  observe(match: Match, raw: { status?: unknown; step?: unknown; toss?: unknown }) {
    const b = this.box(match.id);
    b.status = typeof raw.status === 'string' ? raw.status : b.status;
    if (Number.isInteger(raw.step)) b.step = raw.step as number;
    const turn = (raw as { turn?: { action?: unknown } | null }).turn;
    b.turnAction = turn && typeof turn.action === 'string' ? turn.action : null;
    const toss = readToss(raw.toss);
    const w = toss?.winner ?? null;
    b.tossWinner = w === null ? null : ((this.ctx.flipped(match) ? 1 - w : w) as 0 | 1);
  }

  /** Air's veto changed (a step entered, a side set, an undo or edit, who starts): queue what the match room needs. */
  noteChange(match: Match, before: MatchData, after: MatchData) {
    if (!this.linked(match)) return;
    const b = this.box(match.id);
    if (b.rewrite || b.conflict) return this.ctx.changed();
    const kept = before.veto.every((v, i) => after.veto[i] && sameStep(v, after.veto[i]!));
    const changedSides = before.veto.map((v, i) => [v, after.veto[i], i] as const).filter(([v, w]) => w && v.side !== w.side);
    // A side can still go while the match room has not moved past that pick: it slots in right after it.
    const sideAt = (i: number) => roomActions(before.veto.slice(0, i + 1)) + 1;
    const sideOk = changedSides.every(([v, , i]) => !v.side && (b.step ?? 0) <= sideAt(i));
    const firstChanged = before.vetoFirst !== after.vetoFirst;
    if (!kept || after.veto.length < before.veto.length || !sideOk || (firstChanged && before.veto.length)) {
      b.rewrite = true; // a step the match room may already have: send the whole veto again, once the producer confirms
    } else {
      for (const [, w, i] of changedSides) {
        const n = sideAt(i);
        for (const e of b.queue) if (e.expect !== undefined && e.expect >= n) e.expect++;
        const at = b.queue.findIndex((e) => e.expect !== undefined && e.expect > n);
        b.queue.splice(at < 0 ? b.queue.length : at, 0, { key: key(), action: 'pick_side', map: w!.map, side: w!.side, expect: n });
      }
      b.queue.push(...entriesFor(after.veto.slice(before.veto.length), roomActions(after.veto.slice(0, before.veto.length)) + 1));
      if (firstChanged && b.status === 'toss_choice_pending') b.queue.unshift({ key: key(), action: 'toss_choice', goFirst: after.vetoFirst === b.tossWinner });
    }
    this.ctx.save();
    this.ctx.changed();
  }

  /** The producer's choice: send Air's whole veto again (reset first), or take the match room's. */
  async resolve(match: Match, keep: 'air' | 'esportra') {
    const b = this.box(match.id);
    if (keep === 'esportra') {
      const theirs = b.conflict?.esportra;
      Object.assign(b, { queue: [], rewrite: false, conflict: null, error: null, needsSide: null });
      if (theirs) await this.ctx.matchData.setVeto(theirs);
      this.ctx.log('Veto · using the match room’s veto');
    } else {
      const md = this.ctx.matchData.of(match);
      b.queue = [{ key: key(), action: 'reset' }, { key: key(), action: 'start' }, ...entriesFor(md.veto, 1)];
      Object.assign(b, { rewrite: false, conflict: null, error: null, needsSide: null, status: null, step: null });
      this.ctx.log('Veto · sending Air’s veto to the match room again');
    }
    this.lastSend = 0;
    this.ctx.save();
    this.ctx.changed();
  }

  /** Try again after an error that stopped sending. */
  retry(match: Match) {
    const b = this.box(match.id);
    b.error = null;
    this.lastSend = 0;
    this.ctx.changed();
  }

  /** Sends the next waiting step, at most every 2 s; called from the Esportra loop. */
  async tick(match: Match | null) {
    if (!this.linked(match) || this.sending) return;
    const b = this.box(match.id);
    if (!b.queue.length || b.rewrite || b.conflict || b.error || this.ctx.now() - this.lastSend < SEND_EVERY) return;
    this.sending = true;
    this.lastSend = this.ctx.now();
    try {
      await this.sendNext(match, b);
    } finally {
      this.sending = false;
      this.ctx.save();
      this.ctx.changed();
    }
  }

  private async sendNext(match: Match, b: SavedVetoOutbox) {
    const md = this.ctx.matchData.of(match);
    const head = b.queue[0]!;
    const setup = ['start', 'reset', 'toss_choice'].includes(head.action);
    // The match room asks first for what Air's steps assume: a started veto, then the toss winner's choice.
    if (!setup && (b.status === null || b.status === 'not_started')) b.queue.unshift({ key: key(), action: 'start' });
    else if (!setup && b.status === 'toss_choice_pending') b.queue.unshift({ key: key(), action: 'toss_choice', goFirst: (md.vetoFirst ?? 0) === b.tossWinner });
    else if (!setup && b.turnAction === 'pick_side' && head.action !== 'pick_side') {
      // The match room waits for the side on the last pick: hold the next step until the producer gives it.
      return;
    }
    const entry = b.queue[0]!;
    const expectedStep = entry.expect ?? (entry.action === 'toss_choice' ? 0 : b.step);
    try {
      const answer = await this.ctx.account()!.vetoAction(match.source!.matchId, { clientKey: entry.key, expectedStep, action: entry.action, map: entry.map, side: entry.side, goFirst: entry.goFirst });
      this.observe(match, answer);
      b.queue.shift();
      b.sentAt = this.ctx.now();
      b.error = null;
      if (!b.queue.length) await this.settle(match, answer);
    } catch (error) {
      this.failed(match, b, error as EsportraError);
    }
  }

  /** All sent: Air's veto now matches the match room's (taken from its answer, so they agree exactly). */
  private async settle(match: Match, answer: { steps?: unknown; mapPool?: unknown; sequence?: unknown }) {
    const theirs = this.convert(match, answer);
    const md = this.ctx.matchData.of(match);
    if (theirs && JSON.stringify(theirs) !== JSON.stringify(md.veto)) await this.ctx.matchData.setVeto(theirs);
  }

  private convert(match: Match, raw: { steps?: unknown; mapPool?: unknown; sequence?: unknown }): VetoStep[] | null {
    const flip = this.ctx.flipped(match);
    const steps = readVetoSteps(raw.steps), order = readOrder(raw.sequence);
    const md = this.ctx.matchData.of(match);
    const pool = readPool(raw.mapPool);
    return vetoFrom(flip ? flipVeto(steps) : steps, match.bestOf, pool.length ? pool : md.mapPool, order && flip ? flipVeto(order) : order ?? md.vetoOrder)?.veto ?? null;
  }

  private failed(match: Match, b: SavedVetoOutbox, error: EsportraError) {
    const status = error.status ?? 0;
    if (status === 409) {
      const veto = (error.data as { veto?: { status?: unknown; step?: unknown; toss?: unknown; steps?: unknown; sequence?: unknown } } | null)?.veto;
      if (veto) this.observe(match, veto);
      b.conflict = { air: this.ctx.matchData.of(match).veto, esportra: (veto && this.convert(match, veto)) ?? [] };
      this.ctx.log('Veto · the match room changed while Air’s steps waited');
    } else if (status === 0 || status >= 500) {
      b.error = null; // offline: keep the steps and try again
    } else {
      b.error = error.message || 'Esportra refused this veto step.';
      this.ctx.log(`Veto not sent to the match room · ${b.error}`);
    }
  }
}
