// The production model: one setup, the selected match, and everything that serves it.
// Pushes match and setup to the engine, points outputs and capture at the match's room, runs the
// manual triggers, and builds the snapshot the interface renders (including the Check list).

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { BANNER_THEMES, type CheckItem, type CorrectionCall, type Match, type LayerRow, type MonitorFrame, type PollInput, type SceneStatus, type QuickMatchInput, type Setup, type Snapshot, type Team } from '../shared/api.ts';
import type { EngineClient, EngineStatus } from './engine-client.ts';
import type { EngineSupervisor } from './engine-supervisor.ts';
import type { GepBridge } from './gep.ts';
import type { IngestClient } from './ingest.ts';
import type { ObsLink } from './obs.ts';
import { Replay } from './replay.ts';
import type { BuildScene } from './scene-build.ts';
import { SCENE_KEYS, SCENES, sourceName, type SlotId } from '../shared/scenes.ts';
import { AUTO_LAYERS, LAYER_DEFS, SETUP_LAYER_KEYS, defaultMode, type LayerMode } from '../shared/layers.ts';
import { EventLog } from './event-log.ts';
import { Autopilot } from './autopilot/autopilot.ts';
import type { SegmentEdit } from '../shared/autopilot.ts';
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

export class Production extends EventEmitter {
  private readonly deps: ProductionDeps;
  private room: any = null;
  private roomV = -1;
  readonly log: EventLog;
  readonly replay: Replay;
  readonly autopilot: Autopilot;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitorBusy = false;

