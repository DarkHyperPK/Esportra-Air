// Air's saved settings: the tournament setup, matches, OBS address and which OBS scenes Air owns.
// Secrets (engine key, OBS password) are kept separately, encrypted by the OS (see secrets.ts).

import { loadShowTemplates } from './show-templates.ts';
import { copyFileSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeDurable } from './durable.ts';
import { BACKUP_EVERY_MS, listBackups, readBackup, stamp, writeBackup, type BackupInfo } from './store-backups.ts';
import { randomUUID } from 'node:crypto';
import { ownScreen, ownScreenId } from '../shared/own-graphics.ts';
import type { Match, Screen, Setup } from '../shared/api.ts';
import { emptyOwned, type Owned } from './scene-build.ts';
import type { SceneKey } from '../shared/scenes.ts';
import type { SavedRundown } from './autopilot/rundown.ts';
import type { SavedEsportra } from './esportra.ts';
import type { EventInfo } from '../shared/model.ts';
import { DEFAULT_ACCENT, migrateToEvents } from './event-model.ts';
import { splitRiot } from '../shared/riot.ts';
import { linkMatch } from './team-library.ts';

export interface Saved {
  version: 1;
  setup: Setup;
  matches: Match[];
  /** Events own the branding, talent and sponsors their matches use. */
  events: EventInfo[];
  /** Teams/Players: the teams and players matches pick from. */
  teams?: import('../shared/api.ts').LibTeam[];
  players?: import('../shared/api.ts').LibPlayer[];
  selectedMatchId: string | null;
  /** Battle royale lobbies (20 Nov) and the one selected for lobby games. */
  lobbies?: import('../shared/api.ts').Lobby[];
  /** The PCOB observer address last used (the consent is asked every time). */
  pcobHost?: string;
  /** vMix (28 Nov): its address on this PC and which vMix Web Browser input shows which Air page (src/main/vmix.ts). */
  vmix?: import('../shared/vmix.ts').SavedVmix;
  selectedLobbyId?: string | null;
  /** The live match's state, saved every 2 s while a battle royale match is live (27 Nov): a restart offers to resume it. */
  brCheckpoint?: import('../shared/br-run.ts').BrCheckpoint | null;
  /** Each lobby's autopilot run in progress, and the full screen each lobby room shows (so a restart knows). */
  brAutopilot?: Record<string, import('./br-autopilot.ts').SavedAutopilot>;
  lobbyShown?: Record<string, string | null>;
  owned: Owned;
  enginePort: number;
  /** The producer's rundown rows, per match (older saves hold edits and are migrated). Whether autopilot is on is never saved. */
  rundown?: Record<string, SavedRundown>;
  /** The producer's show templates (16 Nov), and which one each match's show was last set from. */
  showTemplates?: import('../shared/show-templates.ts').ShowTemplate[];
  showTemplateOf?: Record<string, string>;
  /** Points tables the producer saved on this PC (28 Nov), beside the PMGC and FFWS presets. */
  pointsTables?: import('../shared/br.ts').SavedPointsTable[];
  /** Where autopilot is in each match's rundown, so a restart resumes instead of starting over. */
  autopilotProgress?: Record<string, { states: Record<string, 'done' | 'on_air'>; savedAt: number }>;
  /** The signed-in Esportra account (tokens are kept separately, encrypted). */
  esportra?: SavedEsportra;
  /** How long a timeout counts down, in seconds (absent: 60). */
  timeoutSeconds?: number;
  /** Each match's map records (src/shared/map-records.ts) and which one the post-game graphics show. */
  mapRecords?: Record<string, import('../shared/map-records.ts').MapRecord[]>;
  recordShown?: Record<string, number | 'series'>;
  postOptions?: Record<string, import('./map-records.ts').PostOptions>;
  /** Map results sent (or waiting to be sent) to Esportra for review, per match (src/main/esportra-sync.ts). */
  esportraResults?: Record<string, import('./esportra-sync.ts').SavedResults>;
  /** Stages read from Esportra for lobby games (28 Nov, read only), by stage id (src/main/esportra-stages.ts). */
  esportraStages?: Record<string, import('./esportra-stages.ts').StageFollow>;
  /** Veto steps entered in Air for the Esportra match room, per match (src/main/esportra-veto-outbox.ts). */
  esportraVetoOutbox?: Record<string, import('./esportra-veto-outbox.ts').SavedVetoOutbox>;
  /** This PC's id with Esportra (stable across sign-ins). */
  deviceId?: string;
  /** What this PC does: run the show, or only capture the game and send it to a producer's Air. */
  mode?: 'production' | 'capture';
  /** First run: shown until finished. Saves from before first run existed count as finished. */
  onboarding?: { done: boolean };
  /** Keys the producer rebound on this PC (only those that differ from the defaults). */
  keymap?: Record<string, string>;
  /** The moments shown on Live, in order. */
  moments?: string[];
  /** Match data per match: veto, map pool, holding text, champion (src/shared/match-data.ts). */
  matchData?: Record<string, import('../shared/match-data.ts').MatchData>;
  /** Event data per event: standings, ticker, bracket, handle and site. */
  eventData?: Record<string, import('../shared/match-data.ts').EventData>;
  /** What each Teams/Players player has done before (Player profile, pre-match matchup), by library player id. */
  playerPrep?: Record<string, import('../shared/match-data.ts').PlayerPrep>;
  /** Saved looks from Graphics › Templates. */
  templates?: import('../shared/templates.ts').Template[];
  /** Your own graphics: imported designs with data boxes (Graphics › Your graphics). */
  ownGraphics?: import('../shared/own-graphics.ts').OwnGraphic[];
  /** F-keys and Ctrl/Alt keys work over the game (absent: on). */
  globalKeys?: boolean;
  /** How this PC runs graphics: Air, Stream Deck / Companion, or both (absent: Air). */
  control?: import('../shared/companion.ts').ControlMode;
  /** The Companion connection's port on this PC. */
  companion?: { port: number };
  /** Producer side: allow other PCs on the network to join. The code itself is kept encrypted. */
  join?: { enabled: boolean; port: number };
  /** Capture-only side: the producer's address and this PC's role. The code is kept encrypted. */
  link?: { address: string; role: 'observer' | 'player' };
  /** Auto-backup folder (27 Nov): the selected event's event file is written here after changes (src/main/event-files.ts). */
  autoBackup?: { folder: string };
  /** Player camera links (VDO.Ninja ids) per player slot, and how the cameras are laid out. */
  cams?: { layout: 'ingame' | 'grid5' | 'grid10'; delayMs: number; ids: Array<Array<string | null>> };
}

