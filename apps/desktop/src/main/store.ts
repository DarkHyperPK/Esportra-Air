// Air's saved settings: the tournament setup, matches, OBS address and which OBS scenes Air owns.
// Secrets (engine key, OBS password) are kept separately, encrypted by the OS (see secrets.ts).

import { loadShowTemplates } from './show-templates.ts';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
  owned: Owned;
  enginePort: number;
  /** The producer's rundown rows, per match (older saves hold edits and are migrated). Whether autopilot is on is never saved. */
  rundown?: Record<string, SavedRundown>;
  /** The producer's show templates (16 Nov), and which one each match's show was last set from. */
  showTemplates?: import('../shared/show-templates.ts').ShowTemplate[];
  showTemplateOf?: Record<string, string>;
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

export class Store {
  data: Saved;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.data = defaults();
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<Saved>;
      if (saved.version === 1) this.data = { ...defaults(), ...saved, setup: { ...defaultSetup(), ...saved.setup } as Setup };
      // Every screen needs a UUID output alias (older saves may lack one).
      this.migrate();
      // Saves from before first run existed were set up by hand, and every match then was Valorant.
      if (saved.version === 1 && !saved.onboarding) {
        this.data.onboarding = { done: true };
        this.data.setup.game ??= 'valorant';
      }
    } catch {
      // First run, or an unreadable file: start from defaults (the old file is overwritten on save).
    }
  }

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

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.file);
  }
}
