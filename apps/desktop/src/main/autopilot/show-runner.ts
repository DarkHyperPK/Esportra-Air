// Autopilot: a rundown of segments that arm on game events, count down in a visible hold window and
// put an Esportra graphic on air — unless the producer holds, skips or takes first. It never switches
// OBS scenes. Ported from the legacy
// src/show-runner.js with an injected clock so every timing rule is tested without waiting.
//
// Segment lifecycle: queued → armed → holding → taking → on_air → done.
//
// Safety rules (PRD E3.5):
//   - Nothing takes during a technical pause or a timeout.
//   - OBS disconnected → paused; reconnecting resumes only a pause the disconnect caused.
//   - A take that was cancelled by a pause is dropped, never replayed afterwards.
//   - Command ids are idempotent: a repeated id is ignored.
//   - Manual segments arm and show in Next but never take themselves.

import { EventEmitter } from 'node:events';
import type { AutopilotPause, AutopilotView, Preset, Segment, SegmentEdit } from '../../shared/autopilot.ts';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface TakeOutcome {
  ok: boolean;
  error?: string;
}

export interface RunnerPorts {
  /** Puts the segment on air. `stillAllowed` is checked last, right before the graphic changes. */
  take(segment: Segment, stillAllowed: () => boolean): Promise<TakeOutcome>;
}

export interface GameEvent {
  type?: string;
  phase?: string;
  [key: string]: unknown;
}

export type RunnerLogKind = 'armed' | 'held' | 'skipped' | 'taken' | 'on_air' | 'paused' | 'resumed' | 'error';
export interface RunnerLog {
  kind: RunnerLogKind;
  segment: Segment | null;
  actor?: 'operator' | 'automation';
  message?: string;
}

const DUPLICATE_WINDOW = 50;

type Active = Segment['state'];

export class ShowRunner extends EventEmitter {
  private readonly clock: Clock;
  private readonly ports: RunnerPorts;
  private segments: Segment[] = [];
  private preset: Preset = 'standard';
  private enabled = false;
  private paused: AutopilotPause = null;
  /** Maps already finished according to the score (Fix data › Series), a floor for the map counter. */
  private seriesMaps = 0;
  /** A team has won the series: steps for maps after the last one played are skipped. */
  private seriesDecided = false;
  private holdEndsAt: number | null = null;
  private holdTotalMs: number | null = null;
  private holdTimer: unknown = null;
  private delayTimer: unknown = null;
  private commandIds: string[] = [];
  /** Bumped by every pause, skip, hold and stop: a take in flight checks it before it fires. */
  private epoch = 0;

  constructor(ports: RunnerPorts, clock: Clock = realClock) {
    super();
    this.ports = ports;
    this.clock = clock;
  }

  // ── rundown ──

  /** Replaces the rundown. Only allowed while nothing is armed, held, taking or on air. */
  load(segments: Segment[], preset: Preset = 'standard') {
    this.preset = preset;
    this.cancelTimers();
    this.segments = segments.map((s) => ({ ...s, state: 'queued', heldBy: null }));
    this.enabled = false;
    this.paused = null;
    this.change();
  }

  /** Marks steps already done before a restart, so starting resumes at the next unfinished one. */
  restore(states: Record<string, 'done' | 'on_air'>) {
    for (const seg of this.segments) {
      const s = states[seg.id];
      if (s) seg.state = s;
    }
    this.change();
  }

  /**
   * Applies edits and a new order to segments that have not started. Active or finished segments are
   * left alone (the edit applies at the next boundary), as in the legacy replaceUpcoming.
   */
  edit(id: string, edit: SegmentEdit): { ok: boolean; error?: string } {
    const seg = this.find(id);
    if (!seg) return { ok: false, error: 'That segment is not in the rundown.' };
    if (seg.state !== 'queued') return { ok: false, error: 'This segment has started. Change it before it arms.' };
    Object.assign(seg, edit);
    this.change();
    return { ok: true };
  }

