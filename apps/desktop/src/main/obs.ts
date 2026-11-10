// OBS WebSocket (v5): one connection with live status and the switching controls.
//
// Status mirrors what OBS reports through its events; the console never animates a take OBS
// did not make. Ported from the legacy src/obs-controller.js and src/obs-transitions.js.

import { EventEmitter } from 'node:events';
import type { ObsSocket } from './obs-types.ts';
import { buildScenes, readSlots, type BuildScene, type Owned } from './scene-build.ts';

export type { ObsSocket } from './obs-types.ts';

export type TransitionKind = 'cut' | 'fade' | 'stinger' | 'other';

export interface TransitionInfo {
  name: string;
  kind: TransitionKind;
}

export interface ObsStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  version: string | null;
  collection: string | null;
  studioMode: boolean;
  programScene: string | null;
  previewScene: string | null;
  scenes: string[];
  videoInputs: string[];
  transitions: TransitionInfo[];
  currentTransition: string | null;
  transitionActive: boolean;
  replayBufferActive: boolean | null;
  /** First source in each watched slot scene (null while empty). */
  slots: Record<string, string | null>;
}

export interface TransitionChoice {
  mode: 'cut' | 'fade' | 'stinger';
  name: string;
  durationMs?: number;
}

export interface TakeResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

const AUDIO_OR_BROWSER = /audio|wasapi|pulse|alsa|coreaudio|browser_source/i;
const KINDS: Record<string, TransitionKind> = { cut_transition: 'cut', fade_transition: 'fade', obs_stinger_transition: 'stinger' };
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

