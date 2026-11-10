// Autopilot for the selected match: the runner, its rundown (saved edits per match) and the bridge to
// OBS. The producer starts it explicitly each time the app runs; it is never restored after a restart.

import type { Match, Screen } from '../../shared/api.ts';
import { sourceName } from '../../shared/scenes.ts';
import type { AutopilotPause, AutopilotView, Segment, SegmentEdit } from '../../shared/autopilot.ts';
import type { ObsLink, TransitionChoice } from '../obs.ts';
import type { Store } from '../store.ts';
import { buildRundown, emptyEdits, validateEdit, type RundownEdits } from './rundown.ts';
import { realClock, ShowRunner, type Clock, type GameEvent, type RunnerLog, type TakeOutcome } from './show-runner.ts';

export interface AutopilotDeps {
  store: Store;
  obs: ObsLink;
  match(): Match | null;
  screens(): Screen[];
  stinger(): string | null;
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
    case 'paused': return `Autopilot paused · ${entry.message === 'tech' ? 'technical pause' : entry.message === 'timeout' ? 'timeout' : 'OBS disconnected'}`;
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
    this.runner.load(match ? buildRundown(match.bestOf, this.edits(match)) : []);
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
    const { obs } = this.deps;
    if (!this.deps.match()) return 'Choose a match first.';
    if (obs.status.state !== 'connected') return 'Connect OBS first.';
    if (!obs.status.studioMode) return 'Turn on Studio Mode so takes go through Preview.';
    if (!obs.status.scenes.includes('Esportra · Gameplay')) return 'Add the Esportra scenes to OBS first.';
    return null;
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
  onRoom(room: { map?: { number?: number }; airPause?: { kind?: string } } | null) {
    this.ensureLoaded();
    const number = Number(room?.map?.number);
    this.runner.setMap(Number.isInteger(number) && number > 0 ? number : 1);
    const kind = room?.airPause?.kind;
    const wanted: AutopilotPause = kind === 'technical' ? 'tech' : kind === 'timeout' ? 'timeout' : null;
    if (wanted) this.runner.pause(wanted);
    else {
      this.runner.resume('tech');
      this.runner.resume('timeout');
    }
  }

  onObs() {
    const { obs } = this.deps;
    if (obs.status.state === 'connected') {
      this.runner.resume('obs');
      this.runner.onProgram(obs.status.programScene);
    } else if (obs.status.state === 'disconnected' || obs.status.state === 'error') {
      this.runner.pause('obs');
    }
  }

  stopAll() {
    this.runner.stopAll();
  }

  // ── OBS ──

  private choice(pick: Segment['transition']): TransitionChoice | null {
    const { obs } = this.deps;
    if (pick === 'cut') return obs.cutChoice();
    if (pick === 'stinger') return obs.stingerChoice(this.deps.stinger());
    return null;
  }

  private async takeSegment(segment: Segment, stillAllowed: () => boolean): Promise<TakeOutcome> {
    const { obs } = this.deps;
    if (obs.status.state !== 'connected') return { ok: false, error: 'OBS is not connected.' };
    if (!obs.status.studioMode) return { ok: false, error: 'Turn on Studio Mode so takes go through Preview.' };
    if (!obs.status.scenes.includes(segment.scene)) return { ok: false, error: `The scene “${segment.scene}” is not in OBS.` };
    try {
      if (segment.graphic) {
        const screen = this.deps.screens().find((s) => s.id === segment.graphic);
        if (!screen?.enabled) return { ok: false, error: `The ${segment.graphic.replace(/-/g, ' ')} graphic is switched off in Setup.` };
        await obs.showFullscreen(sourceName(screen.title));
      }
      if (obs.status.programScene === segment.scene) return { ok: true, alreadyOnAir: true };
      if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
      return await obs.take(this.choice(segment.transition), { scene: segment.scene, stillAllowed });
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
