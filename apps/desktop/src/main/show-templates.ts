// Show templates: start a match's show from a saved one, or keep the current match's show for the next.
// A template holds the Rundown rows (screens, when each comes up, each one's look), the banner style and
// the pause look. Built-in templates are the four starting points; saved ones live in store.data.showTemplates.
import { randomUUID } from 'node:crypto';
import type { BannerTheme, Match } from '../shared/api.ts';
import { BANNER_THEMES } from '../shared/api.ts';
import { HUD_ROW, type Preset, type RundownRow, type Section } from '../shared/autopilot.ts';
import { START_POINTS, builtInId, startPoint, type PauseStyle, type ShowTemplate, type ShowTemplateView, type StartPoint } from '../shared/show-templates.ts';
import type { Template } from '../shared/templates.ts';
import { rowsForScreens, sortRows, validRow } from './autopilot/rundown.ts';
import type { Store } from './store.ts';

export interface ShowTemplateContext {
  store: Store;
  match(): Match | null;
  /** The selected match's Rundown rows. */
  rows(): RundownRow[];
  /** Replaces the selected match's rows (refused while autopilot runs). */
  replaceRows(rows: RundownRow[], startedFrom: Preset): void;
  screens(): string[];
  looks(): Template[];
  sectionOf(show: string): Section;
  purposeOf(show: string): string | null;
  pause(): PauseStyle;
  setPause(p: PauseStyle): Promise<void>;
  setTheme(t: BannerTheme): Promise<void>;
  log(text: string): void;
}

const MAX = 40;

export class ShowTemplates {
  private readonly ctx: ShowTemplateContext;

  constructor(ctx: ShowTemplateContext) {
    this.ctx = ctx;
  }

  private saved(): ShowTemplate[] {
    return (this.ctx.store.data.showTemplates ??= []);
  }

  private builtIn(point: StartPoint, bestOf: 1 | 3 | 5): ShowTemplate {
    const { screens, template } = startPoint(point, bestOf);
    const rows = rowsForScreens(screens, template, bestOf, (s) => this.ctx.sectionOf(s), (s) => this.ctx.purposeOf(s));
    return { id: builtInId(point), name: START_POINTS.find(([p]) => p === point)![1], rows, theme: 'broadcast', pause: 'box' };
  }

  /** Every template: the built-in starting points, then the producer's own. */
  all(bestOf: 1 | 3 | 5 = 3): ShowTemplate[] {
    return [...START_POINTS.map(([p]) => this.builtIn(p, bestOf)), ...this.saved()];
  }

  get(id: string, bestOf: 1 | 3 | 5 = 3): ShowTemplate {
    const t = this.all(bestOf).find((x) => x.id === id);
    if (!t) throw new Error('That show template no longer exists.');
    return t;
  }

  views(): ShowTemplateView[] {
    const used = this.ctx.store.data.showTemplateOf ?? {};
    const looks = new Map(this.ctx.looks().map((t) => [t.id, t.name]));
    return this.all(this.ctx.match()?.bestOf ?? 3).map((t) => ({
      id: t.id, name: t.name, builtIn: t.id.startsWith('builtin:'), theme: t.theme, pause: t.pause,
      screens: t.rows.filter((r) => r.show && r.show !== HUD_ROW).filter((r, i, a) => a.findIndex((x) => x.show === r.show) === i)
        .map((r) => ({ show: r.show!, style: r.style === 'band' ? 'band' as const : 'full' as const, look: r.template ? looks.get(r.template) ?? null : null })),
      hudLook: (() => { const id = t.rows.find((r) => r.show === HUD_ROW)?.template; return id ? looks.get(id) ?? null : null; })(),
      uses: Object.values(used).filter((x) => x === t.id).length,
    }));
  }

