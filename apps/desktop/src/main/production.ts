// The production model: one setup, the selected match, and everything that serves it.
// Pushes match and setup to the engine, points outputs and capture at the match's room, runs the
// manual triggers, and builds the snapshot the interface renders (including the Check list).

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { BANNER_THEMES, type CheckItem, type CorrectionInput, type Match, type QuickMatchInput, type Setup, type Snapshot, type Team } from '../shared/api.ts';
import type { EngineClient, EngineStatus } from './engine-client.ts';
import type { EngineSupervisor } from './engine-supervisor.ts';
import type { GepBridge } from './gep.ts';
import type { IngestClient } from './ingest.ts';
import type { ObsLink, SceneRow } from './obs.ts';
import type { Store } from './store.ts';

export interface ProductionDeps {
  store: Store;
  engine: Pick<EngineSupervisor, 'state' | 'error' | 'reattached' | 'status' | 'port' | 'on'> & { client: EngineClient };
  obs: ObsLink;
  capture: { state: GepBridge['state']; reason: string | null; start(): void; stop(): void; on(event: 'change', listener: () => void): unknown };
  ingest: Pick<IngestClient, 'target'>;
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

export function sceneName(title: string) {
  return `Air · ${title}`;
}

export class Production extends EventEmitter {
  private readonly deps: ProductionDeps;
  private room: any = null;
  private roomV = -1;
  private pauseId: string | null = null;
  triggers: Snapshot['triggers'] = { pause: null, strap: false, sponsor: null };

  constructor(deps: ProductionDeps) {
    super();
    this.deps = deps;
    const changed = () => this.emit('change');
    deps.engine.on('change', changed);
    deps.engine.on('status', () => void this.readRoom());
    // A restarted engine has the saved state; re-send outputs and context so nothing drifts.
    deps.engine.on('restarted', () => void this.syncEngine().catch(() => {}));
    deps.obs.on('change', changed);
    deps.capture.on('change', changed);
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
    const outputs = setup.screens.filter((s) => s.enabled).map((s) => ({ id: s.outputId, overlay: s.overlay, matchCode: match?.code ?? 'MAIN' }));
    await this.client.put('/control/outputs', { outputs });
    this.deps.ingest.target(match ? this.client.ingestUrl(match.code) : null);
    if (!match) return;
    const code = encodeURIComponent(match.code);
    await this.client.post(`/api/${code}/config`, {
      airContext: { showId: setup.id, matchId: match.id, source: match.kind },
      teams: match.teams,
      event: { name: setup.brand.eventName || setup.name, stage: setup.brand.stage, bestOf: match.bestOf },
      casters: match.casters.length ? match.casters : [{ name: '', handle: '' }, { name: '', handle: '' }],
      sponsors: setup.sponsors,
      layout: { bannerTheme: setup.package, minimap: setup.minimap },
      show: { eventBug: setup.hud.eventBug !== false },
    });
    await this.client.patch(`/api/${code}`, { show: setup.hud });
    this.roomV = -1;
    await this.readRoom();
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
    };
    const data = this.deps.store.data;
    data.matches = [match, ...data.matches].slice(0, 50);
    data.selectedMatchId = id;
    this.resetTriggers();
    this.save();
    await this.syncEngine();
  }

  async selectMatch(id: string) {
    if (!this.deps.store.data.matches.some((m) => m.id === id)) throw new Error('That match is no longer available.');
    this.deps.store.data.selectedMatchId = id;
    this.resetTriggers();
    this.save();
    await this.syncEngine();
  }

