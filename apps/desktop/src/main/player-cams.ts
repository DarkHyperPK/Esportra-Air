// Player cameras: a camera link per player (VDO.Ninja push links), the layout (in-game frames, a 5-up
// or 10-up grid) and a delay. Saved per PC, sent to the engine, shown by the HUD pages. Production gives
// it a small context.
import { randomBytes } from 'node:crypto';
import { cameraLinkUrl } from '../shared/model.ts';
import type { CamsView } from '../shared/api.ts';
import type { Store } from './store.ts';

export interface CamsContext {
  store: Store;
  /** A player's name in the room (the game's), else null. */
  playerName(team: number, slot: number): string | null;
  /** A team's tag in the selected match. */
  teamTag(team: number): string | null;
  hasMatch(): boolean;
  act(name: string, args: Record<string, unknown>): Promise<void>;
  /** The full-screen graphic on air, and showing or hiding the camera grid there. */
  onAir(): string | null;
  showGrid(on: boolean): Promise<void>;
  log(text: string): void;
}

export class PlayerCams {
  private readonly ctx: CamsContext;
  constructor(ctx: CamsContext) { this.ctx = ctx; }

  private get cams() {
    return (this.ctx.store.data.cams ??= { layout: 'ingame', delayMs: 0, ids: [[null, null, null, null, null], [null, null, null, null, null]] });
  }

  view(connected?: boolean[][]): CamsView {
    const cams = this.cams;
    const slots = [0, 1].flatMap((team) => [0, 1, 2, 3, 4].map((slot) => {
      const id = cams.ids[team]?.[slot] ?? null;
      const name = this.ctx.playerName(team, slot) || `${this.ctx.teamTag(team) ?? (team ? 'B' : 'A')} · Player ${slot + 1}`;
      return { team, slot, name, id, pushUrl: id ? cameraLinkUrl(id, name) : null, connected: !!id && !!connected?.[team]?.[slot] };
    }));
    return { layout: cams.layout, delayMs: cams.delayMs, slots };
  }

  /** Sends the camera setup to the engine (the HUD pages show the streams from it). */
  async push() {
    if (!this.ctx.hasMatch()) return;
    const cams = this.cams;
    await this.ctx.act('cams.set', { layout: cams.layout, delayMs: cams.delayMs, slots: cams.ids });
  }

  /** The camera layout ('ingame' while not set). */
  get layout() { return this.cams.layout; }
  set layout(next: CamsView['layout']) { this.cams.layout = next; this.ctx.store.save(); }

  async set(patch: { layout?: CamsView['layout']; delayMs?: number }) {
    const cams = this.cams;
    if (patch.layout !== undefined) {
      if (!['ingame', 'grid5', 'grid10'].includes(patch.layout)) throw new Error('Choose In-game, 5-up or 10-up.');
      cams.layout = patch.layout;
    }
    if (patch.delayMs !== undefined) {
      if (!Number.isInteger(patch.delayMs) || patch.delayMs < 0 || patch.delayMs > 10_000) throw new Error('Camera delay is 0–10,000 ms.');
      cams.delayMs = patch.delayMs;
    }
    this.ctx.store.save();
    await this.push();
    // A grid layout is a full-screen graphic: line it up like the other full-screen layers.
    if (patch.layout && patch.layout !== 'ingame') await this.ctx.showGrid(true).catch(() => {});
    else if (patch.layout === 'ingame' && this.ctx.onAir() === 'cam-grid') await this.ctx.showGrid(false).catch(() => {});
  }

  private check(team: number, slot: number) {
    if (![0, 1].includes(team) || !Number.isInteger(slot) || slot < 0 || slot > 4) throw new Error('Choose a team and player slot.');
  }

  /** Makes (or replaces) the camera link for a player. The old link stops working. */
  async create(team: number, slot: number) {
    this.check(team, slot);
    this.cams.ids[team]![slot] = randomBytes(9).toString('base64url');
    this.ctx.store.save();
    await this.push();
    this.ctx.log(`Camera link made · ${this.view().slots[team * 5 + slot]!.name}`);
  }

  async remove(team: number, slot: number) {
    this.check(team, slot);
    this.cams.ids[team]![slot] = null;
    this.ctx.store.save();
    await this.push();
  }
}
