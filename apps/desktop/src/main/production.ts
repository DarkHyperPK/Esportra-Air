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
import type { BuildScene } from './scene-build.ts';
import { SCENE_KEYS, SCENES, sourceName, type SlotId } from '../shared/scenes.ts';
import { AUTO_LAYERS, GAME_DRAWS, LAYER_DEFS, SETUP_LAYER_KEYS, defaultMode, type LayerMode } from '../shared/layers.ts';
import { EventLog } from './event-log.ts';
import { Autopilot } from './autopilot/autopilot.ts';
import { CaptureStats } from './capture-stats.ts';
import { GAMES } from '../shared/games.ts';
import { LIBRARY_ROOM } from '../shared/library.ts';
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
import type { Preset, SegmentEdit } from '../shared/autopilot.ts';
import type { Store } from './store.ts';

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
}

const PLAIN = /^[^<>\x00-\x1f\x7f]*$/;
const COLORS = ['#4fd3ea', '#e0445e'];

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || !PLAIN.test(value)) {
    throw new Error(`${label}: use plain text, 1–${max} characters.`);
  }
  return value.trim();
}

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
/** Images Air stored in the engine's asset store, or an https URL (Esportra logos). */
const IMAGE = /^(https:\/\/[^\s"'<>]{1,500}|\/air-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HEX = /^#[0-9a-f]{6}$/i;

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
      if (gameId && !RIOT_ID.test(gameId)) throw new Error(`${label}: write the Riot ID as Name#TAG.`);
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
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitorBusy = false;

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
    deps.engine.on('restarted', () => void this.syncEngine().catch(() => {}));
    deps.obs.on('change', changed);
    this.log = new EventLog({ nameOf: (t, i) => this.room?.players?.[t]?.[i]?.name || `P${i + 1}`, onChange: changed, onEvent: (event) => this.autopilot.onGameEvent(event) });
    this.autopilot = new Autopilot({
      store: deps.store, match: () => this.match, screens: () => this.setup.screens,
      showGraphic: async (id, transition) => {
        if (transition === 'stinger') {
          await this.act('stinger.play', {}, false);
          await new Promise((r) => setTimeout(r, 450));
        }
        await this.fullscreen(id, id !== null, true);
      },
      showing: () => this.room?.airFullscreen ?? null,
      log: (line) => this.log.add(line), changed,
    });
    deps.obs.watchSlots(SCENE_KEYS.flatMap((key) => SCENES[key].slots.map((slot) => slot.scene)));
    deps.capture.on('change', changed);
    // The Capture page's sparklines move once a second while data is flowing.
    const tick = setInterval(() => deps.capture.state === 'live' && this.emit('change'), 1000);
    tick.unref?.();
  }

  get setup() {
    return this.deps.store.data.setup;
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
  async syncEngine() {
    const match = this.match;
    const setup = this.setup;
    const outputs = setup.screens.filter((s) => s.enabled && !s.hosted).map((s) => ({ id: s.outputId, overlay: s.overlay, matchCode: match?.code ?? 'MAIN' }));
    await this.client.put('/control/outputs', { outputs });
    this.deps.ingest.target(match ? this.client.ingestUrl(match.code) : null);
    if (!match) {
      this.log.target(null);
      return;
    }
    const code = encodeURIComponent(match.code);
    await this.client.post(`/api/${code}/config`, {
      airContext: { showId: setup.id, matchId: match.id, source: match.kind },
      teams: match.teams,
      event: { name: match.event.name || match.source?.tournament || setup.name, stage: match.event.stage, bestOf: match.bestOf },
      casters: match.casters.length ? match.casters : [{ name: '', handle: '' }, { name: '', handle: '' }],
      sponsors: match.sponsors,
      layout: { bannerTheme: match.theme ?? setup.package, minimap: setup.minimap },
      show: { eventBug: setup.hud.eventBug !== false },
    });
    const managed = new Set<string>(SETUP_LAYER_KEYS);
    const plain = Object.fromEntries(Object.entries(setup.hud).filter(([k]) => !managed.has(k) && !(GAME_DRAWS as readonly string[]).includes(k)));
    if (Object.keys(plain).length) await this.client.patch(`/api/${code}`, { show: plain });
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

  private async readRoom() {
    const match = this.match;
    if (!match || this.deps.engine.state !== 'running') return;
    const room = this.deps.engine.status?.rooms.find((r) => r.match === match.code.toUpperCase());
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
    } catch {
      // Engine unavailable; the supervisor reports it.
    }
    this.emit('change');
  }

  // ── matches ──

  async createQuickMatch(input: QuickMatchInput) {
    const names = [text(input.teamA, 40, 'Team A'), text(input.teamB, 40, 'Team B')];
    if (names[0]!.toLowerCase() === names[1]!.toLowerCase()) throw new Error('The two teams need different names.');
    if (![1, 3, 5].includes(input.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
    const id = randomUUID();
    const tags = tagsFor(names[0]!, names[1]!);
    const teams = names.map((name, i) => ({ name, tag: tags[i]!, color: COLORS[i]!, logo: '' })) as [Team, Team];
    const match: Match = {
      id, code: `Q${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, kind: 'quick', title: `${names[0]} vs ${names[1]}`,
      bestOf: input.bestOf, teams, casters: [], createdAt: (this.deps.now ?? Date.now)(),
      game: input.game ?? 'valorant', players: [[], []], ...this.carryOver(null),
    };
    const data = this.deps.store.data;
    data.matches = [match, ...data.matches].slice(0, 50);
    data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
  }

  /** The New match wizard: game, teams, lineups, talent, event and sponsors in one go. */
  async createMatch(input: NewMatchInput) {
    const game = GAMES.find((g) => g.id === input?.game);
    if (!game) throw new Error('Choose a game.');
    if (!game.available) throw new Error(`${game.name} is coming to Air. Choose VALORANT for now.`);
    if (![1, 3, 5].includes(input.bestOf)) throw new Error('Choose best of 1, 3 or 5.');
    const teams = validTeams(input.teams);
    const players = validPlayers(input.players ?? [[], []]);
    if (!Array.isArray(input.casters) || input.casters.length > 2) throw new Error('Add up to two casters.');
    const casters = input.casters.filter((c) => c?.name?.trim()).map((c, i) => ({ name: text(c.name, 40, `Caster ${i + 1}`), handle: c.handle ? text(c.handle, 40, `Caster ${i + 1} handle`) : '' }));
    if (!Array.isArray(input.sponsors) || input.sponsors.length > 12) throw new Error('Add up to 12 sponsors.');
    const id = randomUUID();
    const match: Match = {
      id, code: `Q${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, kind: 'quick', title: `${teams[0].name} vs ${teams[1].name}`,
      bestOf: input.bestOf, teams, casters, createdAt: (this.deps.now ?? Date.now)(), game: game.id, players,
      event: { name: input.event?.name ? text(input.event.name, 60, 'Event name') : '', stage: input.event?.stage ? text(input.event.stage, 60, 'Stage') : '' },
      sponsors: input.sponsors.map((s, i) => text(s, 40, `Sponsor ${i + 1}`)),
      theme: input.theme && BANNER_THEMES.includes(input.theme) ? input.theme : this.carryOver(null).theme,
    };
    const data = this.deps.store.data;
    data.matches = [match, ...data.matches].slice(0, 50);
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
      if (m.event.name) state.event = { ...state.event, name: m.event.name.toUpperCase(), stage: (m.event.stage || state.event.stage).toUpperCase() };
      if (m.casters.length) state.casters = m.casters.map((c) => ({ name: c.name, handle: c.handle }));
      if (m.sponsors.length) state.sponsors = m.sponsors;
    }
    state.layout = { ...(state.layout ?? {}), bannerTheme: m?.theme ?? this.setup.package };
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
    if (this.deps.store.data.selectedMatchId !== id) this.rehearsal.stop();
    this.deps.store.data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
  }

  /** A new match starts with the event and sponsors of the latest match (of the same tournament, when there is one). */
  private carryOver(tournamentId: string | null): Pick<Match, 'event' | 'sponsors' | 'theme'> {
    const list = this.deps.store.data.matches;
    const from = (tournamentId && list.find((m) => m.source?.tournamentId === tournamentId)) || list[0];
    return { event: { ...(from?.event ?? { name: '', stage: '' }) }, sponsors: [...(from?.sponsors ?? [])], theme: from?.theme ?? this.setup.package ?? 'broadcast' };
  }

  async updateMatch(id: string, patch: Partial<Pick<Match, 'casters' | 'title' | 'event' | 'sponsors' | 'players' | 'teams' | 'bestOf' | 'theme'>>) {
    const match = this.deps.store.data.matches.find((m) => m.id === id);
    if (!match) throw new Error('That match is no longer available.');
    if (patch.title !== undefined) match.title = text(patch.title, 80, 'Match title');
    if (patch.casters !== undefined) {
      if (!Array.isArray(patch.casters) || patch.casters.length > 2) throw new Error('Add up to two casters.');
      match.casters = patch.casters.map((c, i) => ({ name: text(c.name, 40, `Caster ${i + 1}`), handle: c.handle ? text(c.handle, 40, `Caster ${i + 1} handle`) : '' }));
    }
    if (patch.event !== undefined) {
      match.event = { name: patch.event.name ? text(patch.event.name, 60, 'Event name') : '', stage: patch.event.stage ? text(patch.event.stage, 60, 'Stage') : '' };
    }
    if (patch.sponsors !== undefined) {
      if (!Array.isArray(patch.sponsors) || patch.sponsors.length > 12) throw new Error('Add up to 12 sponsors.');
      match.sponsors = patch.sponsors.map((s, i) => text(s, 40, `Sponsor ${i + 1}`));
    }
    if (patch.players !== undefined) match.players = validPlayers(patch.players);
    if (patch.teams !== undefined) {
      match.teams = validTeams(patch.teams);
      match.title = `${match.teams[0].name} vs ${match.teams[1].name}`;
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
    if (patch.sponsors !== undefined) {
      if (!Array.isArray(patch.sponsors) || patch.sponsors.length > 12) throw new Error('Add up to 12 sponsors.');
      setup.sponsors = patch.sponsors.map((s, i) => text(s, 40, `Sponsor ${i + 1}`));
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
    return SCENE_KEYS.map((key) => {
      const def = SCENES[key];
      return {
        name: def.name,
        exclusive: def.exclusive,
        slots: def.slots.map((slot) => ({ id: slot.id, sceneName: slot.scene, frame: slot.frame })),
        sources: [
          ...this.setup.screens
            .filter((x) => x.scene === key && x.enabled && !x.hosted)
            .map((x) => ({ id: x.id, inputName: sourceName(x.title), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })),
          // Full-screen graphics also cover the game: Take shows them without switching OBS scenes.
          ...(key === 'gameplay' ? this.setup.screens.filter((x) => x.id === 'fullscreen' && x.enabled).map((x) => ({ id: 'fullscreen-over-game', inputName: sourceName('Full screen over game'), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })) : []),
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
  private pending: Array<{ key: string; label: string; actions: Array<{ name: string; args: Record<string, unknown> }> }> = [];
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
    for (const change of changes) for (const a of change.actions) await this.act(a.name, a.args, false);
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
    await this.esportra.refreshMatches();
  }

  /** Makes an Esportra match the match on this PC: teams, tags, logos, best-of and tournament name. */
  async useEsportraMatch(matchId: string) {
    const account = this.esportra;
    const found = account.view().matches.find((m) => m.id === matchId);
    if (!found) throw new Error('That match is no longer in your Esportra schedule. Refresh the list.');
    if (!found.supported) throw new Error('Air only produces Valorant matches for now.');
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
      // The tournament may have changed names, logos or best-of; the producer's casters are kept.
      Object.assign(existing, { title: `${found.teamA} vs ${found.teamB}`, teams, bestOf: found.bestOf as 1 | 3 | 5, source });
      data.selectedMatchId = existing.id;
    } else {
      const id = randomUUID();
      const players = [0, 1].map((t) => (lineups?.[t] ?? []).map((name) => ({ id: randomUUID(), name, realName: '', gameId: '', photo: '' }))) as Match['players'];
      const carried = this.carryOver(found.tournamentId);
      const match: Match = { id, code, kind: 'esportra', title: `${found.teamA} vs ${found.teamB}`, bestOf: found.bestOf as 1 | 3 | 5, teams, casters: [], createdAt: (this.deps.now ?? Date.now)(), source, game: 'valorant', players, event: { name: found.tournament || carried.event.name, stage: carried.event.stage }, sponsors: carried.sponsors, theme: carried.theme };
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

  /** The link a player opens on their own PC to send their camera (VDO.Ninja, no account needed). */
  private pushUrl(id: string, label: string) {
    return `https://vdo.ninja/?push=${id}&webcam&autostart&quality=0&label=${encodeURIComponent(label)}`;
  }

  private camsView(connected?: boolean[][]): CamsView {
    const cams = this.cams;
    const slots = [0, 1].flatMap((team) => [0, 1, 2, 3, 4].map((slot) => {
      const id = cams.ids[team]?.[slot] ?? null;
      const name = this.room?.players?.[team]?.[slot]?.name || `${this.match?.teams[team]?.tag ?? (team ? 'B' : 'A')} · Player ${slot + 1}`;
      return { team, slot, name, id, pushUrl: id ? this.pushUrl(id, name) : null, connected: !!id && !!connected?.[team]?.[slot] };
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

  // ── autopilot ──

  autopilotStart() {
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
  autopilotPreset(preset: Preset) {
    this.autopilot.setPreset(preset);
    this.log.add(`Autopilot preset · ${preset}`);
  }
  segmentUpdate(id: string, edit: SegmentEdit) {
    this.autopilot.edit(id, edit);
  }
  segmentMove(id: string, direction: number) {
    this.autopilot.move(id, direction < 0 ? -1 : 1);
  }

  async casterStrap(on: boolean) {
    const match = this.requireMatch();
    if (on && !match.casters.some((c) => c.name)) throw new Error('Add the casters’ names first.');
    await this.graphic(on ? 'Caster lower third' : 'Lower third off', [{ name: on ? 'lowerthird.caster' : 'lowerthird.hide', args: {} }]);
  }

  async sponsorRead(sponsor: string | null) {
    if (sponsor !== null && !this.requireMatch().sponsors.includes(sponsor)) throw new Error('Add this sponsor to the match first.');
    await this.graphic(sponsor ? `Sponsor read · ${sponsor}` : 'Lower third off', [sponsor ? { name: 'lowerthird.generic', args: { title: sponsor, sub: 'Presented by', team: -1 } } : { name: 'lowerthird.hide', args: {} }]);
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
  private async fullscreen(screenId: string | null, on: boolean, direct = false) {
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
    actions.push({ name: 'fullscreen.show', args: { screen: on && screen ? screen.id : null } });
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
    const sponsor = lowerOn && lt.kind === 'generic' && lt.sub === 'Presented by' ? String(lt.title) : null;
    return {
      pause: room?.airPause?.kind ?? null,
      strap: lowerOn && lt.kind === 'caster',
      sponsor,
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
    const wanted = SCENE_KEYS.flatMap((k) => [SCENES[k].name, ...SCENES[k].slots.map((slot) => slot.scene)]);
    const missingScenes = wanted.filter((n) => !obs.status.scenes.includes(n));
    const installed = obs.status.state === 'connected' && missingScenes.length === 0;
    const sceneStatus: SceneStatus[] = SCENE_KEYS.map((k) => ({
      key: k,
      name: SCENES[k].name,
      inObs: obs.status.scenes.includes(SCENES[k].name),
      slots: SCENES[k].slots.map((slot) => ({ id: slot.id, label: slot.label, scene: slot.scene, source: obs.status.slots[slot.scene] ?? null })),
    }));
    const feedState = capture.state === 'live' && roomStatus?.lastFeedAt == null ? 'waiting' : capture.state;
    const snapshot: Snapshot = {
      version,
      engine: { state: engine.state, port: engine.port, reattached: engine.reattached, error: engine.error },
      setup: this.setup,
      matches: this.deps.store.data.matches,
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
      cue: { mode: this.cueMode, pending: this.pending.map((c) => c.label), room: match ? `__ESA_SIM_CUE_${match.code}` : null },
      esportra: this.deps.esportra?.view() ?? signedOut(),
      mode: this.mode,
      join: this.joinHost.view(),
      link: this.link.view(),
      autopilotBlock: this.autopilot.block(),
      log: this.log.list(),
      checks: [],
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
  if (a.have >= a.total) return { id: 'art', title, detail: `All ${a.total} agent, weapon and map pictures are on this PC. Graphics show them without internet.`, health: 'ok' };
  if (a.downloading) return { id: 'art', title, detail: `Downloading pictures to this PC: ${a.have} of ${a.total}…`, health: 'off' };
  return { id: 'art', title, detail: `${a.total - a.have} of ${a.total} pictures are not on this PC yet, and media.valorant-api.com could not be reached. Graphics run without them; Air tries again every minute.`, health: 'warn', action: { id: 'download-art', label: 'Download now' } };
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
      ? { id: 'match', title: 'Show and match', detail: `${s.match.title}${s.match.event.name ? ` · ${s.match.event.name}` : ''} · Bo${s.match.bestOf}`, health: 'ok' }
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
      ? { id: 'obs', title: 'OBS', detail: `OBS ${s.obs.version ?? ''} on this PC · obs-websocket connected`, health: 'ok' }
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
  const casters = s.match?.casters.filter((c) => c.name).length ?? 0;
  out.push(
    casters
      ? { id: 'talent', title: 'Talent', detail: `${casters} caster${casters > 1 ? 's' : ''} ready for the lower third.`, health: 'ok' }
      : { id: 'talent', title: 'Talent', detail: 'No casters added. The caster lower third needs their names.', health: s.match ? 'warn' : 'off', ...(s.match ? { action: { id: 'add-casters' as const, label: 'Add casters' } } : {}) },
  );
  out.push(
    artCheck(s.art),
  );
  return out;
}