  move(id: string, direction: -1 | 1): { ok: boolean; error?: string } {
    const index = this.segments.findIndex((s) => s.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.segments.length) return { ok: false, error: 'It cannot move further.' };
    const swap = this.segments[target]!;
    const seg = this.segments[index]!;
    if (seg.state !== 'queued' || swap.state !== 'queued') return { ok: false, error: 'Only segments that have not started can be moved.' };
    this.segments[index] = swap;
    this.segments[target] = seg;
    this.change();
    return { ok: true };
  }

  // ── lifecycle ──

  /** Starts autopilot: arms the first queued segment. Never resumes a take from before. */
  start(): { ok: boolean; error?: string } {
    if (!this.segments.some((s) => s.state === 'queued' || s.state === 'armed')) return { ok: false, error: 'There is nothing left in the rundown.' };
    this.enabled = true;
    this.paused = null;
    if (!this.segments.some((s) => s.state === 'armed' || s.state === 'holding' || s.state === 'taking')) this.armNext(-1);
    this.change();
    return { ok: true };
  }

  /** Run manually: stops all automation and clears countdowns. The rundown is kept for the next start. */
  stop() {
    this.epoch++;
    this.cancelTimers();
    this.enabled = false;
    this.paused = null;
    for (const seg of this.segments) {
      if (seg.state === 'armed' || seg.state === 'holding' || seg.state === 'taking') {
        seg.state = 'queued';
        seg.heldBy = null;
      }
    }
    this.change();
  }

  /**
   * Maps already won in the series, from the score. GEP does not say which map of the series is being
   * played, so the map number is the larger of this and the map results the rundown has completed.
   */
  setSeriesMaps(played: number, decided = false) {
    const n = Math.max(0, Math.floor(played) || 0);
    if (n === this.seriesMaps && decided === this.seriesDecided) return;
    this.seriesMaps = n;
    this.seriesDecided = decided;
    // A step waiting on a map that will not be played (map 3 after a 2–0) is skipped.
    const armed = this.segments.find((s) => s.state === 'armed');
    if (armed && this.unplayed(armed)) {
      const index = this.segments.indexOf(armed);
      armed.state = 'done';
      this.log({ kind: 'skipped', segment: armed, message: 'series won' });
      if (this.enabled) this.armNext(index);
    }
    this.change();
  }

  /** The series is won and this step belongs to a map after the last one played. */
  private unplayed(seg: Segment) {
    return this.seriesDecided && seg.mapNumber != null && seg.mapNumber > this.seriesMaps;
  }

  /** The map being played (1-based): after each map result is taken or skipped, the next map starts. */
  currentMap(): number {
    const finished = this.segments.filter((s) => s.trigger === 'map_end' && (s.state === 'done' || s.state === 'on_air')).length;
    return Math.max(this.seriesMaps, finished) + 1;
  }

  // ── pauses ──

  pause(reason: Exclude<AutopilotPause, null>) {
    if (!this.enabled) return;
    if (this.paused === reason) return;
    this.paused = reason;
    this.freeze();
    this.log({ kind: 'paused', segment: this.active(), message: reason });
    this.change();
  }

  /** Clears one pause reason. Other reasons stay: a timeout ending does not clear a technical pause. */
  resume(reason: Exclude<AutopilotPause, null> | 'any' = 'any') {
    if (!this.paused) return;
    if (reason !== 'any' && this.paused !== reason) return;
    this.paused = null;
    this.log({ kind: 'resumed', segment: this.active() });
    this.armTimers();
    this.change();
  }

  // ── events ──

  /** Feeds a game event: an armed automatic segment whose trigger matches opens its hold window. */
  onGameEvent(event: GameEvent) {
    if (!this.canAutomate()) return;
    if (triggerMatches('map_end', event)) this.skipMissed();
    const seg = this.segments.find((s) => s.state === 'armed');
    if (!seg || seg.mode !== 'automatic' || seg.trigger === 'manual' || seg.trigger === 'delay') return;
    if (seg.mapNumber != null && seg.mapNumber !== this.currentMap()) return;
    if (!triggerMatches(seg.trigger, event)) return;
    this.openHold(seg);
  }