export function validateTransition(input: TransitionChoice | null | undefined): TransitionChoice | null {
  if (input == null) return null;
  if (!['cut', 'fade', 'stinger'].includes(input.mode)) throw new Error('Choose Cut, Fade or Stinger.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 256) throw new Error('Choose a transition available in OBS.');
  if (input.mode === 'fade' && (!Number.isInteger(input.durationMs) || input.durationMs! < 50 || input.durationMs! > 10_000)) throw new Error('Fade duration must be 50–10,000 milliseconds.');
  return { mode: input.mode, name: input.name, ...(input.mode === 'fade' ? { durationMs: input.durationMs } : {}) };
}

const initial = (): ObsStatus => ({
  state: 'disconnected', error: null, version: null, collection: null, studioMode: false, programScene: null, previewScene: null,
  scenes: [], videoInputs: [], transitions: [], currentTransition: null, transitionActive: false, replayBufferActive: null, slots: {},
});

export class ObsLink extends EventEmitter {
  status: ObsStatus = initial();
  private socket: ObsSocket | null = null;
  private readonly create: () => ObsSocket;
  private args: { host: string; port: number; password: string } | null = null;
  private watched: string[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private wantConnected = false;
  private busy = false;
  private restoreTransition: string | null = null;
  private readonly backoff: number[];

  constructor(create: () => ObsSocket, options: { backoffMs?: number[] } = {}) {
    super();
    this.create = create;
    this.backoff = options.backoffMs ?? BACKOFF_MS;
  }

  private update(patch: Partial<ObsStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('change');
  }

  get connected() {
    return this.status.state === 'connected';
  }

  /** Slot scenes whose contents Air watches (to turn "Add your source" into the real name). */
  watchSlots(sceneNames: string[]) {
    this.watched = sceneNames;
  }

  async connect(host: string, port: number, password: string) {
    await this.disconnect();
    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Enter the OBS computer’s address and WebSocket port (OBS › Tools › WebSocket Server Settings).');
    }
    this.args = { host, port, password };
    this.wantConnected = true;
    this.attempt = 0;
    await this.open();
  }

  private async open() {
    const args = this.args;
    if (!args) return;
    const socket = this.create();
    this.socket = socket;
    this.update({ state: 'connecting', error: null });
    try {
      await socket.connect(`ws://${args.host}:${args.port}`, args.password || undefined, { rpcVersion: 1 });
    } catch (error) {
      this.socket = null;
      const text = String((error as Error)?.message ?? error);
      const message = /auth/i.test(text)
        ? 'OBS rejected the password. Copy it from OBS › Tools › WebSocket Server Settings › Show Connect Info.'
        : 'Could not reach OBS. Check that OBS is open and its WebSocket server is enabled on this port.';
      this.update({ state: 'error', error: message });
      this.scheduleReconnect(/auth/i.test(text));
      throw new Error(message);
    }
    this.listen(socket);
    const version = await socket.call('GetVersion');
    this.update({ state: 'connected', error: null, version: version.obsVersion ?? null });
    this.attempt = 0;
    await this.refresh();
  }

  private listen(socket: ObsSocket) {
    const on = (event: string, fn: (e: any) => void) => socket.on(event, fn);
    on('CurrentProgramSceneChanged', (e) => this.update({ programScene: e.sceneName }));
    on('CurrentPreviewSceneChanged', (e) => this.update({ previewScene: e.sceneName }));
    on('StudioModeStateChanged', (e) => {
      this.update({ studioMode: !!e.studioModeEnabled, ...(e.studioModeEnabled ? {} : { previewScene: null }) });
      void this.refresh();
    });
    on('SceneTransitionStarted', () => this.update({ transitionActive: true }));
    on('SceneTransitionEnded', () => {
      this.update({ transitionActive: false });
      void this.restoreBase();
    });
    on('CurrentSceneTransitionChanged', (e) => this.update({ currentTransition: e.transitionName }));
    for (const event of ['SceneListChanged', 'SceneCreated', 'SceneRemoved', 'SceneNameChanged', 'InputCreated', 'InputRemoved', 'InputNameChanged', 'SceneItemCreated', 'SceneItemRemoved', 'ReplayBufferStateChanged', 'CurrentSceneCollectionChanged']) {
      on(event, () => this.scheduleRefresh());
    }
    on('ConnectionClosed', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.update({ ...initial(), state: 'error', error: 'The connection to OBS was lost. Air reconnects automatically.' });
      this.scheduleReconnect(false);
    });
  }

  private scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 120);
    this.refreshTimer.unref?.();
  }

  private scheduleReconnect(authFailure: boolean) {
    // A wrong password will not fix itself: stop and let the producer correct it.
    if (!this.wantConnected || authFailure || this.reconnectTimer) return;
    const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)]!;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open().catch(() => {
        // open() schedules the next attempt itself.
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async refresh() {
    const socket = this.socket;
    if (!socket) return;
    const call = (name: string) => socket.call(name).catch(() => null);
    try {
      const [scenes, inputs, transitions, studio, replay, collections] = await Promise.all([
        call('GetSceneList'), call('GetInputList'), call('GetSceneTransitionList'), call('GetStudioModeEnabled'), call('GetReplayBufferStatus'), call('GetSceneCollectionList'),
      ]);
      const studioMode = !!studio?.studioModeEnabled;
      const preview = studioMode ? await call('GetCurrentPreviewScene') : null;
      const slots = await readSlots(socket, this.watched);
      this.update({
        programScene: scenes?.currentProgramSceneName ?? this.status.programScene,
        previewScene: studioMode ? preview?.currentPreviewSceneName ?? null : null,
        studioMode,
        collection: collections?.currentSceneCollectionName ?? null,
        scenes: (scenes?.scenes ?? []).map((s: { sceneName: string }) => s.sceneName),
        videoInputs: (inputs?.inputs ?? [])
          .filter((i: { inputName: string; inputKind: string }) => !AUDIO_OR_BROWSER.test(i.inputKind) && !i.inputName.startsWith('Esportra · '))
          .map((i: { inputName: string }) => i.inputName),
        transitions: (transitions?.transitions ?? []).map((t: { transitionName: string; transitionKind: string }) => ({ name: t.transitionName, kind: KINDS[t.transitionKind] ?? 'other' })),
        currentTransition: transitions?.currentSceneTransitionName ?? null,
        // OBS answers 604 when its replay buffer is not configured; that reads as unavailable.
        replayBufferActive: replay ? !!replay.outputActive : null,
        slots,
      });
    } catch {
      // A failed read keeps the last known status; ConnectionClosed reports real loss.
    }
  }

  async disconnect() {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) await socket.disconnect().catch(() => {});
    this.update(initial());
  }

  // ── building ──

  async build(scenes: BuildScene[], owned: Owned, saveOwned: (owned: Owned) => void) {
    if (!this.socket) throw new Error('Connect to OBS first.');
    this.watchSlots(scenes.flatMap((s) => s.slots.map((slot) => slot.sceneName)));
    const result = await buildScenes({ socket: this.socket, scenes, owned, saveOwned });
    await this.refresh();
    return result;
  }

  /** Puts an existing OBS source into a slot scene (the in-app shortcut for "add your source"). */
  async useSource(slotScene: string, source: string) {
    if (!this.socket) throw new Error('Connect to OBS first.');
    if (!this.status.videoInputs.includes(source)) throw new Error(`“${source}” is not an available video source in OBS.`);
    if (!this.status.scenes.includes(slotScene)) throw new Error('Add the Esportra scenes to OBS first.');
    await this.socket.call('CreateSceneItem', { sceneName: slotScene, sourceName: source, sceneItemEnabled: true });
    await this.refresh();
  }

  // ── switching ──

  async setStudioMode(on: boolean) {
    if (!this.socket) throw new Error('Connect to OBS first.');
    await this.socket.call('SetStudioModeEnabled', { studioModeEnabled: on });
    await this.refresh();
  }

  async setPreview(sceneName: string) {
    const socket = this.requireStudio();
    if (!this.status.scenes.includes(sceneName)) throw new Error('That scene is not in OBS.');
    await socket.call('SetCurrentPreviewScene', { sceneName });
  }

  private requireStudio() {
    if (!this.socket) throw new Error('Connect to OBS first.');
    if (!this.status.studioMode) throw new Error('Turn on Studio Mode so takes go through Preview.');
    return this.socket;
  }

  /**
   * Puts the preview scene on air. With a transition choice, uses that transition for this take only
   * and restores OBS's own transition afterwards.
   */
  async take(choice?: TransitionChoice | null, options: { scene?: string; stillAllowed?: () => boolean } = {}): Promise<TakeResult> {
    if (this.busy || this.status.transitionActive) return { ok: false, error: 'Wait for the current OBS transition to finish.' };
    this.busy = true;
    const started = Date.now();
    try {
      const socket = this.requireStudio();
      const forced = validateTransition(choice);
      if (forced) {
        const wanted = this.status.transitions.find((t) => t.name === forced.name && t.kind === forced.mode);
        if (!wanted) return { ok: false, error: `The ${forced.mode} transition “${forced.name}” is not available in OBS.` };
        this.restoreTransition = this.status.currentTransition && this.status.currentTransition !== forced.name ? this.status.currentTransition : null;
        await socket.call('SetCurrentSceneTransition', { transitionName: forced.name });
        if (forced.mode === 'fade') await socket.call('SetCurrentSceneTransitionDuration', { transitionDuration: forced.durationMs });
      }
      if (options.scene) await socket.call('SetCurrentPreviewScene', { sceneName: options.scene });
      if (options.stillAllowed && !options.stillAllowed()) {
        await this.restoreBase();
        return { ok: false, error: 'Take cancelled because production changed.' };
      }
      if (!this.status.previewScene && !options.scene) {
        await this.restoreBase();
        return { ok: false, error: 'Choose a scene for Preview first.' };
      }
      await socket.call('TriggerStudioModeTransition');
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      await this.restoreBase();
      return { ok: false, error: (error as Error).message, latencyMs: Date.now() - started };
    } finally {
      this.busy = false;
    }
  }

  /** The cut transition, if OBS has one. */
  cutChoice(): TransitionChoice | null {
    const cut = this.status.transitions.find((t) => t.kind === 'cut');
    return cut ? { mode: 'cut', name: cut.name } : null;
  }

  stingerChoice(preferred: string | null): TransitionChoice | null {
    const stingers = this.status.transitions.filter((t) => t.kind === 'stinger');
    const pick = stingers.find((t) => t.name === preferred) ?? stingers[0];
    return pick ? { mode: 'stinger', name: pick.name } : null;
  }

  private async restoreBase() {
    const name = this.restoreTransition;
    this.restoreTransition = null;
    if (name && this.socket) await this.socket.call('SetCurrentSceneTransition', { transitionName: name }).catch(() => {});
  }

  // ── monitors ──

  /** A small JPEG of a scene as OBS renders it, or null. */
  async screenshot(sceneName: string | null, width = 480): Promise<string | null> {
    if (!this.socket || !sceneName) return null;
    try {
      const { imageData } = await this.socket.call('GetSourceScreenshot', {
        sourceName: sceneName, imageFormat: 'jpg', imageWidth: width, imageHeight: Math.round((width * 9) / 16), imageCompressionQuality: 55,
      });
      return typeof imageData === 'string' ? imageData : null;
    } catch {
      return null;
    }
  }

  /** The raw socket, for the replay helper. */
  get raw(): ObsSocket | null {
    return this.socket;
  }
}
