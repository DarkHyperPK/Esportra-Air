import type { LayerGroup, LayerMode } from './layers.ts';
import type { GameDef, GameId, Profile } from './games.ts';
import type { SceneKey, SlotId } from './scenes.ts';
import type { EventInfo, EventPatch, SponsorInput, TalentInput } from './model.ts';
import type { DevicesView } from './devices.ts';

// The contract between the main process and the interface. The renderer only ever sees these
// shapes, through `window.air` (see src/preload/index.ts).

export type Page = 'ready' | 'event' | 'help' | 'console' | 'teams' | 'library' | 'studio' | 'scenes' | 'capture' | 'outputs' | 'settings';
export type Health = 'ok' | 'warn' | 'off' | 'bad';

export interface Team {
  name: string;
  tag: string;
  color: string;
  logo: string;
}

/** A player in a match's lineup, as the producer entered them. */
export interface PlayerInfo {
  id: string;
  /** Shown on air. */
  name: string;
  realName: string;
  /** How the game reports them (Valorant: Riot ID `Name#TAG`), so live data can be matched to this player. */
  gameId: string;
  /** Riot's PUUID when Esportra has verified the account: seats the player before the game lists them. */
  puuid?: string;
  /** The player's Esportra user id, for an Esportra match (finds them again when Esportra's lineup changes names). */
  esportraId?: string;
  /** Photo URL served by the engine's asset store, or ''. */
  photo: string;
  /** The player in Teams/Players this lineup entry follows. */
  libraryId?: string;
}

/** A team in Teams/Players: matches pick from these. */
export interface LibTeam extends Team {
  id: string;
  /** The team's id on Esportra, when a stage from Esportra brought it in (28 Nov). */
  esportraId?: string;
  /** The logo address last fetched from Esportra, so a logo is fetched again only when Esportra's changes. */
  esportraLogo?: string;
}

/** A player in Teams/Players, on a team or on none. */
export interface LibPlayer {
  id: string;
  name: string;
  realName: string;
  /** Riot ID `Name#TAG`. */
  gameId: string;
  /** Riot's PUUID, from Esportra's verified account (never typed). */
  puuid?: string;
  /** Their Esportra user id, when an Esportra match brought them in. */
  esportraId?: string;
  photo: string;
  role: string;
  teamId: string | null;
  /** The player's PUBG MOBILE OpenID, learned from the observer feed (seats their team in later lobbies). */
  openId?: string;
  /** PUBG MOBILE Character ID, digits (28 Nov). The observer API's `uID` is this same value, so it places the player in the game. */
  uid?: string;
}

export interface Library {
  teams: LibTeam[];
  players: LibPlayer[];
}

export interface Match {
  /** This match's own choice of sponsor per space (null: none in this match), over the event's. */
  spaceActive?: Partial<Record<import('./model.ts').SponsorSpace, string | null>>;
  id: string;
  /** Room code on the engine; outputs follow the selected match's room. */
  code: string;
  kind: 'quick' | 'esportra';
  title: string;
  bestOf: 1 | 3 | 5;
  teams: [Team, Team];
  createdAt: number;
  game: GameId;
  /** Lineups per team (starters first). */
  players: [PlayerInfo[], PlayerInfo[]];
  /** The Teams/Players teams this match follows, per side. */
  teamIds?: [string | null, string | null];
  /** When the match was finished (series won, Esportra completed, or marked by hand). A finished match keeps
   *  the teams and players it was played with; Teams/Players changes no longer reach it. */
  finishedAt?: number;
  /** The event this match belongs to: its branding, talent and sponsors. */
  eventId: string;
  /** The event stage shown on air, e.g. "Playoffs" (free text). */
  stage: string;
  /** The event's people and sponsors switched off for this match (everyone else is on). */
  talentOff: string[];
  sponsorsOff: string[];
  /** The banner style used by this match's graphics. */
  theme: BannerTheme;
  /** Set for matches taken from an Esportra tournament. */
  source?: {
    matchId: string; tournamentId: string; tournament: string; scheduledAt: string | null; lineups: [string[], string[]] | null;
    /** Esportra's match package (prepare): result proposals go to it. */
    packageId?: string; packageVersion?: number;
    /** The team names as Esportra has them, team 1 then team 2 (to see whether the sides were swapped here). */
    teams?: [string, string];
  };
}

