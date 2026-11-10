import type { LayerGroup, LayerMode } from './layers.ts';
import type { GameId } from './games.ts';
import type { SceneKey, SlotId } from './scenes.ts';

// The contract between the main process and the interface. The renderer only ever sees these
// shapes, through `window.air` (see src/preload/index.ts).

export type Page = 'ready' | 'console' | 'library' | 'scenes' | 'capture' | 'outputs' | 'settings' | 'setup';
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

/** A player in a match's lineup, as the producer entered them. */
export interface PlayerInfo {
  id: string;
  /** Shown on air. */
  name: string;
  realName: string;
  /** How the game reports them (Valorant: Riot ID `Name#TAG`), so live data can be matched to this player. */
  gameId: string;
  /** Photo URL served by the engine's asset store, or ''. */
  photo: string;
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
  game: GameId;
  /** Lineups per team (starters first). */
  players: [PlayerInfo[], PlayerInfo[]];
  /** Shown on the event bug and lower thirds. */
  event: { name: string; stage: string };
  sponsors: string[];
  /** The banner style used by this match's graphics. */
  theme: BannerTheme;
  /** Set for matches taken from an Esportra tournament. */
  source?: { matchId: string; tournamentId: string; tournament: string; scheduledAt: string | null; lineups: [string[], string[]] | null };
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
  /** Shown inside the full-screen host page rather than as its own OBS source. */
  hosted?: boolean;
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
  /** @deprecated Moved onto each match (event, sponsors). Kept only to migrate older saves. */
  brand: { eventName: string; stage: string };
  /** @deprecated See `brand`. */
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
  alive: [number, number];
  bank: [number, number];
  /** When the current phase's countdown ends (ms since epoch), or null. */
  clockEndsAt: number | null;
  spikePlanted: boolean;
  /** The player the observer camera is on. */
  observed: { team: number; player: number; name: string } | null;
  roster: Array<Array<{ name: string; inGameName: string }>>;
}

export interface LayerRow {
  id: string;
  label: string;
  group: LayerGroup;
  hotkey: string;
  mode: LayerMode;
  /** Auto means something for this layer. */
  auto: boolean;
  /** An Auto layer the producer has switched by hand. */
  manual: boolean;
  available: boolean;
}

export interface LogEntry {
  t: number;
  text: string;
}

export interface PollInput {
  question: string;
  options: [string, string];
  firstPercent: number;
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
  id: 'esportra' | 'match' | 'feed' | 'obs' | 'scenes' | 'sources' | 'talent' | 'art';
  title: string;
  detail: string;
  health: Health;
  action?: { id: ActionId; label: string };
}

export type ActionId = 'connect-obs' | 'install-graphics' | 'start-capture' | 'choose-match' | 'add-casters' | 'open-sources' | 'sign-in';

import type { AutopilotView, SegmentEdit } from './autopilot.ts';
import type { EsportraView } from './esportra.ts';
import type { JoinView, LinkView, PcMode, PcRole } from './join.ts';

export interface FeatureStat {
  id: string;
  label: string;
  detail: string;
  kind: 'stream' | 'event';
  /** live: arriving (events: seen this match) · quiet: a stream went silent · waiting: not seen yet · player-pc: needs a player PC. */
  status: 'live' | 'quiet' | 'waiting' | 'player-pc';
  ageMs: number | null;
  /** Messages per second over the last 60 s, oldest first. */
  spark: number[];
}

export interface CaptureView {
  messagesPerSec: number;
  total: number;
  gaps: number;
  lastAgeMs: number | null;
  features: FeatureStat[];
}

export interface CamSlot {
  team: number;
  slot: number;
  name: string;
  /** Link id once a link has been made for this player. */
  id: string | null;
  /** The link the player opens on their own PC (VDO.Ninja). */
  pushUrl: string | null;
  connected: boolean;
}

export interface CamsView {
  layout: 'ingame' | 'grid5' | 'grid10';
  delayMs: number;
  slots: CamSlot[];
}

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
    /** Every scene in the OBS collection, for mapping segments to scenes. */
    sceneNames: string[];
    videoInputs: string[];
  };
  outputs: OutputHealth[];
  testRound: { running: boolean; startedAt: number | null; durationMs: number; speed: number; fromMs: number };
  capture: CaptureView;
  cams: CamsView;
  /** What is on screen right now, read from the engine so external controllers show up too. */
  triggers: {
    pause: 'technical' | 'timeout' | null;
    strap: boolean;
    sponsor: string | null;
    /** A lower third showing one person (a caster) by name. */
    person: string | null;
    player: boolean;
    poll: boolean;
  };
  layers: LayerRow[];
  autopilot: AutopilotView;
  esportra: EsportraView;
  mode: PcMode;
  join: JoinView;
  link: LinkView;
  /** Why Start autopilot is not available yet (Run manually always is). */
  autopilotBlock: string | null;
  log: LogEntry[];
  checks: CheckItem[];
  /** Whether agent, weapon and map art can be loaded (media.valorant-api.com). */
  art: 'checking' | 'ok' | 'offline';
}

