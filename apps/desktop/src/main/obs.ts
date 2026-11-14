// OBS WebSocket (v5): one connection with live status, scene building and screenshots.
//
// Air never switches OBS scenes (decision R1): it installs its scenes and sources, reads which scene
// is on air, takes screenshots for the Live monitors and saves the replay buffer. Status mirrors
// what OBS reports through its events.

import { EventEmitter } from 'node:events';
import type { ObsSocket } from './obs-types.ts';
import { buildScenes, readSlots, type BuildScene, type Owned } from './scene-build.ts';
import { isAirName } from '../shared/scenes.ts';

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

const AUDIO_OR_BROWSER = /audio|wasapi|pulse|alsa|coreaudio|browser_source/i;
const KINDS: Record<string, TransitionKind> = { cut_transition: 'cut', fade_transition: 'fade', obs_stinger_transition: 'stinger' };
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

const initial = (): ObsStatus => ({
  state: 'disconnected', error: null, version: null, collection: null, studioMode: false, programScene: null, previewScene: null,
  scenes: [], videoInputs: [], transitions: [], currentTransition: null, transitionActive: false, replayBufferActive: null, slots: {},
});

const SETTINGS = 'OBS › Tools › WebSocket Server Settings';

/** Why connecting failed, in the producer's words, from what the OBS library reports. */
export function whyNotConnected(error: unknown, host: string, port: number): { message: string; auth: boolean } {
  const code = (error as { code?: unknown })?.code;
  const text = String((error as Error)?.message ?? error ?? '');
  const where = `${host}, port ${port}`;
  if (code === 4009 || /auth/i.test(text)) return { auth: true, message: `OBS rejected the password. Copy it from ${SETTINGS} › Show Connect Info.` };
  if (code === 4010) return { auth: false, message: 'This OBS is too old for Air. Update OBS to version 28 or newer (its WebSocket server is built in).' };
  if (/ECONNREFUSED/.test(text)) return { auth: false, message: `Nothing is answering on ${where}. Open OBS, then in ${SETTINGS} tick Enable WebSocket server and check the port is ${port}.` };
  if (/ENOTFOUND|EAI_AGAIN/.test(text)) return { auth: false, message: `No computer called ${host} was found. Use the OBS computer’s IP address (shown in ${SETTINGS} › Show Connect Info).` };
  if (/ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/.test(text)) return { auth: false, message: `Could not reach ${where}. Check that both PCs are on the same network and that Windows Firewall allows OBS.` };
  return { auth: false, message: `Could not reach OBS on ${where}. Check that OBS is open and ${SETTINGS} › Enable WebSocket server is ticked.${text ? ` (${text})` : ''}` };
}

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
      const { message, auth } = whyNotConnected(error, args.host, args.port);
      this.update({ state: 'error', error: message });
      this.scheduleReconnect(auth);
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
    on('SceneTransitionEnded', () => this.update({ transitionActive: false }));
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
          .filter((i: { inputName: string; inputKind: string }) => !AUDIO_OR_BROWSER.test(i.inputKind) && !isAirName(i.inputName))
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
