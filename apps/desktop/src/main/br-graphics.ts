// Battle royale graphics on air (22 Nov): what the lobby room needs beyond its `br` field, and the producer's
// Take/Clear of its full screens. Kept apart from the versus show (Rundown, autopilot, cue deck): a lobby has no
// rounds to follow yet (live data arrives with the observer feed, step 6), so its graphics are taken by hand.
//  · `airPack`: the downloaded game pack's pictures for core/br.js's picture slots (Esports and CI logos, wallpapers,
//    characters, map pictures by name). Only pack paths; nothing is sent when the event has no licence or no pack.
//  · `layout.brHud` and `brPopup`: the HUD layout (rail, grid, strip) and the strip's standings pop-up.
//  · Templates: the same `airTemplates`/`airBrand` as the match rooms, the lobby's HUD look as `airPageTemplates.brhud`.
//  · `airBrTheme` (23 Nov): the lobby's theme (preset or own colours, background, emblem, props); `brEmblem` the
//    event's logo, `brSponsors` its sponsors (title first, three at most) for the footer.
import type { Lobby, LobbyLook } from '../shared/api.ts';
import type { GameAsset } from '../shared/game-assets.ts';
import { packPath } from '../shared/game-assets.ts';
import { isLobbyGraphic } from '../shared/templates.ts';

import { BR_PICTURE, BR_SCREENS, BR_THEMES, BR_THEME_COLOURS, DEFAULT_THEME, HUD_LAYOUTS, type BrScreen, type BrTheme } from '../shared/br-screens.ts';
import type { EventInfo } from '../shared/model.ts';
export const DEFAULT_LOOK: LobbyLook = { hud: 'rail', popup: false, templates: {} };

export interface BrGraphicsContext {
  /** Sends one action to a room of the graphics engine. */
  action: (room: string, name: string, args: Record<string, unknown>) => Promise<void>;
  /** The game pack's pictures, when this lobby's event may use them. */
  assets: (lobby: Lobby) => GameAsset[];
  /** Templates and the brand kit, as the match rooms get them. */
  templates: (lobby: Lobby) => Record<string, unknown>;
  /** The name of the lobby's event, for the graphics' event line. */
  eventName: (lobby: Lobby) => string;
  /** The saved templates, to check a look exists and fits its graphic. */
  templateGraphic: (id: string) => string | null;
  /** The lobby's event, for its emblem and sponsors. */
  event?: (lobby: Lobby) => EventInfo | null;
  /** What each lobby room shows full screen, saved so a restart still knows what is on air (27 Nov). */
  persist?: (shown: Record<string, string | null>) => void;
}

/** The pictures core/br.js reads: logos (white variant first), lists of wallpapers and characters, maps by name. */
export function packField(game: string, assets: GameAsset[]) {
  const path = (a: GameAsset) => packPath(game, a.file);
  const logo = (kind: GameAsset['kind']) => {
    const list = assets.filter((a) => a.kind === kind);
    return list.find((a) => a.variant === 'white') ?? list[0] ?? null;
  };
  const esports = logo('logo-esports'), ci = logo('logo-ci') ?? logo('logo-game');
  const maps: Record<string, string> = {};
  for (const a of assets.filter((x) => x.kind === 'map')) { const k = a.name.toLowerCase(); if (!maps[k]) maps[k] = path(a); }
  return {
    esports: esports ? path(esports) : '', ci: ci ? path(ci) : '',
    wallpaper: assets.filter((a) => a.kind === 'wallpaper').slice(0, 8).map(path),
    character: assets.filter((a) => a.kind === 'character').slice(0, 8).map(path),
    item: assets.filter((a) => a.kind === 'item').slice(0, 8).map(path),
    maps,
  };
}

/** The lobby's theme as the producer set it; anything that is not a preset, a #rrggbb colour or an allowed picture is refused. */
export function validTheme(v: unknown): BrTheme {
  if (v === undefined || v === null) return DEFAULT_THEME;
  if (typeof v !== 'object') throw new Error('That theme is not valid.');
  const x = v as Record<string, unknown>;
  if (!BR_THEMES.includes(x.preset as never)) throw new Error('Choose Sky, Jungle or Inferno.');
  const colors: BrTheme['colors'] = {};
  const raw = x.colors && typeof x.colors === 'object' ? (x.colors as Record<string, unknown>) : {};
  for (const [k, c] of Object.entries(raw)) {
    if (c === '' || c === null || c === undefined) continue;
    if (!BR_THEME_COLOURS.includes(k as never) || typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) throw new Error('Colours are #rrggbb.');
    colors[k as keyof typeof colors] = c.toLowerCase();
  }
  const picture = (p: unknown, what: string) => {
    if (p === undefined || p === null || p === '') return '';
    if (typeof p !== 'string' || !BR_PICTURE.test(p)) throw new Error(`The ${what} must be a kit picture or a picture uploaded to Air.`);
    return p;
  };
  const pr = (x.props && typeof x.props === 'object' ? x.props : {}) as Record<string, unknown>;
  return {
    preset: x.preset as BrTheme['preset'],
    ...(Object.keys(colors).length ? { colors } : {}),
    background: picture(x.background, 'background'), emblem: picture(x.emblem, 'emblem'),
    props: { crate: pr.crate !== false, chutes: pr.chutes !== false, side: pr.side === 'left' ? 'left' : 'right' },
  };
}

