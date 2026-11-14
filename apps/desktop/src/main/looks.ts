// Looks: saved templates (Graphics › Templates), the HUD's look, the Break page's look, and what the
// rooms need to draw them. Production gives it a small context; the model and checks are in
// src/shared/templates.ts and the overlay side in core/templates.js.
import { HUD_ROW, type RundownRow } from '../shared/autopilot.ts';
import { lookOf } from '../shared/look.ts';
import { validTemplate, type BrandKit, type Template } from '../shared/templates.ts';
import type { Setup } from '../shared/api.ts';
import type { OwnGraphic } from '../shared/own-graphics.ts';
import type { Store } from './store.ts';

export interface LooksContext {
  store: Store;
  setup(): Setup;
  /** The selected match's Rundown rows. */
  rows(): RundownRow[];
  save(): void;
  /** After a change: the match room gets the new looks. */
  publish(): Promise<void>;
  brand(): BrandKit;
  own(): OwnGraphic[];
}

export class Looks {
  private readonly ctx: LooksContext;
  private checked: { from: Template[]; list: Template[] } | null = null;

  constructor(ctx: LooksContext) {
    this.ctx = ctx;
  }

  /** Saved looks. A broken entry in the saved file is skipped, never sent. Checked once per saved list. */
  get templates(): Template[] {
    const saved = this.ctx.store.data.templates ?? [];
    if (this.checked?.from === saved) return this.checked.list;
    const out: Template[] = [];
    for (const t of saved) {
      try { out.push(validTemplate(t, t.updatedAt)); } catch { /* skipped */ }
    }
    this.checked = { from: saved, list: out };
    return out;
  }

  /** Adds a template, or saves one (same id). */
  async save(input: unknown) {
    const t = validTemplate(input);
    const data = this.ctx.store.data;
    const list = data.templates ?? [];
    const old = list.find((x) => x.id === t.id);
    if (!old && list.length >= 300) throw new Error('Air keeps up to 300 templates. Delete some you no longer use.');
    if (old && old.graphic !== t.graphic) throw new Error('A template stays with its graphic. Use Save as to start one for another graphic.');
    data.templates = old ? list.map((x) => (x.id === t.id ? { ...t, createdAt: old.createdAt } : x)) : [...list, t];
    this.ctx.save();
    await this.ctx.publish();
  }

  /** Deletes a template; Rundown rows that used it go back to the default look. */
  async delete(id: string) {
    const data = this.ctx.store.data;
    if (!(data.templates ?? []).some((t) => t.id === id)) throw new Error('That template is already gone.');
    data.templates = (data.templates ?? []).filter((t) => t.id !== id);
    for (const saved of Object.values(data.rundown ?? {})) {
      if (saved && Array.isArray(saved.rows)) saved.rows = saved.rows.map((r) => (r.template === id ? (({ template: _t, ...rest }) => rest)(r) : r));
    }
    // Steps already built keep the id; a missing template shows the default look.
    this.ctx.save();
    await this.ctx.publish();
  }

  /** The Break screen's look: the Break row's (frame = over the game), else the production's older setting. */
  breakLook(): 'classic' | 'frame' {
    const row = this.ctx.rows().find((r) => r.show === 'holding');
    if (row?.style) return row.style === 'band' ? 'frame' : 'classic';
    return lookOf(this.ctx.setup().look).break;
  }

  /** OBS slots this show needs: Break's two windows only with the frame look. */
  slotWanted(id: string) {
    return !id.startsWith('break') || this.breakLook() === 'frame';
  }

  /** How many saved match rundowns use each template. */
  use(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const saved of Object.values(this.ctx.store.data.rundown ?? {})) {
      const ids = new Set((saved?.rows ?? []).map((r) => r.template).filter((x): x is string => !!x));
      for (const id of ids) out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }

  /** The look of the in-game HUD: the template on the match's HUD row, if any. */
  hud(): Template | null {
    const id = this.ctx.rows().find((r) => r.show === HUD_ROW)?.template;
    return id ? this.templates.find((t) => t.id === id && t.graphic === 'hud') ?? null : null;
  }

  /** What the rooms need: every saved look, the brand kit, the HUD's look, the scene pages' looks and your graphics. */
  state() {
    // Scene pages (Break, Desk) find their own look by graphic: holding|full, holding|band or casters|full.
    // Every key is sent, null when unused: the room merges, so a removed look must be cleared explicitly.
    const pages: Record<string, string | null> = { 'holding|full': null, 'holding|band': null, 'casters|full': null };
    for (const r of this.ctx.rows()) {
      const t = r.template && (r.show === 'holding' || r.show === 'casters') ? this.templates.find((x) => x.id === r.template && x.graphic.startsWith(`${r.show}|`)) : undefined;
      if (t) pages[t.graphic] = t.id;
    }
    return { airTemplates: this.templates, airBrand: this.ctx.brand(), airHudTemplate: this.hud()?.id ?? null, airPageTemplates: pages, airOwn: this.ctx.own() };
  }
}
