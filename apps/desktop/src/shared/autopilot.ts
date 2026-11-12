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

/** One row of the producer's rundown: a screen (null: back to the game) and the rule for it. */
export interface RundownRow {
  id: string;
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