const full = { x: 0, y: 0, width: 1920, height: 1080 };
const screen = (id: string, overlay: string, title: string, scene: SceneKey, primary = false): Screen => ({ id, outputId: '', scene, primary, overlay, title, enabled: true, frame: { ...full } });

/** A full-screen graphic shown by the full-screen host page. */
const hosted = (id: string, overlay: string, title: string): Screen => ({ ...screen(id, overlay, title, 'fullscreen'), hosted: true });

/** Every graphic Air puts in OBS, grouped by the scene it lives in (PRD picture 9). */
export const DEFAULT_SCREENS: Screen[] = [
  screen('holding', 'holding', 'Holding', 'holding', true),
  screen('ticker', 'ticker', 'Ticker', 'holding'),
  screen('in-game', 'ingame', 'In-game HUD', 'gameplay', true),
  screen('stinger', 'stinger', 'Stinger (live)', 'gameplay'),
  screen('fullscreen', 'fullscreen', 'Full screen', 'fullscreen', true),
  hosted('match-intro', 'match-intro', 'Match intro'),
  hosted('map-veto', 'map-veto', 'Map veto'),
  hosted('agent-select', 'agent-select', 'Agent select'),
  hosted('map-result', 'map-result', 'Map result'),
  hosted('series', 'series', 'Series'),
  hosted('halftime', 'halftime', 'Halftime'),
  hosted('standings', 'standings', 'Standings'),
  hosted('schedule', 'schedule', 'Today\'s schedule'),
  hosted('bracket', 'bracket', 'Bracket'),
  hosted('map-breakdown', 'map-breakdown', 'Map breakdown'),
  hosted('postgame-player', 'postgame-player', 'Player of the map'),
  hosted('postgame-matchup', 'postgame-matchup', 'Matchup'),
  hosted('player-profile', 'player-profile', 'Player profile'),
  hosted('champion', 'champion', 'Champion'),
  hosted('cam-grid', 'cam-grid', 'Player cams'),
  screen('replay-bug', 'replay', 'Replay bug', 'replay', true),
  screen('casters', 'casters', 'Casters', 'casters', true),
];

