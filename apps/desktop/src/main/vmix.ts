// vMix (28 Nov): points the producer's Web Browser inputs at Air's pages, from vMix's official Web API only
// (docs/vmix.md). It reads GET /api/ (XML) every 3 s while connected and sends exactly three functions:
// SetInputName, BrowserNavigate, BrowserReload. It never switches, cuts, fades, overlays or outputs anything,
// never adds or removes an input, and only talks to this PC or the local network.
import { VMIX_FUNCTIONS, VMIX_OFF, VMIX_PORT, isLoopback, parseVmixInputs, vmixAddress, type SavedVmix, type VmixFunction, type VmixInput, type VmixPage, type VmixPageView, type VmixView } from '../shared/vmix.ts';

export const POLL_MS = 3000;

export interface VmixContext {
  /** The Air pages the current show needs (the same pages as the OBS plan), with this PC's 127.0.0.1 addresses. */
  pages(): VmixPage[];
  load(): SavedVmix | undefined;
  save(v: SavedVmix): void;
  /** This PC's address on the local network, for a vMix on another PC (it cannot reach 127.0.0.1). */
  lan?: () => string | null;
  fetch?: typeof fetch;
  log(text: string): void;
  changed(): void;
}

const ALLOWED = new Set<string>(VMIX_FUNCTIONS);

export class VmixLink {
  private readonly ctx: VmixContext;
  private base: string | null = null;
  private host = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private status: Pick<VmixView, 'state' | 'error' | 'lastAt'> = { state: 'off', error: null, lastAt: null };
  private inputs: VmixInput[] = [];

  constructor(ctx: VmixContext) { this.ctx = ctx; }
  private get fetch() { return this.ctx.fetch ?? fetch; }
  private saved(): SavedVmix { return this.ctx.load() ?? { host: '127.0.0.1', port: VMIX_PORT, pairs: {} }; }

  /** Starts reading vMix's Web API (Settings › Web in vMix). */
  connect(address: string) {
    const at = vmixAddress(address);
    if (!at) throw new Error('Use the address of vMix on this PC or your network, for example 127.0.0.1 or 192.168.1.30 (the Web API port is 8088 unless you changed it).');
    this.stop();
    this.base = `http://${at.host}:${at.port}`;
    this.host = at.host;
    this.status = { state: 'connecting', error: null, lastAt: null };
    this.ctx.save({ ...this.saved(), host: at.host, port: at.port });
    this.ctx.log(`vMix: reading ${at.host}, port ${at.port}`);
    this.ctx.changed();
    this.schedule(0);
  }

  disconnect() {
    if (!this.base) return;
    this.stop();
    this.inputs = [];
    this.status = { state: 'off', error: null, lastAt: null };
    this.ctx.log('vMix: disconnected');
    this.ctx.changed();
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.base = null; this.host = '';
  }

  private schedule(ms: number) {
    if (!this.base) return;
    this.timer = setTimeout(() => void this.poll(), ms);
    this.timer.unref?.();
  }

  /** The one place a call leaves Air: only the three documented functions, only `Input` and `Value`. */
  private async call(fn: VmixFunction, input: string, value?: string): Promise<void> {
    if (!ALLOWED.has(fn)) throw new Error(`Air does not send ${String(fn)} to vMix.`);
    if (!this.base) throw new Error('vMix is not connected.');
    const q = [`Function=${fn}`, `Input=${encodeURIComponent(input)}`, ...(value === undefined ? [] : [`Value=${encodeURIComponent(value)}`])].join('&');
    const res = await this.fetch(`${this.base}/api/?${q}`);
    if (!res.ok) throw new Error(`vMix answered ${res.status} to ${fn}.`);
  }

  /** The address a page has for this vMix: another PC cannot reach 127.0.0.1, so it gets this PC's network address. */
  private urlFor(page: VmixPage): string {
    if (!this.host || isLoopback(this.host)) return page.url;
    const lan = this.ctx.lan?.();
    return lan ? page.url.replace('//127.0.0.1:', `//${lan}:`) : page.url;
  }

