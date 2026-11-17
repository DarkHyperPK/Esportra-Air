// Still pictures of overlay pages for lists (17 Nov). A list of live previews (Graphics studio's looks, the
// Rundown, Screens) kept dozens of 1080p pages running, and fast scrolling dropped to a few frames a second.
// A list card now shows a picture of its page, rendered once off screen at 1280×720 (sharp on high-DPI screens) and kept; the big single
// previews stay live. Only Air's own preview pages on this PC can be rendered.

export type RenderPage = (url: string) => Promise<string>;

const PAGE = /^http:\/\/127\.0\.0\.1:\d{2,5}\/overlays\/[a-z0-9-]+\.html(\?[^\s#]*)?$/i;

export class Thumbnails {
  private readonly done = new Map<string, string>();
  private readonly running = new Map<string, Promise<string | null>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;

  private readonly render: RenderPage;
  private readonly limit: number;
  private readonly parallel: number;

  constructor(render: RenderPage, limit = 160, parallel = 2) {
    this.render = render;
    this.limit = limit;
    this.parallel = parallel;
  }

  /** A data URL of the page, or null when it cannot be rendered (the caller shows the live page instead). */
  get(url: string, key = ''): Promise<string | null> {
    if (typeof url !== 'string' || url.length > 8000 || !PAGE.test(url)) return Promise.resolve(null);
    const id = `${key}\n${url}`;
    const hit = this.done.get(id);
    if (hit) {
      this.done.delete(id);
      this.done.set(id, hit);
      return Promise.resolve(hit);
    }
    const busy = this.running.get(id);
    if (busy) return busy;
    const job = new Promise<string | null>((resolve) => {
      this.queue.push(async () => {
        this.active++;
        try {
          const data = await this.render(url);
          this.done.set(id, data);
          while (this.done.size > this.limit) this.done.delete(this.done.keys().next().value!);
          resolve(data);
        } catch {
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

  private next() {
    while (this.active < this.parallel && this.queue.length) this.queue.shift()!();
  }
}