/** A battle royale lobby (20 Nov): many teams, several games, scored by placement and eliminations (src/shared/br.ts). */
export interface Lobby {
  id: string;
  /** Room code on the engine; the lobby's graphics read this room. */
  code: string;
  eventId: string;
  game: GameId;
  title: string;
  stage: string;
  teams: import('./br.ts').LobbyTeam[];
  games: import('./br.ts').LobbyGame[];
  scoring: import('./br.ts').Scoring;
  /** How the lobby's graphics look (22 Nov): the HUD layout, the strip's pop-up, a template per graphic. */
  look?: LobbyLook;
  /** The producer's pairs of PCOB team slots (by PCOB team id) to lobby teams. */
  pcobSeats?: Record<string, string>;
  /** What runs by itself (24 Nov): moments, the Rundown and autopilot, the post-game pick (src/shared/br-rundown.ts). */
  show?: Partial<import('./br-rundown.ts').BrShow>;
  /** Days of matches (27 Nov): a broadcast session each; every match belongs to one. Filled in for older lobbies on load. */
  days?: import('./br.ts').LobbyDay[];
  /** Points added or taken away with a reason; they count in the official standings. */
  adjustments?: import('./br.ts').Adjustment[];
  /** Where this lobby came from, when it was read from an Esportra stage (28 Nov, read only). */
  source?: import('./br.ts').LobbySource;
  createdAt: number;
}
export interface LobbyLook { hud: 'rail' | 'grid' | 'strip'; popup: boolean; templates: Record<string, string>; theme?: import('./br-screens.ts').BrTheme }

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
  /** The game this production makes graphics for (chosen in first run, switched from the top bar). */
  game: GameId | null;
  /** How the production's PCs are laid out; null until the producer chooses. */
  profile: Profile | null;
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
  /** Scorebug fit, pause and break styles (absent: the defaults in shared/look.ts). */
  look?: Partial<import('./look.ts').Look>;
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
  /** Each player's numbers from the game data, for Live's match data (16 Nov). */
  players: Array<Array<{ name: string; agent: string; k: number; d: number; a: number; credits: number; ult: number; ultMax: number; alive: boolean }>>;
  /** Maps won in the series, and the team names and tags on screen. */
  series: [number, number];
  teams: Array<{ name: string; tag: string }>;
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
  /** The mode waiting in the Cued column, when it differs from what is on air. */
  cued?: LayerMode;
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
  id: 'esportra' | 'match' | 'feed' | 'obs' | 'scenes' | 'sources' | 'talent' | 'art' | 'player-pcs' | 'match-data';
  title: string;
  detail: string;
  health: Health;
  action?: { id: ActionId; label: string };
}

export type ActionId = 'connect-obs' | 'install-graphics' | 'start-capture' | 'choose-match' | 'add-casters' | 'open-sources' | 'sign-in' | 'download-art' | 'open-devices' | 'open-match-data';