  /** One read of /api/, then pairing by title and re-pointing. Public so tests (and Air after a change) can run it now. */
  async poll() {
    if (!this.base || this.busy) return;
    this.busy = true;
    const base = this.base;
    try {
      const res = await this.fetch(`${base}/api/`);
      if (!res.ok) throw new Error(`vMix answered ${res.status}.`);
      const inputs = parseVmixInputs(await res.text());
      if (this.base !== base) return;
      this.inputs = inputs;
      this.status = { state: 'connected', error: null, lastAt: Date.now() };
      await this.align();
    } catch (e) {
      if (this.base !== base) return;
      this.status = { state: 'error', error: this.words(e), lastAt: this.status.lastAt };
    } finally {
      this.busy = false;
      this.ctx.changed();
      this.schedule(POLL_MS);
    }
  }

  private words(e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    return /fetch failed|ECONN|abort|network/i.test(m) ? 'vMix does not answer. Is vMix running with the Web Controller on (Settings › Web)?' : m;
  }

  /** Pairs pages whose input is already titled `ESPORTRA · <page>`, then points paired inputs at the show's pages. */
  private async align() {
    const pages = this.ctx.pages();
    const cur = this.saved();
    const pairs = { ...cur.pairs };
    const pointed = { ...(cur.pointed ?? {}) };
    const has = (key: string) => this.inputs.some((i) => i.key === key);
    const used = () => new Set(Object.values(pairs));
    for (const p of pages) {
      if (pairs[p.id] && has(pairs[p.id]!)) continue;
      const found = this.inputs.find((i) => i.browser && i.title === p.name && !used().has(i.key));
      if (found) { pairs[p.id] = found.key; delete pointed[p.id]; }
    }
    let changed = JSON.stringify(pairs) !== JSON.stringify(cur.pairs);
    for (const p of pages) {
      const key = pairs[p.id];
      if (!key || !has(key)) continue;
      const url = this.urlFor(p);
      if (pointed[p.id] === url) continue;
      try { await this.call('BrowserNavigate', key, url); pointed[p.id] = url; changed = true; this.ctx.log(`vMix: ${p.name} points at ${url}`); }
      catch (e) { this.status = { ...this.status, error: this.words(e) }; }
    }
    if (changed) this.ctx.save({ ...cur, pairs, pointed });
  }

  /** The producer pairs a page with a Web Browser input (null: forget the pairing; the input is left as it is). */
  async pair(pageId: string, key: string | null) {
    const page = this.ctx.pages().find((p) => p.id === pageId);
    if (!page) throw new Error('That page is not in this show.');
    const cur = this.saved();
    const pairs = { ...cur.pairs };
    const pointed = { ...(cur.pointed ?? {}) };
    if (key === null) {
      delete pairs[pageId]; delete pointed[pageId];
      this.ctx.save({ ...cur, pairs, pointed });
      this.ctx.changed();
      return;
    }
    const input = this.inputs.find((i) => i.key === key);
    if (this.status.state !== 'connected' || !input) throw new Error('Connect to vMix and choose one of its inputs.');
    if (!input.browser) throw new Error(`${input.title || 'That input'} is not a Web Browser input. In vMix: Add Input › Web Browser.`);
    const other = Object.entries(pairs).find(([id, k]) => k === key && id !== pageId);
    if (other) throw new Error(`${input.title} already shows another Air page. Unpair that one first.`);
    if (input.title !== page.name) await this.call('SetInputName', key, page.name);
    const url = this.urlFor(page);
    await this.call('BrowserNavigate', key, url);
    pairs[pageId] = key; pointed[pageId] = url;
    this.ctx.save({ ...cur, pairs, pointed });
    this.ctx.log(`vMix: ${page.name} paired and pointed at ${url}`);
    await this.poll();
  }

  async reload(pageId: string) {
    const key = this.saved().pairs[pageId];
    if (!key || this.status.state !== 'connected' || !this.inputs.some((i) => i.key === key)) throw new Error('That page has no input in vMix to reload.');
    await this.call('BrowserReload', key);
  }

  view(): VmixView {
    const cur = this.ctx.load();
    const connected = this.status.state === 'connected';
    const pages: VmixPageView[] = this.ctx.pages().map((p) => {
      const key = cur?.pairs[p.id] ?? null;
      const input = key ? this.inputs.find((i) => i.key === key) ?? null : null;
      const status = !key ? 'unpaired' : !connected ? 'unknown' : input ? 'paired' : 'missing';
      return { ...p, url: this.urlFor(p), status, key, title: input?.title ?? null };
    });
    return { ...VMIX_OFF, ...this.status, host: this.base ? this.base.replace(/^http:\/\//, '') : cur ? `${cur.host}:${cur.port}` : VMIX_OFF.host, inputs: this.inputs.filter((i) => i.browser), pages };
  }
}
