// The production model: one setup, the selected match, and everything that serves it.
// Pushes match and setup to the engine, points outputs and capture at the match's room, runs the
// manual triggers, and builds the snapshot the interface renders (including the Check list).

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { BANNER_THEMES, type CheckItem, type CorrectionCall, type Match, type LayerRow, type MonitorFrame, type PollInput, type SceneStatus, type QuickMatchInput, type NewMatchInput, type Setup, type Snapshot, type Team } from '../shared/api.ts';
import type { EngineClient, EngineStatus } from './engine-client.ts';
import type { EngineSupervisor } from './engine-supervisor.ts';
import type { GepBridge } from '../../../../packages/capture/src/gep.ts';
import type { ObsLink } from './obs.ts';
import type { BuildScene, BuildSlot } from './scene-build.ts';
import { SCENE_KEYS, SCENES, legacySourceName, sourceName, type SlotId } from '../shared/scenes.ts';
import { AUTO_LAYERS, GAME_DRAWS, LAYER_DEFS, SETUP_LAYER_KEYS, defaultMode, type LayerMode } from '../shared/layers.ts';
import { EventLog } from './event-log.ts';
import { Autopilot } from './autopilot/autopilot.ts';
import { mapComplete, withScores, type GameEvent } from './autopilot/show-runner.ts';
import { CaptureStats } from './capture-stats.ts';
import { devicesView } from '../shared/devices.ts';
import { DEFAULT_MOMENTS, rebind, validMoments } from '../shared/keymap.ts';
import { gameName, gameOf, type GameId, type Profile } from '../shared/games.ts';
import { LIBRARY_ROOM } from '../shared/library.ts';
import { lookOf, validLook } from '../shared/look.ts';
import { BRAND_KEYS, graphicStyle, validBrand, validTemplate, DEFAULT_BRAND, type BrandKit, type Template } from '../shared/templates.ts';
import { HUD_ROW } from '../shared/autopilot.ts';
import { join } from 'node:path';
import { ArtCache, type ArtStatus } from './art-cache.ts';
import { Rehearsal } from './rehearsal.ts';
import type { EsportraAccount } from './esportra.ts';
import { JoinHost } from './join.ts';
import type { IngestClient } from '../../../../packages/capture/src/ingest.ts';
import { LinkClient } from '../../../../packages/capture/src/link.ts';
import { wsIngest } from './ws-ingest.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';
import type { PcMode, PcRole } from '../shared/join.ts';
import { signedOut } from '../shared/esportra.ts';
import { randomBytes } from 'node:crypto';
import type { CamsView } from '../shared/api.ts';
import type { Preset, RowInput } from '../shared/autopilot.ts';
import type { Store } from './store.ts';
import { CompanionHost } from './companion.ts';
import { presetRows, rundownScreens } from './autopilot/rundown.ts';
import { deleteTeam, linkMatch, pickTeam, pushMatch, refreshMatch, setLineup, validPlayer, validTeam } from './team-library.ts';
import type { LibPlayer, LibTeam, Library } from '../shared/api.ts';
import { CONTROL_MODES, companionValues, type ControlMode } from '../shared/companion.ts';
import { ROLE_NAME } from '../shared/model.ts';
import { HEX, IMAGE, text } from './validate.ts';
import { cameraLinkUrl, cameraViewUrl, type EventInfo, type EventPatch, type SponsorInput, type TalentInput } from '../shared/model.ts';
import type { ApiMethod, MatchPatch } from '../shared/api.ts';
import { GlobalKeys, type ShortcutRegistry } from './global-keys.ts';
import { applyEventPatch, engineConfig, newEvent, onAir, renewTalentLink, upsertSponsor, upsertTalent, validOff } from './event-model.ts';

export interface ProductionDeps {
  store: Store;
  engine: Pick<EngineSupervisor, 'state' | 'error' | 'reattached' | 'status' | 'port' | 'on' | 'dataDir' | 'hudRoot'> & { client: EngineClient };
  obs: ObsLink;
  capture: { state: GepBridge['state']; reason: string | null; start(): void; stop(): void; on(event: 'change', listener: () => void): unknown; role?: PcRole; setRole?(role: PcRole): void };
  /** Encrypted small secrets (the join code). Without it they last only for this run. */
  secrets?: Pick<Secrets, 'get' | 'set'>;
  /** Sends this PC's game data to a producer's Air, when this PC only captures. */
  linkIngest?: IngestClient;
  /** Converts an uploaded image to PNG (Electron's nativeImage in the app). Without it only PNG is accepted. */
  toPng?: (bytes: Buffer) => Buffer | null;
  /** Overrides for tests. */
  lanAddresses?: () => string[];
  artFetch?: typeof fetch;
  /** Where agent and map pictures are downloaded from (tests use a stand-in). */
  artOrigin?: string;
  ingest: Pick<IngestClient, 'target'>;
  /** What the capture delivers; the app records every game message here. */
  stats?: CaptureStats;
  /** The producer's Esportra account; absent in tests that do not need it. */
  esportra?: EsportraAccount;
  version: string;
  now?: () => number;
  /** Fixed Companion port (tests). */
  companionPort?: number;
}

const COLORS = ['#4fd3ea', '#e0445e'];

const GENERIC = new Set(['TEAM', 'THE', 'ESPORTS', 'GAMING', 'CLUB', 'GG']);

/** A short scorebug tag: "Team Alpha" → ALP, "Paper Rex" → PR, "Fnatic" → FNA. */
export function tagFor(name: string) {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const meaningful = words.filter((w) => !GENERIC.has(w));
  const use = meaningful.length ? meaningful : words;
  const tag = use.length > 1 ? use.map((w) => w[0]).join('').slice(0, 3) : (use[0] ?? '').slice(0, 3);
  return tag.length >= 2 ? tag : (tag + 'TM').slice(0, 2);
}

/** Tags for both teams, made distinct if they would collide. */
export function tagsFor(a: string, b: string): [string, string] {
  const first = tagFor(a);
  let second = tagFor(b);
  if (second === first) {
    const letters = b.toUpperCase().replace(/[^A-Z0-9]/g, '');
    second = letters.length >= 3 ? letters[0]! + letters[letters.length - 2]! + letters[letters.length - 1]! : `${second.slice(0, 2)}2`;
    if (second === first) second = `${first.slice(0, 2)}2`;
  }
  return [first, second];
}