import type { AutopilotView, Preset, RowInput, RundownRow } from './autopilot.ts';
import type { CompanionView, ControlMode } from './companion.ts';
import type { RehearsalOptions, RehearsalView } from './rehearsal.ts';
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
  /** Counts up with every snapshot, so the interface never replaces a newer one with an older reply. */
  seq?: number;
  version: string;
  engine: { state: 'starting' | 'running' | 'restarting' | 'failed'; port: number | null; reattached: boolean; error: string | null };
  setup: Setup;
  matches: Match[];
  match: Match | null;
  /** First run is shown until it is finished (never on a capture-only PC). */
  onboarding: { done: boolean };
  /** The chosen game's module, or null before first run picks one. */
  game: GameDef | null;
  /** Why the game cannot be switched right now (a show is live), or null. */
  gameLocked: string | null;
  events: EventInfo[];
  /** The selected match's event. */
  event: EventInfo | null;
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
    /** Sources Air put in its own scenes that are no longer there (changed in OBS since). */
    missingSources: string[];
    /** Why the last Add to OBS stopped, until it succeeds. */
    installError: string | null;
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
    /** The id of the sponsor whose read is on air. */
    sponsor: string | null;
    /** A lower third showing one person (a caster) by name. */
    person: string | null;
    player: boolean;
    poll: boolean;
  };
  layers: LayerRow[];
  autopilot: AutopilotView;
  /** The selected match's rundown rows, in show order. */
  rundown: RundownRow[];
  /** Saved looks (Graphics › Templates). */
  templates: import('./templates.ts').Template[];
  /** Your own graphics (Graphics › Your graphics). */
  ownGraphics: import('./own-graphics.ts').OwnGraphic[];
  /** Ids of templates and own graphics on air right now: editing one changes what viewers see at once. */
  onAirLooks: string[];
  /** The game left this map before it ended; Live asks what it was. */
  mapStopped: { map: number; scores: [number, number] } | null;
  /** The selected match's data (veto, maps, holding text, champion), or null without a match. */
  matchData: import('./match-data.ts').MatchData | null;
  /** The selected match's event data (standings, ticker, bracket, handle, site), or null. */
  eventData: import('./match-data.ts').EventData | null;
  /** Each Teams/Players player's prep, by library player id. */
  playerPrep: Record<string, import('./match-data.ts').PlayerPrep>;
  /** How many saved match rundowns use each template. */
  templateUse: Record<string, number>;
  /** Show templates (built in and yours), and the one the selected match's show was last set from. */
  showTemplates: import('./show-templates.ts').ShowTemplateView[];
  /** The points tables saved on this PC (28 Nov). */
  pointsTables: import('./br.ts').SavedPointsTable[];
  /** The test-game roster check (28 Nov): set while the observer feed is in a game. */
  rosterCheck: import('../main/br-roster-view.ts').RosterView | null;
  showTemplateOf: string | null;
  /** Teams/Players. */
  library: Library;
  /** How this PC runs graphics. */
  control: ControlMode;
  companion: CompanionView;
  /** Graphics waiting in the Cued column, and the sample room the Cued monitor shows. */
  cue: { mode: boolean; pending: string[]; room: string | null };
  esportra: EsportraView;
  /** Map results sent to Esportra for review, for a match from Esportra (null otherwise). */
  esportraResults: import('./esportra-package.ts').EsportraResultsView | null;
  /** The selected Esportra match's veto: followed or entered here, its status on Esportra, warnings. */
  esportraVeto: import('./esportra-package.ts').EsportraVetoView | null;
  /** Stages read from Esportra for lobby games, with their sync state (28 Nov, read only). */
  esportraStages: import('../main/esportra-stages.ts').StagesView;
  /** The selected match's map records, and which one the post-game graphics show. */
  /** The buy phase has run long: maybe a timeout. Null when not, or while a pause is on air. */
  pauseHint: { seconds: number } | null;
  mapRecords: {
    maps: Array<{ map: number; name: string; score: [number, number]; winner: 0 | 1 | -1; how: 'game' | 'producer' | 'closed'; partial: boolean }>;
    shown: number | 'series' | null;
    /** The record the post-game graphics show now. */
    record: import('./map-records.ts').MapRecord | null;
    options: { stats: string[]; player: [number, number] | null; matchup: [[number, number], [number, number]] | null };
  } | null;
  mode: PcMode;
  join: JoinView;
  /** Keys rebound on this PC (overrides only) and the moments on Live. */
  keymap: Record<string, string>;
  moments: string[];
  /** Keys over the game: the switch, and which keys work over the game or are taken by another app. */
  globalKeys: { on: boolean; available: boolean; active: string[]; taken: string[] };
  /** Player PCs in their seats, observers and PCs without a seat (Devices). */
  devices: DevicesView;
  link: LinkView;
  /** Why Start autopilot is not available yet (Run manually always is). */
  autopilotBlock: string | null;
  log: LogEntry[];
  checks: CheckItem[];
  /** Agent, weapon and map pictures on this PC (downloaded once from media.valorant-api.com). */
  art: { total: number; have: number; downloading: boolean; lastError: string | null; unavailable: string[] };
  /** Game packs (official pictures hosted by Esportra) and whether an event confirmed their licence. */
  /** Battle royale lobbies and the selected one (src/shared/br.ts works out their standings). */
  lobbies: Lobby[];
  selectedLobbyId: string | null;
  /** The full screen Air last took on the selected lobby's room (src/main/br-graphics.ts). */
  lobbyOnAir: string | null;
  /** Air closed while a match was live (27 Nov): what Live offers to resume. */
  brResume: import('./br-run.ts').BrResume | null;
  /** The lobby's autopilot: the graphic it runs now and the ones after it. */
  brAuto: import('./br-rundown.ts').BrAutoStatus;
  /** The match being played, as the observer feed last read it (Live › Insights › Now). */
  pcobLive?: import('./pcob.ts').BrLive | null;
  /** The PUBG MOBILE observer feed (src/main/br-live.ts). */
  pcob: import('./pcob-status.ts').PcobStatus;
  /** Record PCOB (27 Nov): the raw PCOB answers being saved to a file on this PC (src/main/pcob-recorder.ts). */
  pcobRecording: import('../main/pcob-recorder.ts').PcobRecordingView;
  packs: Array<import('./game-assets.ts').PackStatus & { licensed: boolean; licence: string; rules: string[] }>;
  /** After Air or the graphics engine restarted mid-show: one sentence for the producer, until dismissed. */
  recovery: string | null;
  /** Air could not read its saved data on start (27 Nov): what it loaded instead. Shown once, until dismissed. */
  recovered: { from: string | null; fromAt: number | null; at: number; brokenFile: string } | null;
  /** The auto-backup folder (27 Nov): where the selected event's file is written after changes. */
  autoBackup: { folder: string | null; lastAt: number | null; file: string | null; error: string | null };
  /** The private rehearsal of the selected match (never on air). */
  rehearsal: RehearsalView;
}

