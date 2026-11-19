// Still pictures of overlay pages for lists (17 Nov). A list of live previews (Graphics studio's looks, the
// Rundown, Screens) kept dozens of 1080p pages running, and fast scrolling dropped to a few frames a second.
// A list card now shows a picture of its page, rendered once off screen at 1280×720 (sharp on high-DPI screens) and kept; the big single
// previews stay live. Only Air's own preview pages on this PC can be rendered.

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** Keeps the newest `keep` pictures in the folder. */
export function pruneStills(dir: string, keep: number) {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(keep)) unlinkSync(join(dir, f));
  } catch { /* a folder we cannot tidy is only disk space */ }
}

export type RenderPage = (url: string) => Promise<string>;
/** Where finished pictures are kept between runs (19 Nov), so a restart does not render every card again. */
export interface StillStore { read(id: string): string | null; write(id: string, data: string): void }

const PAGE = /^http:\/\/127\.0\.0\.1:\d{2,5}\/overlays\/[a-z0-9-]+\.html(\?[^\s#]*)?$/i;

export class Thumbnails {
  private readonly done = new Map<string, string>();
  private readonly running = new Map<string, Promise<string | null>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;

  private readonly render: RenderPage;
  private readonly limit: number;
  private readonly parallel: number;

  private readonly store: StillStore | null;
  private readonly log: (url: string, error: unknown) => void;

  constructor(render: RenderPage, opts: { limit?: number; parallel?: number; store?: StillStore; log?: (url: string, error: unknown) => void } = {}) {
    this.render = render;
    this.limit = opts.limit ?? 160;
    this.parallel = opts.parallel ?? 2;
    this.store = opts.store ?? null;
    this.log = opts.log ?? (() => {});
  }

  /** A data URL of the page, or null when it cannot be rendered (the list shows a plain card; never the live page). */
  get(url: string, key = ''): Promise<string | null> {
    if (typeof url !== 'string' || url.length > 8000 || !PAGE.test(url)) return Promise.resolve(null);
    const id = `${key}\n${url}`;
    const hit = this.done.get(id);
    if (hit) {
      this.done.delete(id);
      this.done.set(id, hit);
      return Promise.resolve(hit);
    }
    const kept = this.read(id);
    if (kept) {
      this.remember(id, kept);
      return Promise.resolve(kept);
    }
    const busy = this.running.get(id);
    if (busy) return busy;
    const job = new Promise<string | null>((resolve) => {
      this.queue.push(async () => {
        this.active++;
        try {
          const data = await this.render(url);
          if (!/^data:image\/png;base64,.{64}/.test(data)) throw new Error('blank picture');
          this.remember(id, data);
          try { this.store?.write(id, data); } catch (e) { this.log(url, e); }
          resolve(data);
        } catch (e) {
          this.log(url, e);
          resolve(null);
        } finally {
          this.active--;
          this.running.delete(id);
          this.next();
        }
      });
      this.next();
    });
    this.running.set(id, job);
    return job;
  }

  private read(id: string) {
    try { return this.store?.read(id) ?? null; } catch { return null; }
  }

  private remember(id: string, data: string) {
    this.done.set(id, data);
    while (this.done.size > this.limit) this.done.delete(this.done.keys().next().value!);
  }

  private next() {
    while (this.active < this.parallel && this.queue.length) this.queue.shift()!();
  }
}
