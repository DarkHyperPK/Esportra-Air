// The production model: one setup, the selected match, and everything that serves it.
// Pushes match and setup to the engine, points outputs and capture at the match's room, runs the
// manual triggers, and builds the snapshot the interface renders (including the Check list).

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { BANNER_THEMES, type CheckItem, type CorrectionCall, type Match, type LayerRow, type MonitorFrame, type PollInput, type SceneStatus, type QuickMatchInput, type NewMatchInput, type Setup, type Snapshot, type Team } from '../shared/api.ts';
import type { EngineClient, EngineStatus } from './engine-client.ts';
import type { EngineSupervisor } from './engine-supervisor.ts';
import type { GepBridge } from '../../../../packages/capture/src/gep.ts';
import type { ObsLink } from './obs.ts';
import type { BuildScene, BuildSlot } from './scene-build.ts';
import { SCENE_KEYS, SCENES, graphicSourceName, legacySourceName, sourceName, type SlotId } from '../shared/scenes.ts';
import { AUTO_LAYERS, GAME_DRAWS, LAYER_DEFS, SETUP_LAYER_KEYS, defaultMode, type LayerMode } from '../shared/layers.ts';
import { EventLog } from './event-log.ts';
import { Autopilot } from './autopilot/autopilot.ts';
import { mapComplete, withScores, type GameEvent } from './autopilot/show-runner.ts';
import { CaptureStats } from './capture-stats.ts';
import { devicesView } from '../shared/devices.ts';
import { DEFAULT_MOMENTS, rebind, validMoments } from '../shared/keymap.ts';
import { gameName, gameOf, type GameId, type Profile } from '../shared/games.ts';
import { LIBRARY_ROOM } from '../shared/library.ts';
import { BAND_SCREENS, lookOf, validLook } from '../shared/look.ts';
import { BRAND_KEYS, graphicStyle, validBrand, validTemplate, DEFAULT_BRAND, type BrandKit, type Template } from '../shared/templates.ts';
import { isOwnScreen, ownScreen, ownScreenId, pngSize, validOwn, type OwnGraphic } from '../shared/own-graphics.ts';
import { HUD_ROW, defaultSection, type Section } from '../shared/autopilot.ts';
import { join } from 'node:path';
import { ArtCache, type ArtStatus } from './art-cache.ts';
import { GamePacks } from './game-packs.ts';
import { Lobbies } from './br-lobbies.ts';
import { EventJournal } from './event-journal.ts';
import { EventFiles } from './event-files.ts';
import { BrGraphics, validLook as validLobbyLook, validTheme } from './br-graphics.ts';
import { BrLiveFeed } from './br-live.ts';
import { PcobRecorder } from './pcob-recorder.ts';
import { BrAutopilot } from './br-autopilot.ts';
import { LICENSED_PACKS, assetSrc, type PackStatus } from '../shared/game-assets.ts';
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
import { presetRows, rowsForScreens, ruleOf, rundownScreens } from './autopilot/rundown.ts';
import { ShowTemplates } from './show-templates.ts';
import { COLORS, tagFor, tagsFor } from './team-tags.ts';
import { EsportraMatches } from './esportra-matches.ts';
import { VetoOutbox } from './esportra-veto-outbox.ts';
import { EsportraSync } from './esportra-sync.ts';
import { MapRecords, type RecordChoice } from './map-records.ts';
import { PauseHint } from './pause-hint.ts';
import { MatchDataService } from './match-data.ts';
import { deleteTeam, linkMatch, pickTeam, pushMatch, refreshMatch, setLineup, validPlayer, validTeam } from './team-library.ts';
import type { LibPlayer, LibTeam, Library } from '../shared/api.ts';
import { CONTROL_MODES, companionValues, type ControlMode } from '../shared/companion.ts';
import { ROLE_NAME, type SponsorSpace } from '../shared/model.ts';
import { SponsorSpaces } from './sponsor-spaces.ts';
import { HEX, IMAGE, text } from './validate.ts';
import { RIOT_ID, isPuuid, splitRiot } from '../shared/riot.ts';
import { checks } from './readiness.ts';
import { CueDeck, type GraphicAction } from './cue-deck.ts';
import { OwnGraphics } from './own-graphics-service.ts';
import { Looks } from './looks.ts';
import { planScenes, sourcesMissing } from './scene-plan.ts';
import { PlayerCams } from './player-cams.ts';
import { companionAct, companionHello, type CompanionTarget } from './companion-bridge.ts';
import { obsSceneView, roomReadout } from './snapshot-parts.ts';
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
  /** How Air reads the PUBG MOBILE observer client (tests pass their own). */
  pcobFetch?: typeof fetch;
  /** Where Record PCOB writes (Documents/Esportra Air recordings); without it recording is not available. */
  recordingsDir?: string;
  /** Where the event journals are kept (userData/events); without it no journal is written. */
  journalDir?: string;
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
  /** Auto-backup debounce in ms (tests; default 10 s). */
  autoBackupMs?: number;
}

export { tagFor, tagsFor } from './team-tags.ts';


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
      const puuid = isPuuid(p?.puuid) ? String(p.puuid).trim() : '';
      const esportraId = typeof p?.esportraId === 'string' && /^[0-9a-f-]{36}$/i.test(p.esportraId) ? p.esportraId : '';
      return { id: typeof p?.id === 'string' && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : randomUUID(), name: text(p?.name, 32, `${label} name`), realName: p?.realName ? text(p.realName, 60, `${label} real name`) : '', gameId, ...(puuid ? { puuid } : {}), ...(esportraId ? { esportraId } : {}), photo };
    });
  }) as Match['players'];
}

export class Production extends EventEmitter {
  private readonly deps: ProductionDeps;
  private room: any = null;
  private roomV = -1;
  readonly log: EventLog;
  readonly autopilot: Autopilot;
  readonly stats: CaptureStats;
  readonly art: ArtCache;
  readonly packs: GamePacks;
  readonly lobbies: Lobbies;
  /** Safe saves (27 Nov): the event journal, event files and the auto-backup folder. */
  readonly journal: EventJournal | null;
  readonly eventFiles: EventFiles;
  readonly brGraphics: BrGraphics;
  /** The PUBG MOBILE observer feed (src/main/br-live.ts). */
  readonly brLive: BrLiveFeed;
  readonly pcobRecorder: PcobRecorder;
  readonly brAuto: BrAutopilot;
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
  /** A map left before it ended (the game aborted it): the producer decides what it was. */
  private stopped: { matchId: string; map: number; scores: [number, number] } | null = null;

