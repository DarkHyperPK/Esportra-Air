// Show templates (approved mock, 16 Nov): a whole show to start a match from. Which screens the match has,
// when each comes up and its look (full screen or overlay bar, or a saved look), the banner style and the
// pause look. Built-in ones come from the four starting points; the producer saves their own from a match.
import type { BannerTheme } from './api.ts';
import type { Preset, RundownRow } from './autopilot.ts';

export type StartPoint = 'standard' | 'results' | 'everything' | 'hud';
export const START_POINTS: Array<[StartPoint, string]> = [['standard', 'Standard'], ['results', 'Results only'], ['everything', 'Everything'], ['hud', 'Just the HUD']];

/** Every screen New match offers, in show order (own designs are added beside them). */
export const ALL_PICK_SCREENS = ['holding', 'match-intro', 'map-veto', 'agent-select', 'schedule', 'bracket', 'in-game', 'halftime', 'map-result', 'map-breakdown', 'postgame-player', 'postgame-matchup', 'series', 'standings', 'player-profile', 'cam-grid', 'casters', 'champion'];

/** A starting point's screens and the rule set they come with. */
export function startPoint(point: StartPoint, bestOf: 1 | 3 | 5): { screens: string[]; template: Preset } {
  if (point === 'everything') return { screens: ALL_PICK_SCREENS, template: 'standard' };
  if (point === 'hud') return { screens: ['in-game'], template: 'standard' };
  if (point === 'results') return { screens: ['in-game', 'map-result', ...(bestOf > 1 ? ['series'] : []), 'champion'], template: 'minimal' };
  return { screens: ['holding', 'match-intro', 'map-veto', 'agent-select', 'in-game', 'halftime', 'map-result', ...(bestOf > 1 ? ['series'] : []), 'casters', 'champion'], template: 'standard' };
}

export type PauseStyle = 'box' | 'panel' | 'bar';

export interface ShowTemplate {
  id: string;
  name: string;
  rows: RundownRow[];
  theme: BannerTheme;
  pause: PauseStyle;
}

/** What the interface shows of a template. */
export interface ShowTemplateView {
  id: string;
  name: string;
  builtIn: boolean;
  theme: BannerTheme;
  pause: PauseStyle;
  /** The full-screen and scene screens in it, in show order, with their look. */
  screens: Array<{ show: string; style: 'full' | 'band'; look: string | null }>;
  /** The saved look of the in-game HUD, if any. */
  hudLook: string | null;
  /** Matches whose show was last set from it. */
  uses: number;
}

export const builtInId = (p: StartPoint) => `builtin:${p}`;