const RIOT_ID = /^[^#<>\x00-\x1f]{3,16}#[A-Za-z0-9]{2,5}$/;

/** Two lineups of up to seven players each, plain text, optional Riot ID and photo. */
/** Two teams: name, tag, colour and logo. */
export function validTeams(input: unknown): [Team, Team] {
  if (!Array.isArray(input) || input.length !== 2) throw new Error('A match has two teams.');
  const teams = input.map((t: any, i: number) => {
    const label = `Team ${i ? 'B' : 'A'}`;
    const name = text(t?.name, 40, `${label} name`);
    const tag = typeof t?.tag === 'string' && t.tag.trim() ? text(t.tag.toUpperCase(), 5, `${label} tag`) : tagFor(name);
    const color = typeof t?.color === 'string' && HEX.test(t.color) ? t.color.toLowerCase() : COLORS[i]!;
    const logo = typeof t?.logo === 'string' ? t.logo : '';
    if (logo && !IMAGE.test(logo)) throw new Error(`${label}: choose the logo again.`);
    return { name, tag, color, logo };
  }) as [Team, Team];
  if (teams[0].name.toLowerCase() === teams[1].name.toLowerCase()) throw new Error('The two teams need different names.');
  if (teams[0].tag === teams[1].tag) teams[1].tag = tagsFor(teams[0].name, teams[1].name)[1];
  return teams;
}

export function validPlayers(input: unknown): Match['players'] {
  if (!Array.isArray(input) || input.length !== 2) throw new Error('Provide a lineup for each team.');
  return input.map((team, t) => {
    if (!Array.isArray(team) || team.length > 7) throw new Error('A team has up to seven players.');
    return team.map((p: any, i: number) => {
      const label = `Team ${t ? 'B' : 'A'} player ${i + 1}`;
      const gameId = typeof p?.gameId === 'string' ? p.gameId.trim() : '';
      if (gameId && !RIOT_ID.test(gameId)) throw new Error(`${label}: write the in-game name as Name#TAG.`);
      const photo = typeof p?.photo === 'string' ? p.photo : '';
      if (photo && !IMAGE.test(photo)) throw new Error(`${label}: choose the photo again.`);
      return { id: typeof p?.id === 'string' && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : randomUUID(), name: text(p?.name, 32, `${label} name`), realName: p?.realName ? text(p.realName, 60, `${label} real name`) : '', gameId, photo };
    });
  }) as Match['players'];
}

/** Which on-air slot a change fills: a later cued change for the same slot replaces it. */
function cueKey(actions: Array<{ name: string; args: Record<string, unknown> }>): string {
  const last = actions.at(-1)!;
  if (last.name === 'layer.set') return `layer:${String(last.args.layer)}`;
  if (last.name === 'fullscreen.show') return 'fs';
  return last.name.split('.')[0]!;
}

export class Production extends EventEmitter {
  private readonly deps: ProductionDeps;
  private room: any = null;
  private roomV = -1;
  readonly log: EventLog;
  readonly autopilot: Autopilot;
  readonly stats: CaptureStats;
  readonly art: ArtCache;
  readonly rehearsal: Rehearsal;
  readonly joinHost: JoinHost;
  readonly link: LinkClient;
  readonly companion: CompanionHost;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitorBusy = false;
  private globalKeys: GlobalKeys | null = null;
  private keysListening = false;
  private eventChain: Promise<void> = Promise.resolve();
  /** The match whose map end was just handled; cleared when a round is won (a new map has started). */
  private mapEndSeen: string | null = null;

  constructor(deps: ProductionDeps) {
    super();
    this.deps = deps;
    this.stats = deps.stats ?? new CaptureStats();
    this.art = new ArtCache({ catalogue: join(deps.engine.hudRoot, 'core', 'catalog.js'), dir: join(deps.engine.dataDir, 'art'), fetch: deps.artFetch, ...(deps.artOrigin ? { origin: deps.artOrigin } : {}) });
    this.art.on('change', () => this.emit('change'));
    this.rehearsal = new Rehearsal({
      client: () => deps.engine.client, store: deps.store, match: () => this.match, screens: () => this.setup.screens,
      seed: (room) => this.seedSample(room, { banner: false, firstMap: true }), feedLive: () => deps.capture.state === 'live', changed: () => this.emit('change'),
    });
    const memory = new Map<string, string>();
    const secrets = deps.secrets ?? { get: (k: string) => memory.get(k) ?? null, set: (k: string, v: string | null) => void (v === null ? memory.delete(k) : memory.set(k, v)) };
    this.joinHost = new JoinHost({ store: deps.store, secrets, client: () => deps.engine.client, matchCode: () => this.match?.code ?? null, changed: () => this.emit('change'), addresses: deps.lanAddresses });
    this.link = new LinkClient({
      settings: { read: () => deps.store.data.link ?? null, write: (v) => { if (v) deps.store.data.link = v; else delete deps.store.data.link; deps.store.save(); } },
      secrets, ingest: deps.linkIngest ?? wsIngest(), name: () => hostname(), changed: () => this.emit('change'),
      capture: { get role() { return deps.capture.role ?? 'observer'; }, setRole: (r) => deps.capture.setRole?.(r), get state() { return deps.capture.state; } },
    });
    const changed = () => this.emit('change');
    deps.engine.on('change', changed);
    deps.engine.on('status', () => void this.readRoom());
    // A restarted engine has the saved state; re-send outputs and context so nothing drifts.
    deps.engine.on('restarted', () => {
      this.noteRecovery();
      void this.syncEngine().catch(() => {});
    });
    deps.obs.on('change', changed);
    this.log = new EventLog({ nameOf: (t, i) => this.room?.players?.[t]?.[i]?.name || `P${i + 1}`, onChange: changed, onEvent: (event) => {
      // One at a time, in order: a round or map event first reads the room's score.
      this.eventChain = this.eventChain.then(() => this.onEngineEvent(event)).catch(() => {});
    } });
    this.autopilot = new Autopilot({
      store: deps.store, match: () => this.match, screens: () => this.setup.screens,
      showGraphic: async (id, transition, style, template) => {
        if (transition === 'stinger') {
          await this.act('stinger.play', {}, false);
          await new Promise((r) => setTimeout(r, 450));
        }
        await this.fullscreen(id, id !== null, true, style, template);
      },
      templates: () => this.templates,
      showing: () => this.room?.airFullscreen ?? null,
      log: (line) => this.log.add(line), changed,
      rowsChanged: () => void this.syncEngine().catch(() => {}),
    });
    this.companion = new CompanionHost({
      store: deps.store, secrets, mode: () => this.control, port: deps.companionPort, addresses: deps.lanAddresses, changed,
      hello: () => this.companionHello(),
      values: () => companionValues(this.room, {
        onAir: this.room?.airFullscreen ? this.screenTitle(this.room.airFullscreen) : 'Game',
        cued: this.pending.length, next: this.autopilot.view().next?.name ?? '',
      }),
      watch: () => ({
        onAir: this.room?.airFullscreen ?? null, pause: !!this.room?.airPause,
        dataPaused: !!this.deps.engine.status?.rooms.find((r) => r.match === this.match?.code.toUpperCase())?.feedPaused,
      }),
      act: (name, args) => this.companionAct(name, args),
    });
    this.on('change', () => this.companion.onChange());
    // Companion is parked (12 Nov): the choice is not offered, so an earlier choice goes back to Air.
    if (deps.store.data.control && deps.store.data.control !== 'air') deps.store.data.control = 'air';
    void this.companion.sync();
    deps.obs.watchSlots(SCENE_KEYS.flatMap((key) => SCENES[key].slots.map((slot) => slot.scene)));
    deps.capture.on('change', changed);
    // The Capture page's sparklines move once a second while data is flowing.
    const tick = setInterval(() => deps.capture.state === 'live' && this.emit('change'), 1000);
    tick.unref?.();
  }

  // ── recovery after a restart ──

  private recoveredAt: number | null = null;

  /** Air reopened on a running engine, or the engine came back: tell the producer, once, in plain words. */
  noteRecovery() {
    if (!this.match) return;
    this.recoveredAt = Date.now();
    this.log.add('Recovered after a restart');
    this.emit('change');
  }

  /** Called once at start-up: Air re-attached to a graphics engine that kept running. */
  checkRecovery() {
    if (this.deps.engine.reattached) this.noteRecovery();
  }

  dismissRecovery() {
    this.recoveredAt = null;
    this.emit('change');
  }

  private recoveryText(): string | null {
    if (this.recoveredAt === null) return null;
    const at = this.autopilot.view().resumeAt;
    return `Recovered after a restart. Graphics kept the last data${at ? `; autopilot is ready to resume at ${at}` : ''}.`;
  }

  get setup() {
    return this.deps.store.data.setup;
  }

  // ── first run and the game ──

  /** Why the game cannot change now: a show is live on this PC. */
  gameLocked(): string | null {
    const capturing = this.deps.capture.state === 'live' || this.deps.capture.state === 'waiting';
    const testRound = !!this.match && !!this.deps.engine.status?.rooms.find((r) => r.match === this.match!.code.toUpperCase())?.testRound?.running;
    return capturing || testRound ? 'Switch game after the show: game data or a test round is running.' : null;
  }

  /** The chosen game's module; refuses when none is chosen or it cannot be produced. */
  private requireGame() {
    const game = gameOf(this.setup.game);
    if (!game) throw new Error('Choose a game first.');
    if (!game.available) throw new Error(`${game.name} is coming later. Choose another game from the top bar.`);
    return game;
  }

  /** Switching match changes every graphic on air; not while a show is running. */
  private assertCanSwitch() {
    if (this.gameLocked()) throw new Error('Stop game data or the test round before switching matches.');
  }

  async chooseGame(id: GameId) {
    const game = gameOf(id);
    if (!game) throw new Error('Choose one of the games in the list.');
    if (!game.available) throw new Error(`${game.name} is coming later.`);
    if (this.setup.game === id) return;
    const locked = this.gameLocked();
    if (locked) throw new Error(locked);
    this.rehearsal.stop();
    this.setup.game = id;
    // The selected match belongs to the old game; its graphics leave the screens.
    const data = this.deps.store.data;
    if (this.match && this.match.game !== id) data.selectedMatchId = null;
    if (this.setup.profile === 'player-pcs' && !game.playerPcData) this.setup.profile = 'observer';
    this.save();
    await this.syncEngine();
  }

  // ── keyboard (per PC) ──

  async setKey(actionId: string, key: string | null, swap = false) {
    this.deps.store.data.keymap = rebind(this.deps.store.data.keymap, String(actionId), key === null ? null : String(key), swap === true);
    this.applyKeys();
    this.save();
  }

  async resetKeys() {
    this.deps.store.data.keymap = {};
    this.applyKeys();
    this.save();
  }

  /** Keys over the game: the app gives Electron's globalShortcut, the dev host a stand-in. */
  attachKeys(registry: ShortcutRegistry, call: (method: ApiMethod, args: unknown[]) => Promise<unknown>) {
    this.globalKeys = new GlobalKeys(registry, () => this.snapshot(), call, (message) => this.emit('notice', message));
    this.applyKeys();
  }

  setGlobalKeys(on: boolean) {
    this.deps.store.data.globalKeys = on === true;
    this.applyKeys();
    this.save();
  }

  /** While Settings waits for a new key, nothing is held over the game, so the key reaches Air. */
  holdGlobalKeys(listening: boolean) {
    this.keysListening = listening === true;
    this.applyKeys();
  }

  private applyKeys() {
    const status = this.globalKeys?.apply(this.deps.store.data.keymap, this.deps.store.data.globalKeys !== false && !this.keysListening);
    if (status && this.keysListening) status.on = this.deps.store.data.globalKeys !== false;
  }

  stopKeys() {
    this.globalKeys?.stop();
  }

  async setMoments(ids: string[]) {
    this.deps.store.data.moments = validMoments(ids);
    this.save();
  }

  async chooseProfile(profile: Profile) {
    if (!['one-pc', 'observer', 'player-pcs'].includes(profile)) throw new Error('Choose one of the setups.');
    const game = this.requireGame();
    if (profile === 'player-pcs' && !game.playerPcData) throw new Error(`${game.name} gets nothing extra from player PCs. Choose another setup.`);
    this.setup.profile = profile;
    this.save();
  }

  async finishOnboarding() {
    this.requireGame();
    this.deps.store.data.onboarding = { done: true };
    this.save();
  }

  async restartOnboarding() {
    this.deps.store.data.onboarding = { done: false };
    this.save();
  }
  get match(): Match | null {
    const { matches, selectedMatchId } = this.deps.store.data;
    return matches.find((m) => m.id === selectedMatchId) ?? null;
  }
  private get client() {
    return this.deps.engine.client;
  }
  private save() {
    this.deps.store.save();
    this.emit('change');
  }

  /** Outputs follow the selected match; the engine is told the match context and HUD settings. */
  /** Only what is in the selected match's Rundown goes to OBS. */
  private applyRundownScreens() {
    // Starting soon, Break and Ending: the classic screen or the frame with two see-through windows.
    const breakPage = this.breakLook() === 'frame' ? 'break-frame' : 'holding';
    if (this.setup.screens.some((x) => x.id === 'holding' && x.overlay !== breakPage)) {
      this.setup.screens = this.setup.screens.map((x) => (x.id === 'holding' ? { ...x, overlay: breakPage } : x));
      this.deps.store.save();
    }
    if (!this.match) return;
    const wanted = rundownScreens(this.autopilot.rows());
    if (this.setup.screens.every((x) => x.enabled === wanted.has(x.id))) return;
    this.setup.screens = this.setup.screens.map((x) => ({ ...x, enabled: wanted.has(x.id) }));
    this.deps.store.save();
  }

  async syncEngine() {
    this.applyRundownScreens();
    const match = this.match;
    const setup = this.setup;
    const outputs = setup.screens.filter((s) => s.enabled && !s.hosted).map((s) => ({ id: s.outputId, overlay: s.overlay, matchCode: match?.code ?? 'MAIN' }));
    await this.client.put('/control/outputs', { outputs });
    this.deps.ingest.target(match ? this.client.ingestUrl(match.code) : null);
    if (!match) {
      this.log.target(null);
      return;
    }
    // A test round is on air and hands back the room exactly as it was; send the match once it ends.
    if (this.deps.engine.status?.rooms.find((r) => r.match === match.code.toUpperCase())?.testRound?.running) {
      this.syncAfterTest = true;
      return;
    }
    this.syncAfterTest = false;
    const code = encodeURIComponent(match.code);
    await this.client.post(`/api/${code}/config`, {
      airContext: { showId: setup.id, matchId: match.id, source: match.kind },
      teams: match.teams,
      ...engineConfig(match, this.eventOf(match), setup.name),
      layout: { bannerTheme: match.theme ?? setup.package, minimap: setup.minimap, timerWindow: this.hudTemplate()?.timer ?? lookOf(setup.look).timer, pauseStyle: lookOf(setup.look).pause },
      show: { eventBug: setup.hud.eventBug !== false },
    });
    // Templates: the saved looks, the event's brand kit and the HUD's look.
    await this.client.patch(`/api/${code}`, this.templateState(match));
    const managed = new Set<string>(SETUP_LAYER_KEYS);
    const plain = Object.fromEntries(Object.entries(setup.hud).filter(([k]) => !managed.has(k) && !(GAME_DRAWS as readonly string[]).includes(k)));
    if (Object.keys(plain).length) await this.client.patch(`/api/${code}`, { show: plain });
    // Today's schedule: the event's matches on this match's day.
    await this.client.patch(`/api/${code}`, { schedule: this.scheduleOf(match) });
    // The lineups: the engine puts display names and photos on the players the game reports.
    await this.client.patch(`/api/${code}`, { airRoster: match.players.map((team) => team.map((p) => ({ gameId: p.gameId, name: p.name, photo: p.photo }))) });
    // Setup decides where each layer starts; after that the console owns them for the match.
    await this.act('layers.init', { modes: this.initialModes() }, false);
    await this.pushCams();
    await this.joinHost.sync();
    this.log.target(this.client.observeUrl(match.code));
    this.roomV = -1;
    await this.readRoom();
  }

  /** Every console layer's starting mode: Setup's choice, else the layer's default. */
  private initialModes(): Record<string, LayerMode> {
    const hud = this.setup.hud;
    const modes: Record<string, LayerMode> = {};
    for (const def of LAYER_DEFS.filter((d) => !d.id.startsWith('fs:'))) {
      const fromSetup = (SETUP_LAYER_KEYS as readonly string[]).includes(def.id);
      modes[def.id] = fromSetup ? (hud[def.id] === false ? 'off' : defaultMode(def.id)) : AUTO_LAYERS.has(def.id) ? 'auto' : 'off';
    }
    for (const id of GAME_DRAWS) modes[id] = 'off';
    return modes;
  }

  /** Runs a named engine action for the selected match. */
  private async act(name: string, args: Record<string, unknown>, refresh = true) {
    const match = this.requireMatch();
    await this.client.post('/control/action', { match: match.code, name, args });
    if (refresh) {
      this.roomV = -1;
      await this.readRoom();
    }
  }

  private syncAfterTest = false;

  private async readRoom() {
    const match = this.match;
    if (!match || this.deps.engine.state !== 'running') return;
    const room = this.deps.engine.status?.rooms.find((r) => r.match === match.code.toUpperCase());
    if (this.syncAfterTest && room && !room.testRound?.running) {
      this.syncAfterTest = false;
      void this.syncEngine().catch(() => {});
    }
    if (room && room.v === this.roomV) {
      this.emit('change');
      return;
    }
    try {
      const data = await this.client.get<{ v: number; state: any }>(`/api/${encodeURIComponent(match.code)}`);
      this.room = data.state;
      this.roomV = data.v;
      this.scheduleCueSync();
      this.autopilot.onRoom(this.room);
      this.finishIfWon(match);
    } catch {
      // Engine unavailable; the supervisor reports it.
    }
    this.emit('change');
  }

  // ── matches ──

  async createQuickMatch(input: QuickMatchInput) {
    this.assertCanSwitch();
    const names = [text(input.teamA, 40, 'Team A'), text(input.teamB, 40, 'Team B')];
    if (names[0]!.toLowerCase() === names[1]!.toLowerCase()) throw new Error('The two teams need different names.');
    if (![1, 3, 5].includes(input.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
    const id = randomUUID();
    const tags = tagsFor(names[0]!, names[1]!);
    const teams = names.map((name, i) => ({ name, tag: tags[i]!, color: COLORS[i]!, logo: '' })) as [Team, Team];
    const match: Match = {
      id, code: `Q${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, kind: 'quick', title: `${names[0]} vs ${names[1]}`,
      bestOf: input.bestOf, teams, createdAt: (this.deps.now ?? Date.now)(),
      game: this.requireGame().id, players: [[], []], ...this.carryOver(null), ...(input.eventId ? { eventId: this.requireEvent(input.eventId).id } : {}),
    };
    const data = this.deps.store.data;
    linkMatch(match, this.library);
    data.matches = [match, ...data.matches].slice(0, 50);
    data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
  }

  /** The New match wizard: game, teams, lineups, talent, event and sponsors in one go. */
  async createMatch(input: NewMatchInput) {
    this.assertCanSwitch();
    const game = this.requireGame();
    if (![1, 3, 5].includes(input.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
    const teams = validTeams(input.teams);
    const players = validPlayers(input.players ?? [[], []]);
    const carried = this.carryOver(null);
    const event = input.eventId ? this.requireEvent(input.eventId) : this.eventOf({ eventId: carried.eventId } as Match) ?? this.requireEvent(carried.eventId);
    const id = randomUUID();
    const match: Match = {
      id, code: `Q${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, kind: 'quick', title: `${teams[0].name} vs ${teams[1].name}`,
      bestOf: input.bestOf, teams, createdAt: (this.deps.now ?? Date.now)(), game: game.id, players,
      eventId: event.id,
      stage: input.stage ? text(input.stage, 40, 'Stage') : event.id === carried.eventId ? carried.stage : '',
      talentOff: input.talentOff ? validOff(input.talentOff, event.talent, 'Talent') : [],
      sponsorsOff: input.sponsorsOff ? validOff(input.sponsorsOff, event.sponsors, 'Sponsors') : [],
      theme: input.theme && BANNER_THEMES.includes(input.theme) ? input.theme : carried.theme,
    };
    const data = this.deps.store.data;
    linkMatch(match, this.library);
    data.matches = [match, ...data.matches].slice(0, 50);
    // The wizard is a guided setup: its match starts from the Standard rundown (quick and Esportra matches start empty).
    (data.rundown ??= {})[id] = { rows: presetRows(input.template ?? 'standard', input.bestOf), startedFrom: input.template ?? 'standard' };
    data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
    this.log.add(`Match created · ${match.title}`);
  }

  // ── HUD library ──

  /**
   * Seeds the library's sample room: the sample match with this match's teams, logos, players and
   * event, every graphic switched on, and a banner on screen so banner styles can be compared.
   */
  async librarySeed() {
    await this.seedSample(LIBRARY_ROOM, { banner: true });
  }

  /** The sample match in an ephemeral room, dressed as the selected match. */
  private async seedSample(code: string, options: { banner: boolean; firstMap?: boolean }) {
    const room = `/api/${code}`;
    await this.client.put(`${room}?preset=default`, {});
    const { state } = await this.client.get<{ state: any }>(room);
    const m = this.match;
    if (m) {
      state.teams = state.teams.map((t: any, i: number) => ({ ...t, name: m.teams[i]!.name.toUpperCase(), tag: m.teams[i]!.tag, color: m.teams[i]!.color, logo: m.teams[i]!.logo }));
      state.players = state.players.map((team: any[], t: number) => team.map((p: any, i: number) => {
        const mine = m.players[t]?.[i];
        return mine ? { ...p, name: mine.name.toUpperCase(), photo: mine.photo } : p;
      }));
      const air = engineConfig(m, this.eventOf(m), this.setup.name);
      if (this.eventOf(m)) state.event = { ...state.event, ...air.event, name: air.event.name.toUpperCase(), stage: (air.event.stage || state.event.stage).toUpperCase() };
      if (air.casters.some((c) => c.name)) state.casters = air.casters;
      if (air.sponsors.length) state.sponsors = air.sponsors;
    }
    state.layout = { ...(state.layout ?? {}), bannerTheme: m?.theme ?? this.setup.package, timerWindow: this.hudTemplate()?.timer ?? lookOf(this.setup.look).timer };
    Object.assign(state, this.templateState(m));
    // A rehearsal is map 1 of this match's own best-of, with nothing played yet.
    if (options.firstMap && m) {
      const pool = ['LOTUS', 'HAVEN', 'SUNSET', 'ASCENT', 'BIND'];
      state.event = { ...state.event, bestOf: m.bestOf };
      state.map = { ...state.map, name: pool[0], number: 1 };
      state.teams = state.teams.map((t: any) => ({ ...t, series: 0, score: 0 }));
      state.series = pool.slice(0, m.bestOf).map((map, k) => ({ map, pick: k === m.bestOf - 1 ? -1 : k % 2, score: [0, 0], winner: null }));
    }
    if (options.banner) state.banner = { type: 'ace', team: 0, player: 0, text: '', method: '', ts: Date.now(), hold: 3_600_000 };
    state.show = { ...state.show, killfeed: false, observed: false, minimap: false };
    state.airFullscreen = null;
    await this.client.put(room, state);
  }

  async libraryPlay(on: boolean) {
    await this.client.post('/control/test-round', { match: LIBRARY_ROOM, action: on ? 'start' : 'stop', speed: 2 });
  }

  /** Stores an image (logo or player photo) in the engine and returns its URL. JPEG and WebP are converted to PNG. */
  async uploadImage(dataUrl: string): Promise<string> {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) throw new Error('Choose a PNG, JPEG or WebP image.');
    const raw = Buffer.from(m[2]!, 'base64');
    if (raw.length > 6_000_000) throw new Error('That image is larger than 6 MB. Choose a smaller one.');
    const png = this.deps.toPng ? this.deps.toPng(raw) : m[1] === 'png' ? raw : null;
    if (!png) throw new Error('This build can only read PNG images.');
    const id = randomUUID();
    await this.client.putBytes(`/control/assets/${id}`, png);
    return `/air-assets/${id}`;
  }

  async selectMatch(id: string) {
    if (!this.deps.store.data.matches.some((m) => m.id === id)) throw new Error('That match is no longer available.');
    if (this.deps.store.data.selectedMatchId !== id) this.assertCanSwitch();
    if (this.deps.store.data.selectedMatchId !== id) this.rehearsal.stop();
    this.deps.store.data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
  }

  /** A new match starts with the event and sponsors of the latest match (of the same tournament, when there is one). */
  private carryOver(tournamentId: string | null, tournamentName = ''): Pick<Match, 'eventId' | 'stage' | 'talentOff' | 'sponsorsOff' | 'theme'> {
    const data = this.deps.store.data;
    const list = data.matches;
    const from = (tournamentId && list.find((m) => m.source?.tournamentId === tournamentId)) || (!tournamentId ? list[0] : undefined);
    let event = tournamentId ? data.events.find((e) => e.tournamentId === tournamentId) : from ? this.eventOf(from) : data.events[0];
    if (!event) {
      event = newEvent(tournamentName || this.setup.name || 'My event', tournamentId);
      data.events = [...data.events, event];
    }
    return { eventId: event.id, stage: from?.stage ?? '', talentOff: [], sponsorsOff: [], theme: from?.theme ?? this.setup.package ?? 'broadcast' };
  }

  /**
   * A game event from the engine. Rounds won and map ends carry the room's score, so halftime is the
   * 12th round played and a map end is a finished map (13+ and ahead), not a remake or a crash.
   */
  private async onEngineEvent(raw: GameEvent) {
    let event = raw;
    const match = this.match;
    let state: any = null;
    if (match && (raw.type === 'round.won' || raw.type === 'match.end')) {
      state = await this.client.get<{ state: any }>(`/api/${encodeURIComponent(match.code)}`).then((d) => d.state).catch(() => null);
      event = withScores(raw, state?.teams);
    }
    if (event.type === 'round.won') this.mapEndSeen = null;
    this.autopilot.onGameEvent(event);
    this.companion.onEngineEvent(event);
    if (match && event.type === 'match.end' && state && this.mapEndSeen !== match.id) await this.countMap(match, state, event).catch((e) => this.log.add(`Map result not counted · ${(e as Error).message}`));
  }

  /** A finished map counts in the series from the game: its result on the series graphics, one more win. */
  private async countMap(match: Match, state: any, event: GameEvent) {
    const scores = event.scores as [number, number] | undefined;
    if (!scores) return;
    if (this.deps.engine.status?.rooms.find((r) => r.match === match.code.toUpperCase())?.testRound?.running) return;
    const label = `${scores[0]}–${scores[1]}`;
    if (!mapComplete(scores)) {
      this.log.add(`Map ended at ${label} · not counted as a result`);
      this.emit('notice', `The map ended at ${label}, so Air did not count it as a result. If it was, set it in Fix data.`);
      return;
    }
    // The game can report a map end twice; it counts once until a round of the next map is won.
    this.mapEndSeen = match.id;
    const wins = [0, 1].map((i) => Number(state?.teams?.[i]?.series) || 0);
    const map = wins[0]! + wins[1]! + 1;
    if (map > match.bestOf || Math.max(...wins) > match.bestOf / 2) return;
    // Already counted (the game can report a map end twice). Picked maps are listed beforehand without a winner.
    const done = state?.series?.[map - 1]?.winner;
    if (done === 0 || done === 1) return;
    const winner = scores[0] > scores[1] ? 0 : 1;
    wins[winner]!++;
    const fix = (field: string, value: unknown) => this.client.post(`/api/${encodeURIComponent(match.code)}/display-fixes`, { action: 'set', field, value, until: 'cleared', reason: `Map ${map} from the game` });
    await fix('map_result', scores.map((score) => ({ mapIndex: map, score })));
    await fix('series', wins);
    this.log.add(`Map ${map} · ${match.teams[winner]?.name ?? 'Team'} win ${label} · series ${wins[0]}–${wins[1]}`);
    this.roomV = -1;
    await this.readRoom();
  }

  /** A team has won the series in the room: the match is finished and keeps its teams from now on. */
  private finishIfWon(match: Match) {
    if (match.finishedAt) return;
    const wins = (this.room?.teams ?? []).map((t: { series?: number }) => Number(t?.series) || 0);
    if (Math.max(0, ...wins) > match.bestOf / 2) {
      match.finishedAt = Date.now();
      this.log.add(`Match finished · ${match.title}`);
      this.save();
    }
  }

  async markFinished(id: string, finished: boolean) {
    const match = this.deps.store.data.matches.find((m) => m.id === id);
    if (!match) throw new Error('That match is no longer available.');
    if (finished) match.finishedAt ??= Date.now();
    else {
      delete match.finishedAt;
      // Reopened: it follows Teams/Players again, from now.
      if (refreshMatch(match, this.library)) match.title = `${match.teams[0].name} vs ${match.teams[1].name}`;
      if (match.id === this.deps.store.data.selectedMatchId) {
        this.save();
        await this.syncEngine();
        return;
      }
    }
    this.save();
  }

  // ── Teams/Players ──

  /** The teams and players matches pick from (kept in the store, edited in place). */
  get library(): Library {
    const data = this.deps.store.data;
    data.teams ??= [];
    data.players ??= [];
    return { get teams() { return data.teams!; }, set teams(v) { data.teams = v; }, get players() { return data.players!; }, set players(v) { data.players = v; } };
  }

  /** After a library change: every match that follows it is brought up to date; the one on air is resent. */
  private async libraryChanged() {
    let selected = false;
    for (const m of this.deps.store.data.matches) {
      if (refreshMatch(m, this.library)) {
        m.title = `${m.teams[0].name} vs ${m.teams[1].name}`;
        if (m.id === this.deps.store.data.selectedMatchId) selected = true;
      }
    }
    this.save();
    if (selected) await this.syncEngine();
  }

  async saveTeam(input: Partial<LibTeam>) {
    const team = validTeam(input, this.library);
    const lib = this.library;
    lib.teams = lib.teams.some((t) => t.id === team.id) ? lib.teams.map((t) => (t.id === team.id ? team : t)) : [...lib.teams, team];
    await this.libraryChanged();
    return team;
  }

  async removeTeam(id: string) {
    deleteTeam(this.library, String(id));
    await this.libraryChanged();
  }

  async savePlayer(input: Partial<LibPlayer>) {
    const player = validPlayer(input, this.library);
    const lib = this.library;
    lib.players = lib.players.some((p) => p.id === player.id) ? lib.players.map((p) => (p.id === player.id ? player : p)) : [...lib.players, player];
    await this.libraryChanged();
    return player;
  }

  async removePlayer(id: string) {
    const lib = this.library;
    if (!lib.players.some((p) => p.id === id)) throw new Error('That player is already gone.');
    lib.players = lib.players.filter((p) => p.id !== id);
    await this.libraryChanged();
  }

  /** Which team plays on one side of a match; its first five players start. */
  async setMatchTeam(matchId: string, side: number, teamId: string) {
    const match = this.deps.store.data.matches.find((m) => m.id === matchId);
    if (!match) throw new Error('That match is no longer available.');
    if (side !== 0 && side !== 1) throw new Error('Choose side A or B.');
    pickTeam(match, side, String(teamId), this.library);
    match.title = `${match.teams[0].name} vs ${match.teams[1].name}`;
    this.save();
    if (match.id === this.deps.store.data.selectedMatchId) await this.syncEngine();
  }

  /** The players one side plays with, in order (the first five start). */
  async setStarters(matchId: string, side: number, playerIds: string[]) {
    const match = this.deps.store.data.matches.find((m) => m.id === matchId);
    if (!match) throw new Error('That match is no longer available.');
    if (side !== 0 && side !== 1) throw new Error('Choose side A or B.');
    setLineup(match, side, playerIds, this.library);
    this.save();
    if (match.id === this.deps.store.data.selectedMatchId) await this.syncEngine();
  }

  // ── events ──

  eventOf(match: Pick<Match, 'eventId'>): EventInfo | null {
    return this.deps.store.data.events.find((e) => e.id === match.eventId) ?? null;
  }

  /** An event's brand kit (Primary is its colour). A broken saved kit falls back to the defaults. */
  brandOf(event: EventInfo | null): BrandKit {
    if (!event) return { ...DEFAULT_BRAND };
    try { return validBrand(event.brand, event.accent); } catch { return { ...DEFAULT_BRAND, primary: event.accent }; }
  }

  /** Saves an event's brand kit; Primary becomes the event colour. */
  async brandSave(eventId: string, kit: Partial<BrandKit>) {
    const event = this.requireEvent(eventId);
    const next = validBrand({ ...this.brandOf(event), ...(kit ?? {}) });
    const { primary, ...rest } = next;
    await this.putEvent({ ...event, accent: primary, brand: rest });
  }

  // ── templates ──

  /** Saved looks (Graphics › Templates). A broken entry in the saved file is skipped, never sent. */
  get templates(): Template[] {
    // Checked once per saved list: every change to templates stores a new array.
    const saved = this.deps.store.data.templates ?? [];
    if (this.checkedTemplates?.from === saved) return this.checkedTemplates.list;
    const out: Template[] = [];
    for (const t of saved) {
      try { out.push(validTemplate(t, t.updatedAt)); } catch { /* skipped */ }
    }
    this.checkedTemplates = { from: saved, list: out };
    return out;
  }
  private checkedTemplates: { from: Template[]; list: Template[] } | null = null;

  /** Adds a template, or saves one (same id). */
  async templateSave(input: unknown) {
    const t = validTemplate(input);
    const data = this.deps.store.data;
    const list = data.templates ?? [];
    const old = list.find((x) => x.id === t.id);
    if (!old && list.length >= 300) throw new Error('Air keeps up to 300 templates. Delete some you no longer use.');
    if (old && old.graphic !== t.graphic) throw new Error('A template stays with its graphic. Use Save as to start one for another graphic.');
    data.templates = old ? list.map((x) => (x.id === t.id ? { ...t, createdAt: old.createdAt } : x)) : [...list, t];
    this.save();
    if (this.match) await this.syncEngine();
  }

  /** Deletes a template; Rundown rows that used it go back to the default look. */
  async templateDelete(id: string) {
    const data = this.deps.store.data;
    if (!(data.templates ?? []).some((t) => t.id === id)) throw new Error('That template is already gone.');
    data.templates = (data.templates ?? []).filter((t) => t.id !== id);
    for (const saved of Object.values(data.rundown ?? {})) {
      if (saved && Array.isArray(saved.rows)) saved.rows = saved.rows.map((r) => (r.template === id ? (({ template: _t, ...rest }) => rest)(r) : r));
    }
    // Steps already built keep the id; a missing template shows the default look.
    this.save();
    if (this.match) await this.syncEngine();
  }

  /** The Break screen's look: the Break row's (frame = over the game), else the production's older setting. */
  private breakLook(): 'classic' | 'frame' {
    const row = this.autopilot.rows().find((r) => r.show === 'holding');
    if (row?.style) return row.style === 'band' ? 'frame' : 'classic';
    return lookOf(this.setup.look).break;
  }

  /** OBS slots this show needs: Break's two windows only with the frame look. */
  private slotWanted(id: string) {
    return !id.startsWith('break') || this.breakLook() === 'frame';
  }

  /** How many saved match rundowns use each template. */
  private templateUse(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const saved of Object.values(this.deps.store.data.rundown ?? {})) {
      const ids = new Set((saved?.rows ?? []).map((r) => r.template).filter((x): x is string => !!x));
      for (const id of ids) out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  }

  /** The look of the in-game HUD: the template on the match's HUD row, if any. */
  private hudTemplate(): Template | null {
    const id = this.autopilot.rows().find((r) => r.show === HUD_ROW)?.template;
    return id ? this.templates.find((t) => t.id === id && t.graphic === 'hud') ?? null : null;
  }

  /** What the graphics need for templates: every saved look, the brand kit and the HUD's look. */
  private templateState(match: Match | null) {
    // Scene pages (Break, Desk) find their own look by graphic: holding|full, holding|band or casters|full.
    // Every key is sent, null when unused: the room merges, so a removed look must be cleared explicitly.
    const pages: Record<string, string | null> = { 'holding|full': null, 'holding|band': null, 'casters|full': null };
    for (const r of this.autopilot.rows()) {
      const t = r.template && (r.show === 'holding' || r.show === 'casters') ? this.templates.find((x) => x.id === r.template && x.graphic.startsWith(`${r.show}|`)) : undefined;
      if (t) pages[t.graphic] = t.id;
    }
    return { airTemplates: this.templates, airBrand: this.brandOf(match ? this.eventOf(match) : null), airHudTemplate: this.hudTemplate()?.id ?? null, airPageTemplates: pages };
  }

  private requireEvent(id: string): EventInfo {
    const event = this.deps.store.data.events.find((e) => e.id === id);
    if (!event) throw new Error('That event is no longer available.');
    return event;
  }

  /** Replaces an event and re-sends the selected match when it uses it. */
  private async putEvent(next: EventInfo) {
    const data = this.deps.store.data;
    data.events = data.events.map((e) => (e.id === next.id ? next : e));
    // A match keeps switch-offs only for people and sponsors the event still has.
    for (const m of data.matches.filter((x) => x.eventId === next.id)) {
      m.talentOff = m.talentOff.filter((id) => next.talent.some((t) => t.id === id));
      m.sponsorsOff = m.sponsorsOff.filter((id) => next.sponsors.some((s) => s.id === id));
    }
    this.save();
    if (this.match?.eventId === next.id) await this.syncEngine();
  }

  async createEvent(name: string) {
    const event = newEvent(text(name, 60, 'Event name'));
    this.deps.store.data.events = [...this.deps.store.data.events, event];
    this.save();
    return event;
  }

  /** Deletes a match from this PC. The match on air cannot be deleted while game data or a test round runs. */
  async deleteMatch(id: string) {
    const data = this.deps.store.data;
    if (!data.matches.some((m) => m.id === id)) throw new Error('That match is already gone.');
    if (data.selectedMatchId === id && this.gameLocked()) throw new Error('This match is live. Stop game data or the test round before deleting it.');
    const event = data.matches.find((m) => m.id === id)!.eventId;
    data.matches = data.matches.filter((m) => m.id !== id);
    if (data.rundown) delete data.rundown[id];
    if (data.autopilotProgress) delete data.autopilotProgress[id];
    if (data.selectedMatchId === id) {
      this.rehearsal.stop();
      data.selectedMatchId = data.matches.find((m) => m.eventId === event)?.id ?? null;
      this.save();
      if (data.selectedMatchId) await this.syncEngine();
      else this.emit('change');
      return;
    }
    this.save();
  }

  /** Deletes an event and every match in it from this PC. */
  async deleteEvent(id: string) {
    const data = this.deps.store.data;
    if (!data.events.some((e) => e.id === id)) throw new Error('That event is already gone.');
    const selected = data.matches.find((m) => m.id === data.selectedMatchId);
    if (selected?.eventId === id && this.gameLocked()) throw new Error('A match of this event is live. Stop game data or the test round first.');
    for (const m of data.matches.filter((x) => x.eventId === id)) {
      if (data.rundown) delete data.rundown[m.id];
      if (data.autopilotProgress) delete data.autopilotProgress[m.id];
    }
    data.matches = data.matches.filter((m) => m.eventId !== id);
    data.events = data.events.filter((e) => e.id !== id);
    if (selected?.eventId === id) {
      this.rehearsal.stop();
      data.selectedMatchId = data.matches[0]?.id ?? null;
      this.save();
      if (data.selectedMatchId) await this.syncEngine();
      else this.emit('change');
      return;
    }
    this.save();
  }

  async updateEvent(id: string, patch: EventPatch) {
    await this.putEvent(applyEventPatch(this.requireEvent(id), patch ?? {}));
  }

  async saveTalent(eventId: string, input: TalentInput) {
    await this.putEvent(upsertTalent(this.requireEvent(eventId), input ?? {}));
  }

  async removeTalent(eventId: string, talentId: string) {
    const event = this.requireEvent(eventId);
    if (!event.talent.some((t) => t.id === talentId)) throw new Error('That person is no longer in this event.');
    await this.putEvent({ ...event, talent: event.talent.filter((t) => t.id !== talentId) });
  }

  async renewTalentLink(eventId: string, talentId: string) {
    await this.putEvent(renewTalentLink(this.requireEvent(eventId), talentId));
  }

  async saveSponsor(eventId: string, input: SponsorInput) {
    await this.putEvent(upsertSponsor(this.requireEvent(eventId), input ?? {}));
  }

  async removeSponsor(eventId: string, sponsorId: string) {
    const event = this.requireEvent(eventId);
    if (!event.sponsors.some((s) => s.id === sponsorId)) throw new Error('That sponsor is no longer in this event.');
    await this.putEvent({ ...event, sponsors: event.sponsors.filter((s) => s.id !== sponsorId) });
  }

  async updateMatch(id: string, patch: MatchPatch) {
    const match = this.deps.store.data.matches.find((m) => m.id === id);
    if (!match) throw new Error('That match is no longer available.');
    if (patch.title !== undefined) match.title = text(patch.title, 80, 'Match title');
    if (patch.eventId !== undefined && patch.eventId !== match.eventId) {
      this.requireEvent(patch.eventId);
      // Switch-offs belong to the old event's people and sponsors.
      Object.assign(match, { eventId: patch.eventId, talentOff: [], sponsorsOff: [] });
    }
    const event = this.eventOf(match);
    if (patch.stage !== undefined) match.stage = patch.stage ? text(patch.stage, 40, 'Stage') : '';
    if (patch.talentOff !== undefined) match.talentOff = validOff(patch.talentOff, event?.talent ?? [], 'Talent');
    if (patch.sponsorsOff !== undefined) match.sponsorsOff = validOff(patch.sponsorsOff, event?.sponsors ?? [], 'Sponsors');
    if (patch.players !== undefined) {
      match.players = validPlayers(patch.players);
      pushMatch(match, this.library);
    }
    if (patch.teams !== undefined) {
      match.teams = validTeams(patch.teams);
      match.title = `${match.teams[0].name} vs ${match.teams[1].name}`;
      pushMatch(match, this.library);
    }
    if (patch.theme !== undefined) {
      if (!BANNER_THEMES.includes(patch.theme)) throw new Error('Choose one of the banner styles.');
      match.theme = patch.theme;
    }
    if (patch.bestOf !== undefined) {
      if (![1, 3, 5].includes(patch.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
      match.bestOf = patch.bestOf;
    }
    this.save();
    if (match.id === this.match?.id) await this.syncEngine();
  }

  // ── setup ──

  async updateSetup(patch: Partial<Setup>) {
    const setup = this.setup;
    if (patch.name !== undefined) setup.name = text(patch.name, 60, 'Production name');
    if (patch.package !== undefined) {
      if (!BANNER_THEMES.includes(patch.package)) throw new Error('Choose one of the available graphics styles.');
      setup.package = patch.package;
    }
    if (patch.brand !== undefined) {
      setup.brand = {
        eventName: patch.brand.eventName ? text(patch.brand.eventName, 60, 'Event name') : '',
        stage: patch.brand.stage ? text(patch.brand.stage, 60, 'Stage') : '',
      };
    }
    if (patch.screens !== undefined) setup.screens = this.validScreens(patch.screens);
    const toggled: string[] = [];
    if (patch.hud !== undefined) {
      for (const [k, v] of Object.entries(patch.hud)) {
        if (k in setup.hud && typeof v === 'boolean') {
          if (setup.hud[k] !== v && (SETUP_LAYER_KEYS as readonly string[]).includes(k)) toggled.push(k);
          setup.hud[k] = v;
        }
      }
    }
    if (patch.minimap !== undefined) {
      const { x, y, size } = patch.minimap;
      if (![x, y, size].every(Number.isInteger) || x < 0 || y < 0 || x > 1920 || y > 1080 || size < 200 || size > 800) throw new Error('Keep the minimap frame on screen (size 200–800).');
      setup.minimap = { x, y, size };
    }
    if (patch.look !== undefined) setup.look = validLook(patch.look, lookOf(setup.look));
    if (patch.obs !== undefined) {
      const stinger = patch.obs.stinger;
      if (stinger !== null && (typeof stinger !== 'string' || stinger.length > 200)) throw new Error('Choose a stinger transition from OBS.');
      setup.obs = { host: patch.obs.host || setup.obs.host, port: patch.obs.port || setup.obs.port, stinger };
    }
    this.save();
    await this.syncEngine();
    if (this.match) for (const k of toggled) await this.act('layer.set', { layer: k, mode: setup.hud[k] ? defaultMode(k) : 'off' });
  }

  private validScreens(screens: Setup['screens']) {
    const known = new Map(this.setup.screens.map((s) => [s.id, s]));
    if (!Array.isArray(screens) || screens.length !== known.size || new Set(screens.map((s) => s.id)).size !== screens.length) {
      throw new Error('Keep every screen; switch it off instead of removing it.');
    }
    const titles = new Set<string>();
    return screens.map((s) => {
      const base = known.get(s.id);
      if (!base) throw new Error('Unknown screen.');
      const title = text(s.title, 40, 'Screen name');
      if (titles.has(title.toLowerCase())) throw new Error('Each screen needs its own name (it becomes an OBS scene name).');
      titles.add(title.toLowerCase());
      const f = s.frame;
      if (![f.x, f.y, f.width, f.height].every(Number.isInteger) || f.width < 64 || f.height < 36 || f.x < -1920 || f.y < -1080 || f.x > 1920 || f.y > 1080) {
        throw new Error(`${title}: keep its position and size within the screen.`);
      }
      return { ...base, title, enabled: !!s.enabled, frame: { x: f.x, y: f.y, width: f.width, height: f.height } };
    });
  }

  // ── OBS ──

  /** The scenes Air builds, with each enabled graphic in its scene (PRD picture 9). */
  buildPlan(): BuildScene[] {
    const port = this.deps.engine.port;
    const full = { x: 0, y: 0, width: 1920, height: 1080 };
    // Sponsor loops of the selected match's sponsors, hidden until shown (a break, or by autopilot).
    const sponsorVideos = this.match ? onAir(this.match, this.eventOf(this.match)).sponsors.filter((x) => x.video) : [];
    // The desk's two camera windows: the first two people on air with a camera, in the event's order.
    const cams = this.match ? onAir(this.match, this.eventOf(this.match)).talent.filter((t) => t.camera.kind !== 'none').slice(0, 2) : [];
    const deskFill = (slot: string): BuildSlot['fill'] | null => {
      const t = cams[slot === 'cam1' ? 0 : slot === 'cam2' ? 1 : 2];
      if (!t) return null;
      if (t.camera.kind === 'obs' && t.camera.obsSource) return { kind: 'source', sourceName: t.camera.obsSource };
      if (t.camera.kind === 'link' && t.camera.linkId) return { kind: 'link', inputName: sourceName(`Camera · ${t.name}`), url: cameraViewUrl(t.camera.linkId) };
      return null;
    };
    return SCENE_KEYS.map((key) => {
      const def = SCENES[key];
      return {
        name: def.name,
        formerly: def.formerly,
        exclusive: def.exclusive,
        // Break's two windows exist only when Break uses the frame look.
        slots: def.slots.filter((slot) => this.slotWanted(slot.id)).map((slot) => ({ id: slot.id, sceneName: slot.scene, formerly: slot.formerly, frame: slot.frame, ...(deskFill(slot.id) ? { fill: deskFill(slot.id)! } : {}) })),
        sources: [
          ...this.setup.screens
            .filter((x) => x.scene === key && x.enabled && !x.hosted)
            .map((x) => ({ id: x.id, inputName: sourceName(x.title), formerly: legacySourceName(x.title), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })),
          // Full-screen graphics also cover the game: Take shows them without switching OBS scenes.
          ...(key === 'gameplay' ? this.setup.screens.filter((x) => x.id === 'fullscreen' && x.enabled).map((x) => ({ id: 'fullscreen-over-game', inputName: sourceName('Full screen over game'), formerly: legacySourceName('Full screen over game'), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })) : []),
          // Over-the-game graphics also sit over the desk cameras (as bands over a stage shot).
          ...(key === 'casters' ? this.setup.screens.filter((x) => x.id === 'fullscreen' && x.enabled).map((x) => ({ id: 'fullscreen-over-desk', inputName: sourceName('Full screen over desk'), formerly: legacySourceName('Full screen over desk'), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })) : []),
          ...(key === 'holding' ? sponsorVideos.map((x) => ({ id: `sponsor:${x.id}`, inputName: sourceName(`Sponsor video · ${x.name}`), kind: 'media' as const, url: x.video, frame: full, enabled: false })) : []),
        ],
      };
    });
  }

  async installGraphics() {
    const data = this.deps.store.data;
    await this.deps.obs.build(this.buildPlan(), data.owned, (owned) => {
      data.owned = owned;
      this.deps.store.save();
    });
    this.emit('change');
  }

  async useSlotSource(slot: SlotId, source: string) {
    const def = SCENE_KEYS.flatMap((k) => SCENES[k].slots).find((x) => x.id === slot);
    if (!def) throw new Error('Unknown source slot.');
    await this.deps.obs.useSource(def.scene, source);
  }

  /** F3: saves the last moments to OBS's replay buffer. Air does not switch scenes to play it. */
  async saveReplay() {
    const socket = this.deps.obs.raw;
    if (!socket || this.deps.obs.status.state !== 'connected') throw new Error('Connect OBS first.');
    if (this.deps.obs.status.replayBufferActive !== true) throw new Error('Start the replay buffer in OBS first (Controls › Start Replay Buffer).');
    await socket.call('SaveReplayBuffer');
    this.log.add('Replay saved in OBS');
  }

  // ── cue and take (graphics only) ──

  /** Changes go to the Cued column first (Take puts them on air), or straight on air. */
  private cueMode = true;
  private cued: { matchId: string | null; changes: Array<{ key: string; label: string; actions: Array<{ name: string; args: Record<string, unknown> }> }> } = { matchId: null, changes: [] };
  /** Cued changes belong to the match they were cued on; switching match drops them. */
  private get pending() {
    const id = this.deps.store.data.selectedMatchId ?? null;
    if (this.cued.matchId !== id) this.cued = { matchId: id, changes: [] };
    return this.cued.changes;
  }
  private set pending(changes) {
    this.cued = { matchId: this.deps.store.data.selectedMatchId ?? null, changes };
  }
  private cueTimer: ReturnType<typeof setTimeout> | null = null;

  private get cueRoom() {
    return `__ESA_SIM_CUE_${this.requireMatch().code}`;
  }

  /**
   * A graphic change: queued while cueing, applied at once otherwise. A cued change replaces an
   * earlier one for the same slot (one lower third, one full-screen graphic, one mode per layer), and
   * a change that would leave the slot as it is on air simply uncues it.
   */
  private async graphic(label: string, actions: Array<{ name: string; args: Record<string, unknown> }>) {
    this.requireMatch();
    if (this.cueMode) {
      const key = cueKey(actions);
      const replaced = this.pending.some((c) => c.key === key);
      this.pending = this.pending.filter((c) => c.key !== key);
      if (this.matchesAir(actions)) {
        if (replaced) this.log.add(`Uncued · ${label}`);
      } else {
        this.pending.push({ key, label, actions });
        this.log.add(`Cued · ${label}`);
      }
      await this.syncCue();
      this.emit('change');
      return;
    }
    for (const a of actions) await this.act(a.name, a.args, false);
    this.roomV = -1;
    await this.readRoom();
    this.log.add(label);
  }

  /** True when applying these actions would leave the on-air graphics as they are. */
  private matchesAir(actions: Array<{ name: string; args: Record<string, unknown> }>) {
    const last = actions.at(-1)!;
    const room = this.room ?? {};
    if (last.name === 'layer.set') return this.layerRows().find((r) => r.id === last.args.layer)?.mode === last.args.mode;
    if (last.name === 'fullscreen.show') return (room.airFullscreen ?? null) === (last.args.screen ?? null);
    if (last.name === 'lowerthird.hide') return !room.show?.lowerThird;
    if (last.name === 'poll.hide') return !room.show?.poll;
    return false;
  }

  /** The Cued monitor's room: the live state with the cued changes applied. */
  async syncCue() {
    const match = this.match;
    if (!match || this.deps.engine.state !== 'running') return;
    const { state } = await this.client.get<{ state: any }>(`/api/${encodeURIComponent(match.code)}`);
    await this.client.put(`/api/${this.cueRoom}`, state);
    for (const change of this.pending) for (const a of change.actions) await this.client.post('/control/action', { match: this.cueRoom, name: a.name, args: a.args }).catch(() => {});
  }

  /** Keeps the cue room following the live match (throttled). */
  private scheduleCueSync() {
    if (this.cueTimer || !this.match) return;
    this.cueTimer = setTimeout(() => {
      this.cueTimer = null;
      void this.syncCue().catch(() => {});
    }, 800);
    this.cueTimer.unref?.();
  }

  setCueMode(on: boolean) {
    this.cueMode = on === true;
    if (!this.cueMode && this.pending.length) this.pending = [];
    this.emit('change');
  }

  clearCue() {
    this.pending = [];
    void this.syncCue().catch(() => {});
    this.log.add('Cue cleared');
    this.emit('change');
  }

  /** Take: everything cued goes on air. With the stinger, the HUD wipe plays first and the change lands behind it. */
  async takeCue(how: 'take' | 'cut' | 'stinger' = 'take') {
    if (!this.pending.length) throw new Error('Nothing is cued. Choose a graphic first.');
    const changes = this.pending;
    this.pending = [];
    if (how === 'stinger') {
      await this.act('stinger.play', {}, false);
      await new Promise((r) => setTimeout(r, 450));
    }
    for (let i = 0; i < changes.length; i++) {
      try {
        for (const a of changes[i]!.actions) await this.act(a.name, a.args, false);
      } catch (error) {
        // What did not go on air stays cued, so the operator can Take again.
        this.pending = [...changes.slice(i), ...this.pending];
        this.roomV = -1;
        await this.readRoom().catch(() => {});
        this.emit('change');
        throw error;
      }
    }
    this.roomV = -1;
    await this.readRoom();
    this.log.add(`${how === 'stinger' ? 'Stinger' : how === 'cut' ? 'Cut' : 'Take'} · ${changes.map((c) => c.label).join(', ')}`);
    await this.syncCue().catch(() => {});
  }

  /** Starts or stops the PVW / PGM screenshot loop (the Console asks for it while it is on screen). */
  setMonitoring(on: boolean) {
    if (!on) {
      if (this.monitorTimer) clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      return;
    }
    if (this.monitorTimer) return;
    this.monitorTimer = setInterval(() => void this.pump(), 350);
    this.monitorTimer.unref?.();
    void this.pump();
  }

  private async pump() {
    const obs = this.deps.obs;
    if (this.monitorBusy || !obs.connected) return;
    this.monitorBusy = true;
    try {
      const { previewScene, programScene, studioMode } = obs.status;
      const pvw = studioMode ? await obs.screenshot(previewScene) : null;
      const pgm = await obs.screenshot(programScene);
      const frame: MonitorFrame = { pvw, pgm, previewScene, programScene };
      this.emit('monitor', frame);
    } finally {
      this.monitorBusy = false;
    }
  }

  // ── capture, test round, triggers ──

  startCapture() {
    this.stats.reset();
    if (!this.match) throw new Error('Choose or create a match first, so game data goes to the right place.');
    this.deps.capture.start();
  }

  stopCapture() {
    this.deps.capture.stop();
  }

  private requireMatch() {
    const match = this.match;
    if (!match) throw new Error('Choose or create a match first.');
    return match;
  }

  async testRound(action: 'start' | 'stop' | 'seek', options: { speed?: number; from?: number } = {}) {
    const match = this.requireMatch();
    const speed = Number.isFinite(options.speed) ? Math.min(8, Math.max(0.25, options.speed!)) : 1;
    const from = Number.isFinite(options.from) ? Math.max(0, options.from!) : 0;
    if (action === 'start' || action === 'seek') this.stats.reset();
    await this.client.post('/control/test-round', { match: match.code, action, speed, from });
    this.roomV = -1;
    await this.readRoom();
  }

  async pause(kind: 'technical' | 'timeout' | null) {
    const match = this.requireMatch();
    const path = `/api/${encodeURIComponent(match.code)}/pause-panel`;
    const current = this.room?.airPause?.id;
    if (current) await this.client.post(path, { action: 'clear', id: current });
    if (kind) {
      const id = randomUUID();
      await this.client.post(path, { action: 'show', panel: { kind, id, startedAt: Date.now(), scope: { showId: this.setup.id, matchId: match.id } } });
      this.log.add(kind === 'technical' ? 'Tech pause on' : 'Timeout on');
    } else if (current) {
      this.log.add('Pause cleared');
    }
    this.roomV = -1;
    await this.readRoom();
  }

  // ── observer and player PCs ──

  get mode(): PcMode {
    return this.deps.store.data.mode ?? 'production';
  }

  async setMode(mode: PcMode) {
    if (mode !== 'production' && mode !== 'capture') throw new Error('Choose Production or Capture-only.');
    if (mode === this.mode) return;
    if (this.deps.capture.state === 'live' || this.deps.capture.state === 'waiting') throw new Error('Stop game capture before changing what this PC does.');
    this.deps.store.data.mode = mode;
    if (mode === 'capture') {
      this.link.resume();
    } else {
      this.link.disconnect();
    }
    this.save();
  }

  joinSet(enabled: boolean) {
    return this.joinHost.set(enabled === true);
  }

  joinRotate() {
    return this.joinHost.rotate();
  }

  async linkConnect(input: { address: string; code: string; role: PcRole }) {
    if (this.mode !== 'capture') throw new Error('Switch this PC to Capture-only first.');
    await this.link.connect(input ?? ({} as never));
  }

  linkDisconnect() {
    this.link.disconnect();
  }

  linkRetry() {
    this.link.retry();
  }

  // ── Esportra ──

  private get esportra() {
    const account = this.deps.esportra;
    if (!account) throw new Error('Esportra sign-in is not available in this build.');
    return account;
  }

  async esportraSignIn(email: string, password: string) {
    await this.esportra.login(email, password);
    this.log.add('Signed in to Esportra');
  }

  async esportraSignOut() {
    this.esportra.logout();
    this.log.add('Signed out of Esportra');
  }

  async esportraRefresh() {
    await this.esportra.checkAccess().catch(() => {});
    // Without Air access the match list is refused anyway: say why once, instead of asking again.
    if (this.esportra.view().state === 'denied') throw new Error('Esportra has not turned on Air for this account yet, so its matches cannot load. Your own events and matches work as normal.');
    await this.esportra.refreshMatches();
    // Matches Esportra reports as completed are finished here too.
    const done = new Set(this.esportra.view().matches.filter((e) => e.status === 'completed').map((e) => e.id));
    let changed = false;
    for (const m of this.deps.store.data.matches) if (!m.finishedAt && m.source && done.has(m.source.matchId)) { m.finishedAt = Date.now(); changed = true; }
    if (changed) this.save();
  }

  /** Makes an Esportra match the match on this PC: teams, tags, logos, best-of and tournament name. */
  async useEsportraMatch(matchId: string) {
    const account = this.esportra;
    const found = account.view().matches.find((m) => m.id === matchId);
    if (!found) throw new Error('That match is no longer in your Esportra schedule. Refresh the list.');
    if (this.match?.source?.matchId !== matchId) this.assertCanSwitch();
    if (!found.supported) throw new Error('Air cannot produce this match’s game yet.');
    if (this.setup.game !== 'valorant') throw new Error(`This is a Valorant match and Air is set to ${this.setup.game ? gameName(this.setup.game) : 'no game'}. Switch game from the top bar first.`);
    if (account.view().state === 'denied') throw new Error(account.view().warning ?? 'Esportra has not confirmed Air access for this PC.');
    let lineups: [string[], string[]] | null = null;
    try {
      const roster = await account.roster(matchId);
      lineups = [roster.team1.players.map((p) => p.displayName), roster.team2.players.map((p) => p.displayName)];
    } catch {
      // The lineup is a convenience; the match works without it.
    }
    const data = this.deps.store.data;
    const code = `E${matchId.replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    const teams = [
      { name: found.teamA, tag: found.tagA || tagFor(found.teamA), color: COLORS[0]!, logo: found.logoA ?? '' },
      { name: found.teamB, tag: found.tagB || tagFor(found.teamB), color: COLORS[1]!, logo: found.logoB ?? '' },
    ] as [Team, Team];
    const source = { matchId, tournamentId: found.tournamentId, tournament: found.tournament, scheduledAt: found.scheduledAt, lineups };
    const existing = data.matches.find((m) => m.source?.matchId === matchId);
    if (existing) {
      // The tournament may have changed names, logos or best-of; the producer's talent and sponsors are kept.
      Object.assign(existing, { title: `${found.teamA} vs ${found.teamB}`, teams, bestOf: found.bestOf as 1 | 3 | 5, source });
      data.selectedMatchId = existing.id;
    } else {
      const id = randomUUID();
      const players = [0, 1].map((t) => (lineups?.[t] ?? []).map((name) => ({ id: randomUUID(), name, realName: '', gameId: '', photo: '' }))) as Match['players'];
      const carried = this.carryOver(found.tournamentId, found.tournament);
      const match: Match = { id, code, kind: 'esportra', title: `${found.teamA} vs ${found.teamB}`, bestOf: found.bestOf as 1 | 3 | 5, teams, createdAt: (this.deps.now ?? Date.now)(), source, game: 'valorant', players, ...carried };
      linkMatch(match, this.library);
      data.matches = [match, ...data.matches].slice(0, 50);
      data.selectedMatchId = id;
    }
    this.save();
    await this.syncEngine();
    this.log.add(`Match from Esportra · ${found.teamA} vs ${found.teamB}`);
  }

  // ── player cameras ──

  private get cams() {
    return (this.deps.store.data.cams ??= { layout: 'ingame', delayMs: 0, ids: [[null, null, null, null, null], [null, null, null, null, null]] });
  }

  private camsView(connected?: boolean[][]): CamsView {
    const cams = this.cams;
    const slots = [0, 1].flatMap((team) => [0, 1, 2, 3, 4].map((slot) => {
      const id = cams.ids[team]?.[slot] ?? null;
      const name = this.room?.players?.[team]?.[slot]?.name || `${this.match?.teams[team]?.tag ?? (team ? 'B' : 'A')} · Player ${slot + 1}`;
      return { team, slot, name, id, pushUrl: id ? cameraLinkUrl(id, name) : null, connected: !!id && !!connected?.[team]?.[slot] };
    }));
    return { layout: cams.layout, delayMs: cams.delayMs, slots };
  }

  /** Sends the camera setup to the engine (the HUD pages show the streams from it). */
  private async pushCams() {
    if (!this.match) return;
    const cams = this.cams;
    await this.act('cams.set', { layout: cams.layout, delayMs: cams.delayMs, slots: cams.ids });
  }

  async camsSet(patch: { layout?: CamsView['layout']; delayMs?: number }) {
    const cams = this.cams;
    if (patch.layout !== undefined) {
      if (!['ingame', 'grid5', 'grid10'].includes(patch.layout)) throw new Error('Choose In-game, 5-up or 10-up.');
      cams.layout = patch.layout;
    }
    if (patch.delayMs !== undefined) {
      if (!Number.isInteger(patch.delayMs) || patch.delayMs < 0 || patch.delayMs > 10_000) throw new Error('Camera delay is 0–10,000 ms.');
      cams.delayMs = patch.delayMs;
    }
    this.deps.store.save();
    await this.pushCams();
    // A grid layout is a full-screen graphic: line it up in Preview like the other full-screen layers.
    if (patch.layout && patch.layout !== 'ingame') await this.fullscreen('cam-grid', true, true).catch(() => {});
    else if (patch.layout === 'ingame' && this.room?.airFullscreen === 'cam-grid') await this.fullscreen('cam-grid', false, true).catch(() => {});
  }

  private slot(team: number, slot: number) {
    if (![0, 1].includes(team) || !Number.isInteger(slot) || slot < 0 || slot > 4) throw new Error('Choose a team and player slot.');
  }

  /** Makes (or replaces) the camera link for a player. The old link stops working. */
  async camCreate(team: number, slot: number) {
    this.slot(team, slot);
    this.cams.ids[team]![slot] = randomBytes(9).toString('base64url');
    this.deps.store.save();
    await this.pushCams();
    this.log.add(`Camera link made · ${this.camsView().slots[team * 5 + slot]!.name}`);
  }

  async camRemove(team: number, slot: number) {
    this.slot(team, slot);
    this.cams.ids[team]![slot] = null;
    this.deps.store.save();
    await this.pushCams();
  }

  // ── graphics control: Air, Stream Deck / Companion, or both ──

  get control(): ControlMode {
    return this.deps.store.data.control ?? 'air';
  }

  async setControl(mode: ControlMode) {
    if (!(CONTROL_MODES as readonly unknown[]).includes(mode)) throw new Error('Choose Air, Stream Deck / Companion, or Both.');
    this.deps.store.data.control = mode;
    this.deps.store.save();
    // Companion only: autopilot is not shown, so it cannot keep running unseen.
    if (mode === 'companion') this.autopilot.stop();
    await this.companion.sync();
    this.emit('change');
  }

  companionRenewKey() {
    this.companion.renewKey();
  }

  private screenTitle(id: string) {
    return this.setup.screens.find((x) => x.id === id)?.title ?? id;
  }

  /** What Companion's dropdowns offer: screens in My show, people on air, sponsors on for this match. */
  private companionHello() {
    const match = this.match;
    const on = match ? onAir(match, this.eventOf(match)) : { talent: [], sponsors: [] };
    return {
      version: this.deps.version,
      screens: this.setup.screens.filter((x) => x.hosted && x.enabled).map((x) => ({ id: x.id, title: x.title })),
      talent: on.talent.map((t) => ({ id: t.id, name: t.name })),
      sponsors: on.sponsors.map((x) => ({ id: x.id, name: x.name })),
    };
  }

  /** A Companion button: the same Production methods as Air's keys, so Cued applies the same way. */
  private async companionAct(name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'fullscreen': {
        const screen = String(args.screen ?? '');
        if (!this.setup.screens.some((x) => x.id === screen && x.hosted && x.enabled)) throw new Error('That screen is not in My show.');
        const on = args.on === 'toggle' ? this.room?.airFullscreen !== screen : args.on !== false && args.on !== 'off';
        return this.setLayer(`fs:${screen}`, on ? 'on' : 'off');
      }
      case 'talent': {
        if (args.talentId === null || args.talentId === undefined || args.talentId === '') return this.lowerThird(null);
        const match = this.requireMatch();
        const person = onAir(match, this.eventOf(match)).talent.find((t) => t.id === args.talentId);
        if (!person) throw new Error('That person is not on air for this match.');
        return this.lowerThird({ kind: 'person', name: person.name, role: ROLE_NAME[person.role] });
      }
      case 'sponsor': return this.sponsorRead(typeof args.sponsorId === 'string' && args.sponsorId ? args.sponsorId : null);
      case 'toast': {
        const text = typeof args.text === 'string' ? args.text.trim() : '';
        if (!text || text.length > 120 || /[<>]/.test(text)) throw new Error('A toast is plain text, 1–120 characters.');
        return this.toast(text);
      }
      case 'pause': return this.pause(args.kind === 'technical' || args.kind === 'timeout' ? args.kind : null);
      case 'take': return this.takeCue('take');
      case 'take_stinger': return this.takeCue('stinger');
      case 'clear': return this.clearCue();
      case 'autopilot_hold':
      case 'autopilot_skip':
      case 'autopilot_take':
        if (this.control !== 'both') throw new Error('Autopilot buttons work when Air is set to Both.');
        if (name === 'autopilot_hold') return this.autopilotHold();
        if (name === 'autopilot_skip') return this.autopilotSkip();
        return this.autopilotTake();
      default: throw new Error(`Air does not know the action “${name}”.`);
    }
  }

  // ── autopilot ──

  autopilotRestart() {
    this.autopilot.restartRundown();
    this.log.add('Autopilot rundown starts again from the first step');
  }

  autopilotStart() {
    this.recoveredAt = null;
    this.autopilot.start();
  }
  autopilotStop() {
    this.autopilot.stop();
  }
  autopilotHold() {
    this.autopilot.hold();
  }
  autopilotSkip() {
    this.autopilot.skip();
  }
  autopilotTake() {
    return this.autopilot.take();
  }
  /** Resuming also takes the pause panel off air, or the pause would simply come back. */
  async autopilotResume() {
    if (this.room?.airPause) await this.pause(null);
    this.autopilot.resume();
  }
  rundownStartFrom(preset: Preset) {
    this.autopilot.startFrom(preset);
    this.log.add(`Rundown · started from ${preset}`);
  }
  rundownSave(input: RowInput & { id?: string }) {
    this.autopilot.saveRow(input);
  }
  rundownRemove(id: string) {
    this.autopilot.removeRow(id);
  }
  rundownEnable(id: string, on: boolean) {
    this.autopilot.enableRow(id, on);
  }
  rundownMove(id: string, direction: number) {
    this.autopilot.moveRow(id, direction < 0 ? -1 : 1);
  }

  async casterStrap(on: boolean) {
    const match = this.requireMatch();
    if (on && !onAir(match, this.eventOf(match)).talent.length) throw new Error('Add the people on air in Event first.');
    await this.graphic(on ? 'Caster lower third' : 'Lower third off', [{ name: on ? 'lowerthird.caster' : 'lowerthird.hide', args: {} }]);
  }

  async sponsorRead(sponsorId: string | null) {
    if (sponsorId === null) return this.graphic('Lower third off', [{ name: 'lowerthird.hide', args: {} }]);
    const match = this.requireMatch();
    const sponsor = onAir(match, this.eventOf(match)).sponsors.find((s) => s.id === sponsorId);
    if (!sponsor) throw new Error('This sponsor is not on for this match.');
    await this.graphic(`Sponsor read · ${sponsor.name}`, [{ name: 'lowerthird.generic', args: { title: sponsor.name, sub: sponsor.read || 'Presented by', team: -1 } }]);
  }

  async lowerThird(input: { kind: 'caster' } | { kind: 'person'; name: string; role: string } | { kind: 'player' } | null) {
    if (input === null) return this.graphic('Lower third off', [{ name: 'lowerthird.hide', args: {} }]);
    if (input.kind === 'caster') return this.casterStrap(true);
    if (input.kind === 'person') return this.graphic(`Lower third · ${input.name}`, [{ name: 'lowerthird.generic', args: { title: input.name, sub: input.role, team: -1 } }]);
    const observed = this.observedPlayer();
    if (!observed) throw new Error('No player is being observed yet. Spotlight needs the game’s roster.');
    await this.graphic(`Spotlight · ${observed.name}`, [{ name: 'lowerthird.player', args: { team: observed.team, player: observed.player } }]);
  }

  async toast(text: string) {
    await this.graphic(`Toast · ${text}`, [{ name: 'toast.show', args: { text } }]);
  }

  async poll(input: PollInput | null) {
    if (input === null) return this.graphic('Poll hidden', [{ name: 'poll.hide', args: {} }]);
    await this.graphic(`Poll · ${input.question}`, [{ name: 'poll.show', args: { question: input.question, options: input.options, firstPercent: input.firstPercent } }]);
  }

  async stingerPlay() {
    await this.act('stinger.play', {});
    this.log.add('Stinger (graphic) played');
  }

  /** Sets a console layer. Full-screen rows choose which graphic the Fullscreen scene shows. */
  async setLayer(id: string, mode: LayerMode) {
    if (id.startsWith('fs:')) return this.fullscreen(id.slice(3), mode === 'on');
    const label = LAYER_DEFS.find((d) => d.id === id)?.label ?? id;
    await this.graphic(`${label} · ${mode}`, [{ name: 'layer.set', args: { layer: id, mode } }]);
  }

  /**
   * Shows a full-screen graphic in the full-screen host (null: back to the game). OBS is not touched
   * (decision R1). From the console it is cued like any graphic; autopilot and the camera layout
   * apply it directly.
   */
  /** The event's matches on the same day as this one, for Today's schedule (time, tags, stage, result). */
  private scheduleOf(match: Match) {
    const day = (m: Match) => new Date(m.source?.scheduledAt ?? m.createdAt).toDateString();
    const same = this.deps.store.data.matches.filter((m) => m.eventId && m.eventId === match.eventId && m.game === match.game && day(m) === day(match));
    const list = (same.length ? same : [match]).sort((a, b) => (a.source?.scheduledAt ?? '').localeCompare(b.source?.scheduledAt ?? '') || a.createdAt - b.createdAt);
    return list.slice(0, 6).map((m) => {
      const at = m.source?.scheduledAt ? new Date(m.source.scheduledAt) : null;
      const wins = m.id === match.id ? (this.room?.teams ?? []).map((t: { series?: number }) => Number(t?.series) || 0) : [];
      return {
        time: at ? at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
        a: m.teams[0].tag, b: m.teams[1].tag, label: m.stage || `Bo${m.bestOf}`, done: !!m.finishedAt,
        ...(wins.length === 2 && (wins[0] || wins[1]) ? { score: `${wins[0]}–${wins[1]}` } : {}),
      };
    });
  }

  /** How a screen looks when put up by hand: the look of its row in the match's Rundown. */
  private lookOfRow(screenId: string): { style: 'full' | 'band'; template?: string } {
    const row = this.autopilot.rows().find((r) => r.show === screenId && r.enabled);
    return { style: row?.style === 'band' ? 'band' : 'full', ...(row?.template ? { template: row.template } : {}) };
  }

  private async fullscreen(screenId: string | null, on: boolean, direct = false, style?: 'full' | 'band', template?: string) {
    const screen = screenId ? this.setup.screens.find((x) => x.id === screenId && x.scene === 'fullscreen') : null;
    if (screenId && !screen) throw new Error('Unknown full-screen graphic.');
    const actions: Array<{ name: string; args: Record<string, unknown> }> = [];
    if (on && screenId === 'player-profile') {
      const observed = this.observedPlayer();
      if (!observed) throw new Error('No player is being observed yet. The player profile needs the game’s roster.');
      actions.push({ name: 'spotlight.set', args: { team: observed.team, player: observed.player } });
    }
    if (on && screenId === 'cam-grid' && this.cams.layout === 'ingame') {
      this.cams.layout = 'grid10';
      this.deps.store.save();
      await this.pushCams();
    }
    // A template (if it still exists) decides full screen or over the game; otherwise the row's style does.
    const look = on && screen ? (style ? { style, template } : this.lookOfRow(screen.id)) : { style: 'full' as const };
    const tpl = look.template ? this.templates.find((t) => t.id === look.template && t.graphic.startsWith(`${screen!.id}|`)) : undefined;
    actions.push({ name: 'fullscreen.show', args: { screen: on && screen ? screen.id : null, style: tpl ? graphicStyle(tpl.graphic) : look.style, template: tpl?.id ?? null } });
    const label = on && screen ? `Full screen · ${screen.title}` : 'Back to the game';
    if (!direct) return this.graphic(label, actions);
    for (const a of actions) await this.act(a.name, a.args, false);
    this.roomV = -1;
    await this.readRoom();
    this.log.add(label);
  }

  async correct(input: CorrectionCall) {
    const match = this.requireMatch();
    const body = 'undo' in input
      ? { action: 'undo' }
      : 'clear' in input
      ? { action: 'clear' }
      : { action: 'set', field: input.field, value: input.value, until: input.field === 'scores' ? 'next_round' : 'cleared', reason: text(input.reason, 200, 'Reason') };
    await this.client.post(`/api/${encodeURIComponent(match.code)}/display-fixes`, body);
    this.roomV = -1;
    await this.readRoom();
  }

  // ── snapshot ──

  /** The observed player, only once the game has reported that slot's name. */
  private observedPlayer(): { team: number; player: number; name: string } | null {
    const o = this.room?.observed;
    const name = Array.isArray(o) ? this.room?.players?.[o[0]]?.[o[1]]?.name : null;
    return Array.isArray(o) && name ? { team: o[0], player: o[1], name } : null;
  }

  /** What is on screen right now, read from the engine so external controllers show up too. */
  private liveTriggers(): Snapshot['triggers'] {
    const room = this.room;
    const layers = room?.airLayers ?? {};
    const lt = room?.lowerThird ?? {};
    const lowerOn = layers.lowerThird === 'on';
    const match = this.match;
    const sponsors = match ? onAir(match, this.eventOf(match)).sponsors : [];
    const sponsor = lowerOn && lt.kind === 'generic' && lt.team === -1 ? sponsors.find((x) => x.name === lt.title) ?? null : null;
    return {
      pause: room?.airPause?.kind ?? null,
      strap: lowerOn && lt.kind === 'caster',
      sponsor: sponsor?.id ?? null,
      person: lowerOn && lt.kind === 'generic' && !sponsor ? String(lt.title) : null,
      player: lowerOn && lt.kind === 'player',
      poll: layers.poll === 'on',
    };
  }

  private layerRows(): LayerRow[] {
    const { obs } = this.deps;
    const layers = this.room?.airLayers ?? {};
    return LAYER_DEFS.map((def) => {
      if (def.id.startsWith('fs:')) {
        const screen = this.setup.screens.find((x) => x.id === def.id.slice(3));
        const on = !!screen && this.room?.airFullscreen === screen.id;
        const fs = this.pending.find((c) => c.key === 'fs')?.actions.at(-1)?.args.screen;
        const cued: LayerMode | undefined = fs === undefined ? undefined : fs === screen?.id ? 'on' : 'off';
        return { ...def, mode: on ? 'on' : 'off', ...(cued && cued !== (on ? 'on' : 'off') ? { cued } : {}), auto: false, manual: false, available: !!screen?.enabled && !!this.match } as LayerRow;
      }
      const auto = AUTO_LAYERS.has(def.id);
      const mode: LayerMode = layers[def.id] ?? (auto ? 'auto' : 'off');
      const cued = this.pending.find((c) => c.key === `layer:${def.id}`)?.actions.at(-1)?.args.mode as LayerMode | undefined;
      return { ...def, mode, ...(cued ? { cued } : {}), auto, manual: auto && mode !== 'auto', available: !!this.match };
    });
  }

  snapshot(): Snapshot {
    const { engine, obs, capture, version } = this.deps;
    const status: EngineStatus | null = engine.status;
    const match = this.match;
    const roomStatus = match ? status?.rooms.find((r) => r.match === match.code.toUpperCase()) : undefined;
    const room = match ? this.room : null;
    const named = (t: number) => (room?.players?.[t] ?? []).filter((p: { name?: string }) => p?.name).length;
    const readout = room
      ? {
          map: room.map?.name ?? null,
          round: Number.isFinite(room.round?.number) ? room.round.number : null,
          phase: room.round?.phase ?? null,
          score: [room.teams?.[0]?.score ?? null, room.teams?.[1]?.score ?? null] as [number | null, number | null],
          playersFound: [named(0), named(1)] as [number, number],
          sides: [room.teams?.[0]?.side ?? null, room.teams?.[1]?.side ?? null] as [string | null, string | null],
          alive: [0, 1].map((t) => (room.players?.[t] ?? []).filter((p: { alive?: boolean }) => p?.alive).length) as [number, number],
          bank: [0, 1].map((t) => (room.players?.[t] ?? []).reduce((sum: number, p: { credits?: number }) => sum + (Number(p?.credits) || 0), 0)) as [number, number],
          clockEndsAt: Number(room.round?.endsAt) > 0 ? Number(room.round.endsAt) : null,
          spikePlanted: room.round?.phase === 'planted',
          observed: this.observedPlayer(),
          roster: [0, 1].map((t) => (room.players?.[t] ?? []).map((p: { name?: string; inGameName?: string }) => ({ name: p?.name ?? '', inGameName: p?.inGameName ?? '' }))),
        }
      : null;
    const enabled = this.setup.screens.filter((s) => s.enabled && !s.hosted);
    const outputs = enabled.map((s) => {
      const o = status?.outputs.find((x) => x.id === s.outputId);
      return { screenId: s.id, title: s.title, overlay: s.overlay, url: `http://127.0.0.1:${engine.port}/o/${s.outputId}`, connections: o?.connections ?? 0, lastFrameAt: o?.lastFrameAt ?? null };
    });
    const wanted = SCENE_KEYS.flatMap((k) => [SCENES[k].name, ...SCENES[k].slots.filter((slot) => this.slotWanted(slot.id)).map((slot) => slot.scene)]);
    const missingScenes = wanted.filter((n) => !obs.status.scenes.includes(n));
    const installed = obs.status.state === 'connected' && missingScenes.length === 0;
    const sceneStatus: SceneStatus[] = SCENE_KEYS.map((k) => ({
      key: k,
      name: SCENES[k].name,
      inObs: obs.status.scenes.includes(SCENES[k].name),
      // The Break windows only need a source with the frame style.
      slots: SCENES[k].slots.filter((slot) => this.slotWanted(slot.id)).map((slot) => ({ id: slot.id, label: slot.label, scene: slot.scene, source: obs.status.slots[slot.scene] ?? null })),
    }));
    const feedState = capture.state === 'live' && roomStatus?.lastFeedAt == null ? 'waiting' : capture.state;
    const snapshot: Snapshot = {
      version,
      engine: { state: engine.state, port: engine.port, reattached: engine.reattached, error: engine.error },
      setup: this.setup,
      matches: this.deps.store.data.matches.filter((m) => m.game === this.setup.game),
      onboarding: { done: this.deps.store.data.onboarding?.done ?? false },
      game: gameOf(this.setup.game),
      gameLocked: this.gameLocked(),
      keymap: this.deps.store.data.keymap ?? {},
      moments: this.deps.store.data.moments ?? DEFAULT_MOMENTS,
      globalKeys: this.globalKeys ? { ...this.globalKeys.status } : { on: this.deps.store.data.globalKeys !== false, available: false, active: [], taken: [] },
      events: this.deps.store.data.events,
      event: this.match ? this.eventOf(this.match) : null,
      match,
      readout,
      feed: { state: feedState, reason: capture.reason, ageMs: roomStatus?.feedAgeMs ?? null, paused: roomStatus?.feedPaused ?? false },
      obs: {
        state: obs.status.state, error: obs.status.error, version: obs.status.version, collection: obs.status.collection,
        studioMode: obs.status.studioMode, programScene: obs.status.programScene, previewScene: obs.status.previewScene,
        transitions: obs.status.transitions.map((t) => ({ name: t.name, kind: t.kind })), transitionActive: obs.status.transitionActive,
        replay: { bufferActive: obs.status.replayBufferActive, busy: false },
        installed, missingScenes, scenes: sceneStatus, sceneNames: obs.status.scenes, videoInputs: obs.status.videoInputs,
      },
      outputs,
      testRound: { running: roomStatus?.testRound.running ?? false, startedAt: roomStatus?.testRound.startedAt ?? null, durationMs: roomStatus?.testRound.durationMs ?? 0, speed: roomStatus?.testRound.speed ?? 1, fromMs: roomStatus?.testRound.fromMs ?? 0 },
      capture: this.stats.view(),
      cams: this.camsView(roomStatus?.cams),
      triggers: this.liveTriggers(),
      layers: this.layerRows(),
      autopilot: this.autopilot.view(),
      rundown: this.autopilot.rows(),
      templates: this.templates,
      templateUse: this.templateUse(),
      library: { teams: this.library.teams, players: this.library.players },
      control: this.control,
      companion: this.companion.view(),
      cue: { mode: this.cueMode, pending: this.pending.map((c) => c.label), room: match ? `__ESA_SIM_CUE_${match.code}` : null },
      esportra: this.deps.esportra?.view() ?? signedOut(),
      mode: this.mode,
      join: this.joinHost.view(),
      devices: devicesView({ lineup: this.match?.players ?? null, roomPlayers: Array.isArray(this.room?.players) ? this.room.players : null, peers: this.joinHost.view().peers, now: Date.now() }),
      link: this.link.view(),
      autopilotBlock: this.autopilot.block(),
      log: this.log.list(),
      checks: [],
      recovery: this.recoveryText(),
      art: this.art.status,
      rehearsal: this.rehearsal.view(),
    };
    snapshot.checks = checks(snapshot);
    return snapshot;
  }
}

/** The readiness checklist (PRD picture 7). Warns, never blocks; every problem names its one fix. */
/** Readiness: are the agent, weapon and map pictures on this PC? */
function artCheck(a: ArtStatus): CheckItem {
  const title = 'Agent and map art';
  if (!a.total) return { id: 'art', title, detail: 'Looking for the agent and map pictures on this PC…', health: 'off' };
  const gone = a.unavailable.length;
  const names = gone ? ` Riot’s art server does not have ${gone === 1 ? 'this picture' : `these ${gone} pictures`}: ${a.unavailable.slice(0, 6).join(', ')}${gone > 6 ? ', …' : ''}. Graphics show the name instead.` : '';
  const missing = a.total - a.have - gone;
  if (missing <= 0) return { id: 'art', title, detail: `${a.have} of ${a.total} agent, weapon and map pictures are on this PC. Graphics show them without internet.${names}`, health: gone ? 'warn' : 'ok' };
  if (a.downloading) return { id: 'art', title, detail: `Downloading pictures to this PC: ${a.have} of ${a.total}…`, health: 'off' };
  return { id: 'art', title, detail: `${missing} of ${a.total} pictures are not on this PC yet. The picture download could not reach Riot’s picture server; Air tries again every minute.${names}`, health: 'warn', action: { id: 'download-art', label: 'Download now' } };
}

export function checks(s: Snapshot): CheckItem[] {
  const out: CheckItem[] = [];
  const e = s.esportra;
  out.push(
    e.state === 'signed-out'
      ? { id: 'esportra', title: 'Esportra', detail: e.error ?? 'Not signed in. Quick matches work without an account.', health: 'off', action: { id: 'sign-in', label: 'Sign in' } }
      : e.state === 'online'
        ? { id: 'esportra', title: 'Esportra', detail: `Signed in as ${e.email} · ${e.matches.length} match${e.matches.length === 1 ? '' : 'es'} on your schedule${e.warning ? ` · ${e.warning}` : ''}`, health: e.warning ? 'warn' : 'ok' }
        : e.state === 'offline'
          ? { id: 'esportra', title: 'Esportra', detail: e.warning ?? 'Working offline.', health: 'warn' }
          : { id: 'esportra', title: 'Esportra', detail: e.warning ?? 'No Air access.', health: 'warn', action: { id: 'sign-in', label: 'Sign in again' } },
  );
  out.push(
    s.match
      ? { id: 'match', title: 'Show and match', detail: `${s.match.title}${s.event?.name ? ` · ${s.event.name}` : ''} · Bo${s.match.bestOf}`, health: 'ok' }
      : { id: 'match', title: 'Show and match', detail: 'No match selected yet.', health: 'warn', action: { id: 'choose-match', label: 'Create a match' } },
  );
  const found = s.readout ? s.readout.playersFound[0] + s.readout.playersFound[1] : 0;
  out.push(
    s.feed.state === 'live'
      ? { id: 'feed', title: 'Game data', detail: `Valorant is feeding GEP${found ? ` · ${found} of 10 players found` : ''}.`, health: 'ok' }
      : s.feed.state === 'waiting'
        ? { id: 'feed', title: 'Game data', detail: s.feed.reason ?? 'Waiting for Valorant.', health: 'warn' }
        : s.feed.state === 'unavailable'
          ? { id: 'feed', title: 'Game data', detail: s.feed.reason ?? 'Game capture is unavailable on this PC.', health: 'bad' }
          : { id: 'feed', title: 'Game data', detail: 'Game capture is off on this PC. Nothing is read until you start it.', health: 'off', action: { id: 'start-capture', label: 'Start capture' } },
  );
  out.push(
    s.obs.state === 'connected'
      ? { id: 'obs', title: 'OBS', detail: `OBS ${s.obs.version ?? ''} on this PC · Connected`, health: 'ok' }
      : { id: 'obs', title: 'OBS', detail: s.obs.error ?? 'OBS is not connected.', health: 'warn', action: { id: 'connect-obs', label: 'Connect OBS' } },
  );
  out.push(
    s.obs.installed
      ? { id: 'scenes', title: 'Scenes', detail: `${s.outputs.length} Esportra scenes are in your OBS collection.`, health: 'ok' }
      : s.obs.state === 'connected'
        ? { id: 'scenes', title: 'Scenes', detail: `Not in OBS yet: ${s.obs.missingScenes.join(', ')}.`, health: 'warn', action: { id: 'install-graphics', label: 'Add for me' } }
        : { id: 'scenes', title: 'Scenes', detail: 'Shown once OBS is connected.', health: 'off' },
  );
  const loading = s.outputs.filter((o) => o.connections > 0).length;
  const idle = s.outputs.filter((o) => o.connections === 0);
  out.push(
    s.obs.installed && idle.length === 0
      ? { id: 'sources', title: 'Browser sources', detail: `${loading} of ${s.outputs.length} connected.`, health: 'ok' }
      : s.obs.installed
        ? { id: 'sources', title: 'Browser sources', detail: `${loading} of ${s.outputs.length} connected · not loading: ${idle.map((o) => o.title).join(', ')}. OBS loads a source when its scene is opened once.`, health: 'warn' }
        : { id: 'sources', title: 'Browser sources', detail: 'Shown once scenes are in OBS.', health: 'off' },
  );
  // Player PCs: only for setups that use them, and only once a match exists.
  if (s.setup.profile === 'player-pcs' && s.match) {
    const d = s.devices;
    const missing = d.seats.filter((x) => x.state !== 'live').map((x) => x.name).filter(Boolean);
    out.push(d.checkedIn === d.seats.length && d.seats.length > 0
      ? { id: 'player-pcs', title: `Player PCs · ${d.checkedIn} of ${d.seats.length} checked in`, detail: 'Every player’s own data is arriving.', health: 'ok' }
      : { id: 'player-pcs', title: `Player PCs · ${d.checkedIn} of ${d.seats.length} checked in`, detail: d.fromGame ? `${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}: health and abilities stay hidden on air until their PC sends them.` : 'Player PCs are seated once the game starts. Until then health and abilities stay hidden on air.', health: 'warn', action: { id: 'open-devices' as const, label: 'Open Devices' } });
  }
  const air = s.match ? onAir(s.match, s.event) : { talent: [], sponsors: [] };
  const people = air.talent.length;
  out.push(
    people
      ? { id: 'talent', title: 'Talent and sponsors', detail: `${air.talent.map((t) => t.name).join(', ')}${air.sponsors.length ? ` · ${air.sponsors.length} sponsor${air.sponsors.length > 1 ? 's' : ''}` : ''}`, health: 'ok' }
      : { id: 'talent', title: 'Talent and sponsors', detail: 'Nobody on air for this match. Talent graphics need their names.', health: s.match ? 'warn' : 'off', ...(s.match ? { action: { id: 'add-casters' as const, label: 'Add people' } } : {}) },
  );
  out.push(
    artCheck(s.art),
  );
  return out;
}
