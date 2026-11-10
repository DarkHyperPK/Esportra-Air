// Can this PC load the agent, weapon and map art the HUD uses (media.valorant-api.com)?
// Graphics work without it; they just show no agent or map art.

export type ArtState = 'checking' | 'ok' | 'offline';

export class ArtCheck {
  state: ArtState = 'checking';
  checkedAt: number | null = null;
  private readonly doFetch: typeof fetch;
  private readonly changed: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: { fetch?: typeof fetch; changed: () => void }) {
    this.doFetch = options.fetch ?? fetch;
    this.changed = options.changed;
  }

  async run() {
    let next: ArtState = 'offline';
    try {
      const res = await this.doFetch('https://media.valorant-api.com/agents/41fb69c1-4189-7b37-f117-bcaf1e96f1bf/displayicon.png', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      next = res.ok ? 'ok' : 'offline';
    } catch {
      next = 'offline';
    }
    this.checkedAt = Date.now();
    if (next !== this.state) {
      this.state = next;
      this.changed();
    }
  }

  /** Checks now and every five minutes. */
  start(everyMs = 300_000) {
    void this.run();
    this.timer = setInterval(() => void this.run(), everyMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