  async updateMatch(id: string, patch: Partial<Pick<Match, 'casters' | 'title'>>) {
    const match = this.deps.store.data.matches.find((m) => m.id === id);
    if (!match) throw new Error('That match is no longer available.');
    if (patch.title !== undefined) match.title = text(patch.title, 80, 'Match title');
    if (patch.casters !== undefined) {
      if (!Array.isArray(patch.casters) || patch.casters.length > 2) throw new Error('Add up to two casters.');
      match.casters = patch.casters.map((c, i) => ({ name: text(c.name, 40, `Caster ${i + 1}`), handle: c.handle ? text(c.handle, 40, `Caster ${i + 1} handle`) : '' }));
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
    if (patch.hud !== undefined) {
      for (const [k, v] of Object.entries(patch.hud)) if (k in setup.hud && typeof v === 'boolean') setup.hud[k] = v;
    }
    if (patch.minimap !== undefined) {
      const { x, y, size } = patch.minimap;
      if (![x, y, size].every(Number.isInteger) || x < 0 || y < 0 || x > 1920 || y > 1080 || size < 200 || size > 800) throw new Error('Keep the minimap frame on screen (size 200–800).');
      setup.minimap = { x, y, size };
    }
    if (patch.obs !== undefined) {
      const source = patch.obs.gameplaySource;
      if (source !== null && (typeof source !== 'string' || source.length > 200)) throw new Error('Choose a gameplay source from OBS.');
      setup.obs = { host: patch.obs.host || setup.obs.host, port: patch.obs.port || setup.obs.port, gameplaySource: source };
    }
    this.save();
    await this.syncEngine();
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

  sceneRows(): SceneRow[] {
    const port = this.deps.engine.port;
    return this.setup.screens
      .filter((s) => s.enabled)
      .map((s) => ({
        sceneName: sceneName(s.title),
        url: `http://127.0.0.1:${port}/o/${s.outputId}`,
        ...s.frame,
        background: s.gameplay ? this.setup.obs.gameplaySource : null,
      }));
  }

  async installGraphics() {
    const data = this.deps.store.data;
    await this.deps.obs.install(this.sceneRows(), data.owned, (owned) => {
      data.owned = owned;
      this.deps.store.save();
    });
    this.emit('change');
  }

  // ── capture, test round, triggers ──

  startCapture() {
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

  async testRound(action: 'start' | 'stop') {
    const match = this.requireMatch();
    await this.client.post('/control/test-round', { match: match.code, action });
    this.roomV = -1;
    await this.readRoom();
  }

  private resetTriggers() {
    this.triggers = { pause: null, strap: false, sponsor: null };
    this.pauseId = null;
  }

  async pause(kind: 'technical' | 'timeout' | null) {
    const match = this.requireMatch();
    const path = `/api/${encodeURIComponent(match.code)}/pause-panel`;
    if (this.pauseId) await this.client.post(path, { action: 'clear', id: this.pauseId });
    this.pauseId = null;
    this.triggers.pause = null;
    if (kind) {
      const id = randomUUID();
      await this.client.post(path, { action: 'show', panel: { kind, id, startedAt: Date.now(), scope: { showId: this.setup.id, matchId: match.id } } });
      this.pauseId = id;
      this.triggers.pause = kind;
    }
    this.emit('change');
  }

  async casterStrap(on: boolean) {
    const match = this.requireMatch();
    if (on && !match.casters.some((c) => c.name)) throw new Error('Add the casters’ names on the Match step first.');
    await this.client.patch(`/api/${encodeURIComponent(match.code)}`, { lowerThird: { kind: 'caster', team: 0 }, show: { lowerThird: on } });
    this.triggers.strap = on;
    if (on) this.triggers.sponsor = null;
    this.emit('change');
  }

  async sponsorRead(sponsor: string | null) {
    const match = this.requireMatch();
    if (sponsor !== null && !this.setup.sponsors.includes(sponsor)) throw new Error('Add this sponsor in Setup › Brand first.');
    const lowerThird = sponsor ? { kind: 'sponsor', title: sponsor, sub: 'Presented by', team: -1 } : {};
    await this.client.patch(`/api/${encodeURIComponent(match.code)}`, { ...(sponsor ? { lowerThird } : {}), show: { lowerThird: !!sponsor } });
    this.triggers.sponsor = sponsor;
    if (sponsor) this.triggers.strap = false;
    this.emit('change');
  }

  async correct(input: CorrectionInput | { clear: true }) {
    const match = this.requireMatch();
    const body = 'clear' in input
      ? { action: 'clear' }
      : { action: 'set', field: input.field, value: input.value, until: input.field === 'scores' ? 'next_round' : 'cleared', reason: text(input.reason, 200, 'Reason') };
    await this.client.post(`/api/${encodeURIComponent(match.code)}/display-fixes`, body);
    this.roomV = -1;
    await this.readRoom();
  }

  // ── snapshot ──

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
        }
      : null;
    const enabled = this.setup.screens.filter((s) => s.enabled);
    const outputs = enabled.map((s) => {
      const o = status?.outputs.find((x) => x.id === s.outputId);
      return { screenId: s.id, title: s.title, url: `http://127.0.0.1:${engine.port}/o/${s.outputId}`, connections: o?.connections ?? 0, lastFrameAt: o?.lastFrameAt ?? null };
    });
    const missingScenes = enabled.map((s) => sceneName(s.title)).filter((n) => !obs.status.scenes.includes(n));
    const installed = obs.status.state === 'connected' && missingScenes.length === 0;
    const feedState = capture.state === 'live' && roomStatus?.lastFeedAt == null ? 'waiting' : capture.state;
    const snapshot: Snapshot = {
      version,
      engine: { state: engine.state, port: engine.port, reattached: engine.reattached, error: engine.error },
      setup: this.setup,
      matches: this.deps.store.data.matches,
      match,
      readout,
      feed: { state: feedState, reason: capture.reason, ageMs: roomStatus?.feedAgeMs ?? null, paused: roomStatus?.feedPaused ?? false },
      obs: { state: obs.status.state, error: obs.status.error, version: obs.status.version, programScene: obs.status.programScene, installed, missingScenes, videoInputs: obs.status.videoInputs },
      outputs,
      testRound: { running: roomStatus?.testRound.running ?? false, startedAt: roomStatus?.testRound.startedAt ?? null, durationMs: roomStatus?.testRound.durationMs ?? 0 },
      triggers: { ...this.triggers },
      checks: [],
    };
    snapshot.checks = checks(snapshot);
    return snapshot;
  }
}

/** The Check list. Warns, never blocks; each problem names its fix. */
export function checks(s: Snapshot): CheckItem[] {
  const out: CheckItem[] = [];
  const found = s.readout ? s.readout.playersFound[0] + s.readout.playersFound[1] : 0;
  out.push(
    found >= 10
      ? { id: 'lineups', title: 'Players found in the game', detail: 'All 10 players are on the HUD.', health: 'ok' }
      : { id: 'lineups', title: 'Players', detail: found ? `${found} of 10 players found so far.` : 'Player names come from the game once it starts.', health: 'off' },
  );
  if (s.obs.state !== 'connected') {
    out.push({ id: 'installed', title: 'Graphics in OBS', detail: s.obs.error ?? 'OBS is not connected.', health: 'warn', action: { id: 'open-setup-obs', label: 'Connect OBS' } });
  } else if (!s.obs.installed) {
    out.push({ id: 'installed', title: 'Graphics in OBS', detail: `Not in OBS yet: ${s.obs.missingScenes.join(', ')}.`, health: 'warn', action: { id: 'install-graphics', label: 'Install graphics in OBS' } });
  } else {
    out.push({ id: 'installed', title: 'Graphics in OBS', detail: `${s.outputs.length} Air scenes are in your OBS scene collection.`, health: 'ok' });
  }
  const idle = s.outputs.filter((o) => o.connections === 0);
  out.push(
    s.obs.installed && idle.length === 0
      ? { id: 'rendering', title: 'Graphics loading', detail: 'Every Air source is connected to the graphics engine.', health: 'ok' }
      : s.obs.installed
        ? { id: 'rendering', title: 'Graphics loading', detail: `Not loading yet: ${idle.map((o) => o.title).join(', ')}. OBS loads a browser source when its scene is opened once.`, health: 'warn' }
        : { id: 'rendering', title: 'Graphics loading', detail: 'Shown once graphics are in OBS.', health: 'off' },
  );
  const feed = s.feed;
  out.push(
    feed.state === 'live'
      ? { id: 'feed', title: 'Game feed', detail: 'Live data is arriving from Valorant.', health: 'ok' }
      : feed.state === 'waiting'
        ? { id: 'feed', title: 'Game feed', detail: feed.reason ?? 'Waiting for Valorant.', health: 'warn' }
        : feed.state === 'unavailable'
          ? { id: 'feed', title: 'Game feed', detail: feed.reason ?? 'Game capture is unavailable on this PC.', health: 'bad' }
          : { id: 'feed', title: 'Game feed', detail: 'Game capture is off on this PC.', health: 'off', action: { id: 'start-capture', label: 'Start game capture' } },
  );
  out.push({ id: 'esportra', title: 'Esportra', detail: 'Not signed in. Quick matches work without an Esportra account.', health: 'off' });
  return out;
}