export interface NewMatchInput {
  bestOf: 1 | 3 | 5;
  teams: [Team, Team];
  players: [Array<Omit<PlayerInfo, 'id'> & { id?: string }>, Array<Omit<PlayerInfo, 'id'> & { id?: string }>];
  /** Defaults to the latest match's event (a new event is made when there is none). */
  eventId?: string;
  stage?: string;
  talentOff?: string[];
  sponsorsOff?: string[];
  theme?: BannerTheme;
  /** How the Rundown starts (default Standard). */
  template?: Preset;
  /** The screens ticked in New match › Screens; the Rundown is made of these (with the template's rules). */
  screens?: string[];
  /** Screens (of `screens`) that start with the overlay bar look instead of full screen. */
  bands?: string[];
}

export type MatchPatch = Partial<Pick<Match, 'title' | 'players' | 'teams' | 'bestOf' | 'theme' | 'eventId' | 'stage' | 'talentOff' | 'sponsorsOff'>>;

export interface QuickMatchInput {
  teamA: string;
  teamB: string;
  bestOf: 1 | 3 | 5;
  /** The event the match belongs to (a new match is made inside an event). */
  eventId?: string;
}

export interface CorrectionInput {
  field: 'scores' | 'series' | 'names' | 'player_name' | 'sides';
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
  /** Adds a rundown row (a screen and its rule), or saves one (same id). Refused while autopilot runs. */
  rundownSave(input: RowInput & { id?: string }): Promise<Snapshot>;
  rundownRemove(id: string): Promise<Snapshot>;
  rundownEnable(id: string, on: boolean): Promise<Snapshot>;
  rundownMove(id: string, direction: -1 | 1): Promise<Snapshot>;
  /** Changes go to the Cued column (true) or straight on air (false). */
  cueMode(on: boolean): Promise<Snapshot>;
  cueTake(how: 'take' | 'cut' | 'stinger'): Promise<Snapshot>;
  cueClear(): Promise<Snapshot>;
  /** Replaces the rows with a starting point. */
  rundownStartFrom(preset: Preset): Promise<Snapshot>;
  /** Air, Stream Deck / Companion, or both: what Air shows and whether Companion can connect. */
  setControl(mode: ControlMode): Promise<Snapshot>;
  /** A new Companion key; Companion must be given it again. */
  companionRenewKey(): Promise<Snapshot>;
  /** F3: saves OBS's replay buffer (no scene switching). */
  replay(): Promise<Snapshot>;
  useSlotSource(slot: SlotId, source: string): Promise<Snapshot>;
  createQuickMatch(input: QuickMatchInput): Promise<Snapshot>;
  selectMatch(id: string): Promise<Snapshot>;
  updateMatch(id: string, patch: MatchPatch): Promise<Snapshot>;
  /** The game for the whole app. Refused while a show is live. */
  chooseGame(id: GameId): Promise<Snapshot>;
  /** Rebinds a keyboard action on this PC (null resets it); `swap` trades keys with the action that has it. */
  setKey(actionId: string, key: string | null, swap?: boolean): Promise<Snapshot>;
  resetKeys(): Promise<Snapshot>;
  setMoments(ids: string[]): Promise<Snapshot>;
  setGlobalKeys(on: boolean): Promise<Snapshot>;
  /** Settings is waiting for a new key: release keys over the game until it has it. */
  holdGlobalKeys(listening: boolean): Promise<Snapshot>;
  /** Saves the manual as a PDF (the app asks where); resolves to where it went, or null if cancelled. */
  saveManualPdf(): Promise<string | null>;
  /** Opens the system file picker for a video on this PC; its path, or null when cancelled. */
  pickVideo(): Promise<string | null>;
  /** A still picture of an overlay preview page (a data URL), or null to show the live page instead. */
  thumbnail(url: string, key: string): Promise<string | null>;
  chooseProfile(profile: Profile): Promise<Snapshot>;
  finishOnboarding(): Promise<Snapshot>;
  restartOnboarding(): Promise<Snapshot>;
  createEvent(name: string): Promise<Snapshot>;
  /** Teams/Players: add or save a team (same id) or a player; delete them. Matches that follow them update. */
  saveTeam(input: Partial<LibTeam>): Promise<Snapshot>;
  removeTeam(id: string): Promise<Snapshot>;
  savePlayer(input: Partial<LibPlayer>): Promise<Snapshot>;
  removePlayer(id: string): Promise<Snapshot>;
  /** Which saved team plays on a side of a match (its first five start), and who plays, in order. */
  setMatchTeam(matchId: string, side: 0 | 1, teamId: string): Promise<Snapshot>;
  setStarters(matchId: string, side: 0 | 1, playerIds: string[]): Promise<Snapshot>;
  /** Deletes an event and its matches from this PC (Esportra keeps its own). Refused while one of them is live. */
  deleteEvent(id: string): Promise<Snapshot>;
  /** Marks a match finished (it stops following Teams/Players), or reopens it. */
  markFinished(id: string, finished: boolean): Promise<Snapshot>;
  mapStoppedResolve(choice: 'team0' | 'team1' | 'remade' | 'ignore'): Promise<Snapshot>;
  matchDataSave(input: import('./match-data.ts').MatchData): Promise<Snapshot>;
  vetoStep(input: { map: string; side?: 'ATK' | 'DEF' }): Promise<Snapshot>;
  vetoUndo(): Promise<Snapshot>;
  /** Empties the veto; for an Esportra match the match room's veto is reset too. */
  vetoReset(): Promise<Snapshot>;
  /** Event data › Refresh from Esportra: the tournament's standings and bracket, read now. */
  esportraBracketRefresh(): Promise<Snapshot>;
  /** Teams/Players › Refresh from Esportra: the lineup and Riot IDs, read now. */
  esportraLineupRefresh(): Promise<Snapshot>;
  /** Starts the selected match's show from a show template (rows, banner style, pause look). */
  showTemplateApply(id: string): Promise<Snapshot>;
  /** Keeps the selected match's show as a template (a new one, or replacing one of yours by id). */
  showTemplateSave(input: { name: string; id?: string }): Promise<Snapshot>;
  showTemplateRename(id: string, name: string): Promise<Snapshot>;
  showTemplateDuplicate(id: string): Promise<Snapshot>;
  showTemplateDelete(id: string): Promise<Snapshot>;
  /** Who acts first in the veto; steps already entered swap teams with it. */
  vetoFirst(team: 0 | 1): Promise<Snapshot>;
  /** A coin toss for who starts the veto. */
  vetoToss(): Promise<Snapshot>;
  /** Changes a step already entered: map, side, which team chose the side. */
  vetoEdit(index: number, input: { map?: string; side?: 'ATK' | 'DEF' | null; sideTeam?: 0 | 1 | null }): Promise<Snapshot>;
  eventDataSave(eventId: string, input: import('./match-data.ts').EventData): Promise<Snapshot>;
  playerPrepSave(playerId: string, input: import('./match-data.ts').PlayerPrep): Promise<Snapshot>;
  /** Deletes a match from this PC (an Esportra match stays in Esportra). Refused while it is live. */
  deleteMatch(id: string): Promise<Snapshot>;
  updateEvent(id: string, patch: EventPatch): Promise<Snapshot>;
  /** Saves an event's brand kit; Primary becomes the event colour. */
  brandSave(eventId: string, kit: Partial<import('./templates.ts').BrandKit>): Promise<Snapshot>;
  /** Adds or saves a template (same id). It stays with its graphic. */
  templateSave(template: import('./templates.ts').Template): Promise<Snapshot>;
  /** Deletes a template; Rundown rows that used it go back to the default look. */
  templateDelete(id: string): Promise<Snapshot>;
  /** Your own graphics: save (new or changed) and delete. */
  ownSave(graphic: import('./own-graphics.ts').OwnGraphic): Promise<Snapshot>;
  ownDelete(id: string): Promise<Snapshot>;
  /** Adds an own graphic to this match's Rundown with the rule of the screen it stands for. */
  ownUse(id: string): Promise<Snapshot>;
  /** Stores the design (a 1920×1080 PNG, kept as exported) and resolves to its URL on the engine. */
  uploadArtwork(dataUrl: string): Promise<string>;
  /** Stores a font for the data boxes. */
  uploadFont(dataUrl: string, name: string): Promise<import('./own-graphics.ts').OwnFont>;
  /** Adds (no id) or changes a person on air. A camera link gets its id here. */
  saveTalent(eventId: string, input: TalentInput): Promise<Snapshot>;
  removeTalent(eventId: string, talentId: string): Promise<Snapshot>;
  /** A new camera link for this person; the old one stops working. */
  renewTalentLink(eventId: string, talentId: string): Promise<Snapshot>;
  saveSponsor(eventId: string, input: SponsorInput): Promise<Snapshot>;
  /** The event's active sponsor in a sponsor space (null: the first that bought it). */
  sponsorSpaceSet(eventId: string, space: import('./model.ts').SponsorSpace, sponsorId: string | null): Promise<Snapshot>;
  /** This match's own sponsor in a space (null: none in this match; 'event': follow the event). */
  matchSpaceSet(space: import('./model.ts').SponsorSpace, sponsorId: string | null): Promise<Snapshot>;
  removeSponsor(eventId: string, sponsorId: string): Promise<Snapshot>;
  /** Seeds the HUD library's sample room with this match's teams (or sample teams) and the given banner style. */
  librarySeed(): Promise<Snapshot>;
  /** Plays the sample round in the library room so the previews move. */
  libraryPlay(on: boolean): Promise<Snapshot>;
  /** Downloads any agent, weapon and map pictures not yet on this PC. */
  artDownload(): Promise<Snapshot>;
  eventLicence(eventId: string, game: string, input: { confirmed?: boolean; number?: string }): Promise<Snapshot>;
  packDownload(game: string): Promise<Snapshot>;
  lobbyCreate(input: { eventId: string; game: GameId; title?: string; games?: number; maps?: string[] }): Promise<Snapshot>;
  lobbyUpdate(id: string, patch: { title?: string; stage?: string; scoring?: import('./br.ts').Scoring; games?: Array<{ map: string; startsAt?: string }> }): Promise<Snapshot>;
  lobbyTeams(id: string, teamIds: string[]): Promise<Snapshot>;
  lobbyResult(id: string, game: number, rows: import('./br.ts').TeamResult[]): Promise<Snapshot>;
  lobbyClearResult(id: string, game: number): Promise<Snapshot>;
  lobbySelect(id: string | null): Promise<Snapshot>;
  lobbyDelete(id: string): Promise<Snapshot>;
  /** Import (28 Nov): looks through a pictures folder (asked for when `folder` is null; later calls pass the `token`) and matches what it finds. Null when cancelled. */
  sheetPictures(input: import('../main/sheet-import.ts').PictureInput): Promise<import('../main/sheet-import.ts').PictureScan | null>;
  /** Saves an import into Teams/Players (and lobbies). Refused while a match is live. */
  sheetImport(input: import('../main/sheet-import.ts').ImportInput): Promise<import('../main/sheet-import.ts').ImportResult>;
  /** Use a stage from Esportra (28 Nov, read only; nothing is sent back). The stages this producer can run, one stage in full, using it, reading it again, and following it again or stopping. */
  esportraStages(): Promise<import('../main/esportra-stages.ts').StageList>;
  esportraStageRead(stageId: string): Promise<import('../main/esportra-stages.ts').StageDetail>;
  esportraStageUse(stageId: string, eventId?: string | null): Promise<Snapshot>;
  esportraStageRefresh(stageId: string): Promise<Snapshot>;
  esportraStageFollow(stageId: string, part?: import('./br.ts').StagePart | 'all' | 'off'): Promise<Snapshot>;
  /** Saved points tables on this PC. */
  pointsTableSave(input: { id?: string; name: string; scoring: import('./br.ts').Scoring }): Promise<import('./br.ts').SavedPointsTable>;
  pointsTableDelete(id: string): Promise<Snapshot>;
  /** The match generator: fills a day with matches (count, first start, gap in minutes, map rotation). */
  lobbyFormat(id: string, dayId: string, spec: import('./br-format.ts').FormatSpec): Promise<Snapshot>;
  /** A new lobby with this one's format and points, no teams or results (Group A → Group B). */
  lobbyCopy(id: string, title?: string): Promise<Snapshot>;
  /** The roster check: this UID is that Teams/Players player's. Refused while a match is live. */
  rosterUid(lobbyId: string, playerId: string, uid: string): Promise<Snapshot>;
  lobbyLook(id: string, look: Partial<LobbyLook>): Promise<Snapshot>;
  /** Moments, Rundown (`preset` or `rows`), autopilot, the top fraggers band and the post-game pick. */
  lobbyShow(id: string, patch: Partial<Omit<import('./br-rundown.ts').BrShow, 'moments'>> & { preset?: import('./br-rundown.ts').BrPreset; moments?: Partial<Record<import('./br-rundown.ts').BrMomentKind, boolean>> }): Promise<Snapshot>;
  /** What the lobby's graphics read (pictures, theme, emblem, sponsors), with a draft theme, for the theme editor's preview. */
  lobbyPreview(id: string, theme?: unknown): Promise<Record<string, unknown>>;
  /** Reads the PUBG MOBILE observer client's API (PCOB) on this PC or the local network; consent every time. */
  pcobConnect(host: string, consent: boolean): Promise<Snapshot>;
  pcobDisconnect(): Promise<Snapshot>;
  /** Saves every raw answer of PCOB to a file on this PC while on (needs the connection and its consent). */
  pcobRecord(on: boolean): Promise<Snapshot>;
  /** Shows the recording in its folder. */
  pcobShowRecording(): Promise<void>;
  /** Pairs a PCOB team slot with a lobby team (null: automatic). */
  pcobSeat(lobbyId: string, pcobTeamId: number, team: string | null): Promise<Snapshot>;
  /** Take one of the lobby's full screens on its room, or clear with null. */
  lobbyTake(id: string, screen: string | null): Promise<Snapshot>;
  /** The run sheet (27 Nov): arm a match, remake, void with a reason, end it, confirm, edit a confirmed one with a reason. */
  lobbyArm(lobbyId: string, matchId: string): Promise<Snapshot>;
  lobbyDisarm(lobbyId: string): Promise<Snapshot>;
  lobbyRemake(lobbyId: string, matchId: string): Promise<Snapshot>;
  lobbyVoid(lobbyId: string, matchId: string, reason: string): Promise<Snapshot>;
  lobbyEndMatch(lobbyId: string, matchId: string): Promise<Snapshot>;
  lobbyConfirm(lobbyId: string, matchId: string): Promise<Snapshot>;
  lobbyEditConfirmed(lobbyId: string, matchId: string, results: import('./br.ts').TeamResult[], reason: string): Promise<Snapshot>;
  lobbyAdjust(lobbyId: string, team: string, points: number, reason: string): Promise<Snapshot>;
  lobbyAdjustRemove(lobbyId: string, id: string): Promise<Snapshot>;
  lobbyDayAdd(lobbyId: string, input: { date?: string; title?: string; opensAt?: string }): Promise<Snapshot>;
  lobbyDayEdit(lobbyId: string, dayId: string, patch: { date?: string; title?: string; opensAt?: string; matchIds?: string[]; reopen?: boolean }): Promise<Snapshot>;
  /** Start day: the checklist (go false), or start it and arm its first match (go true). */
  lobbyDayStart(lobbyId: string, dayId: string, go?: boolean): Promise<import('../main/br-run.ts').DayStart>;
  /** Close day: the summary and what stops it (close false), or close it (close true; refused while a match is open). */
  lobbyDayClose(lobbyId: string, dayId: string, close?: boolean): Promise<import('./br-run.ts').DaySummary & { problems: string[] }>;
  /** After a restart: carry on with the live match and the autopilot run that was in progress, or not. */
  lobbyResume(): Promise<Snapshot>;
  lobbyResumeDismiss(): Promise<Snapshot>;
  packAssets(game: string): Promise<Array<import('./game-assets.ts').GameAsset & { src: string; thumbSrc: string }>>;
  /** Forgets this match's autopilot progress so the rundown starts again from the first step. */
  autopilotRestart(): Promise<Snapshot>;
  recoveryDismiss(): Promise<Snapshot>;
  recoveredDismiss(): Promise<Snapshot>;
  /** Save event file… (null: cancelled). */
  eventExport(eventId: string): Promise<import('../main/event-files.ts').EventFileSaved | null>;
  /** Open event file…: reads the file the producer picks and says what is in it (null: cancelled). Nothing changes yet. */
  eventImportOpen(): Promise<import('../main/event-files.ts').EventFileCheck | null>;
  eventImportConfirm(token: string, mode: 'copy' | 'replace'): Promise<{ eventId: string; name: string }>;
  backupList(): Promise<Array<{ name: string; at: number; bytes: number }>>;
  backupRestore(name: string): Promise<Snapshot>;
  autoBackupChoose(): Promise<Snapshot>;
  autoBackupOff(): Promise<Snapshot>;
  autoBackupNow(): Promise<string | null>;
  /** Plays the match privately inside Air, with autopilot firing. Nothing reaches OBS. */
  rehearsalStart(options: Partial<RehearsalOptions>): Promise<Snapshot>;
  rehearsalStop(): Promise<Snapshot>;
  /** Takes the step the rehearsal's autopilot is waiting on. */
  rehearsalTake(): Promise<Snapshot>;
  /** Shows one full-screen graphic in the rehearsal (null: back to the game). */
  rehearsalShow(screen: string | null): Promise<Snapshot>;
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
  joinUseSource(id: string): Promise<Snapshot>;
  linkConnect(input: { address: string; code: string; role: PcRole }): Promise<Snapshot>;
  linkDisconnect(): Promise<Snapshot>;
  linkRetry(): Promise<Snapshot>;
  esportraSignIn(email: string, password: string): Promise<Snapshot>;
  esportraSignOut(): Promise<Snapshot>;
  esportraRefresh(): Promise<Snapshot>;
  /** Checks access again (and loads the matches once it is on); still refused is not an error. */
  esportraCheck(): Promise<Snapshot>;
  /** After the match room changed: keep Air's veto (sent again) or use the match room's. Also confirms sending a corrected veto. */
  vetoOutboxResolve(keep: 'air' | 'esportra'): Promise<Snapshot>;
  vetoOutboxRetry(): Promise<Snapshot>;
  /** Starts the veto in the Esportra match room, which flips the coin. */
  vetoOutboxStart(): Promise<Snapshot>;
  /** Asks Esportra to turn Air on for this account, with an optional note (up to 500 characters). */
  esportraRequestAccess(note: string): Promise<Snapshot>;
  esportraWithdrawRequest(): Promise<Snapshot>;
  useEsportraMatch(matchId: string): Promise<Snapshot>;
  /** Applies or rejects a map result on Esportra (organizers and crew allowed to submit results). */
  esportraReview(proposalId: string, decision: 'apply' | 'reject'): Promise<Snapshot>;
  /** Hands the veto back to Esportra after it was entered here. */
  vetoFollowEsportra(): Promise<Snapshot>;
  /** Which map record (or the whole series) the post-game graphics show. */
  recordShow(choice: number | 'series'): Promise<Snapshot>;
  recordRemove(map: number): Promise<Snapshot>;
  /** Keeps the map being played as it stands, without counting it in the series. */
  closeMap(): Promise<Snapshot>;
  /** Post-game player and matchup: the stats ticked and the players shown (null: the top fraggers). */
  postOptions(input: { stats?: string[]; player?: [number, number] | null; matchup?: [[number, number], [number, number]] | null }): Promise<Snapshot>;
  camsSet(patch: { layout?: CamsView['layout']; delayMs?: number }): Promise<Snapshot>;
  camCreate(team: number, slot: number): Promise<Snapshot>;
  camRemove(team: number, slot: number): Promise<Snapshot>;
  pause(kind: 'technical' | 'timeout' | null, options?: { team?: 0 | 1 | null; seconds?: number | null }): Promise<Snapshot>;
  casterStrap(on: boolean): Promise<Snapshot>;
  /** The "presented by" lower third for one of the match's sponsors (by id), or off. */
  sponsorRead(sponsorId: string | null): Promise<Snapshot>;
  correct(input: CorrectionCall): Promise<Snapshot>;
  copy(text: string): Promise<void>;
}

export const CHANNELS = {
  call: 'air:call',
  snapshot: 'air:snapshot',
  monitor: 'air:monitor',
} as const;

export type ApiMethod = Exclude<keyof AirApi, 'onSnapshot' | 'onMonitor'>;
