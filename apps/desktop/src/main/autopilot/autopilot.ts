// Autopilot for the selected match: the runner, its rundown (preset and saved edits per match) and the
// bridge to Esportra graphics. It never switches OBS scenes. The producer starts it explicitly each
// time the app runs; it is never restored after a restart.

import type { Template } from '../../shared/templates.ts';
import type { Match, Screen } from '../../shared/api.ts';
import type { AutopilotPause, AutopilotView, Preset, RowInput, RundownRow, Segment } from '../../shared/autopilot.ts';
import type { Store } from '../store.ts';
import { buildRundown, migrate, presetRows, RETIRED_SCREENS, screenTitle, sortRows, validPreset, validRow, type SavedRundown } from './rundown.ts';
import { randomUUID } from 'node:crypto';
import { realClock, ShowRunner, type Clock, type GameEvent, type RunnerLog, type TakeOutcome } from './show-runner.ts';

export interface AutopilotDeps {
  store: Store;
  match(): Match | null;
  screens(): Screen[];
  /** Shows a full-screen graphic (null: back to the game), optionally behind the HUD stinger. */
  showGraphic(screenId: string | null, transition: Segment['transition'], style?: 'full' | 'band', template?: string): Promise<void>;
  /** Saved looks (Graphics › Templates) a row may pick. */
  templates?(): Template[];
  /** Which full-screen graphic is showing now, so a timed step only clears its own graphic. */
  showing(): string | null;
  /** Adds a line to the event log. */
  log(text: string): void;
  changed(): void;
  /** The rows changed (the screens that go to OBS follow them). */
  rowsChanged?(): void;
  clock?: Clock;
  /** Save progress for resuming after a restart (off for the private rehearsal). Default true. */
  persist?: boolean;
}