  /**
   * The map has ended: automatic steps of this map still waiting on a moment inside it (round live,
   * halftime, a round end, the spike) missed it and would block the rundown, so they are skipped.
   * Steps that wait for the producer's Take are left alone.
   */
  private skipMissed() {
    const map = this.currentMap();
    for (;;) {
      const seg = this.segments.find((s) => s.state === 'armed');
      if (!seg || seg.mode !== 'automatic' || !IN_MAP.has(seg.trigger) || (seg.mapNumber != null && seg.mapNumber !== map)) return;
      seg.state = 'done';
      this.log({ kind: 'skipped', segment: seg, message: 'the map ended first' });
      this.armNext(this.segments.indexOf(seg));
      this.change();
    }
  }

  // ── operator controls ──

  /** Hold freezes the segment until an explicit Take or Skip. */
  hold(id: string | null = null, commandId?: string): { ok: boolean; error?: string } {
    if (this.duplicate(commandId)) return { ok: true };
    const seg = id ? this.find(id) : this.pending();
    if (!seg) return { ok: false, error: 'Nothing is armed to hold.' };
    if (seg.state !== 'armed' && seg.state !== 'holding') return { ok: false, error: 'Only the next segment can be held.' };
    this.epoch++;
    this.clearHoldTimer();
    seg.state = 'holding';
    seg.heldBy = 'operator';
    this.log({ kind: 'held', segment: seg, actor: 'operator' });
    this.change();
    return { ok: true };
  }

  skip(id: string | null = null, commandId?: string): { ok: boolean; error?: string } {
    if (this.duplicate(commandId)) return { ok: true };
    const seg = id ? this.find(id) : this.pending();
    if (!seg) return { ok: false, error: 'Nothing is armed to skip.' };
    if (seg.state !== 'armed' && seg.state !== 'holding') return { ok: false, error: 'Only the next segment can be skipped.' };
    this.epoch++;
    this.clearHoldTimer();
    this.clearDelayTimer();
    seg.state = 'done';
    seg.heldBy = null;
    this.log({ kind: 'skipped', segment: seg, actor: 'operator' });
    this.armNext(this.segments.indexOf(seg));
    this.change();
    return { ok: true };
  }

  /** Take now: puts the next segment on air through OBS. */
  async take(id: string | null = null, options: { commandId?: string; actor?: 'operator' | 'automation' } = {}): Promise<{ ok: boolean; error?: string }> {
    if (this.duplicate(options.commandId)) return { ok: true };
    if (!this.enabled) return { ok: false, error: 'Autopilot is off.' };
    if (this.paused) return { ok: false, error: pausedMessage(this.paused) };
    const seg = id ? this.find(id) : this.pending();
    if (!seg) return { ok: false, error: 'Nothing is armed to take.' };
    if (seg.state !== 'armed' && seg.state !== 'holding') return { ok: false, error: 'Only the next segment can be taken.' };
    const actor = options.actor ?? 'operator';
    const epoch = ++this.epoch;
    this.clearHoldTimer();
    this.clearDelayTimer();
    const before = { state: seg.state, heldBy: seg.heldBy };
    seg.state = 'taking';
    seg.heldBy = null;
    this.change();
    let outcome: TakeOutcome;
    try {
      outcome = await this.ports.take(seg, () => this.epoch === epoch && !this.paused && this.enabled);
    } catch (error) {
      outcome = { ok: false, error: (error as Error).message };
    }
    // A pause, skip, hold or stop while the take was being prepared wins: drop it, never replay it.
    if (this.epoch !== epoch) {
      if (seg.state === 'taking') this.revert(seg, before.state === 'holding' && before.heldBy ? before : { state: 'armed', heldBy: null });
      return { ok: false, error: 'The take was cancelled because production changed.' };
    }
    if (!outcome.ok) {
      this.revert(seg, { state: 'holding', heldBy: 'operator' });
      this.log({ kind: 'error', segment: seg, message: outcome.error });
      this.change();
      return { ok: false, error: outcome.error ?? 'The graphic could not be shown.' };
    }
    this.log({ kind: 'taken', segment: seg, actor });
    // Graphics change the moment the engine applies them: no tally to wait for.
    this.confirm(seg);
    return { ok: true };
  }

