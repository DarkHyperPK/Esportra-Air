import type { SceneKey, SlotId } from './scenes.ts';

// The contract between the main process and the interface. The renderer only ever sees these
// shapes, through `window.air` (see src/preload/index.ts).

export type Page = 'ready' | 'console' | 'scenes' | 'capture' | 'outputs' | 'data' | 'sync' | 'setup';
export type Health = 'ok' | 'warn' | 'off' | 'bad';

export interface Team {
  name: string;
  tag: string;
  color: string;
  logo: string;
}

export interface Caster {
  name: string;
  handle: string;
}

export interface Match {
  id: string;
  /** Room code on the engine; outputs follow the selected match's room. */
  code: string;
  kind: 'quick' | 'esportra';
  title: string;
  bestOf: 1 | 3 | 5;
  teams: [Team, Team];
  casters: Caster[];
  createdAt: number;
}

export interface Screen {
  /** Stable id for the screen in Air. */
  id: string;
  /** Output alias (`/o/<uuid>`): the URL OBS loads. The HUD only recognises UUID aliases. */
  outputId: string;
  /** The OBS scene this graphic is placed in. */
  scene: SceneKey;
  /** The graphic previewed for its scene on the Outputs page. */
  primary?: boolean;
  overlay: string;
  title: string;
  enabled: boolean;
  /** Position and size of the graphic inside its OBS scene (1920×1080 canvas). */
  frame: { x: number; y: number; width: number; height: number };
}

export const BANNER_THEMES = ['broadcast', 'compact', 'monument', 'impact'] as const;
export type BannerTheme = (typeof BANNER_THEMES)[number];

export interface Setup {
  id: string;
  name: string;
  /** The HUD's banner theme (core/hud-settings.js). */
  package: BannerTheme;
  /** Shown on the event bug and lower thirds. Team colours come from each team. */
  brand: { eventName: string; stage: string };
  sponsors: string[];
  screens: Screen[];
  /** HUD element switches, written to the match state's `show` flags. */
  hud: Record<string, boolean>;
  minimap: { x: number; y: number; size: number };
  obs: { host: string; port: number; /** Name of the OBS stinger transition to use for Stinger takes. */ stinger: string | null };
}

export interface RoundReadout {
  map: string | null;
  round: number | null;
  phase: string | null;
  score: [number | null, number | null];
  playersFound: [number, number];
  sides: [string | null, string | null];
  roster: Array<Array<{ name: string; inGameName: string }>>;
}

export interface SlotStatus {
  id: SlotId;
  label: string;
  scene: string;
  /** First source the crew added to the slot, or null while it still waits for one. */
  source: string | null;
}

export interface SceneStatus {
  key: SceneKey;
  name: string;
  inObs: boolean;
  slots: SlotStatus[];
}

/** A live frame pair for the PVW / PGM monitors (JPEG data URIs from OBS). */
export interface MonitorFrame {
  pvw: string | null;
  pgm: string | null;
  previewScene: string | null;
  programScene: string | null;
}

export interface OutputHealth {
  screenId: string;
  title: string;
  /** Overlay page this output serves (used to preview it by match code). */
  overlay: string;
  url: string;
  connections: number;
  lastFrameAt: number | null;
}

export interface CheckItem {
  id: 'esportra' | 'match' | 'feed' | 'obs' | 'scenes' | 'sources' | 'talent' | 'internet';
  title: string;
  detail: string;
  health: Health;
  action?: { id: ActionId; label: string };
}

export type ActionId = 'connect-obs' | 'install-graphics' | 'start-capture' | 'choose-match' | 'add-casters' | 'open-sources';

export interface Snapshot {
  version: string;
  engine: { state: 'starting' | 'running' | 'restarting' | 'failed'; port: number | null; reattached: boolean; error: string | null };
  setup: Setup;
  matches: Match[];
  match: Match | null;
  readout: RoundReadout | null;
  feed: { state: 'off' | 'waiting' | 'live' | 'unavailable'; reason: string | null; ageMs: number | null; paused: boolean };
  obs: {
    state: 'disconnected' | 'connecting' | 'connected' | 'error';
    error: string | null;
    version: string | null;
    collection: string | null;
    studioMode: boolean;
    programScene: string | null;
    previewScene: string | null;
    transitions: Array<{ name: string; kind: 'cut' | 'fade' | 'stinger' | 'other' }>;
    transitionActive: boolean;
    replay: { bufferActive: boolean | null; busy: boolean };
    installed: boolean;
    missingScenes: string[];
    scenes: SceneStatus[];
    videoInputs: string[];
  };
  outputs: OutputHealth[];
  testRound: { running: boolean; startedAt: number | null; durationMs: number };
  triggers: { pause: 'technical' | 'timeout' | null; strap: boolean; sponsor: string | null };
  checks: CheckItem[];
}

export interface QuickMatchInput {
  teamA: string;
  teamB: string;
  bestOf: 1 | 3 | 5;
}

export interface CorrectionInput {
  field: 'scores' | 'names' | 'player_name' | 'sides';
  value: unknown;
  reason: string;
}

export type CorrectionCall = CorrectionInput | { clear: true } | { undo: true };

/** Exposed to the renderer as `window.air`. Every call resolves to the latest snapshot or throws a plain message. */
export interface AirApi {
  snapshot(): Promise<Snapshot>;
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
  onMonitor(listener: (frame: MonitorFrame) => void): () => void;
  /** Starts or stops the PVW/PGM screenshot loop (only while the Console is on screen). */
  monitor(on: boolean): Promise<void>;
  obsStudioMode(on: boolean): Promise<Snapshot>;
  obsPreview(scene: string): Promise<Snapshot>;
  obsTake(): Promise<Snapshot>;
  obsCut(): Promise<Snapshot>;
  obsStinger(): Promise<Snapshot>;
  replay(): Promise<Snapshot>;
  useSlotSource(slot: SlotId, source: string): Promise<Snapshot>;
  createQuickMatch(input: QuickMatchInput): Promise<Snapshot>;
  selectMatch(id: string): Promise<Snapshot>;
  updateMatch(id: string, patch: Partial<Pick<Match, 'casters' | 'title'>>): Promise<Snapshot>;
  updateSetup(patch: Partial<Setup>): Promise<Snapshot>;
  connectObs(input: { host: string; port: number; password: string }): Promise<Snapshot>;
  disconnectObs(): Promise<Snapshot>;
  installGraphics(): Promise<Snapshot>;
  startCapture(input: { consent: true }): Promise<Snapshot>;
  stopCapture(): Promise<Snapshot>;
  testRound(action: 'start' | 'stop'): Promise<Snapshot>;
  pause(kind: 'technical' | 'timeout' | null): Promise<Snapshot>;
  casterStrap(on: boolean): Promise<Snapshot>;
  sponsorRead(sponsor: string | null): Promise<Snapshot>;
  correct(input: CorrectionCall): Promise<Snapshot>;
  copy(text: string): Promise<void>;
}

export const CHANNELS = {
  call: 'air:call',
  snapshot: 'air:snapshot',
  monitor: 'air:monitor',
} as const;

export type ApiMethod = Exclude<keyof AirApi, 'onSnapshot' | 'onMonitor'>;