  constructor(deps: ProductionDeps) {
    super();
    this.deps = deps;
    const changed = () => this.emit('change');
    deps.engine.on('change', changed);
    deps.engine.on('status', () => void this.readRoom());
    // A restarted engine has the saved state; re-send outputs and context so nothing drifts.
    deps.engine.on('restarted', () => void this.syncEngine().catch(() => {}));
    deps.obs.on('change', changed);
    deps.obs.on('change', () => this.autopilot.onObs());
    deps.obs.watchFullscreen(SCENES.fullscreen.name);
    this.log = new EventLog({ nameOf: (t, i) => this.room?.players?.[t]?.[i]?.name || `P${i + 1}`, onChange: changed, onEvent: (event) => this.autopilot.onGameEvent(event) });
    this.autopilot = new Autopilot({
      store: deps.store, obs: deps.obs, match: () => this.match, screens: () => this.setup.screens, stinger: () => this.setup.obs.stinger,
      log: (line) => this.log.add(line), changed,
    });
    deps.obs.watchSlots(SCENE_KEYS.flatMap((key) => SCENES[key].slots.map((slot) => slot.scene)));
    this.replay = new Replay(deps.obs, { canReturn: () => !this.room?.airPause, stinger: () => this.setup.obs.stinger });
    this.replay.on('error-message', (message: string) => this.emit('notice', message));
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
    if (!match) {
      this.log.target(null);
      return;
    }
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
    const managed = new Set<string>(SETUP_LAYER_KEYS);
    const plain = Object.fromEntries(Object.entries(setup.hud).filter(([k]) => !managed.has(k)));
    if (Object.keys(plain).length) await this.client.patch(`/api/${code}`, { show: plain });
    // Setup decides where each layer starts; after that the console owns them for the match.
    await this.act('layers.init', { modes: this.initialModes() }, false);
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
    };
    const data = this.deps.store.data;
    data.matches = [match, ...data.matches].slice(0, 50);
    data.selectedMatchId = id;
    this.save();
    await this.syncEngine();
  }

  async selectMatch(id: string) {
    if (!this.deps.store.data.matches.some((m) => m.id === id)) throw new Error('That match is no longer available.');
    this.deps.store.data.selectedMatchId = id;
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
        sources: this.setup.screens
          .filter((x) => x.scene === key && x.enabled)
          .map((x) => ({ id: x.id, inputName: sourceName(x.title), url: `http://127.0.0.1:${port}/o/${x.outputId}`, frame: x.frame, enabled: true })),
      };
    });
  }

  async installGraphics() {
    const data = this.deps.store.data;
    await this.deps.obs.build(this.buildPlan(), data.owned, (owned) => {
      data.owned = owned;
      this.deps.store.save();
    });
    this.replay.attach();
    this.emit('change');
  }

  async useSlotSource(slot: SlotId, source: string) {
    const def = SCENE_KEYS.flatMap((k) => SCENES[k].slots).find((x) => x.id === slot);
    if (!def) throw new Error('Unknown source slot.');
    await this.deps.obs.useSource(def.scene, source);
  }

  async studioMode(on: boolean) {
    await this.deps.obs.setStudioMode(on);
  }

  async preview(scene: string) {
    if (!SCENE_KEYS.some((k) => SCENES[k].name === scene)) throw new Error('Choose one of the Esportra scenes.');
    await this.deps.obs.setPreview(scene);
  }

  private async takeWith(choice: ReturnType<ObsLink['cutChoice']>, missing: string) {
    if (!choice) throw new Error(missing);
    const scene = this.deps.obs.status.previewScene;
    const result = await this.deps.obs.take(choice);
    if (!result.ok) throw new Error(result.error);
    this.log.add(`${choice.mode === 'cut' ? 'Cut' : 'Stinger'} · ${scene?.replace('Esportra · ', '') ?? 'scene'}`);
  }

  async take() {
    const scene = this.deps.obs.status.previewScene;
    const result = await this.deps.obs.take();
    if (!result.ok) throw new Error(result.error);
    this.log.add(`Take · ${scene?.replace('Esportra · ', '') ?? 'scene'}`);
  }

  cut() {
    return this.takeWith(this.deps.obs.cutChoice(), 'OBS has no Cut transition.');
  }

  stinger() {
    return this.takeWith(this.deps.obs.stingerChoice(this.setup.obs.stinger), 'Add a Stinger transition in OBS (Scene Transitions › + › Stinger) to use Stinger.');
  }

  async playReplay() {
    const result = await this.replay.play();
    if (!result.ok) throw new Error(result.error);
    this.log.add('Replay played');
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
  segmentUpdate(id: string, edit: SegmentEdit) {
    this.autopilot.edit(id, edit);
  }
  segmentMove(id: string, direction: number) {
    this.autopilot.move(id, direction < 0 ? -1 : 1);
  }

  async casterStrap(on: boolean) {
    const match = this.requireMatch();
    if (on && !match.casters.some((c) => c.name)) throw new Error('Add the casters’ names first.');
    await this.act(on ? 'lowerthird.caster' : 'lowerthird.hide', {});
    this.log.add(on ? 'Caster lower third on' : 'Lower third off');
  }

  async sponsorRead(sponsor: string | null) {
    if (sponsor !== null && !this.setup.sponsors.includes(sponsor)) throw new Error('Add this sponsor in Setup › Brand first.');
    await this.act(sponsor ? 'lowerthird.generic' : 'lowerthird.hide', sponsor ? { title: sponsor, sub: 'Presented by', team: -1 } : {});
    this.log.add(sponsor ? `Sponsor read · ${sponsor}` : 'Lower third off');
  }

  async lowerThird(input: { kind: 'caster' } | { kind: 'person'; name: string; role: string } | { kind: 'player' } | null) {
    if (input === null) return this.act('lowerthird.hide', {}).then(() => this.log.add('Lower third off'));
    if (input.kind === 'caster') return this.casterStrap(true);
    if (input.kind === 'person') {
      await this.act('lowerthird.generic', { title: input.name, sub: input.role, team: -1 });
      return this.log.add(`Lower third · ${input.name}`);
    }
    const observed = this.observedPlayer();
    if (!observed) throw new Error('No player is being observed yet. Spotlight needs the game’s roster.');
    await this.act('lowerthird.player', { team: observed.team, player: observed.player });
    this.log.add(`Spotlight · ${observed.name}`);
  }

  async toast(text: string) {
    await this.act('toast.show', { text });
    this.log.add(`Toast · ${text}`);
  }

  async poll(input: PollInput | null) {
    if (input === null) {
      await this.act('poll.hide', {});
      return this.log.add('Poll hidden');
    }
    await this.act('poll.show', { question: input.question, options: input.options, firstPercent: input.firstPercent });
    this.log.add(`Poll · ${input.question}`);
  }

  async stingerPlay() {
    await this.act('stinger.play', {});
    this.log.add('Stinger (graphic) played');
  }

  /** Sets a console layer. Full-screen rows choose which graphic the Fullscreen scene shows. */
  async setLayer(id: string, mode: LayerMode) {
    if (id.startsWith('fs:')) return this.fullscreen(id.slice(3), mode === 'on');
    await this.act('layer.set', { layer: id, mode });
    const label = LAYER_DEFS.find((d) => d.id === id)?.label ?? id;
    this.log.add(`${label} · ${mode}`);
  }

  private async fullscreen(screenId: string, on: boolean) {
    const screen = this.setup.screens.find((x) => x.id === screenId && x.scene === 'fullscreen');
    if (!screen) throw new Error('Unknown full-screen graphic.');
    if (on && screenId === 'player-profile') {
      const observed = this.observedPlayer();
      if (!observed) throw new Error('No player is being observed yet. The player profile needs the game’s roster.');
      await this.act('spotlight.set', { team: observed.team, player: observed.player });
    }
    await this.deps.obs.showFullscreen(on ? sourceName(screen.title) : null);
    // Studio Mode: line it up in Preview so Take puts it on air.
    if (on && this.deps.obs.status.studioMode && this.deps.obs.status.scenes.includes(SCENES.fullscreen.name)) {
      await this.deps.obs.setPreview(SCENES.fullscreen.name);
    }
    this.log.add(on ? `Full screen · ${screen.title} ready in Preview` : 'Full screen hidden');
    this.emit('change');
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
        const on = !!screen && obs.status.fullscreenSource === sourceName(screen.title);
        return { ...def, mode: on ? 'on' : 'off', auto: false, manual: false, available: !!screen?.enabled && obs.connected && obs.status.scenes.includes(SCENES.fullscreen.name) } as LayerRow;
      }
      const auto = AUTO_LAYERS.has(def.id);
      const mode: LayerMode = layers[def.id] ?? (auto ? 'auto' : 'off');
      return { ...def, mode, auto, manual: auto && mode !== 'auto', available: !!this.match };
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
    const enabled = this.setup.screens.filter((s) => s.enabled);
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
        replay: { bufferActive: obs.status.replayBufferActive, busy: this.replay.busy },
        installed, missingScenes, scenes: sceneStatus, sceneNames: obs.status.scenes, videoInputs: obs.status.videoInputs,
      },
      outputs,
      testRound: { running: roomStatus?.testRound.running ?? false, startedAt: roomStatus?.testRound.startedAt ?? null, durationMs: roomStatus?.testRound.durationMs ?? 0 },
      triggers: this.liveTriggers(),
      layers: this.layerRows(),
      autopilot: this.autopilot.view(),
      autopilotBlock: this.autopilot.block(),
      log: this.log.list(),
      checks: [],
    };
    snapshot.checks = checks(snapshot);
    return snapshot;
  }
}

/** The readiness checklist (PRD picture 7). Warns, never blocks; every problem names its one fix. */
export function checks(s: Snapshot): CheckItem[] {
  const out: CheckItem[] = [];
  out.push({ id: 'esportra', title: 'Esportra', detail: 'Not signed in. Quick matches work without an account.', health: 'off' });
  out.push(
    s.match
      ? { id: 'match', title: 'Show and match', detail: `${s.setup.name} · ${s.match.title} · Bo${s.match.bestOf}`, health: 'ok' }
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
  out.push({ id: 'internet', title: 'Internet', detail: 'Graphics run on this PC and keep running offline. Agent and weapon art loads from the internet.', health: 'off' });
  return out;
}
