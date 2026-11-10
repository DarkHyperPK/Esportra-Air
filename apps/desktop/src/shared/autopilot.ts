// Autopilot contract shared by the main process and the interface (PRD picture 8: Now / Next / Coming up).

export type SegmentState = 'queued' | 'armed' | 'holding' | 'taking' | 'on_air' | 'done';

/** What arms an automatic take. Esportra triggers (room opened, veto, series) arrive with Stage 2. */
export const TRIGGERS = ['manual', 'round_live', 'round_end', 'spike_planted', 'spike_defused', 'map_end', 'delay'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABEL: Record<Trigger, string> = {
  manual: 'Manual take',
  round_live: 'Round goes live',
  round_end: 'Round ends',
  spike_planted: 'Spike planted',
  spike_defused: 'Spike defused',
  map_end: 'Map ends',
  delay: 'After a delay',
};

export type TransitionPick = 'default' | 'cut' | 'stinger';

export interface Segment {
  id: string;
  name: string;
  /** OBS scene that goes on air. */
  scene: string;
  /** A Fullscreen graphic (a screen id such as `map-result`) shown before the take, or null. */
  graphic: string | null;
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
  state: SegmentState;
  heldBy: 'operator' | null;
}

export type AutopilotPause = 'tech' | 'timeout' | 'obs' | null;

export interface AutopilotView {
  /** Off until the producer chooses Start autopilot; never restored after a restart. */
  enabled: boolean;
  paused: AutopilotPause;
  /** On air now. */
  now: Segment | null;
  /** Armed, holding or taking: what happens next. */
  next: Segment | null;
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
  scene?: string;
  graphic?: string | null;
  trigger?: Trigger;
  delaySeconds?: number;
  mode?: 'automatic' | 'manual';
  holdMode?: 'window' | 'manual';
  holdSeconds?: number;
  transition?: TransitionPick;
}
