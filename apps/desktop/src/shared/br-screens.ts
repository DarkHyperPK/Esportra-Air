// The battle royale graphics (core/br.js) as Air's interface names them: the full screens a lobby can take
// (core/hud.js FULLSCREEN, the engine's allowlist), when each is used, and the HUD's three layouts.

export const BR_SCREENS = ['br-lobby', 'br-today', 'br-rankings', 'br-overall', 'br-wwcd', 'br-mvp', 'br-champion'] as const;
export type BrScreen = (typeof BR_SCREENS)[number];
export const BR_SCREEN_NAME: Record<BrScreen, string> = {
  'br-lobby': 'Starting soon', 'br-today': "Today's matches", 'br-rankings': 'Match results', 'br-overall': 'Overall standings',
  'br-wwcd': 'WWCD', 'br-mvp': 'Match MVP', 'br-champion': 'Champions',
};
/** Before a match, or after one (results, standings, winners). */
export const BR_SCREEN_PHASE: Record<BrScreen, 'pre' | 'post'> = {
  'br-lobby': 'pre', 'br-today': 'pre', 'br-rankings': 'post', 'br-overall': 'post', 'br-wwcd': 'post', 'br-mvp': 'post', 'br-champion': 'post',
};
export const BR_SCREEN_WHAT: Record<BrScreen, string> = {
  'br-lobby': 'Countdown to the next match over its tilted map, with the plane on the flight path.',
  'br-today': 'The day’s matches as map discs along a flight path; played ones show the winner, the next is marked.',
  'br-rankings': 'The last match: the winning squad and every team’s place, elims and points.',
  'br-overall': 'Standings after the matches played, with the match-point line and the leader.',
  'br-wwcd': 'The match winner with its players and points (WWCD, or BOOYAH for Free Fire).',
  'br-mvp': 'The match’s best player and the next three (numbers arrive with the observer data).',
  'br-champion': 'The champion team with its points, wins, elims and its journey through the day.',
};
export const HUD_LAYOUTS = ['rail', 'grid', 'strip'] as const;
export type HudLayout = (typeof HUD_LAYOUTS)[number];
export const HUD_LAYOUT_NAME: Record<HudLayout, [string, string]> = {
  rail: ['Points rail', 'Every team down the right edge, under the minimap.'],
  grid: ['Points grid', 'Four columns of tiles, bottom right.'],
  strip: ['Top strip', 'The top three under the compass; the full table pops up from Live.'],
};
/** The lobby room's page for a graphic, as a browser source. */
export const lobbyPage = (port: number, code: string, page: string, extra = '') => `http://127.0.0.1:${port}/overlays/${page}.html?match=${encodeURIComponent(code)}${extra}`;

/** The event's colour world for the BR graphics (23 Nov): a preset, or own colours over one, a background picture,
 *  the emblem and the props. core/br.js reads it as `airBrTheme`; pictures are kit pack paths or Air uploads. */
export const BR_THEMES = ['sky', 'jungle', 'inferno'] as const;
export type BrThemePreset = (typeof BR_THEMES)[number];
export const BR_THEME_NAME: Record<BrThemePreset, string> = { sky: 'Sky', jungle: 'Jungle', inferno: 'Inferno' };
export const BR_THEME_COLOURS = ['bg1', 'bg2', 'acc', 'panel', 'text', 'title'] as const;
export type BrThemeColour = (typeof BR_THEME_COLOURS)[number];
export const BR_THEME_COLOUR_NAME: Record<BrThemeColour, string> = { bg1: 'Field dark', bg2: 'Field light', acc: 'Highlight', panel: 'Cards', text: 'Card text', title: 'Titles' };
/** Each preset's own colours, so the editor shows what an own colour replaces (kept equal to THEMES in core/br.js). */
export const BR_THEME_BASE: Record<BrThemePreset, Record<BrThemeColour, string>> = {
  sky: { bg1: '#0a58c9', bg2: '#36b4ff', acc: '#ffb60e', panel: '#ffffff', text: '#0a2350', title: '#ffffff' },
  jungle: { bg1: '#0c241c', bg2: '#1d4a39', acc: '#e2bc67', panel: '#12342a', text: '#f4ead1', title: '#fff4d6' },
  inferno: { bg1: '#170302', bg2: '#8a1a06', acc: '#ffb60e', panel: '#280804', text: '#fff3e6', title: '#fff6d8' },
};
export interface BrTheme {
  preset: BrThemePreset;
  colors?: Partial<Record<BrThemeColour, string>>;
  /** '' or absent: the pack's first wallpaper. */
  background?: string;
  /** '' or absent: the event's logo, else a shield with the event's name. */
  emblem?: string;
  props?: { crate: boolean; chutes: boolean; side: 'left' | 'right' };
}
export const DEFAULT_THEME: BrTheme = { preset: 'sky', props: { crate: true, chutes: true, side: 'right' } };
/** A picture core/br.js accepts: a kit pack file or an Air upload. */
export const BR_PICTURE = /^\/(packs\/[a-z0-9]{2,16}\/[0-9a-f]{64}\.(png|jpg|webp)|air-assets\/[0-9a-f-]{36})$/;
