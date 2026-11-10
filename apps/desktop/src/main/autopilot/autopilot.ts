// Autopilot for the selected match: the runner, its rundown (preset and saved edits per match) and the
// bridge to Esportra graphics. It never switches OBS scenes. The producer starts it explicitly each
// time the app runs; it is never restored after a restart.

import type { Match, Screen } from '../../shared/api.ts';
import type { AutopilotPause, AutopilotView, Preset, Segment, SegmentEdit } from '../../shared/autopilot.ts';
import type { Store } from '../store.ts';
import { buildRundown, emptyEdits, validateEdit, validPreset, type RundownEdits } from './rundown.ts';
import { realClock, ShowRunner, type Clock, type GameEvent, type RunnerLog, type TakeOutcome } from './show-runner.ts';

export interface AutopilotDeps {
  store: Store;
  match(): Match | null;
  screens(): Screen[];
  /** Shows a full-screen graphic (null: back to the game), optionally behind the HUD stinger. */
  showGraphic(screenId: string | null, transition: Segment['transition']): Promise<void>;
  /** Which full-screen graphic is showing now, so a timed step only clears its own graphic. */
  showing(): string | null;
  /** Adds a line to the event log. */
  log(text: string): void;
  changed(): void;
  clock?: Clock;
}

const describe = (entry: RunnerLog): string | null => {
  const name = entry.segment?.name ?? '';
  switch (entry.kind) {
    case 'armed': return `Autopilot armed · ${name}`;
    case 'held': return `Held by operator · ${name}`;
    case 'skipped': return `Skipped · ${name}`;
    case 'taken': return `Taken (${entry.actor === 'automation' ? 'automatic' : 'operator'}) · ${name}`;
    case 'on_air': return `On air · ${name}`;
    case 'paused': return `Autopilot paused · ${entry.message === 'tech' ? 'technical pause' : 'timeout'}`;
    case 'resumed': return 'Autopilot resumed';
    case 'error': return entry.message ?? null;
  }
};

export class Autopilot {
  readonly runner: ShowRunner;
  private readonly deps: AutopilotDeps;
  private loadedFor: string | null = null;

  constructor(deps: AutopilotDeps) {
    this.deps = deps;
    this.runner = new ShowRunner({ take: (segment, stillAllowed) => this.takeSegment(segment, stillAllowed) }, deps.clock ?? realClock);
    this.runner.on('change', () => deps.changed());
    this.runner.on('log', (entry: RunnerLog) => {
      const line = describe(entry);
      if (line) deps.log(line);
    });
  }

  private edits(match: Match): RundownEdits {
    const all = (this.deps.store.data.rundown ??= {});
    return (all[match.id] ??= emptyEdits());
  }

  /** Builds the rundown for the selected match. Autopilot is off afterwards, whatever it was before. */
  loadForMatch() {
    const match = this.deps.match();
    this.loadedFor = match?.id ?? null;
    this.runner.load(match ? buildRundown(match.bestOf, this.edits(match)) : [], match ? this.edits(match).preset ?? 'standard' : 'standard');
  }

  /** Reloads only when the selected match changed (called on every room read). */
  ensureLoaded() {
    if ((this.deps.match()?.id ?? null) !== this.loadedFor) this.loadForMatch();
  }

  view(): AutopilotView {
    return this.runner.view();
  }

  /** Why Start autopilot cannot be pressed yet. Run manually always works. */
  block(): string | null {
    return this.deps.match() ? null : 'Choose a match first.';
  }

  /** Switches the match to a preset. Saved edits are kept; only steps not yet started change. */
  setPreset(input: Preset) {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    const preset = validPreset(input);
    if (this.runner.view().enabled) throw new Error('Run manually first, then change the preset.');
    const saved = this.edits(match);
    saved.preset = preset;
    saved.edits = {};
    this.deps.store.save();
    this.loadForMatch();
  }

  start() {
    this.ensureLoaded();
    const block = this.block();
    if (block) throw new Error(block);
    const result = this.runner.start();
    if (!result.ok) throw new Error(result.error);
    this.deps.log('Autopilot started');
  }

  stop() {
    if (!this.runner.view().enabled) return;
    this.runner.stop();
    this.deps.log('Autopilot off · running manually');
  }

  hold() {
    const r = this.runner.hold();
    if (!r.ok) throw new Error(r.error);
  }

  skip() {
    const r = this.runner.skip();
    if (!r.ok) throw new Error(r.error);
  }

  async take() {
    const r = await this.runner.take();
    if (!r.ok) throw new Error(r.error);
  }

  resume() {
    this.runner.resume('tech');
    this.runner.resume('timeout');
  }

  /** Saves an edit for the match and applies it to the running rundown. */
  edit(id: string, input: SegmentEdit) {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    const edit = validateEdit(input);
    const applied = this.runner.edit(id, edit);
    if (!applied.ok) throw new Error(applied.error);
    const saved = this.edits(match);
    saved.edits[id] = { ...saved.edits[id], ...edit };
    this.deps.store.save();
  }

  move(id: string, direction: -1 | 1) {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    const r = this.runner.move(id, direction);
    if (!r.ok) throw new Error(r.error);
    this.edits(match).order = this.runner.view().segments.map((s) => s.id);
    this.deps.store.save();
  }

  // ── inputs ──

  onGameEvent(event: GameEvent) {
    this.runner.onGameEvent(event);
  }

  /** The room's state decides the map number and any pause panel (including one set by another controller). */
  onRoom(room: { teams?: Array<{ series?: number }>; airPause?: { kind?: string } } | null) {
    this.ensureLoaded();
    this.runner.setSeriesMaps((room?.teams ?? []).reduce((sum, t) => sum + (Number(t?.series) || 0), 0));
    const kind = room?.airPause?.kind;
    const wanted: AutopilotPause = kind === 'technical' ? 'tech' : kind === 'timeout' ? 'timeout' : null;
    if (wanted) this.runner.pause(wanted);
    else {
      this.runner.resume('tech');
      this.runner.resume('timeout');
    }
  }

  stopAll() {
    this.runner.stopAll();
  }

  // ── graphics ──

  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  private async takeSegment(segment: Segment, stillAllowed: () => boolean): Promise<TakeOutcome> {
    if (segment.show) {
      const screen = this.deps.screens().find((s) => s.id === segment.show);
      if (!screen?.enabled) return { ok: false, error: `The ${segment.show.replace(/-/g, ' ')} graphic is switched off for this production.` };
    }
    if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
    try {
      await this.deps.showGraphic(segment.show, segment.transition);
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = null;
    // "For N s": back to the game afterwards, unless something else has been put up meanwhile.
    if (segment.show && segment.forSeconds > 0) {
      const shown = segment.show;
      this.clearTimer = setTimeout(() => {
        this.clearTimer = null;
        if (this.deps.showing() === shown) void this.deps.showGraphic(null, 'cut').catch(() => {});
      }, segment.forSeconds * 1000);
      this.clearTimer.unref?.();
    }
    return { ok: true };
  }
}