/** HUD elements the producer can switch, with the HUD's own defaults (core/state.clean.js `show`). */
export const DEFAULT_HUD: Record<string, boolean> = {
  scorebug: true, players: true, spikeTimer: true,
  winProb: false, roundHistory: false, moments: true, sponsor: true, eventBug: true, ticker: true,
};

export function defaultSetup(): Setup {
  return {
    id: randomUUID(),
    name: 'My production',
    game: null,
    profile: null,
    package: 'broadcast',
    brand: { eventName: '', stage: '' },
    sponsors: [],
    screens: DEFAULT_SCREENS.map((s) => ({ ...s, outputId: randomUUID(), frame: { ...s.frame } })),
    hud: { ...DEFAULT_HUD },
    minimap: { x: 24, y: 24, size: 400 },
    obs: { host: '127.0.0.1', port: 4455, stinger: null },
  };
}

export function defaults(): Saved {
  return { version: 1, setup: defaultSetup(), onboarding: { done: false }, matches: [], events: [], selectedMatchId: null, owned: emptyOwned(), enginePort: 5300 };
}

/** Air could not read its saved data on start (27 Nov): what it did instead, shown once. */
export interface Recovered {
  /** The backup Air loaded, or null when there was none and it started empty. */
  from: string | null;
  /** When that backup was made. */
  fromAt: number | null;
  at: number;
  /** The unreadable file, kept beside air.json. */
  brokenFile: string;
}

export interface StoreOptions {
  now?: () => number;
  /** Writes air.json (default: temp file, fsync, rename, fsync folder). Tests make it fail half way. */
  write?: (file: string, text: string) => void;
}

export class Store {
  data: Saved;
  /** Set when air.json could not be read on start; the interface shows it once, then clears it. */
  recovered: Recovered | null = null;
  private readonly file: string;
  private readonly now: () => number;
  private readonly writeFile: (file: string, text: string) => void;
  private lastBackupAt = 0;
  private readonly saved = new Set<() => void>();

  constructor(file: string, options: StoreOptions = {}) {
    this.file = file;
    this.now = options.now ?? Date.now;
    this.writeFile = options.write ?? writeDurable;
    this.data = defaults();
    let text: string | null = null;
    try {
      text = readFileSync(file, 'utf8');
    } catch (e) {
      // No file: first run. Any other failure (a folder, no permission) is an unreadable file.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') text = '';
    }
    if (text !== null && !this.load(text)) this.recover();
  }

  get backupsDir() { return join(dirname(this.file), 'backups'); }

  /** Parses and migrates a saved file into this.data. Leaves this.data as it was and returns false when it cannot. */
  private load(text: string): boolean {
    const before = this.data;
    try {
      const saved = JSON.parse(text) as Partial<Saved> | null;
      if (!saved || typeof saved !== 'object' || saved.version !== 1) throw new Error('not an Air save');
      this.data = { ...defaults(), ...saved, setup: { ...defaultSetup(), ...saved.setup } as Setup };
      // Every screen needs a UUID output alias (older saves may lack one).
      this.migrate();
      // Saves from before first run existed were set up by hand, and every match then was Valorant.
      if (!saved.onboarding) {
        this.data.onboarding = { done: true };
        this.data.setup.game ??= 'valorant';
      }
      return true;
    } catch {
      this.data = before;
      return false;
    }
  }

  /**
   * air.json exists but cannot be read (27 Nov): never start from defaults silently, because the next save would overwrite
   * the producer's data. The bad file is kept beside it, the newest backup that reads is loaded, and the interface says so.
   */
  private recover() {
    const at = this.now();
    const brokenFile = `${this.file}.broken-${stamp(at)}`;
    try { renameSync(this.file, brokenFile); } catch { try { copyFileSync(this.file, brokenFile); } catch { /* keep going */ } }
    for (const b of listBackups(this.backupsDir)) {
      let text: string;
      try { text = readBackup(this.backupsDir, b.name); } catch { continue; }
      if (!this.load(text)) continue;
      try { this.writeFile(this.file, text); } catch { /* the next save writes it */ }
      this.recovered = { from: b.name, fromAt: b.at, at, brokenFile };
      return;
    }
    this.data = defaults();
    this.recovered = { from: null, fromAt: null, at, brokenFile };
  }

  /** The saved copies, newest first. */
  backups(): BackupInfo[] { return listBackups(this.backupsDir); }

  /** Loads one of the backups as the current data. The data as it is now is backed up first, so a restore can be undone. */
  restoreBackup(name: string) {
    const text = readBackup(this.backupsDir, name);
    const before = this.data;
    if (!this.load(text)) throw new Error('That backup cannot be read.');
    const after = this.data;
    this.data = before;
    this.save(true);
    this.data = after;
    this.save();
  }