  // ── view ──

  view(): AutopilotView {
    const now = this.segments.find((s) => s.state === 'on_air') ?? null;
    const next = this.pending() ?? this.segments.find((s) => s.state === 'taking') ?? null;
    const after = next ? this.segments.indexOf(next) : now ? this.segments.indexOf(now) : -1;
    return {
      enabled: this.enabled,
      paused: this.paused,
      now: now ? { ...now } : null,
      next: next ? { ...next } : null,
      holdEndsAt: this.holdEndsAt,
      holdTotalMs: this.holdTotalMs,
      preset: this.preset,
      map: this.currentMap(),
      comingUp: this.segments.slice(after + 1).filter((s) => s.state === 'queued').slice(0, 3).map((s) => ({ ...s })),
      segments: this.segments.map((s) => ({ ...s })),
    };
  }

  stopAll() {
    this.cancelTimers();
    this.removeAllListeners();
  }

  // ── internals ──

  private canAutomate() {
    return this.enabled && !this.paused;
  }

  private find(id: string) {
    return this.segments.find((s) => s.id === id) ?? null;
  }

  private active() {
    return this.pending() ?? this.segments.find((s) => s.state === 'on_air') ?? null;
  }

  /** The segment Hold, Skip and Take act on. */
  private pending() {
    return this.segments.find((s) => s.state === 'armed' || s.state === 'holding') ?? null;
  }

  private duplicate(commandId?: string) {
    if (!commandId) return false;
    if (this.commandIds.includes(commandId)) return true;
    this.commandIds.push(commandId);
    if (this.commandIds.length > DUPLICATE_WINDOW) this.commandIds.shift();
    return false;
  }

  private revert(seg: Segment, to: { state: Segment['state']; heldBy: Segment['heldBy'] }) {
    seg.state = to.state as Active;
    seg.heldBy = to.heldBy;
    this.change();
  }

  private armNext(afterIndex: number) {
    let next = this.segments.slice(afterIndex + 1).find((s) => s.state === 'queued');
    while (next && this.unplayed(next)) {
      next.state = 'done';
      this.log({ kind: 'skipped', segment: next, message: 'series won' });
      next = this.segments.slice(this.segments.indexOf(next) + 1).find((s) => s.state === 'queued');
    }
    if (!next) return;
    next.state = 'armed';
    this.log({ kind: 'armed', segment: next });
    this.armTimers();
  }

  /** The delay trigger starts counting when its segment arms. */
  private armTimers() {
    this.clearDelayTimer();
    const seg = this.segments.find((s) => s.state === 'armed');
    if (!seg || !this.canAutomate() || seg.mode !== 'automatic' || seg.trigger !== 'delay') return;
    this.delayTimer = this.clock.setTimeout(() => {
      this.delayTimer = null;
      if (seg.state === 'armed' && this.canAutomate()) this.openHold(seg);
    }, seg.delaySeconds * 1000);
  }

  private openHold(seg: Segment) {
    seg.state = 'holding';
    seg.heldBy = null;
    if (seg.holdMode === 'window' && seg.holdSeconds > 0) {
      this.holdTotalMs = seg.holdSeconds * 1000;
      this.holdEndsAt = this.clock.now() + this.holdTotalMs;
      this.holdTimer = this.clock.setTimeout(() => {
        this.holdTimer = null;
        void this.take(seg.id, { actor: 'automation' });
      }, this.holdTotalMs);
    } else if (seg.holdMode === 'window') {
      // A zero-second window is an immediate take.
      void this.take(seg.id, { actor: 'automation' });
    }
    this.change();
  }

