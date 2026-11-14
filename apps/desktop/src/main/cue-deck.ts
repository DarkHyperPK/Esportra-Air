// Cue and Take (graphics only): changes go to the Cued column first and Take puts them on air, or they
// go straight on air with cueing off. Cued changes belong to the match they were cued on. The Cued
// monitor shows a private room (`__ESA_SIM_CUE_<code>`) with the live state plus the cued changes.
// Production gives it a small context; nothing here knows about OBS, templates or the rundown.
import type { EngineClient } from './engine-client.ts';

export type GraphicAction = { name: string; args: Record<string, unknown> };
export interface CuedChange { key: string; label: string; actions: GraphicAction[] }

export interface CueContext {
  /** The selected match's id and code, or null. */
  match(): { id: string; code: string } | null;
  client(): EngineClient;
  engineRunning(): boolean;
  /** Runs one action on the live match (not cued). */
  act(name: string, args: Record<string, unknown>): Promise<void>;
  /** Re-reads the live room after a change. */
  refresh(): Promise<void>;
  /** True when these actions would leave the on-air graphics as they are. */
  matchesAir(actions: GraphicAction[]): boolean;
  log(text: string): void;
  changed(): void;
}

/** Which on-air slot a change fills: a later cued change for the same slot replaces it. */
export function cueKey(actions: GraphicAction[]): string {
  const last = actions.at(-1)!;
  if (last.name === 'layer.set') return `layer:${String(last.args.layer)}`;
  if (last.name === 'fullscreen.show') return 'fs';
  return last.name.split('.')[0]!;
}

export class CueDeck {
  /** Changes go to the Cued column first (Take puts them on air), or straight on air. */
  mode = true;
  private cued: { matchId: string | null; changes: CuedChange[] } = { matchId: null, changes: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ctx: CueContext;

  constructor(ctx: CueContext) {
    this.ctx = ctx;
  }

  /** What is cued for the selected match (switching match drops what was cued on another). */
  get pending(): CuedChange[] {
    const id = this.ctx.match()?.id ?? null;
    if (this.cued.matchId !== id) this.cued = { matchId: id, changes: [] };
    return this.cued.changes;
  }
  private set pending(changes: CuedChange[]) {
    this.cued = { matchId: this.ctx.match()?.id ?? null, changes };
  }

  /** The Cued monitor's room, or null without a match. */
  room(): string | null {
    const m = this.ctx.match();
    return m ? `__ESA_SIM_CUE_${m.code}` : null;
  }

  /**
   * A graphic change: queued while cueing, applied at once otherwise. A cued change replaces an
   * earlier one for the same slot (one lower third, one full-screen graphic, one mode per layer), and
   * a change that would leave the slot as it is on air simply uncues it.
   */
  async graphic(label: string, actions: GraphicAction[]) {
    if (!this.ctx.match()) throw new Error('Choose a match first.');
    if (this.mode) {
      const key = cueKey(actions);
      const replaced = this.pending.some((c) => c.key === key);
      this.pending = this.pending.filter((c) => c.key !== key);
      if (this.ctx.matchesAir(actions)) {
        if (replaced) this.ctx.log(`Uncued · ${label}`);
      } else {
        this.pending.push({ key, label, actions });
        this.ctx.log(`Cued · ${label}`);
      }
      await this.sync();
      this.ctx.changed();
      return;
    }
    for (const a of actions) await this.ctx.act(a.name, a.args);
    await this.ctx.refresh();
    this.ctx.log(label);
  }

  /** The Cued monitor's room: the live state with the cued changes applied. */
  async sync() {
    const match = this.ctx.match();
    if (!match || !this.ctx.engineRunning()) return;
    const client = this.ctx.client();
    const room = this.room()!;
    const { state } = await client.get<{ state: unknown }>(`/api/${encodeURIComponent(match.code)}`);
    await client.put(`/api/${room}`, state);
    for (const change of this.pending) for (const a of change.actions) await client.post('/control/action', { match: room, name: a.name, args: a.args }).catch(() => {});
  }

  /** Keeps the cue room following the live match (throttled). */
  scheduleSync() {
    if (this.timer || !this.ctx.match()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync().catch(() => {});
    }, 800);
    this.timer.unref?.();
  }

  setMode(on: boolean) {
    this.mode = on === true;
    if (!this.mode && this.pending.length) this.pending = [];
    this.ctx.changed();
  }

  clear() {
    this.pending = [];
    void this.sync().catch(() => {});
    this.ctx.log('Cue cleared');
    this.ctx.changed();
  }

  /** Take: everything cued goes on air. With the stinger, the HUD wipe plays first and the change lands behind it. */
  async take(how: 'take' | 'cut' | 'stinger' = 'take') {
    if (!this.pending.length) throw new Error('Nothing is cued. Choose a graphic first.');
    const changes = this.pending;
    this.pending = [];
    if (how === 'stinger') {
      await this.ctx.act('stinger.play', {});
      await new Promise((r) => setTimeout(r, 450));
    }
    for (let i = 0; i < changes.length; i++) {
      try {
        for (const a of changes[i]!.actions) await this.ctx.act(a.name, a.args);
      } catch (error) {
        // What did not go on air stays cued, so the operator can Take again.
        this.pending = [...changes.slice(i), ...this.pending];
        await this.ctx.refresh().catch(() => {});
        this.ctx.changed();
        throw error;
      }
    }
    await this.ctx.refresh();
    this.ctx.log(`${how === 'stinger' ? 'Stinger' : how === 'cut' ? 'Cut' : 'Take'} · ${changes.map((c) => c.label).join(', ')}`);
    await this.sync().catch(() => {});
  }
}