/** A look patch laid over the current look. A HUD template made for a layout sets it; choosing another layout by hand drops
 *  a template made for the old one (28 Nov). Not checked yet: `validLook` does that. */
export function mergeLook(cur: LobbyLook, patch: Record<string, unknown>, layoutOf: (templateId: string) => LobbyLook['hud'] | undefined): Record<string, unknown> {
  const picked = patch.templates as Record<string, string> | undefined;
  const merged = { ...cur, ...patch, templates: picked === undefined ? cur.templates : { ...cur.templates, ...picked } } as Record<string, unknown> & { templates: Record<string, string> };
  const tid = merged.templates.brhud;
  const layout = tid ? layoutOf(tid) : undefined;
  if (layout && (patch.hud === undefined || picked?.brhud)) merged.hud = layout;
  else if (layout && patch.hud !== layout) merged.templates = { ...merged.templates, brhud: '' };
  return merged;
}

export function validLook(v: unknown, templateGraphic: (id: string) => string | null): LobbyLook {
  const x = (v ?? {}) as Record<string, unknown>;
  const hud = HUD_LAYOUTS.includes(x.hud as never) ? (x.hud as LobbyLook['hud']) : DEFAULT_LOOK.hud;
  const templates: Record<string, string> = {};
  const raw = x.templates && typeof x.templates === 'object' ? (x.templates as Record<string, unknown>) : {};
  for (const [graphic, id] of Object.entries(raw)) {
    if (id === null || id === undefined || id === '') continue;
    if (typeof id !== 'string' || !isLobbyGraphic(graphic) || templateGraphic(id) !== graphic) throw new Error('That look is not for this graphic.');
    templates[graphic] = id;
  }
  return { hud, popup: x.popup === true, ...(x.hudBrand === true ? { hudBrand: true } : {}), templates, ...(x.theme === undefined ? {} : { theme: validTheme(x.theme) }) };
}

const TIER_ORDER = { title: 0, partner: 1, supporter: 2 } as const;
/** The footer's Presented by: the event's sponsors, title sponsors first, three at most. */
export function sponsorsOf(ev: EventInfo | null) {
  if (!ev) return [];
  return [...ev.sponsors].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]).slice(0, 3).map((s) => ({ name: s.name.toUpperCase(), logo: s.logoLight || s.logo || '' }));
}

export class BrGraphics {
  private readonly ctx: BrGraphicsContext;
  /** What each lobby room shows full screen, as Air last set it. */
  private readonly shown = new Map<string, BrScreen | null>();
  constructor(ctx: BrGraphicsContext) { this.ctx = ctx; }

  /** What was on air before Air closed (the engine kept showing it). */
  load(saved: Record<string, string | null> | undefined) {
    for (const [room, screen] of Object.entries(saved ?? {})) if (screen === null || BR_SCREENS.includes(screen as BrScreen)) this.shown.set(room, screen as BrScreen | null);
  }

  static lookOf(l: Lobby): LobbyLook { return { ...DEFAULT_LOOK, ...(l.look ?? {}), templates: { ...(l.look?.templates ?? {}) } }; }

  /** Room fields besides `br`: pictures, layout, pop-up and looks. */
  roomFields(l: Lobby): Record<string, unknown> {
    const look = BrGraphics.lookOf(l);
    const tpl = this.ctx.templates(l);
    const pages = { ...((tpl.airPageTemplates as Record<string, string | null>) ?? {}), brhud: look.templates.brhud ?? null };
    const ev = this.ctx.event?.(l) ?? null;
    return {
      airPack: packField(l.game, this.ctx.assets(l)), layout: { brHud: look.hud, brHudBrand: look.hudBrand === true }, brPopup: look.popup, brEvent: this.ctx.eventName(l),
      airBrTheme: look.theme ?? DEFAULT_THEME, brEmblem: ev?.logoLight || ev?.logo || '', brSponsors: sponsorsOf(ev), ...tpl, airPageTemplates: pages,
    };
  }

  onAir(l: Lobby): BrScreen | null { return this.shown.get(l.code) ?? null; }

  /** Take a full screen (or clear with null) on the lobby's room, in the look chosen for it. */
  async take(l: Lobby, screen: string | null) {
    if (screen !== null && !BR_SCREENS.includes(screen as BrScreen)) throw new Error('Choose one of the lobby graphics.');
    if (screen && !l.teams.length) throw new Error('Add the lobby’s teams first.');
    const template = screen ? BrGraphics.lookOf(l).templates[`${screen}|full`] ?? null : null;
    await this.ctx.action(l.code, 'fullscreen.show', { screen, style: 'full', template });
    this.shown.set(l.code, screen as BrScreen | null);
    this.ctx.persist?.(Object.fromEntries(this.shown));
  }
}