export interface NewMatchInput {
  game: GameId;
  bestOf: 1 | 3 | 5;
  teams: [Team, Team];
  players: [Array<Omit<PlayerInfo, 'id'> & { id?: string }>, Array<Omit<PlayerInfo, 'id'> & { id?: string }>];
  casters: Caster[];
  event: { name: string; stage: string };
  sponsors: string[];
  theme?: BannerTheme;
}

export interface QuickMatchInput {
  teamA: string;
  teamB: string;
  bestOf: 1 | 3 | 5;
  game?: GameId;
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
  setLayer(id: string, mode: LayerMode): Promise<Snapshot>;
  toast(text: string): Promise<Snapshot>;
  poll(input: PollInput | null): Promise<Snapshot>;
  stingerPlay(): Promise<Snapshot>;
  lowerThird(input: { kind: 'caster' } | { kind: 'person'; name: string; role: string } | { kind: 'player' } | null): Promise<Snapshot>;
  autopilotStart(): Promise<Snapshot>;
  autopilotStop(): Promise<Snapshot>;
  autopilotHold(): Promise<Snapshot>;
  autopilotSkip(): Promise<Snapshot>;
  autopilotTake(): Promise<Snapshot>;
  autopilotResume(): Promise<Snapshot>;
  segmentUpdate(id: string, edit: SegmentEdit): Promise<Snapshot>;
  segmentMove(id: string, direction: -1 | 1): Promise<Snapshot>;
  obsStudioMode(on: boolean): Promise<Snapshot>;
  obsPreview(scene: string): Promise<Snapshot>;
  obsTake(): Promise<Snapshot>;
  obsCut(): Promise<Snapshot>;
  obsStinger(): Promise<Snapshot>;
  replay(): Promise<Snapshot>;
  useSlotSource(slot: SlotId, source: string): Promise<Snapshot>;
  createQuickMatch(input: QuickMatchInput): Promise<Snapshot>;
  selectMatch(id: string): Promise<Snapshot>;
  updateMatch(id: string, patch: Partial<Pick<Match, 'casters' | 'title' | 'event' | 'sponsors' | 'players' | 'teams' | 'bestOf' | 'theme'>>): Promise<Snapshot>;
  /** Seeds the HUD library's sample room with this match's teams (or sample teams) and the given banner style. */
  librarySeed(): Promise<Snapshot>;
  /** Plays the sample round in the library room so the previews move. */
  libraryPlay(on: boolean): Promise<Snapshot>;
  createMatch(input: NewMatchInput): Promise<Snapshot>;
  /** Stores an image (data URL) and resolves to its URL on the engine. */
  uploadImage(dataUrl: string): Promise<string>;
  updateSetup(patch: Partial<Setup>): Promise<Snapshot>;
  connectObs(input: { host: string; port: number; password: string }): Promise<Snapshot>;
  disconnectObs(): Promise<Snapshot>;
  installGraphics(): Promise<Snapshot>;
  startCapture(input: { consent: true }): Promise<Snapshot>;
  stopCapture(): Promise<Snapshot>;
  testRound(action: 'start' | 'stop' | 'seek', options?: { speed?: number; from?: number }): Promise<Snapshot>;
  setMode(mode: PcMode): Promise<Snapshot>;
  joinSet(enabled: boolean): Promise<Snapshot>;
  joinRotate(): Promise<Snapshot>;
  linkConnect(input: { address: string; code: string; role: PcRole }): Promise<Snapshot>;
  linkDisconnect(): Promise<Snapshot>;
  linkRetry(): Promise<Snapshot>;
  esportraSignIn(email: string, password: string): Promise<Snapshot>;
  esportraSignOut(): Promise<Snapshot>;
  esportraRefresh(): Promise<Snapshot>;
  useEsportraMatch(matchId: string): Promise<Snapshot>;
  camsSet(patch: { layout?: CamsView['layout']; delayMs?: number }): Promise<Snapshot>;
  camCreate(team: number, slot: number): Promise<Snapshot>;
  camRemove(team: number, slot: number): Promise<Snapshot>;
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
