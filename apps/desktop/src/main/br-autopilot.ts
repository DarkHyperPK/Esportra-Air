// A battle royale lobby's autopilot (24 Nov): runs the lobby's Rundown (src/shared/br-rundown.ts) from the observer
// feed's moments (src/main/br-live.ts). The plane taking off runs the `plane` rows; a match saved from the game runs
// the `game.end` rows (WWCD, results, MVP, standings, then Starting soon), and after the last match the
// `day.end` rows (Champions). Each row is on screen for its hold, then the next; a hold of 0 stays. On by default;
// the producer's own Take, or the switch in Live, stops whatever is running.
import type { Lobby } from '../shared/api.ts';
import { BR_SCREEN_NAME, type BrScreen } from '../shared/br-screens.ts';
import { showOf, stepsFor, type BrAutoStatus, type BrRow } from '../shared/br-rundown.ts';
import type { BrMoment } from './br-live.ts';
import { currentMatch } from '../shared/br-run.ts';

export interface BrAutopilotContext {
  lobby: () => Lobby | null;
  /** Puts a full screen on the lobby's room (null clears it). */
  take: (l: Lobby, screen: BrScreen | null) => Promise<void>;
  log: (text: string) => void;
  changed: () => void;
  /** Where the run is, saved so a restart can offer to continue it (null clears). */
  persist?: (lobbyId: string, p: SavedAutopilot | null) => void;
  /** Tests wait in their own time. */
  wait?: (ms: number) => Promise<void>;
}

/** The run in progress: the row on screen and the rows after it. */
export interface SavedAutopilot { lobbyId: string; now: BrRow | null; left: BrRow[]; savedAt: number }

export class BrAutopilot {
  private readonly ctx: BrAutopilotContext;
  private run = 0;
  private now: BrRow | null = null;
  private left: BrRow[] = [];
  private saved: SavedAutopilot | null = null;
  private lobbyId = '';
  constructor(ctx: BrAutopilotContext) { this.ctx = ctx; }

  private wait(ms: number) { return this.ctx.wait ? this.ctx.wait(ms) : new Promise<void>((r) => setTimeout(r, ms).unref?.()); }

  status(): BrAutoStatus {
    return { running: this.now ? BR_SCREEN_NAME[this.now.screen] : null, next: this.left.map((r) => BR_SCREEN_NAME[r.screen]) };
  }

  private persist() {
    this.ctx.persist?.(this.lobbyId, this.now || this.left.length ? { lobbyId: this.lobbyId, now: this.now, left: [...this.left], savedAt: Date.now() } : null);
  }

  /** A run saved before Air closed (offered on Live as part of the resume prompt). */
  load(p: SavedAutopilot | null) { this.saved = p && (p.now || p.left.length) ? p : null; }
  get pending() { return this.saved; }
  /** Carries on with what was running: the screen that was on air, then the rest, each for its full hold. */
  async resume() {
    const p = this.saved, l = this.ctx.lobby();
    this.saved = null;
    if (!p || !l || l.id !== p.lobbyId) { if (p) this.ctx.persist?.(p.lobbyId, null); return; }
    await this.start(l, [...(p.now ? [p.now] : []), ...p.left]);
  }
  /** Drops a saved run without running it. */
  discard() { const p = this.saved; this.saved = null; if (p) this.ctx.persist?.(p.lobbyId, null); }

  /** A moment from the observer feed. */
  onMoment(name: BrMoment, data: Record<string, unknown>) {
    const l = this.ctx.lobby();
    if (!l) return;
    const show = showOf(l);
    if (!show.autopilot) return;
    const total = l.games.length;
    // The match the feed named, else the one that is armed or live (never "the first without results").
    const n = Number(data.game ?? currentMatch(l)?.n ?? 0);
    if (name === 'plane') void this.start(l, stepsFor(show.rows, 'plane', n, total));
    // Only a match the game saved with every place: the post-game graphics read its results.
    if (name === 'game.end' && data.results === true) {
      void this.start(l, [...stepsFor(show.rows, 'game.end', n, total), ...(n >= total ? stepsFor(show.rows, 'day.end', n, total) : [])]);
    }
  }

  /** Stops what is running (the producer took a graphic, or switched autopilot off). */
  stop() {
    if (!this.now && !this.left.length) return;
    this.run++; this.now = null; this.left = [];
    this.persist();
    this.ctx.changed();
  }

  private async start(l: Lobby, steps: BrRow[]) {
    if (!steps.length) return;
    const run = ++this.run;
    this.lobbyId = l.id; this.saved = null;
    this.left = [...steps];
    this.ctx.log(`Autopilot: ${steps.map((r) => BR_SCREEN_NAME[r.screen]).join(', ')}`);
    while (this.left.length && run === this.run) {
      const r = this.left.shift()!;
      this.now = r;
      this.persist();
      this.ctx.changed();
      try { await this.ctx.take(l, r.screen); } catch (e) { this.ctx.log(`Autopilot: ${BR_SCREEN_NAME[r.screen]} could not go on air (${e instanceof Error ? e.message : e})`); }
      if (!r.hold) { if (run === this.run) { this.now = null; this.left = []; this.persist(); this.ctx.changed(); } return; }
      await this.wait(r.hold * 1000);
    }
    if (run !== this.run) return;
    this.now = null;
    this.persist();
    this.ctx.changed();
    await this.ctx.take(l, null).catch(() => {});
  }
}