const describe = (entry: RunnerLog): string | null => {
  const name = entry.segment?.name ?? '';
  switch (entry.kind) {
    case 'armed': return `Autopilot armed · ${name}`;
    case 'held': return `Held by operator · ${name}`;
    case 'skipped': return `Skipped · ${name}${entry.message ? ` · ${entry.message}` : ''}`;
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
  private readonly clock: Clock;

  constructor(deps: AutopilotDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? realClock;
    this.runner = new ShowRunner({ take: (segment, stillAllowed) => this.takeSegment(segment, stillAllowed) }, this.clock);
    this.runner.on('change', () => {
      this.saveProgress();
      deps.changed();
    });
    this.runner.on('log', (entry: RunnerLog) => {
      const line = describe(entry);
      if (line) deps.log(line);
    });
  }

  /** The match's rundown rows (older saves are turned into rows the first time). */
  private saved(match: Match): SavedRundown {
    const all = (this.deps.store.data.rundown ??= {});
    const current = all[match.id];
    // A new match starts with only the in-game HUD row; the producer adds their screens (or a template).
    if (!current) all[match.id] = { rows: presetRows('empty', match.bestOf), startedFrom: 'empty' };
    else if (!('rows' in current) || (current as SavedRundown).rows.some((r) => !r.section || (r.show && RETIRED_SCREENS[r.show]))) {
      // Older saves: the full-screen graphics that were switched on in My show stay in the show.
      const myShow = this.deps.screens().filter((x) => x.enabled && x.hosted).map((x) => x.id);
      all[match.id] = migrate(current as never, match.bestOf, myShow);
    }
    return all[match.id] as SavedRundown;
  }

  /** The rows for the interface. */
  rows(): RundownRow[] {
    const match = this.deps.match();
    return match ? this.saved(match).rows : [];
  }

  private title = (id: string | null) => (id === null ? screenTitle(null) : this.deps.screens().find((s) => s.id === id)?.title || screenTitle(id));

  /**
   * Builds the rundown for the selected match. Autopilot is off afterwards, whatever it was before;
   * steps already done in this match (before a restart) stay done, so Start resumes where it was.
   */
  loadForMatch() {
    const match = this.deps.match();
    // A timed graphic from the previous rundown never takes anything down on this one.
    if (this.loadedFor !== (match?.id ?? null)) {
      this.clock.clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    this.loadedFor = match?.id ?? null;
    this.loading = true;
    this.runner.load(match ? buildRundown(match.bestOf, this.saved(match).rows, this.title) : [], match ? this.saved(match).startedFrom : 'standard');
    const saved = match && this.deps.persist !== false ? this.deps.store.data.autopilotProgress?.[match.id] : undefined;
    if (saved) this.runner.restore(saved.states);
    this.loading = false;
  }

  private loading = false;

  /** Saves which steps are done or on air for this match. */
  private saveProgress() {
    const match = this.deps.match();
    if (this.loading || this.deps.persist === false || !match || match.id !== this.loadedFor) return;
    const states: Record<string, 'done' | 'on_air'> = {};
    for (const s of this.runner.view().segments) if (s.state === 'done' || s.state === 'on_air') states[s.id] = s.state;
    const all = (this.deps.store.data.autopilotProgress ??= {});
    const before = JSON.stringify(all[match.id]?.states ?? {});
    if (before === JSON.stringify(states)) return;
    if (Object.keys(states).length) all[match.id] = { states, savedAt: Date.now() };
    else delete all[match.id];
    this.deps.store.save();
  }

  /** Forgets this match's progress: the rundown starts again from the first step. */
  restartRundown() {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    if (this.runner.view().enabled) throw new Error('Run manually first, then start the rundown again.');
    if (this.deps.store.data.autopilotProgress) delete this.deps.store.data.autopilotProgress[match.id];
    this.deps.store.save();
    this.loadForMatch();
  }

  /** Reloads only when the selected match changed (called on every room read). */
  ensureLoaded() {
    if ((this.deps.match()?.id ?? null) !== this.loadedFor) this.loadForMatch();
  }

  view(): AutopilotView {
    const v = this.runner.view();
    const started = v.segments.some((s) => s.state === 'done' || s.state === 'on_air');
    const next = v.segments.find((s) => s.state === 'queued');
    return { ...v, resumeAt: !v.enabled && started && next ? next.name : null };
  }

  /** Why Start autopilot cannot be pressed yet. Run manually always works. */
  block(): string | null {
    return this.deps.match() ? null : 'Choose a match first.';
  }

  /** Replaces the rows with a starting point (Standard, Results only, Manual or Empty). */
  startFrom(input: Preset) {
    const match = this.editable();
    const preset = validPreset(input);
    this.deps.store.data.rundown![match.id] = { rows: presetRows(preset, match.bestOf), startedFrom: preset };
    this.saveRows();
  }

  private editable(): Match {
    const match = this.deps.match();
    if (!match) throw new Error('Choose a match first.');
    if (this.runner.view().enabled) throw new Error('Run manually first, then change the rundown.');
    this.saved(match);
    return match;
  }

  private saveRows() {
    const match = this.deps.match();
    if (match) this.saved(match).rows = sortRows(this.saved(match).rows);
    this.deps.store.save();
    this.loadForMatch();
    this.deps.rowsChanged?.();
  }

  /** Every screen Air has (a row can add any of them; only rows go to OBS). */
  private allScreens() {
    return this.deps.screens().map((s) => s.id);
  }

  /** Adds a row at the end, or saves an existing one (same id). */
  saveRow(input: RowInput & { id?: string }) {
    const match = this.editable();
    const saved = this.saved(match);
    const existing = typeof input?.id === 'string' ? saved.rows.find((r) => r.id === input.id) : undefined;
    const id = existing?.id ?? `r${randomUUID().slice(0, 8)}`;
    const next = validRow({ ...input, enabled: input.enabled ?? existing?.enabled ?? true }, id, match.bestOf, this.allScreens(), this.deps.templates?.() ?? []);
    saved.rows = existing ? saved.rows.map((r) => (r.id === id ? next : r)) : [...saved.rows, next];
    this.saveRows();
  }

  removeRow(id: string) {
    const match = this.editable();
    const saved = this.saved(match);
    if (!saved.rows.some((r) => r.id === id)) throw new Error('That row is already gone.');
    saved.rows = saved.rows.filter((r) => r.id !== id);
    this.saveRows();
  }

  enableRow(id: string, on: boolean) {
    const match = this.editable();
    const saved = this.saved(match);
    if (!saved.rows.some((r) => r.id === id)) throw new Error('That row is already gone.');
    saved.rows = saved.rows.map((r) => (r.id === id ? { ...r, enabled: on === true } : r));
    this.saveRows();
  }

  moveRow(id: string, direction: -1 | 1) {
    const match = this.editable();
    const rows = [...this.saved(match).rows];
    const i = rows.findIndex((r) => r.id === id);
    const j = i + direction;
    // Rows move within their section.
    if (i < 0 || j < 0 || j >= rows.length || rows[j]!.section !== rows[i]!.section) throw new Error('It cannot move further.');
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    this.saved(match).rows = rows;
    this.saveRows();
  }

  start() {
    this.ensureLoaded();
    const block = this.block();
    if (block) throw new Error(block);
    const result = this.runner.start();
    if (!result.ok) throw new Error(result.error);
    this.deps.log(this.runner.view().segments.some((s) => s.state === 'done' || s.state === 'on_air') ? `Autopilot resumed · ${this.runner.view().next?.name ?? ''}` : 'Autopilot started');
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

  // ── inputs ──

  onGameEvent(event: GameEvent) {
    this.runner.onGameEvent(event);
  }

  /** The room's state decides the map number and any pause panel (including one set by another controller). */
  onRoom(room: { teams?: Array<{ series?: number }>; airPause?: { kind?: string } } | null) {
    this.ensureLoaded();
    const wins = (room?.teams ?? []).map((t) => Number(t?.series) || 0);
    const bestOf = this.deps.match()?.bestOf ?? 1;
    this.runner.setSeriesMaps(wins.reduce((a, b) => a + b, 0), Math.max(0, ...wins) > bestOf / 2);
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
    this.clock.clearTimeout(this.clearTimer);
    this.clearTimer = null;
  }

  // ── graphics ──

  private clearTimer: unknown = null;

  private async takeSegment(segment: Segment, stillAllowed: () => boolean): Promise<TakeOutcome> {
    if (segment.show) {
      const screen = this.deps.screens().find((s) => s.id === segment.show);
      if (!screen?.enabled) return { ok: false, error: `The ${segment.show.replace(/-/g, ' ')} graphic is switched off for this production.` };
    }
    if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
    try {
      await this.deps.showGraphic(segment.show, segment.transition, segment.style ?? 'full', segment.template);
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    this.clock.clearTimeout(this.clearTimer);
    this.clearTimer = null;
    // "For N s": back to the game afterwards, unless something else has been put up meanwhile.
    if (segment.show && segment.forSeconds > 0) {
      const shown = segment.show;
      this.clearTimer = this.clock.setTimeout(() => {
        this.clearTimer = null;
        if (this.deps.showing() === shown) void this.deps.showGraphic(null, 'cut').catch(() => {});
      }, segment.forSeconds * 1000);
    }
    return { ok: true };
  }
}
