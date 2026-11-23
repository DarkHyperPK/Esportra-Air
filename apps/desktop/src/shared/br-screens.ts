// The battle royale graphics (core/br.js) as Air's interface names them: the full screens a lobby can take
// (core/hud.js FULLSCREEN, the engine's allowlist), when each is used, and the HUD's three layouts.

export const BR_SCREENS = ['br-lobby', 'br-today', 'br-rankings', 'br-overall', 'br-wwcd', 'br-mvp', 'br-champion'] as const;
export type BrScreen = (typeof BR_SCREENS)[number];
export const BR_SCREEN_NAME: Record<BrScreen, string> = {
  'br-lobby': 'Waiting lobby', 'br-today': "Today's matches", 'br-rankings': 'Match rankings', 'br-overall': 'Overall standings',
  'br-wwcd': 'Match winner', 'br-mvp': 'MVP rankings', 'br-champion': 'Champions',
};
/** Before a match, or after one (results, standings, winners). */
export const BR_SCREEN_PHASE: Record<BrScreen, 'pre' | 'post'> = {
  'br-lobby': 'pre', 'br-today': 'pre', 'br-rankings': 'post', 'br-overall': 'post', 'br-wwcd': 'post', 'br-mvp': 'post', 'br-champion': 'post',
};
export const BR_SCREEN_WHAT: Record<BrScreen, string> = {
  'br-lobby': 'Countdown to the next match, with its map.',
  'br-today': 'Every match of the day with its map; played ones greyed, the next one marked.',
  'br-rankings': 'The last match: podium and every team’s place, elims and points.',
  'br-overall': 'Standings after the matches played, with the match-point race.',
  'br-wwcd': 'The match winner with its players and points (WWCD, or BOOYAH for Free Fire).',
  'br-mvp': 'Top four players of the match (numbers arrive with the observer data).',
  'br-champion': 'The champion team with its points, wins and elims.',
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