  constructor(deps: ProductionDeps) {
    super();
    this.deps = deps;
    this.stats = deps.stats ?? new CaptureStats();
    this.art = new ArtCache({ catalogue: join(deps.engine.hudRoot, 'core', 'catalog.js'), dir: join(deps.engine.dataDir, 'art'), fetch: deps.artFetch, ...(deps.artOrigin ? { origin: deps.artOrigin } : {}) });
    this.art.on('change', () => this.emit('change'));
    // Game packs (20 Nov): official pictures hosted by Esportra, downloaded once a licence is confirmed.
    this.packs = new GamePacks({
      dir: join(deps.engine.dataDir, 'packs'), fetch: deps.artFetch,
      offer: async (game) => { if (!deps.esportra) throw new Error('Sign in to Esportra to download the game pack.'); return deps.esportra.gamePack(game); },
    });
    this.packs.on('change', () => this.emit('change'));
    // The event journal and event files (27 Nov): src/main/event-journal.ts, src/main/event-files.ts.
    this.journal = deps.journalDir ? new EventJournal(deps.journalDir, deps.now) : null;
    // Battle royale lobbies (20 Nov): src/main/br-lobbies.ts.
    this.lobbies = new Lobbies({
      journal: this.journal ?? undefined,
      store: deps.store, log: (t) => this.log.add(t), changed: () => this.emit('change'),
      patch: async (code, fields) => { if (deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(code)}`, fields); },
      live: (id) => (!!this.gameLocked() || this.brLive.live) && deps.store.data.selectedLobbyId === id,
      extra: (l) => this.brGraphics.roomFields(l),
      // Typed results run the post-game Rundown when no observer feed does it (Free Fire, or no Game data).
      typed: (l, n) => { if (!this.brLive.live && this.lobbies.selected?.id === l.id) this.brAuto.onMoment('game.end', { game: n, results: true }); },
    });
    // Lobby graphics on air (22 Nov): src/main/br-graphics.ts.
    this.brGraphics = new BrGraphics({
      action: async (room, name, args) => { if (!deps.engine.status) throw new Error('The graphics engine is not running.'); await this.client.post('/control/action', { match: room, name, args }); },
      assets: (l) => (deps.store.data.events.find((e) => e.id === l.eventId)?.gameLicence?.[l.game] ? this.packs.assets(l.game) : []),
      templates: (l) => ({ ...this.looks.state(), airBrand: this.brandOf(deps.store.data.events.find((e) => e.id === l.eventId) ?? null) }),
      templateGraphic: (id) => this.looks.templates.find((t) => t.id === id)?.graphic ?? null,
      eventName: (l) => deps.store.data.events.find((e) => e.id === l.eventId)?.name ?? '',
      event: (l) => deps.store.data.events.find((e) => e.id === l.eventId) ?? null,
    });
    // PUBG MOBILE live data (24 Nov): src/main/br-live.ts.
    this.pcobRecorder = new PcobRecorder({ dir: deps.recordingsDir ?? join(tmpdir(), 'Esportra Air recordings'), changed: () => this.emit('change'), now: deps.now });
    this.brLive = new BrLiveFeed({
      lobby: () => this.lobbies.selected,
      patch: async (code, fields) => { if (deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(code)}`, fields); },
      save: (id, n, results, feed) => this.lobbies.saveFeed(id, n, results, feed),
      learn: (id, seen) => this.lobbies.learnOpenIds(id, seen),
      event: (name, data) => this.brAuto.onMoment(name, data),
      log: (t) => this.log.add(t), changed: () => this.emit('change'),
      fetch: deps.pcobFetch,
      tap: (route, status, body) => this.pcobRecorder.record(route, status, body),
      air: (event) => this.pcobRecorder.air(event),
      recording: () => this.pcobRecorder.on,
    });
    // The lobby's Rundown run from the feed (24 Nov): src/main/br-autopilot.ts.
    this.brAuto = new BrAutopilot({
      lobby: () => this.lobbies.selected,
      take: async (l, screen) => { await this.brGraphics.take(l, screen); this.emit('change'); },
      log: (t) => this.log.add(t), changed: () => this.emit('change'),
    });
    this.eventFiles = new EventFiles({
      store: deps.store, journal: this.journal, version: deps.version, now: deps.now, debounceMs: deps.autoBackupMs,
      assets: {
        get: async (id) => { try { return await this.client.getBytes(`/air-assets/${id}`); } catch { return null; } },
        put: async (id, bytes) => { if (!deps.engine.status) throw new Error('The graphics engine is not running, so the pictures in the file cannot be kept. Start it and open the file again.'); await this.client.putBytes(`/control/assets/${id}`, bytes); },
      },
      selectedEventId: () => (gameOf(this.setup.game)?.shape === 'lobby' ? this.lobbies.selected?.eventId : this.match?.eventId) ?? this.lobbies.selected?.eventId ?? this.match?.eventId ?? null,
      live: () => !!this.gameLocked() || this.brLive.live,
      imported: async () => { this.own.syncScreens(); this.lobbies.refresh(); this.save(); await this.lobbies.publish().catch(() => {}); },
      changed: () => this.emit('change'), log: (t) => this.log.add(t),
    });
    this.packs.on('change', () => void this.lobbies.publish().catch(() => {}));
    void this.startPacks();
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
      // Game events follow at once: the event stream reconnects now, not at its next retry.
      this.log?.reconnect();
      this.noteRecovery();
      void this.syncEngine().catch(() => {});
    });
    deps.obs.on('change', changed);
    this.log = new EventLog({ nameOf: (t, i) => this.room?.players?.[t]?.[i]?.name || `P${i + 1}`, onChange: changed, onEvent: (event) => {
      // One at a time, in order: a round or map event first reads the room's score.
      this.eventChain = this.eventChain.then(() => this.onEngineEvent(event)).catch(() => {});
    } });
    this.cams = new PlayerCams({
      store: deps.store, hasMatch: () => !!this.match,
      playerName: (team, slot) => this.room?.players?.[team]?.[slot]?.name || null,
      teamTag: (team) => this.match?.teams[team]?.tag ?? null,
      act: (name, args) => this.act(name, args, false),
      onAir: () => this.room?.airFullscreen ?? null,
      showGrid: (on) => this.fullscreen('cam-grid', on, true),
      log: (text) => this.log.add(text),
    });
    this.esportraMatches = new EsportraMatches({
      account: () => deps.esportra, store: deps.store, game: () => this.setup.game ?? null,
      selectedSource: () => this.match?.source?.matchId ?? null, assertCanSwitch: () => this.assertCanSwitch(),
      carryOver: (id, name) => this.carryOver(id, name), library: () => this.library,
      save: () => this.save(), syncEngine: () => this.syncEngine(), log: (text) => this.log.add(text),
      now: () => (deps.now ?? Date.now)(),
      applyPackage: (pkg) => this.esportraSync.apply(pkg),
    });
    this.matchData = new MatchDataService({
      store: deps.store, match: () => this.match, eventId: () => this.match?.eventId ?? null,
      progress: () => {
        const wins = (this.room?.teams ?? []).map((t: { series?: number }) => Number(t?.series) || 0);
        return { mapsPlayed: (wins[0] ?? 0) + (wins[1] ?? 0), seriesWon: !!this.match && Math.max(0, ...wins) > this.match.bestOf / 2 };
      },
      save: () => this.save(),
      patch: async (fields) => { const m = this.match; if (m && this.deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(m.code)}`, fields); },
      log: (text) => this.log.add(text),
      veto: () => this.vetoOutbox,
    });
    this.esportraSync = new EsportraSync({
      account: () => deps.esportra, store: deps.store, match: () => this.match, matchData: this.matchData,
      live: () => !!this.gameLocked(),
      health: () => ({
        appVersion: deps.version, obsConnected: deps.obs.status.state === 'connected', captureActive: deps.capture.state === 'live',
        productionActive: !!this.match, feedState: deps.capture.state === 'live' ? 'live' : 'waiting',
      }),
      event: (id) => deps.store.data.events.find((e) => e.id === id), putEvent: (event) => this.putEvent(event),
      storeImage: (bytes, type) => this.storeImage(bytes, type),
      patch: async (fields) => { const m = this.match; if (m && this.deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(m.code)}`, fields); },
      reprepare: async (matchId) => { await deps.esportra?.refreshMatches(); await this.esportraMatches.use(matchId); },
      save: () => this.save(), log: (text) => this.log.add(text), changed: () => this.emit('change'), now: () => (deps.now ?? Date.now)(),
      outbox: () => this.vetoOutbox,
    });
    this.vetoOutbox = new VetoOutbox({
      store: deps.store, account: () => deps.esportra ?? null, matchData: this.matchData, flipped: (m) => this.esportraSync.flipped(m),
      save: () => this.save(), log: (text) => this.log.add(text), changed: () => this.emit('change'), now: () => (deps.now ?? Date.now)(),
    });
    if (deps.esportra) this.esportraSync.start();
    this.spaces = new SponsorSpaces({
      match: () => this.match, eventOf: (m) => this.eventOf(m), requireEvent: (id) => this.requireEvent(id), putEvent: (e) => this.putEvent(e),
      patch: async (fields) => { const m = this.match; if (m && this.deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(m.code)}`, fields); },
      save: () => this.save(), changed: () => this.emit('change'),
    });
    this.mapRecords = new MapRecords({
      store: deps.store, match: () => this.match, save: () => this.save(), log: (text) => this.log.add(text), now: () => (deps.now ?? Date.now)(),
      patch: async (fields) => { const m = this.match; if (m && this.deps.engine.status) await this.client.patch(`/api/${encodeURIComponent(m.code)}`, fields); },
    });
    this.looks = new Looks({
      store: deps.store, setup: () => this.setup, rows: () => this.autopilot.rows(), save: () => this.save(),
      publish: async () => { if (this.match) await this.syncEngine(); },
      brand: () => this.brandOf(this.match ? this.eventOf(this.match) : null), own: () => this.ownGraphics,
    });
    this.own = new OwnGraphics({
      store: deps.store, setup: () => this.setup, save: () => this.save(),
      putAsset: async (id, bytes) => { await this.client.putBytes(`/control/assets/${id}`, bytes); },
      publish: async () => { if (this.match) await this.syncEngine(); await this.librarySeed().catch(() => {}); },
      match: () => this.match, rows: () => this.autopilot.rows(), reloadRundown: () => this.autopilot.loadForMatch(),
      addRow: (row) => this.rundownSave(row), live: () => !!this.gameLocked(),
      onAir: () => (typeof this.room?.airFullscreen === 'string' ? this.room.airFullscreen : null),
      takeOff: () => this.fullscreen(null, false, true),
    });
    this.shows = new ShowTemplates({
      store: deps.store, match: () => this.match, rows: () => this.autopilot.rows(),
      replaceRows: (rows, from) => this.autopilot.replaceRows(rows, from), screens: () => this.autopilot.screenIds(),
      looks: () => this.templates, sectionOf: (s) => this.sectionOf(s), purposeOf: (s) => this.purposeOf(s),
      pause: () => lookOf(this.setup.look).pause,
      setPause: async (p) => { if (lookOf(this.setup.look).pause !== p) await this.updateSetup({ look: { ...lookOf(this.setup.look), pause: p } }); },
      setTheme: async (t) => { if (this.match && this.match.theme !== t) await this.updateMatch(this.match.id, { theme: t }); },
      log: (text) => this.log.add(text),
    });
    this.cue = new CueDeck({
      match: () => this.match,
      client: () => this.client,
      engineRunning: () => this.deps.engine.state === 'running',
      act: (name, args) => this.act(name, args, false),
      refresh: async () => { this.roomV = -1; await this.readRoom(); },
      matchesAir: (actions) => this.matchesAir(actions),
      log: (text) => this.log.add(text),
      changed: () => this.emit('change'),
    });
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
      hello: () => companionHello(this.companionTarget()),
      values: () => companionValues(this.room, {
        onAir: this.room?.airFullscreen ? this.screenTitle(this.room.airFullscreen) : 'Game',
        cued: this.pending.length, next: this.autopilot.view().next?.name ?? '',
      }),
      watch: () => ({
        onAir: this.room?.airFullscreen ?? null, pause: !!this.room?.airPause,
        dataPaused: !!this.deps.engine.status?.rooms.find((r) => r.match === this.match?.code.toUpperCase())?.feedPaused,
      }),
      act: async (name, args) => { await companionAct(this.companionTarget(), name, args); },
    });
    this.on('change', () => this.companion.onChange());
    // Companion is parked (12 Nov): the choice is not offered, so an earlier choice goes back to Air.
    if (deps.store.data.control && deps.store.data.control !== 'air') deps.store.data.control = 'air';
    void this.companion.sync();
    deps.obs.watchSlots(SCENE_KEYS.flatMap((key) => SCENES[key].slots.map((slot) => slot.scene)));
    deps.obs.watchScenes(SCENE_KEYS.map((key) => SCENES[key].name));
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
    this.eventFiles.stop();
  }

  // ── safe saves (27 Nov) ──

  /** The saved copies of air.json, newest first. */
  backupList() { return this.deps.store.backups(); }

  /** Loads a backup as the current data. Refused while game data or a test round runs; the data as it is now is backed up first. */
  async backupRestore(name: string) {
    if (this.gameLocked() || this.brLive.live) throw new Error('Game data or a test is running. Stop it before restoring a backup.');
    this.deps.store.restoreBackup(name);
    this.log.add('Restored a backup of Air’s saved data');
    this.autopilot.loadForMatch();
    await this.syncEngine().catch(() => {});
    this.emit('change');
  }

  dismissRecovered() {
    this.deps.store.recovered = null;
    this.emit('change');
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
    await this.lobbies.publish().catch(() => {});
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
    // Match data: veto, maps, holding text, champion, standings, ticker, bracket.
    await this.client.patch(`/api/${code}`, this.matchData.room() ?? {});
    // Sponsor spaces: the sponsor each graphic's space shows.
    await this.client.patch(`/api/${code}`, { airSpaces: this.spacesOf(match) });
    // Map records: what the post-game graphics show.
    await this.client.patch(`/api/${code}`, this.mapRecords.room() ?? {});
    // The lineups: the engine puts display names and photos on the players the game reports.
    await this.client.patch(`/api/${code}`, { airRoster: match.players.map((team) => team.map((p) => ({ gameId: p.gameId, ...(p.puuid ? { puuid: p.puuid } : {}), name: p.name, photo: p.photo }))) });
    // Setup decides where each layer starts; after that the console owns them for the match.
    await this.act('layers.init', { modes: this.initialModes() }, false);
    await this.cams.push();
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
      this.cue.scheduleSync();
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
    const known = new Set(this.setup.screens.map((x) => x.id));
    if (input.screens !== undefined && (!Array.isArray(input.screens) || input.screens.some((x) => typeof x !== 'string' || !known.has(x)))) throw new Error('Choose screens from the list.');
    const preset = input.template ?? 'standard';
    if (input.bands !== undefined && (!Array.isArray(input.bands) || input.bands.some((x) => typeof x !== 'string' || !BAND_SCREENS.has(x)))) throw new Error('Only screens with an overlay bar can use it.');
    const bands = new Set(input.bands ?? []);
    const rows = input.screens ? rowsForScreens([...new Set(input.screens)], preset, input.bestOf, (show) => this.sectionOf(show), (show) => this.purposeOf(show)) : presetRows(preset, input.bestOf);
    (data.rundown ??= {})[id] = { rows: rows.map((r) => (r.show && bands.has(r.show) ? { ...r, style: 'band' as const } : r)), startedFrom: preset };
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
    return this.storeImage(Buffer.from(m[2]!, 'base64'), `image/${m[1]}`);
  }

  /** Stores image bytes (PNG, or JPEG/WebP converted to PNG) in the engine and returns their URL. */
  private async storeImage(raw: Buffer, type: string): Promise<string> {
    if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error('Choose a PNG, JPEG or WebP image.');
    if (raw.length > 6_000_000) throw new Error('That image is larger than 6 MB. Choose a smaller one.');
    const png = this.deps.toPng ? this.deps.toPng(raw) : type === 'image/png' ? raw : null;
    if (!png) throw new Error('This build can only read PNG images.');
    const id = randomUUID();
    await this.client.putBytes(`/control/assets/${id}`, png);
    return `/air-assets/${id}`;
  }

  // ── your own graphics: src/main/own-graphics-service.ts ──

  readonly own: OwnGraphics;
  readonly shows: ShowTemplates;
  get ownGraphics(): OwnGraphic[] { return this.own.list; }
  uploadArtwork(dataUrl: string) { return this.own.uploadArtwork(dataUrl); }
  uploadFont(dataUrl: string, name: string) { return this.own.uploadFont(dataUrl, name); }
  ownSave(input: unknown) { return this.own.save(input); }
  ownDelete(id: string) { return this.own.delete(id); }
  ownUse(id: string) { this.own.use(id); }
  purposeOf(show: string) { return this.own.purposeOf(show); }
  sectionOf(show: string): Section { return this.own.sectionOf(show); }

  /**
   * Templates and own graphics viewers see right now (editing one changes it on air at once): the
   * full-screen graphic and its look, the HUD's look while game data is live, and the Break or Desk
   * look while that scene is on program in OBS.
   */
  private onAirLooks(): string[] {
    const room = this.room ?? {};
    const out: string[] = [];
    if (typeof room.airFullscreen === 'string') {
      if (isOwnScreen(room.airFullscreen)) out.push(room.airFullscreen.slice(4));
      else if (typeof room.airFullscreenTemplate === 'string') out.push(room.airFullscreenTemplate);
    }
    if (this.deps.capture.state === 'live') { const hud = this.hudTemplate(); if (hud) out.push(hud.id); }
    const program = this.deps.obs.status.programScene;
    const pages = (room.airPageTemplates ?? {}) as Record<string, string | null>;
    if (program === SCENES.holding.name) for (const k of ['holding|full', 'holding|band']) if (pages[k]) out.push(pages[k]!);
    if (program === SCENES.casters.name && pages['casters|full']) out.push(pages['casters|full']);
    return [...new Set(out)];
  }

  async selectMatch(id: string) {
    if (!this.deps.store.data.matches.some((m) => m.id === id)) throw new Error('That match is no longer available.');
    if (this.deps.store.data.selectedMatchId !== id) this.assertCanSwitch();
    if (this.deps.store.data.selectedMatchId !== id) this.rehearsal.stop();
    this.deps.store.data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
    // An Esportra match reads its lineup again in the background: Riot IDs verified since come in (17 Nov).
    const match = this.deps.store.data.matches.find((m) => m.id === id);
    if (match?.source && this.esportraMatches) {
      void this.esportraMatches.refreshLineup(match).then((changed) => changed && this.emit('change'), () => {});
    }
  }

  /** Teams/Players › Refresh from Esportra: the lineup and Riot IDs, read now. */
  async esportraLineupRefresh() {
    const match = this.match;
    if (!match?.source || !this.esportraMatches) throw new Error('This match is not from Esportra.');
    if (match.finishedAt) throw new Error('A finished match keeps the lineup it was played with. Reopen it first.');
    const changed = await this.esportraMatches.refreshLineup(match);
    this.log.add(changed ? 'Lineup refreshed from Esportra' : 'Lineup already matches Esportra');
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
    if (match && (raw.type === 'round.won' || raw.type === 'match.end' || raw.type === 'match.aborted')) {
      state = await this.client.get<{ state: any }>(`/api/${encodeURIComponent(match.code)}`).then((d) => d.state).catch(() => null);
      event = withScores(raw, state?.teams);
    }
    if (event.type === 'round.won') this.mapEndSeen = null;
    if (match && !this.testRoundRunning(match)) this.mapRecords.onEvent(event as Record<string, unknown>);
    if (event.type === 'round.phase') this.pauseHint.phase(String(event.phase ?? ''));
    this.autopilot.onGameEvent(event);
    this.companion.onEngineEvent(event);
    if (match && event.type === 'match.end' && state && this.mapEndSeen !== match.id) await this.countMap(match, state, event).catch((e) => this.log.add(`Map result not counted · ${(e as Error).message}`));
    if (match && event.type === 'match.aborted' && state && !this.testRoundRunning(match)) {
      const scores = ((event.scores as [number, number] | undefined) ?? [0, 0]);
      const wins = [0, 1].map((i) => Number(state?.teams?.[i]?.series) || 0);
      this.stopped = { matchId: match.id, map: wins[0]! + wins[1]! + 1, scores };
      this.log.add(`Map ${this.stopped.map} left at ${scores[0]}–${scores[1]} · waiting for you`);
      this.emit('notice', `The game left map ${this.stopped.map} at ${scores[0]}–${scores[1]}. Choose in Live whether it counts.`);
      this.emit('change');
    }
  }

  private testRoundRunning(match: Match) {
    return !!this.deps.engine.status?.rooms.find((r) => r.match === match.code.toUpperCase())?.testRound?.running;
  }

  /** The producer decides what a map the game left mid-way was: won by a team, remade, or nothing. */
  async mapStoppedResolve(choice: 'team0' | 'team1' | 'remade' | 'ignore') {
    const stopped = this.stopped;
    const match = this.match;
    if (!stopped || !match || stopped.matchId !== match.id) { this.stopped = null; throw new Error('There is no stopped map to decide.'); }
    this.stopped = null;
    if (choice === 'team0' || choice === 'team1') {
      const state = await this.client.get<{ state: any }>(`/api/${encodeURIComponent(match.code)}`).then((d) => d.state);
      await this.recordMap(match, state, stopped.scores, choice === 'team0' ? 0 : 1, 'Counted by the producer');
    } else this.log.add(choice === 'remade' ? `Map ${stopped.map} remade · not counted` : `Map ${stopped.map} stop ignored`);
    this.emit('change');
  }

  /** A finished map counts in the series from the game: its result on the series graphics, one more win. */
  private async countMap(match: Match, state: any, event: GameEvent) {
    const scores = event.scores as [number, number] | undefined;
    if (!scores) return;
    if (this.testRoundRunning(match)) return;
    const label = `${scores[0]}–${scores[1]}`;
    if (!mapComplete(scores)) {
      // Not a finished map (a forfeit, a remake, a server problem): the producer decides in Live.
      const wins = [0, 1].map((i) => Number(state?.teams?.[i]?.series) || 0);
      this.stopped = { matchId: match.id, map: wins[0]! + wins[1]! + 1, scores };
      this.log.add(`Map ended at ${label} · not counted as a result`);
      this.emit('notice', `The map ended at ${label}, so Air did not count it. Choose in Live whether it counts.`);
      this.emit('change');
      return;
    }
    // The game can report a map end twice; it counts once until a round of the next map is won.
    this.mapEndSeen = match.id;
    this.stopped = null; // a map that counts answers any earlier question about this map
    await this.recordMap(match, state, scores, scores[0] > scores[1] ? 0 : 1, 'from the game');
  }

  /** One more map in the series: its result on the series graphics and one more win for `winner`. */
  private async recordMap(match: Match, state: any, scores: [number, number], winner: 0 | 1, how: string) {
    const label = `${scores[0]}–${scores[1]}`;
    const wins = [0, 1].map((i) => Number(state?.teams?.[i]?.series) || 0);
    const map = wins[0]! + wins[1]! + 1;
    if (map > match.bestOf || Math.max(...wins) > match.bestOf / 2) return;
    // Already counted (the game can report a map end twice). Picked maps are listed beforehand without a winner.
    const done = state?.series?.[map - 1]?.winner;
    if (done === 0 || done === 1) return;
    wins[winner]!++;
    const fix = (field: string, value: unknown) => this.client.post(`/api/${encodeURIComponent(match.code)}/display-fixes`, { action: 'set', field, value, until: 'cleared', reason: `Map ${map} ${how}` });
    await fix('map_result', scores.map((score) => ({ mapIndex: map, score })));
    await fix('series', wins);
    this.log.add(`Map ${map} · ${match.teams[winner]?.name ?? 'Team'} win ${label} · series ${wins[0]}–${wins[1]}`);
    // The map's final data for the post-game graphics.
    await this.mapRecords.close(match, state, map, scores, winner, how === 'from the game' ? 'game' : 'producer').catch((e) => this.log.add(`Map record not kept · ${(e as Error).message}`));
    // An Esportra match: the result goes to the organizer for review (Air never writes scores).
    await this.esportraSync.propose(match, map, scores, how).catch((e) => this.log.add(`Result not queued for Esportra · ${(e as Error).message}`));
    this.roomV = -1;
    await this.readRoom();
    // The next map from the veto, and the holding text (Break, or Ending once the series is won).
    await this.matchData.publish().catch(() => {});
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
    this.lobbies.refresh();
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
    const player = validPlayer(input, this.library, this.setup.game ?? null);
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

  // ── templates and looks: src/main/looks.ts ──

  readonly looks: Looks;
  get templates(): Template[] { return this.looks.templates; }
  templateSave(input: unknown) { const r = this.looks.save(input); void this.lobbies.publish().catch(() => {}); return r; }
  templateDelete(id: string) {
    const r = this.looks.delete(id);
    // A deleted look leaves every lobby that used it.
    for (const l of this.lobbies.list()) { const t = l.look?.templates ?? {}; if (Object.values(t).includes(id)) this.lobbies.setLook(l.id, { ...BrGraphics.lookOf(l), templates: Object.fromEntries(Object.entries(t).filter(([, v]) => v !== id)) }); }
    void this.lobbies.publish().catch(() => {});
    return r;
  }

  // ── battle royale lobbies on air: src/main/br-graphics.ts ──
  lobbyLook(id: string, patch: unknown) {
    const l = this.lobbies.find(id);
    const p = (patch ?? {}) as Record<string, unknown>;
    const cur = BrGraphics.lookOf(l);
    this.lobbies.setLook(id, validLobbyLook({ ...cur, ...p, templates: p.templates === undefined ? cur.templates : { ...cur.templates, ...(p.templates as object) } }, (t) => this.looks.templates.find((x) => x.id === t)?.graphic ?? null));
  }
  lobbyPreview(id: string, theme?: unknown) {
    const l = this.lobbies.find(id);
    const f = this.brGraphics.roomFields(theme === undefined ? l : { ...l, look: { ...BrGraphics.lookOf(l), theme: validTheme(theme) } });
    return { airPack: f.airPack, airBrTheme: f.airBrTheme, brEmblem: f.brEmblem, brEvent: f.brEvent, brSponsors: f.brSponsors };
  }
  pcobConnect(host: unknown, consent: unknown) {
    if (!this.lobbies.selected) throw new Error('Choose the lobby on the graphics first.');
    this.brLive.connect(String(host ?? ''), consent === true);
    this.deps.store.data.pcobHost = this.brLive.status.host;
    this.deps.store.save();
  }
  pcobDisconnect() { this.pcobRecorder.stop('Game data was disconnected.'); this.brLive.disconnect(); }
  /** Record PCOB: only while Air reads the observer PC (the producer's consent is given when connecting). */
  pcobRecord(on: unknown) {
    if (on !== true) { this.pcobRecorder.stop(); return; }
    if (this.brLive.status.state === 'off') throw new Error('Connect to the observer PC first (and tick the consent box). Nothing is recorded without it.');
    this.pcobRecorder.start();
  }
  pcobRecordingFile() { return this.pcobRecorder.view().file; }
  pcobSeat(lobbyId: string, pcobTeamId: unknown, team: unknown) {
    const id = Number(pcobTeamId);
    if (!Number.isInteger(id) || id < 0 || id > 999) throw new Error('That team slot is not valid.');
    this.lobbies.setSeat(lobbyId, id, typeof team === 'string' && team ? team : null);
  }
  /** Moments, the Rundown, autopilot and the post-game pick; switching autopilot off stops what it runs. */
  lobbyShow(id: string, patch: unknown) {
    this.lobbies.setShow(id, (patch ?? {}) as Record<string, unknown>);
    if ((patch as Record<string, unknown> | null)?.autopilot === false) this.brAuto.stop();
  }
  async lobbyTake(id: string, screen: string | null) {
    const l = this.lobbies.find(id);
    // The producer's Take wins over whatever autopilot is running.
    this.brAuto.stop();
    if (this.deps.store.data.selectedLobbyId !== id) await this.lobbies.select(id);
    await this.brGraphics.take(l, screen);
    this.emit('change');
  }
  private breakLook() { return this.looks.breakLook(); }
  /** Holders Air adds: Break's windows only with the frame look; a desk camera holder only for talent with a camera. */
  private slotWanted(id: string) {
    if (!this.looks.slotWanted(id)) return false;
    if (id !== 'cam1' && id !== 'cam2') return true;
    const cams = this.match ? onAir(this.match, this.eventOf(this.match)).talent.filter((t) => t.camera.kind !== 'none').length : 0;
    return cams >= (id === 'cam1' ? 1 : 2);
  }
  private templateUse() { return this.looks.use(); }
  private hudTemplate() { return this.looks.hud(); }
  /** templateState(match) still decides the brand from the given match (sample rooms pass theirs). */
  private templateState(match: Match | null) { return { ...this.looks.state(), airBrand: this.brandOf(match ? this.eventOf(match) : null) }; }

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
    void this.lobbies.publish().catch(() => {});
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

  // ── game packs: src/main/game-packs.ts ──

  /** Whether any event confirmed a licence for this game's pack. */
  packLicensed(game: string) { return this.deps.store.data.events.some((e) => !!e.gameLicence?.[game]); }

  private async startPacks() {
    for (const game of Object.keys(LICENSED_PACKS)) {
      await this.packs.load(game);
      if (this.packLicensed(game)) this.packs.start(game);
    }
  }

  /** The producer confirms the event's tournament licence for a game's pack; the download starts. */
  async eventLicence(eventId: string, game: string, input: { confirmed?: unknown; number?: unknown } = {}) {
    if (!LICENSED_PACKS[game]) throw new Error('This game has no licensed pack.');
    const event = this.requireEvent(eventId);
    const licences = { ...(event.gameLicence ?? {}) };
    if (input.confirmed === false) delete licences[game];
    else {
      const number = typeof input.number === 'string' ? input.number.replace(/[<>]/g, '').trim().slice(0, 40) : '';
      licences[game] = { confirmedAt: Date.now(), ...(number ? { number } : {}) };
    }
    await this.putEvent({ ...event, gameLicence: licences });
    if (this.packLicensed(game)) this.packs.start(game);
  }

  /** Tries the pack's download again now. */
  async packDownload(game: string) {
    if (!this.packLicensed(game)) throw new Error('Confirm the tournament licence on an event first.');
    await this.packs.sync(game);
    const st = this.packs.statusOf(game);
    if (st.waiting) throw new Error(st.waiting);
  }

  /** The pack's pictures with their addresses on the graphics engine (for the asset browser). */
  packAssets(game: string) {
    const port = this.deps.engine.port;
    return this.packs.assets(game).map((a) => ({ ...a, src: assetSrc(port, game, a), thumbSrc: assetSrc(port, game, a, true) }));
  }

  private packsView(): Array<PackStatus & { licensed: boolean; licence: string; rules: string[] }> {
    return Object.entries(LICENSED_PACKS).map(([game, p]) => ({ ...this.packs.statusOf(game), licensed: this.packLicensed(game), licence: p.licence, rules: p.rules }));
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

  // ── sponsor spaces: src/main/sponsor-spaces.ts ──
  readonly spaces: SponsorSpaces;
  spacesOf(match: Match) { return this.spaces.of(match); }
  sponsorSpaceSet(eventId: string, space: SponsorSpace, sponsorId: string | null) { return this.spaces.setForEvent(eventId, space, sponsorId); }
  matchSpaceSet(space: SponsorSpace, sponsorId: string | null | undefined) { return this.spaces.setForMatch(space, sponsorId); }

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
    if (patch.bestOf !== undefined && patch.bestOf !== match.bestOf) {
      if (![1, 3, 5].includes(patch.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
      if (match.id === this.match?.id && this.gameLocked()) throw new Error('Stop game data or the test round before changing the best-of.');
      match.bestOf = patch.bestOf;
      this.matchData.bestOfChanged(match);
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

  /** The scenes Air builds, with each enabled graphic in its scene (PRD picture 9; src/main/scene-plan.ts). */
  buildPlan(): BuildScene[] {
    const on = this.match ? onAir(this.match, this.eventOf(this.match)) : { talent: [], sponsors: [] };
    return planScenes({ port: this.deps.engine.port, screens: this.setup.screens, talent: on.talent, sponsors: on.sponsors, slotWanted: (id) => this.slotWanted(id) });
  }

  /** Why the last Add to OBS failed, until one succeeds (shown on the Scenes check, not only as a toast). */
  private installError: string | null = null;

  async installGraphics() {
    const data = this.deps.store.data;
    try {
      await this.deps.obs.build(this.buildPlan(), data.owned, (owned) => {
        data.owned = owned;
        this.deps.store.save();
      });
      this.installError = null;
    } catch (error) {
      const text = String((error as Error)?.message ?? error);
      this.installError = text;
      this.log.add(`OBS scenes not added · ${text}`);
      throw error;
    } finally {
      this.emit('change');
    }
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

  // ── cue and take (graphics only): src/main/cue-deck.ts ──

  readonly cue: CueDeck;
  private get pending() { return this.cue.pending; }
  private graphic(label: string, actions: GraphicAction[]) { return this.cue.graphic(label, actions); }

  /** True when applying these actions would leave the on-air graphics as they are. */
  private matchesAir(actions: GraphicAction[]) {
    const last = actions.at(-1)!;
    const room = this.room ?? {};
    if (last.name === 'layer.set') return this.layerRows().find((r) => r.id === last.args.layer)?.mode === last.args.mode;
    if (last.name === 'fullscreen.show') return (room.airFullscreen ?? null) === (last.args.screen ?? null);
    if (last.name === 'lowerthird.hide') return !room.show?.lowerThird;
    if (last.name === 'poll.hide') return !room.show?.poll;
    return false;
  }

  syncCue() { return this.cue.sync(); }
  setCueMode(on: boolean) { this.cue.setMode(on); }
  clearCue() { this.cue.clear(); }
  takeCue(how: 'take' | 'cut' | 'stinger' = 'take') { return this.cue.take(how); }

  /** Starts or stops the PVW / PGM screenshot loop (the Console asks for it while it is on screen). */
  setMonitoring(on: boolean) {
    if (!on) {
      if (this.monitorTimer) clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      return;
    }
    if (this.monitorTimer) return;
    // Once a second: each picture makes OBS render and compress a frame, which competes with the game and the stream.
    this.monitorTimer = setInterval(() => void this.pump(), 1000);
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

  /**
   * Tech pause or timeout on air (or off with null). A timeout counts down from `seconds` (default 60;
   * Settings keeps the producer's length) and can name the team that called it.
   */
  async pause(kind: 'technical' | 'timeout' | null, options: { team?: 0 | 1 | null; seconds?: number | null } = {}) {
    const match = this.requireMatch();
    const path = `/api/${encodeURIComponent(match.code)}/pause-panel`;
    const current = this.room?.airPause?.id;
    if (current) await this.client.post(path, { action: 'clear', id: current });
    if (kind) {
      const id = randomUUID();
      const seconds = kind === 'timeout' ? Math.min(600, Math.max(10, Math.round(options.seconds ?? this.deps.store.data.timeoutSeconds ?? 60))) : null;
      const team = options.team === 0 || options.team === 1 ? options.team : null;
      await this.client.post(path, { action: 'show', panel: { kind, id, startedAt: Date.now(), scope: { showId: this.setup.id, matchId: match.id }, ...(team !== null ? { team } : {}), ...(seconds ? { seconds } : {}) } });
      this.pauseHint.dismiss();
      this.log.add(kind === 'technical' ? 'Tech pause on' : `Timeout on${team !== null ? ` · ${match.teams[team]?.name ?? 'Team'}` : ''}${seconds ? ` · ${seconds} s` : ''}`);
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

  /** Which PC's match data is used: `this-pc` or `peer:<id>` (one game data source at a time). */
  async joinUseSource(id: string) {
    await this.joinHost.useSource(id);
    this.log.add('Game data source changed');
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

  // ── match data: src/main/match-data.ts ──

  readonly matchData: MatchDataService;
  matchDataSave(input: unknown) { return this.matchData.save(input); }
  vetoStep(input: { map: string; side?: 'ATK' | 'DEF' }) { return this.matchData.vetoStep(input); }
  vetoUndo() { return this.matchData.vetoUndo(); }
  vetoReset() { return this.matchData.vetoReset(); }
  esportraBracketRefresh() { return this.esportraSync.refreshBracket(); }
  async showTemplateApply(id: string) { await this.shows.apply(id); this.emit('change'); }
  showTemplateSave(input: { name?: unknown; id?: unknown }) { const id = this.shows.save(input); this.emit('change'); return id; }
  showTemplateRename(id: string, name: unknown) { this.shows.rename(id, name); this.emit('change'); }
  showTemplateDuplicate(id: string) { const x = this.shows.duplicate(id); this.emit('change'); return x; }
  showTemplateDelete(id: string) { this.shows.remove(id); this.emit('change'); }
  vetoFirst(team: 0 | 1) { return this.matchData.vetoFirst(team); }
  async vetoToss() { await this.matchData.vetoToss(); }
  vetoEdit(index: number, input: { map?: string; side?: 'ATK' | 'DEF' | null; sideTeam?: 0 | 1 | null }) { return this.matchData.vetoEdit(index, input); }
  eventDataSave(eventId: string, input: unknown) { return this.matchData.saveEvent(eventId, input); }
  playerPrepSave(playerId: string, input: unknown) { return this.matchData.savePrep(playerId, input); }

  // ── Esportra: src/main/esportra-matches.ts ──

  readonly esportraMatches: EsportraMatches;
  async esportraSignIn(email: string, password: string) {
    await this.esportraMatches.signIn(email, password);
    // A pack that waited for a sign-in downloads now.
    for (const game of Object.keys(LICENSED_PACKS)) if (this.packLicensed(game)) this.packs.start(game);
  }
  async esportraSignOut() { this.esportraMatches.signOut(); }
  esportraRefresh() { return this.esportraMatches.refresh(); }
  esportraCheck() { return this.esportraMatches.check(); }
  esportraRequestAccess(note: unknown) { return this.esportraMatches.requestAccess(note); }
  esportraWithdrawRequest() { return this.esportraMatches.withdrawRequest(); }
  useEsportraMatch(matchId: string) { return this.esportraMatches.use(matchId); }
  readonly esportraSync: EsportraSync;
  /** Veto steps entered here for the Esportra match room (two-way veto, 16 Nov). */
  readonly vetoOutbox: VetoOutbox;
  /** The producer picks which veto stands after the match room changed, or confirms sending a corrected veto. */
  async vetoOutboxResolve(keep: 'air' | 'esportra') {
    const match = this.requireMatch();
    await this.vetoOutbox.resolve(match, keep === 'esportra' ? 'esportra' : 'air');
    if (keep === 'esportra') await this.esportraSync.followAgain(match);
  }
  vetoOutboxRetry() { this.vetoOutbox.retry(this.requireMatch()); }
  vetoOutboxStart() { this.vetoOutbox.start(this.requireMatch()); }

  /** The buy phase running long: maybe a timeout nobody announced (approved mock 15 Nov). */
  readonly pauseHint = new PauseHint(() => this.emit('change'));

  // ── map records: src/main/map-records.ts ──
  readonly mapRecords: MapRecords;
  recordShow(choice: RecordChoice) { return this.mapRecords.show(choice); }
  recordRemove(map: number) { return this.mapRecords.remove(map); }
  postOptions(input: Partial<import('./map-records.ts').PostOptions>) { return this.mapRecords.setOptions(input); }
  /** Keeps the map being played as it stands, without counting it in the series (the game did not end it properly). */
  async closeMap() {
    const match = this.requireMatch();
    await this.mapRecords.closeCurrent(match, await this.client.get<{ state: any }>(`/api/${encodeURIComponent(match.code)}`).then((d) => d.state));
    this.emit('change');
  }
  esportraReview(proposalId: string, decision: 'apply' | 'reject') { return this.esportraSync.review(proposalId, decision); }
  async vetoFollowEsportra() {
    // Steps entered here that have not reached the match room are dropped: its veto is taken as it is.
    if (this.vetoOutbox.linked(this.match)) await this.vetoOutbox.resolve(this.match, 'esportra');
    await this.matchData.followEsportra();
    await this.esportraSync.followAgain(this.match!);
  }

  // ── player cameras: src/main/player-cams.ts ──

  readonly cams: PlayerCams;
  camsSet(patch: { layout?: CamsView['layout']; delayMs?: number }) { return this.cams.set(patch); }
  camCreate(team: number, slot: number) { return this.cams.create(team, slot); }
  camRemove(team: number, slot: number) { return this.cams.remove(team, slot); }

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

  /** Companion sees and does only what src/main/companion-bridge.ts allows (the same methods as keys). */
  private companionTarget(): CompanionTarget {
    return {
      control: this.control, version: () => this.deps.version, screens: () => this.setup.screens,
      people: () => (this.match ? onAir(this.match, this.eventOf(this.match)) : { talent: [], sponsors: [] }),
      onAirScreen: () => this.room?.airFullscreen ?? null,
      setLayer: (id, mode) => this.setLayer(id, mode), lowerThird: (x) => this.lowerThird(x), sponsorRead: (id) => this.sponsorRead(id),
      toast: (text) => this.toast(text), pause: (kind) => this.pause(kind), takeCue: (how) => this.takeCue(how), clearCue: () => this.clearCue(),
      autopilotHold: () => this.autopilotHold(), autopilotSkip: () => this.autopilotSkip(), autopilotTake: () => this.autopilotTake(),
    };
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
      // What this player has done before (Teams/Players prep): Player profile's season numbers and quote.
      const puuid = this.room?.players?.[observed.team]?.[observed.player]?.puuid;
      const lineup = this.match?.players.flat().find((p) => (puuid && (p.puuid === puuid || p.gameId === puuid)) || p.name === observed.name);
      await this.client.patch(`/api/${encodeURIComponent(this.match!.code)}`, { spotlight: this.matchData.spotlightFields(lineup?.libraryId) }).catch(() => {});
    }
    if (on && screenId === 'cam-grid' && this.cams.layout === 'ingame') {
      this.cams.layout = 'grid10';
      this.deps.store.save();
      await this.cams.push();
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
    // A series fix moves the current map (from the veto) and the holding text along.
    await this.matchData.publish().catch(() => {});
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
    // Your own graphics are full-screen graphics on Live too (no default key; bind one in Settings › Keyboard).
    const own = this.ownGraphics.map((g) => ({ id: `fs:${ownScreenId(g.id)}`, label: g.name, group: 'fullscreen' as const, hotkey: '' }));
    return [...LAYER_DEFS, ...own].map((def) => {
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

  private snapSeq = 0;
  snapshot(): Snapshot {
    const { engine, obs, capture, version } = this.deps;
    const status: EngineStatus | null = engine.status;
    const match = this.match;
    const roomStatus = match ? status?.rooms.find((r) => r.match === match.code.toUpperCase()) : undefined;
    const room = match ? this.room : null;
    const readout = room ? roomReadout(room, this.observedPlayer()) : null;
    const enabled = this.setup.screens.filter((s) => s.enabled && !s.hosted);
    const outputs = enabled.map((s) => {
      const o = status?.outputs.find((x) => x.id === s.outputId);
      return { screenId: s.id, title: s.title, overlay: s.overlay, url: `http://127.0.0.1:${engine.port}/o/${s.outputId}`, connections: o?.connections ?? 0, lastFrameAt: o?.lastFrameAt ?? null };
    });
    const { missingScenes, missingSources, installed, sceneStatus } = obsSceneView(obs.status, this.buildPlan(), (id) => this.slotWanted(id));
    const feedState = capture.state === 'live' && roomStatus?.lastFeedAt == null ? 'waiting' : capture.state;
    const snapshot: Snapshot = {
      seq: ++this.snapSeq,
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
        installed, missingScenes, missingSources, installError: installed ? null : this.installError, scenes: sceneStatus, sceneNames: obs.status.scenes, videoInputs: obs.status.videoInputs,
      },
      outputs,
      testRound: { running: roomStatus?.testRound.running ?? false, startedAt: roomStatus?.testRound.startedAt ?? null, durationMs: roomStatus?.testRound.durationMs ?? 0, speed: roomStatus?.testRound.speed ?? 1, fromMs: roomStatus?.testRound.fromMs ?? 0 },
      capture: this.stats.view(),
      cams: this.cams.view(roomStatus?.cams),
      triggers: this.liveTriggers(),
      layers: this.layerRows(),
      autopilot: this.autopilot.view(),
      rundown: this.autopilot.rows(),
      templates: this.templates,
      ownGraphics: this.ownGraphics,
      onAirLooks: this.onAirLooks(),
      mapStopped: this.stopped && this.stopped.matchId === this.match?.id ? { map: this.stopped.map, scores: this.stopped.scores } : null,
      matchData: this.match ? this.matchData.of(this.match) : null,
      eventData: this.match?.eventId ? this.matchData.eventData(this.match.eventId) : null,
      playerPrep: this.deps.store.data.playerPrep ?? {},
      templateUse: this.templateUse(),
      showTemplates: this.shows.views(),
      showTemplateOf: this.match ? this.deps.store.data.showTemplateOf?.[this.match.id] ?? null : null,
      library: { teams: this.library.teams, players: this.library.players },
      control: this.control,
      companion: this.companion.view(),
      cue: { mode: this.cue.mode, pending: this.pending.map((c) => c.label), room: this.cue.room() },
      esportra: this.deps.esportra?.view() ?? signedOut(),
      esportraResults: this.esportraSync.view(this.match),
      esportraVeto: this.esportraSync.vetoView(this.match),
      mapRecords: this.mapRecords.view(this.match),
      pauseHint: this.room?.airPause ? null : this.pauseHint.view(),
      mode: this.mode,
      join: this.joinHost.view(),
      devices: devicesView({ lineup: this.match?.players ?? null, roomPlayers: Array.isArray(this.room?.players) ? this.room.players : null, peers: this.joinHost.view().peers, sources: this.joinHost.view().dataSources, now: Date.now() }),
      link: this.link.view(),
      autopilotBlock: this.autopilot.block(),
      log: this.log.list(),
      checks: [],
      recovery: this.recoveryText(),
      recovered: this.deps.store.recovered,
      autoBackup: this.eventFiles.view(),
      art: this.art.status,
      packs: this.packsView(),
      lobbies: this.lobbies.list(),
      lobbyOnAir: this.lobbies.selected ? this.brGraphics.onAir(this.lobbies.selected) : null,
      brAuto: this.brAuto.status(),
      pcobLive: this.brLive.live ? this.brLive.last : null,
      pcobRecording: this.pcobRecorder.view(),
      pcob: { ...this.brLive.status, host: this.brLive.status.host || this.deps.store.data.pcobHost || '127.0.0.1:10086' },
      selectedLobbyId: this.deps.store.data.selectedLobbyId ?? null,
      rehearsal: this.rehearsal.view(),
    };
    snapshot.checks = checks(snapshot);
    return snapshot;
  }
}