  /** A pause stops every countdown. A segment that was counting down arms again; it is not replayed. */
  private freeze() {
    this.epoch++;
    this.clearHoldTimer();
    this.clearDelayTimer();
    const seg = this.segments.find((s) => s.state === 'holding' && s.heldBy === null);
    if (seg) seg.state = 'armed';
    const taking = this.segments.find((s) => s.state === 'taking');
    if (taking) taking.state = 'armed';
  }

  private confirm(seg: Segment) {
    for (const previous of this.segments) if (previous !== seg && previous.state === 'on_air') previous.state = 'done';
    seg.state = 'on_air';
    this.log({ kind: 'on_air', segment: seg });
    this.armNext(this.segments.indexOf(seg));
    this.change();
  }

  private clearHoldTimer() {
    this.clock.clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.holdEndsAt = null;
    this.holdTotalMs = null;
  }

  private clearDelayTimer() {
    this.clock.clearTimeout(this.delayTimer);
    this.delayTimer = null;
  }

  private cancelTimers() {
    this.clearHoldTimer();
    this.clearDelayTimer();
  }

  private change() {
    this.emit('change');
  }

  private log(entry: RunnerLog) {
    this.emit('log', entry);
  }
}

/** Triggers that happen inside a map; once the map has ended they cannot come any more. */
const IN_MAP = new Set<Segment['trigger']>(['match_start', 'round_live', 'halftime', 'round_end', 'spike_planted', 'spike_defused']);

/** The two teams' rounds, when Air has read them from the room alongside the event. */
const scoresOf = (event: GameEvent): [number, number] | null => {
  const sc = event.scores;
  return Array.isArray(sc) && sc.length === 2 && sc.every((n) => Number.isInteger(n) && n >= 0) ? [sc[0], sc[1]] : null;
};

/**
 * A finished map: one team has 13 or more rounds and is ahead (in overtime by two, or the tournament's
 * own tie-break). A map stopped early (a remake, a crash, leaving the lobby) is not a result.
 */
export function mapComplete(scores: [number, number]): boolean {
  const [a, b] = scores;
  return Math.max(a, b) >= 13 && a !== b;
}

/** Adds the room's scores to a round or map event (Air reads them when the event arrives). */
export function withScores(event: GameEvent, teams: Array<{ score?: unknown }> | undefined): GameEvent {
  if (event.type !== 'round.won' && event.type !== 'match.end') return event;
  const scores = (teams ?? []).slice(0, 2).map((t) => Number(t?.score));
  if (scores.length !== 2 || !scores.every((n) => Number.isInteger(n) && n >= 0)) return event;
  return { ...event, scores };
}

export function triggerMatches(trigger: Segment['trigger'], event: GameEvent): boolean {
  const scores = scoresOf(event);
  switch (trigger) {
    case 'match_start': return event.type === 'match.start';
    case 'round_live': return event.type === 'round.phase' && event.phase === 'live';
    // Halftime is after the 12th round played: the teams' rounds add up to 12. Without scores, the
    // round count the parser kept (it can miss rounds from before capture started).
    case 'halftime': return event.type === 'round.won' && (scores ? scores[0] + scores[1] === 12 : Number(event.round) === 12);
    case 'round_end': return event.type === 'round.won';
    case 'spike_planted': return event.type === 'spike.planted';
    case 'spike_defused': return event.type === 'spike.defused';
    // A map stopped early is not a map end; without scores Air trusts the game.
    case 'map_end': return event.type === 'match.end' && (!scores || mapComplete(scores));
    default: return false;
  }
}

export function pausedMessage(reason: Exclude<AutopilotPause, null>): string {
  return reason === 'tech' ? 'Technical pause is on. Resume before taking.' : reason === 'timeout' ? 'A timeout is on. End it before taking.' : 'OBS is disconnected. Autopilot resumes when it reconnects.';
}
