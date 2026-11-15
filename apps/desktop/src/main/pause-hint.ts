// The "looks like a pause" hint (approved mock, 15 Nov): Valorant's buy phase lasts 30 s (45 s in the
// first round), so a buy phase still running after 40 s is likely a tactical timeout or a technical
// problem nobody announced. Air only suggests; the producer decides. No game signal exists for a
// timeout (Overwolf documents none), so this is the best Air can read.

const LONG_BUY_MS = 40_000;

export class PauseHint {
  private buySince: number | null = null;
  private dismissed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly changed: () => void;
  private readonly now: () => number;

  constructor(changed: () => void, now: () => number = Date.now) {
    this.changed = changed;
    this.now = now;
  }

  /** The round's phase changed. */
  phase(phase: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const was = this.view();
    if (phase === 'buy') {
      this.buySince = this.now();
      this.dismissed = false;
      // Wake the interface when the hint becomes due.
      this.timer = setTimeout(() => this.changed(), LONG_BUY_MS + 50);
      this.timer.unref?.();
    } else this.buySince = null;
    if (was) this.changed();
  }

  /** A pause went on air, or the producer waved the hint away: quiet until the next buy phase. */
  dismiss() {
    this.dismissed = true;
  }

  view(): { seconds: number } | null {
    if (this.buySince === null || this.dismissed) return null;
    const ms = this.now() - this.buySince;
    return ms >= LONG_BUY_MS ? { seconds: Math.round(ms / 1000) } : null;
  }
}
