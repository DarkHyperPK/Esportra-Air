// Your graphics (approved mock, 14 Nov), the Air side: the design and fonts are stored in the engine's
// asset store, the definitions in the store, and each design is a hosted screen `own:<id>` of the setup.
// Production gives it a small context; the model and checks are in src/shared/own-graphics.ts.
import { randomUUID } from 'node:crypto';
import { defaultSection, type RowInput, type RundownRow, type Section } from '../shared/autopilot.ts';
import { isOwnScreen, ownScreen, ownScreenId, pngSize, validOwn, type OwnFont, type OwnGraphic } from '../shared/own-graphics.ts';
import type { Setup } from '../shared/api.ts';
import type { Store } from './store.ts';
import { ruleOf } from './autopilot/rundown.ts';

export interface OwnContext {
  store: Store;
  setup(): Setup;
  /** Stores bytes in the engine's asset store. */
  putAsset(id: string, bytes: Buffer): Promise<void>;
  save(): void;
  /** After a change: the rooms (match and previews) get the new definitions. */
  publish(): Promise<void>;
  /** The selected match's id and best-of, or null. */
  match(): { id: string; bestOf: 1 | 3 | 5 } | null;
  /** The selected match's Rundown rows, and reloading it after rows changed. */
  rows(): RundownRow[];
  reloadRundown(): void;
  addRow(row: RowInput): void;
  /** True while game data or a test round runs (mid-show). */
  live(): boolean;
  /** The full-screen graphic on air in the match room, and taking it off. */
  onAir(): string | null;
  takeOff(): Promise<void>;
}

export class OwnGraphics {
  private readonly ctx: OwnContext;

  constructor(ctx: OwnContext) {
    this.ctx = ctx;
  }

  get list(): OwnGraphic[] {
    return this.ctx.store.data.ownGraphics ?? [];
  }

  /** The design: a 1920×1080 PNG up to 16 MB (any Photoshop export fits), stored exactly as exported. */
  async uploadArtwork(dataUrl: string): Promise<string> {
    // The type a browser gives is not trusted either way: the PNG check below reads the bytes.
    const m = /^data:[a-z0-9.+/-]*;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl));
    if (!m) throw new Error('Export the design from Photoshop as a PNG.');
    const raw = Buffer.from(m[1]!, 'base64');
    if (raw.length > 16_000_000) throw new Error('The design is larger than 16 MB, which a 1920 × 1080 PNG never is. Export it again as a PNG.');
    const size = pngSize(raw);
    if (!size) throw new Error('That file is not a PNG. Export the design from Photoshop as a PNG.');
    if (size.width !== 1920 || size.height !== 1080) throw new Error(`The design is ${size.width} × ${size.height}. Export it at 1920 × 1080.`);
    const id = randomUUID();
    await this.ctx.putAsset(id, raw);
    return `/air-assets/${id}`;
  }

  /** A font for the data boxes: WOFF2, WOFF, TTF or OTF, up to 2 MB. */
  async uploadFont(dataUrl: string, name: string): Promise<OwnFont> {
    const m = /^data:[a-z0-9./+-]*;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl));
    if (!m) throw new Error('Choose a WOFF2, WOFF, TTF or OTF font file.');
    const raw = Buffer.from(m[1]!, 'base64');
    if (raw.length > 2_000_000) throw new Error('That font is larger than 2 MB.');
    const head = raw.subarray(0, 4);
    const ok = head.equals(Buffer.from('wOF2')) || head.equals(Buffer.from('wOFF')) || head.equals(Buffer.from([0, 1, 0, 0])) || head.equals(Buffer.from('OTTO'));
    if (!ok) throw new Error('That file is not a font (WOFF2, WOFF, TTF or OTF).');
    const clean = String(name ?? '').replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'My font';
    const id = randomUUID();
    await this.ctx.putAsset(id, raw);
    return { id, name: clean, url: `/air-assets/${id}` };
  }

  async save(input: unknown) {
    const g = validOwn(input);
    const data = this.ctx.store.data;
    const list = data.ownGraphics ?? [];
    const old = list.find((x) => x.id === g.id);
    if (!old && list.length >= 100) throw new Error('Air keeps up to 100 of your own graphics. Delete some you no longer use.');
    data.ownGraphics = old ? list.map((x) => (x.id === g.id ? { ...g, createdAt: old.createdAt } : x)) : [...list, g];
    this.syncScreens();
    this.ctx.save();
    await this.ctx.publish();
  }

  /** Deletes a design; Rundown rows that showed it go too. */
  async delete(id: string) {
    const data = this.ctx.store.data;
    if (!(data.ownGraphics ?? []).some((g) => g.id === id)) throw new Error('That graphic is already gone.');
    const show = ownScreenId(id);
    // Mid-show, deleting would change this match's Rundown and stop autopilot: it waits until after the show.
    if (this.ctx.live() && this.ctx.rows().some((r) => r.show === show)) throw new Error('It is in this match’s Rundown and the match is live. Delete it after the show.');
    if (this.ctx.live() && this.ctx.onAir() === show) throw new Error('It is on air. Take it off before deleting it.');
    data.ownGraphics = (data.ownGraphics ?? []).filter((g) => g.id !== id);
    for (const saved of Object.values(data.rundown ?? {})) {
      if (saved && Array.isArray(saved.rows)) saved.rows = saved.rows.filter((r) => r.show !== show);
    }
    this.syncScreens();
    this.ctx.save();
    this.ctx.reloadRundown();
    // On screen right now: back to the game, so nothing is left half shown.
    if (this.ctx.match() && this.ctx.onAir() === show) await this.ctx.takeOff();
    await this.ctx.publish();
  }

  /** The built-in screen a design stands for (null for "Anything" or a built-in screen). */
  purposeOf(show: string): string | null {
    const g = isOwnScreen(show) ? this.list.find((x) => ownScreenId(x.id) === show) : undefined;
    return g && g.purpose !== 'any' ? g.purpose : null;
  }

  /** Where a screen goes in the Rundown; a design goes where the screen it stands for goes. */
  sectionOf(show: string): Section {
    if (!isOwnScreen(show)) return defaultSection(show);
    const purpose = this.purposeOf(show);
    return purpose ? defaultSection(purpose) : 'between';
  }

  /** Use in this match: a Rundown row with the rule of the screen it stands for. */
  use(id: string) {
    const g = this.list.find((x) => x.id === id);
    if (!g) throw new Error('That graphic is no longer available.');
    const show = ownScreenId(id);
    if (this.ctx.rows().some((r) => r.show === show)) throw new Error('It is already in this match’s Rundown.');
    const match = this.ctx.match();
    const preset = match ? this.ctx.store.data.rundown?.[match.id]?.startedFrom ?? 'standard' : 'standard';
    this.ctx.addRow({ section: this.sectionOf(show), show, ...ruleOf(g.purpose === 'any' ? '' : g.purpose, preset, match?.bestOf ?? 3) });
  }

  /** Each design is a hosted screen of the setup, so Rundown, Live, keys and Companion treat it like Map result. */
  syncScreens() {
    const setup = this.ctx.setup();
    const keep = setup.screens.filter((x) => !isOwnScreen(x.id));
    const old = new Map(setup.screens.filter((x) => isOwnScreen(x.id)).map((x) => [x.id, x]));
    setup.screens = [...keep, ...this.list.map((g) => ownScreen(g, old.get(ownScreenId(g.id))?.enabled ?? false))];
  }
}
