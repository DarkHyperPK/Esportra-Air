// Runs moment rules beside the rundown. A rule that fires goes straight on air, into a hold window
// (cued, then taken when it ends unless held or skipped), or into Cued to wait for the producer.
// It never covers a full-screen graphic: while one is up, the rule waits for the game to come back
// (up to 10 s, then it is dropped and logged).
import { EventEmitter } from 'node:events';
import type { Rule, RuleContext, RuleHit } from '../../shared/rules.ts';
import { matchRule } from '../../shared/rules.ts';
import { realClock, type Clock } from './show-runner.ts';

export type Action = { name: string; args: Record<string, unknown> };

export interface RuleRunnerDeps {
  rules(): Rule[];
  /** Autopilot is on and not paused. */
  active(): boolean;
  /** The rundown's preset: Manual makes every rule wait in Cued; Results only switches rules off. */
  preset(): 'standard' | 'minimal' | 'manual';
  /** A full-screen graphic is on air, or a rundown step is counting down. */
  busy(): boolean;
  /** What the rule puts on air, and how it comes off again (null when it cannot fire now). */
  actionsFor(rule: Rule, hit: RuleHit): { label: string; on: Action[]; off: Action[] | null } | null;
  air(actions: Action[], label: string, via: Rule['via']): Promise<void>;
  cue(actions: Action[], label: string): Promise<void>;
  takeCue(via: Rule['via']): Promise<void>;
  clearCue(): Promise<void>;
  log(text: string): void;
  changed(): void;
  clock?: Clock;
}

import type { RulePending } from '../../shared/api.ts';
export type { RulePending };

const WAIT_FOR_GAME_MS = 10_000;

export class RuleRunner extends EventEmitter {
  private readonly d: RuleRunnerDeps;
  private readonly clock: Clock;
  private pending: (RulePending & { via: Rule['via']; off: Action[] | null; forSeconds: number }) | null = null;
  private timer: unknown = null;
  private waiting: Array<{ rule: Rule; hit: RuleHit; at: number }> = [];
  private waitTimer: unknown = null;

  constructor(deps: RuleRunnerDeps) {
    super();
    this.d = deps;
    this.clock = deps.clock ?? realClock;
  }

  view(): RulePending | null {
    if (!this.pending) return null;
    const { ruleId, label, endsAt, held } = this.pending;
    return { ruleId, label, endsAt, held };
  }

  onGameEvent(event: Record<string, unknown>, ctx: RuleContext) {
    if (!this.d.active() || this.d.preset() === 'minimal') return;
    for (const rule of this.d.rules()) {
      const hit = matchRule(rule, event, ctx);
      if (!hit) continue;
      if (this.d.busy() || this.pending) {
        this.waiting.push({ rule, hit, at: this.clock.now() });
        this.scheduleWait();
      } else void this.fire(rule, hit);
    }
  }

  /** Re-checks waiting rules once a second until the game is back on screen. */
  private scheduleWait() {
    if (this.waitTimer) return;
    this.waitTimer = this.clock.setTimeout(() => {
      this.waitTimer = null;
      const now = this.clock.now();
      const stale = this.waiting.filter((w) => now - w.at > WAIT_FOR_GAME_MS);
      for (const w of stale) this.d.log(`Rule skipped · ${this.d.actionsFor(w.rule, w.hit)?.label ?? 'a moment'} (a full-screen graphic was up)`);
      this.waiting = this.waiting.filter((w) => now - w.at <= WAIT_FOR_GAME_MS);
      if (this.waiting.length && !this.d.busy() && !this.pending && this.d.active()) {
        const next = this.waiting.shift()!;
        void this.fire(next.rule, next.hit);
      }
      if (this.waiting.length) this.scheduleWait();
    }, 1000);
  }

  private async fire(rule: Rule, hit: RuleHit) {
    const made = this.d.actionsFor(rule, hit);
    if (!made) return;
    const hold = this.d.preset() === 'manual' ? 'wait' : rule.hold;
    try {
      if (hold === 'none') {
        await this.d.air(made.on, made.label, rule.via);
        this.d.log(`Rule · ${made.label}`);
        this.clearLater(made.off, rule.forSeconds);
      } else if (hold === 'wait') {
        await this.d.cue(made.on, made.label);
        this.d.log(`Rule · ${made.label} · waiting in Cued`);
      } else {
        await this.d.cue(made.on, made.label);
        const endsAt = this.clock.now() + rule.holdSeconds * 1000;
        this.pending = { ruleId: rule.id, label: made.label, endsAt, held: false, via: rule.via, off: made.off, forSeconds: rule.forSeconds };
        this.timer = this.clock.setTimeout(() => void this.take('automation'), rule.holdSeconds * 1000);
        this.d.log(`Rule · ${made.label} · taking in ${rule.holdSeconds} s`);
        this.d.changed();
      }
    } catch (e) {
      this.d.log(`Rule could not fire · ${(e as Error).message}`);
    }
  }

  private clearLater(off: Action[] | null, seconds: number) {
    if (!off || !seconds) return;
    this.clock.setTimeout(() => void this.d.air(off, 'Rule cleared', 'cut').catch(() => {}), seconds * 1000);
  }

  private stopTimer() {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Takes the rule's cued graphic now (Space, or the window running out). */
  async take(actor: 'operator' | 'automation' = 'operator') {
    const p = this.pending;
    if (!p) throw new Error('No rule is waiting.');
    this.stopTimer();
    this.pending = null;
    this.d.changed();
    await this.d.takeCue(p.via);
    this.d.log(`Rule taken (${actor === 'automation' ? 'automatic' : 'operator'}) · ${p.label}`);
    this.clearLater(p.off, p.forSeconds);
  }

  /** Stops the countdown; the graphic stays in Cued until you take or skip it. */
  hold() {
    if (!this.pending) throw new Error('No rule is waiting.');
    this.stopTimer();
    this.pending = { ...this.pending, endsAt: null, held: true };
    this.d.log(`Rule held · ${this.pending.label}`);
    this.d.changed();
  }

  /** Drops the rule's graphic from Cued. */
  async skip() {
    const p = this.pending;
    if (!p) throw new Error('No rule is waiting.');
    this.stopTimer();
    this.pending = null;
    this.d.changed();
    await this.d.clearCue();
    this.d.log(`Rule skipped · ${p.label}`);
  }

  /** Autopilot stopped: nothing waits or counts down. */
  reset() {
    this.stopTimer();
    if (this.waitTimer) this.clock.clearTimeout(this.waitTimer);
    this.waitTimer = null;
    this.waiting = [];
    this.pending = null;
    this.d.changed();
  }
}
