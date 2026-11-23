// Battle royale graphics on air (22 Nov): what the lobby room needs beyond its `br` field, and the producer's
// Take/Clear of its full screens. Kept apart from the versus show (Rundown, autopilot, cue deck): a lobby has no
// rounds to follow yet (live data arrives with the observer feed, step 6), so its graphics are taken by hand.
//  · `airPack`: the downloaded game pack's pictures for core/br.js's picture slots (Esports and CI logos, wallpapers,
//    characters, map pictures by name). Only pack paths; nothing is sent when the event has no licence or no pack.
//  · `layout.brHud` and `brPopup`: the HUD layout (rail, grid, strip) and the strip's standings pop-up.
//  · Templates: the same `airTemplates`/`airBrand` as the match rooms, the lobby's HUD look as `airPageTemplates.brhud`.
import type { Lobby, LobbyLook } from '../shared/api.ts';
import type { GameAsset } from '../shared/game-assets.ts';
import { packPath } from '../shared/game-assets.ts';
import { isLobbyGraphic } from '../shared/templates.ts';

import { BR_SCREENS, HUD_LAYOUTS, type BrScreen } from '../shared/br-screens.ts';
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
    maps,
  };
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
  return { hud, popup: x.popup === true, templates };
}

export class BrGraphics {
  private readonly ctx: BrGraphicsContext;
  /** What each lobby room shows full screen, as Air last set it. */
  private readonly shown = new Map<string, BrScreen | null>();
  constructor(ctx: BrGraphicsContext) { this.ctx = ctx; }

  static lookOf(l: Lobby): LobbyLook { return { ...DEFAULT_LOOK, ...(l.look ?? {}), templates: { ...(l.look?.templates ?? {}) } }; }

  /** Room fields besides `br`: pictures, layout, pop-up and looks. */
  roomFields(l: Lobby): Record<string, unknown> {
    const look = BrGraphics.lookOf(l);
    const tpl = this.ctx.templates(l);
    const pages = { ...((tpl.airPageTemplates as Record<string, string | null>) ?? {}), brhud: look.templates.brhud ?? null };
    return { airPack: packField(l.game, this.ctx.assets(l)), layout: { brHud: look.hud }, brPopup: look.popup, brEvent: this.ctx.eventName(l), ...tpl, airPageTemplates: pages };
  }

  onAir(l: Lobby): BrScreen | null { return this.shown.get(l.code) ?? null; }

  /** Take a full screen (or clear with null) on the lobby's room, in the look chosen for it. */
  async take(l: Lobby, screen: string | null) {
    if (screen !== null && !BR_SCREENS.includes(screen as BrScreen)) throw new Error('Choose one of the lobby graphics.');
    if (screen && !l.teams.length) throw new Error('Add the lobby’s teams first.');
    const template = screen ? BrGraphics.lookOf(l).templates[`${screen}|full`] ?? null : null;
    await this.ctx.action(l.code, 'fullscreen.show', { screen, style: 'full', template });
    this.shown.set(l.code, screen as BrScreen | null);
  }
}
