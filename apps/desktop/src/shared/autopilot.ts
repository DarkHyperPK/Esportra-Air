// Autopilot contract shared by the main process and the interface (PRD picture 8: Now / Next / Coming up).

export type SegmentState = 'queued' | 'armed' | 'holding' | 'taking' | 'on_air' | 'done';

/** What arms an automatic take. Esportra triggers (room opened, veto, series) come later. */
export const TRIGGERS = ['manual', 'match_start', 'round_live', 'round_end', 'halftime', 'spike_planted', 'spike_defused', 'map_end', 'delay'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABEL: Record<Trigger, string> = {
  manual: 'Manual take',
  match_start: 'The map starts',
  round_live: 'Round goes live',
  halftime: 'Halftime (after round 12)',
  round_end: 'Round ends',
  spike_planted: 'Spike planted',
  spike_defused: 'Spike defused',
  map_end: 'Map ends',
  delay: 'After a delay',
};

/** How the graphic arrives: straight away, or behind the HUD's stinger wipe. */
export type TransitionPick = 'cut' | 'stinger';

/** Where a rundown starts: Standard runs the whole show, Minimal only results, Manual never takes by itself, Empty has nothing. */
export const PRESETS = ['standard', 'minimal', 'manual', 'empty'] as const;
export type Preset = (typeof PRESETS)[number];

/**
 * What a rundown row can wait for: only what Air already reads from the game, or the producer's Take.
 * Spike, economy and round recap are not here: they are Auto layers of the in-game HUD.
 */
export const WHEN = ['manual', 'match_start', 'round_live', 'round_end', 'halftime', 'map_end', 'delay'] as const;
export type When = (typeof WHEN)[number];

export const WHEN_LABEL: Record<When, string> = {
  manual: 'I press Take', match_start: 'Map starts', round_live: 'Round live', round_end: 'Round ends', halftime: 'Halftime', map_end: 'Map ends', delay: 'After previous',
};

/** Which map a row runs on: every map, one map, or once after the series is won. */
export type RowMap = 'every' | number | 'series';

/** The Rundown's sections, in show order, by their usual broadcast names. */
export const SECTIONS = ['pre', 'game', 'between', 'post'] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { pre: 'Pre-show', game: 'Game', between: 'Between maps', post: 'Post-show' };

/** Which screens each section can hold (only screens Air already has). `null` is back to the game. */
export const SECTION_SCREENS: Record<Section, Array<string | null>> = {
  pre: ['holding', 'schedule', 'bracket', 'standings', 'match-intro', 'map-veto', 'agent-select', 'casters'],
  game: ['in-game', null],
  between: ['halftime', 'map-result', 'series', 'standings', 'bracket', 'schedule', 'player-profile', 'cam-grid', 'holding', 'casters'],
  post: ['champion', 'schedule', 'casters', 'holding'],
};
/** Screens in their own OBS scene: the producer switches to them in OBS, so they have no trigger. */
export const SCENE_ROWS = new Set(['holding', 'casters']);
/** The in-game HUD: one row, with its layers as switches. */
export const HUD_ROW = 'in-game';
/** A full-screen graphic or back to the game: a row autopilot can take. */
export const takesItself = (show: string | null) => show === null || (!SCENE_ROWS.has(show) && show !== HUD_ROW);

/** The section a screen usually goes in (old saves and the Graphics library). */
export function defaultSection(show: string | null): Section {
  if (show === null || show === HUD_ROW) return 'game';
  if (['holding', 'match-intro', 'map-veto', 'agent-select'].includes(show)) return 'pre';
  if (show === 'champion') return 'post';
  return 'between';
}

/** What a row is called in its section (the Holding screen is Starting soon, Break or Ending). */
export function rowTitle(show: string | null, section: Section, title: (id: string) => string): string {
  if (show === null) return 'Back to the game';
  if (show === 'holding') return section === 'pre' ? 'Starting soon' : section === 'post' ? 'Ending' : 'Break';
  if (show === 'casters') return 'Desk';
  if (show === HUD_ROW) return 'In-game HUD';
  return title(show);
}

/** One row of the producer's rundown: a screen (null: back to the game) and the rule for it. */
export interface RundownRow {
  id: string;
  /** Pre-show, Game, Between maps or Post-show. */
  section: Section;
  show: string | null;
  trigger: When;
  map: RowMap;
  /** Back to the game after this many seconds (0 = until the next screen). */
  forSeconds: number;
  /** Seconds after the previous row, for `delay`. */
  delaySeconds: number;
  transition: TransitionPick;
  /** `window`: a countdown of holdSeconds (0 = no hold), then take. `manual`: wait for Take. */
  holdMode: 'window' | 'manual';
  holdSeconds: number;
  /** Off: not in the rundown; the producer puts that screen up from Live. */
  enabled: boolean;
  /** Full screen, or over the game (a band over the game feed or camera; screens in BAND_SCREENS). */
  style?: 'full' | 'band';
  /** A saved look from Graphics › Templates for this screen (or, on the HUD row, for the in-game HUD). */
  template?: string;
}

export type RowInput = Omit<RundownRow, 'id' | 'enabled'> & { enabled?: boolean };

export interface Segment {
  id: string;
  name: string;
  /** The full-screen graphic it shows (a screen id such as `map-result`), or null to go back to the game. */
  show: string | null;
  /** Back to the game after this many seconds (0 = stays until the next step). */
  forSeconds: number;
  trigger: Trigger;
  /** Seconds after the previous take, for the `delay` trigger. */
  delaySeconds: number;
  mode: 'automatic' | 'manual';
  /** `window`: a visible countdown, then take. `manual`: wait for Take. */
  holdMode: 'window' | 'manual';
  holdSeconds: number;
  transition: TransitionPick;
  /** Only arms for this map (1–9), when set. */
  mapNumber: number | null;
  /** Runs once after the series is won (the champion). */
  afterSeries?: boolean;
  /** Full screen or over the game, and the saved look (from the row). */
  style?: 'full' | 'band';
  template?: string;
  state: SegmentState;
  heldBy: 'operator' | null;
}

export type AutopilotPause = 'tech' | 'timeout' | null;

export interface AutopilotView {
  /** Off until the producer chooses Start (or Resume) autopilot; never switches itself on. */
  enabled: boolean;
  /** Steps already done in this match (saved across restarts): Start then resumes at this step. */
  resumeAt?: string | null;
  paused: AutopilotPause;
  /** On air now. */
  now: Segment | null;
  /** Armed, holding or taking: what happens next. */
  next: Segment | null;
  preset: Preset;
  /** Absolute time the hold window ends (null while held, or when none is running). */
  holdEndsAt: number | null;
  holdTotalMs: number | null;
  /** The map being played (1-based), worked out from the rundown and the series score. */
  map: number;
  comingUp: Segment[];
  segments: Segment[];
}

/** Why Start autopilot cannot be pressed yet, or null when it can. Run manually always works. */
export type AutopilotBlock = string | null;

export interface SegmentEdit {
  show?: string | null;
  forSeconds?: number;
  trigger?: Trigger;
  delaySeconds?: number;
  mode?: 'automatic' | 'manual';
  holdMode?: 'window' | 'manual';
  holdSeconds?: number;
  transition?: TransitionPick;
}