  /** The rows of a template that fit this match: its best-of's maps, screens Air still has, valid looks. */
  private fit(t: ShowTemplate, bestOf: 1 | 3 | 5): RundownRow[] {
    const screens = this.ctx.screens(), looks = this.ctx.looks();
    const out: RundownRow[] = [];
    for (const r of t.rows) {
      if (typeof r.map === 'number' && r.map > bestOf) continue;
      try {
        out.push({ ...validRow({ ...r }, `${r.id}`, bestOf, screens, looks), section: r.section });
      } catch {
        // A screen or look that no longer exists (a deleted design or template) is left out.
      }
    }
    if (!out.some((r) => r.show === HUD_ROW)) {
      const hud = t.rows.find((r) => r.show === HUD_ROW);
      if (hud) out.push(hud);
    }
    return sortRows(out);
  }

  /** Starts the selected match's show from a template: its rows, banner style and pause look. */
  async apply(id: string) {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    const t = this.get(String(id), match.bestOf);
    // Rules that are added later (your own designs) follow the template's starting point.
    this.ctx.replaceRows(this.fit(t, match.bestOf), t.id === builtInId('results') ? 'minimal' : 'standard');
    (this.ctx.store.data.showTemplateOf ??= {})[match.id] = t.id;
    await this.ctx.setTheme(t.theme);
    await this.ctx.setPause(t.pause);
    this.ctx.log(`Show · ${t.name}`);
  }

  /** Keeps the selected match's show as a template (a new one, or replacing one of yours). */
  save(input: { name?: unknown; id?: unknown }): string {
    const match = this.ctx.match();
    if (!match) throw new Error('Choose a match first.');
    const name = typeof input?.name === 'string' ? input.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (!name || name.length > 40) throw new Error('Name the show template (up to 40 characters).');
    const list = this.saved();
    const existing = typeof input?.id === 'string' ? list.find((x) => x.id === input.id) : undefined;
    if (typeof input?.id === 'string' && !existing) throw new Error('Only your own show templates can be replaced.');
    if (list.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== existing?.id)) throw new Error(`A show template is already called ${name}.`);
    if (!existing && list.length >= MAX) throw new Error(`Keep up to ${MAX} show templates; delete one first.`);
    const theme = BANNER_THEMES.includes(match.theme) ? match.theme : 'broadcast';
    const t: ShowTemplate = { id: existing?.id ?? randomUUID(), name, rows: this.ctx.rows().map((r) => ({ ...r })), theme, pause: this.ctx.pause() };
    if (existing) Object.assign(existing, t); else list.push(t);
    (this.ctx.store.data.showTemplateOf ??= {})[match.id] = t.id;
    this.ctx.store.save();
    this.ctx.log(`Show template saved · ${name}`);
    return t.id;
  }

  rename(id: string, name: unknown) {
    const t = this.saved().find((x) => x.id === id);
    if (!t) throw new Error('Only your own show templates can be renamed.');
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || n.length > 40) throw new Error('Name the show template (up to 40 characters).');
    if (this.saved().some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`A show template is already called ${n}.`);
    t.name = n;
    this.ctx.store.save();
  }

  /** A copy of any template (built in or yours) to change. */
  duplicate(id: string) {
    const src = this.get(id, this.ctx.match()?.bestOf ?? 3);
    const list = this.saved();
    if (list.length >= MAX) throw new Error(`Keep up to ${MAX} show templates; delete one first.`);
    let name = `${src.name} copy`;
    for (let i = 2; list.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = `${src.name} copy ${i}`;
    const copy: ShowTemplate = { ...src, id: randomUUID(), name: name.slice(0, 40), rows: src.rows.map((r) => ({ ...r })) };
    list.push(copy);
    this.ctx.store.save();
    return copy.id;
  }

  remove(id: string) {
    const list = this.saved();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Built-in show templates cannot be deleted.');
    list.splice(i, 1);
    this.ctx.store.save();
  }
}

/** Checks show templates read from disk; anything unreadable is dropped. */
export function loadShowTemplates(input: unknown): ShowTemplate[] {
  if (!Array.isArray(input)) return [];
  return input.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.rows)).slice(0, MAX).map((t) => ({
    id: t.id, name: String(t.name).slice(0, 40), rows: t.rows.filter((r: unknown) => r && typeof r === 'object'),
    theme: BANNER_THEMES.includes(t.theme) ? t.theme : 'broadcast', pause: ['box', 'panel', 'bar'].includes(t.pause) ? t.pause : 'box',
  }));
}