  /** Called after every save (the auto-backup folder follows it). */
  onSaved(fn: () => void) { this.saved.add(fn); return () => void this.saved.delete(fn); }

  /** Brings an older save up to the current scene model, keeping what the producer chose. */
  private migrate() {
    if (this.data.showTemplates !== undefined) this.data.showTemplates = loadShowTemplates(this.data.showTemplates);
    const setup = this.data.setup;
    const known = new Map((setup.screens ?? []).map((x) => [x.id, x]));
    setup.screens = DEFAULT_SCREENS.map((def) => {
      const old = known.get(def.id);
      return { ...def, hosted: def.hosted, outputId: /^[0-9a-f-]{36}$/i.test(old?.outputId ?? '') ? old!.outputId : randomUUID(), enabled: old?.enabled ?? def.enabled, frame: old?.frame ?? { ...def.frame }, title: old?.title ?? def.title };
    });
    // Your own graphics are hosted screens too (shown by the full-screen host, never their own OBS source).
    setup.screens.push(...(this.data.ownGraphics ?? []).map((g) => ownScreen(g, known.get(ownScreenId(g.id))?.enabled ?? false)));
    setup.obs = { host: setup.obs?.host ?? '127.0.0.1', port: setup.obs?.port ?? 4455, stinger: setup.obs?.stinger ?? null };
    if (!this.data.owned || typeof this.data.owned !== 'object' || !('scenes' in this.data.owned)) this.data.owned = emptyOwned();
    // Valorant draws its own killfeed, observer card and minimap; Air no longer offers them.
    for (const k of ['killfeed', 'observed', 'minimap']) delete setup.hud[k];
    // Match v2: game, lineups, event and sponsors live on the match (they used to be production-wide).
    type Legacy = Match & { casters?: Array<{ name: string; handle: string }>; event?: { name: string; stage: string }; sponsors?: string[] };
    const matches = (this.data.matches ?? []) as Legacy[];
    for (const old of matches) {
      old.game ??= 'valorant';
      old.theme ??= setup.package ?? 'broadcast';
      if (!old.eventId) {
        old.event ??= { name: old.source?.tournament || setup.brand?.eventName || '', stage: setup.brand?.stage ?? '' };
        old.sponsors ??= [...(setup.sponsors ?? [])];
      }
      old.players ??= [0, 1].map((t) => (old.source?.lineups?.[t] ?? []).map((name) => ({ id: randomUUID(), name, realName: '', gameId: '', photo: '' }))) as Match['players'];
    }
    // 17 Nov: an Esportra PUUID kept where the Riot ID goes moves to `puuid`, so screens show the Riot ID again.
    for (const m of matches) for (const team of m.players ?? []) for (const p of team) splitRiot(p);
    for (const p of this.data.players ?? []) splitRiot(p);
    // Match v3: talent and sponsors belong to events; a match switches the ones it does not use off.
    this.data.events = migrateToEvents(matches, Array.isArray(this.data.events) ? this.data.events : [], setup.name || 'My event');
    for (const e of this.data.events) {
      e.accent ??= DEFAULT_ACCENT;
      e.stages ??= [];
      e.talent ??= [];
      e.sponsors ??= [];
    }
    for (const m of matches) {
      m.stage ??= '';
      m.talentOff ??= [];
      m.sponsorsOff ??= [];
    }
    // Teams/Players (12 Nov): every match's teams and players are kept in one place; a match follows them.
    const lib = { teams: this.data.teams ?? [], players: this.data.players ?? [] };
    for (const m of matches) if (!m.teamIds) linkMatch(m, lib);
    this.data.teams = lib.teams;
    this.data.players = lib.players;
  }

  /** Writes air.json (flushed to disk before it replaces the old file) and, at most every 30 s, a backup of it. */
  save(forceBackup = false) {
    const text = JSON.stringify(this.data, null, 1);
    this.writeFile(this.file, text);
    const now = this.now();
    if (forceBackup || now - this.lastBackupAt >= BACKUP_EVERY_MS) {
      try {
        writeBackup(this.backupsDir, text, now);
        this.lastBackupAt = now;
      } catch { /* a backup that cannot be written never stops a save */ }
    }
    for (const fn of this.saved) { try { fn(); } catch { /* a listener never stops a save */ } }
  }
}
