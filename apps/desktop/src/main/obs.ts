// OBS WebSocket (v5): connect, install Air's graphics, read what is on air.
//
// Air never switches scenes, transitions, streams or records. It only creates and updates its own
// scenes ("Air · <screen>") and their browser sources, and reads the program scene for status.
// Installation logic is ported from src/obs-template-push.js.

import { EventEmitter } from 'node:events';

export interface ObsSocket {
  connect(url: string, password?: string, identification?: { rpcVersion: number }): Promise<{ obsWebSocketVersion: string }>;
  disconnect(): Promise<void>;
  call(request: string, data?: Record<string, unknown>): Promise<any>;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface SceneRow {
  sceneName: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Existing OBS video input placed underneath (the in-game screen's gameplay). */
  background: string | null;
}

export interface Owned {
  [sceneName: string]: { inputName?: string; geometry?: string; background?: string | null; backgroundItem?: number | null };
}

const geometry = (row: SceneRow) => JSON.stringify([row.x, row.y, row.width, row.height]);
const AUDIO_OR_BROWSER = /audio|wasapi|pulse|alsa|coreaudio|browser_source/i;

/** Creates or updates Air's scenes. Checks every collision before changing anything. */
export async function installScenes(options: { socket: ObsSocket; rows: SceneRow[]; owned: Owned; saveOwned: (owned: Owned) => void }) {
  const { socket, rows, saveOwned } = options;
  const call = (name: string, data?: Record<string, unknown>) => socket.call(name, data);
  const [stream, record, sceneList, inputList] = await Promise.all(['GetStreamStatus', 'GetRecordStatus', 'GetSceneList', 'GetInputList'].map((name) => call(name)));
  if (stream.outputActive !== false || record.outputActive !== false) {
    throw new Error('Stop streaming and recording in OBS before installing or updating Air graphics, so nothing on air reloads.');
  }
  const scenes = new Set<string>((sceneList.scenes ?? []).map((s: { sceneName: string }) => s.sceneName));
  const inputs = new Map<string, { inputKind: string }>((inputList.inputs ?? []).map((i: { inputName: string; inputKind: string }) => [i.inputName, i]));
  const owned: Owned = { ...options.owned };
  for (const row of rows) {
    const inputName = `${row.sceneName} · Graphics`;
    if (scenes.has(row.sceneName) && !owned[row.sceneName]) {
      throw new Error(`OBS already has a scene called “${row.sceneName}” that Air did not create. Rename it in OBS or rename the screen in Air.`);
    }
    const existing = inputs.get(inputName);
    if (existing && (!owned[row.sceneName] || existing.inputKind !== 'browser_source')) throw new Error(`The OBS source “${inputName}” already exists. Rename it in OBS.`);
    if (row.background) {
      const video = inputs.get(row.background);
      if (!video || AUDIO_OR_BROWSER.test(video.inputKind) || row.background.startsWith('Air · ')) {
        throw new Error(`“${row.background}” is not an available video source in OBS. Choose your game capture in Setup › OBS.`);
      }
    }
  }
  const installed: string[] = [];
  for (const row of rows) {
    const inputName = `${row.sceneName} · Graphics`;
    if (!scenes.has(row.sceneName)) {
      await call('CreateScene', { sceneName: row.sceneName });
      owned[row.sceneName] = {};
      saveOwned(owned);
    }
    let sceneItemId: number | undefined;
    if (!inputs.has(inputName)) {
      const created = await call('CreateInput', {
        sceneName: row.sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings: { url: row.url, width: 1920, height: 1080, fps: 60, reroute_audio: false, shutdown: false },
        sceneItemEnabled: true,
      });
      sceneItemId = created.sceneItemId;
    } else {
      const settings = await call('GetInputSettings', { inputName });
      if (settings.inputSettings?.url !== row.url) await call('SetInputSettings', { inputName, inputSettings: { url: row.url }, overlay: true });
      const items = await call('GetSceneItemList', { sceneName: row.sceneName });
      sceneItemId = (items.sceneItems ?? []).find((i: { sourceName: string }) => i.sourceName === inputName)?.sceneItemId;
      if (sceneItemId === undefined) sceneItemId = (await call('CreateSceneItem', { sceneName: row.sceneName, sourceName: inputName, sceneItemEnabled: true })).sceneItemId;
    }
    if (!Number.isInteger(sceneItemId)) throw new Error('OBS did not confirm the graphics source. Try again.');
    const mine = owned[row.sceneName] ?? {};
    let backgroundItem = mine.backgroundItem ?? null;
    if (Number.isInteger(backgroundItem) && mine.background !== row.background) {
      const list = await call('GetSceneItemList', { sceneName: row.sceneName });
      if ((list.sceneItems ?? []).some((i: { sceneItemId: number; sourceName: string }) => i.sceneItemId === backgroundItem && i.sourceName === mine.background)) {
        await call('RemoveSceneItem', { sceneName: row.sceneName, sceneItemId: backgroundItem });
      }
      backgroundItem = null;
    }
    if (row.background) {
      const list = await call('GetSceneItemList', { sceneName: row.sceneName });
      if (!(list.sceneItems ?? []).some((i: { sourceName: string }) => i.sourceName === row.background)) {
        backgroundItem = (await call('CreateSceneItem', { sceneName: row.sceneName, sourceName: row.background, sceneItemEnabled: true })).sceneItemId;
        if (!Number.isInteger(backgroundItem)) throw new Error('OBS did not confirm the gameplay source. Try again.');
        await call('SetSceneItemTransform', {
          sceneName: row.sceneName,
          sceneItemId: backgroundItem,
          sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsAlignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080 },
        });
        await call('SetSceneItemIndex', { sceneName: row.sceneName, sceneItemId: backgroundItem, sceneItemIndex: 0 });
      }
    }
    // Re-installing keeps layout edits made directly in OBS unless Air's own layout changed.
    if (mine.geometry !== geometry(row)) {
      await call('SetSceneItemTransform', {
        sceneName: row.sceneName,
        sceneItemId,
        sceneItemTransform: { positionX: row.x, positionY: row.y, alignment: 5, boundsAlignment: 5, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: row.width, boundsHeight: row.height },
      });
    }
    owned[row.sceneName] = { inputName, geometry: geometry(row), background: row.background, backgroundItem };
    saveOwned(owned);
    installed.push(row.sceneName);
  }
  return { scenes: installed, owned };
}

export interface ObsStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  version: string | null;
  programScene: string | null;
  scenes: string[];
  videoInputs: string[];
}

/** One OBS connection with read-only status. */
export class ObsLink extends EventEmitter {
  status: ObsStatus = { state: 'disconnected', error: null, version: null, programScene: null, scenes: [], videoInputs: [] };
  private socket: ObsSocket | null = null;
  private readonly create: () => ObsSocket;

  constructor(create: () => ObsSocket) {
    super();
    this.create = create;
  }

  private update(patch: Partial<ObsStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('change');
  }

  async connect(host: string, port: number, password: string) {
    await this.disconnect();
    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Enter the OBS computer’s address and WebSocket port (OBS › Tools › WebSocket Server Settings).');
    }
    const socket = this.create();
    this.socket = socket;
    this.update({ state: 'connecting', error: null });
    try {
      await socket.connect(`ws://${host}:${port}`, password || undefined, { rpcVersion: 1 });
    } catch (error) {
      this.socket = null;
      const text = String((error as Error)?.message ?? error);
      const message = /auth/i.test(text)
        ? 'OBS rejected the password. Copy it from OBS › Tools › WebSocket Server Settings › Show Connect Info.'
        : 'Could not reach OBS. Check that OBS is open and its WebSocket server is enabled on this port.';
      this.update({ state: 'error', error: message });
      throw new Error(message);
    }
    socket.on('CurrentProgramSceneChanged', (e: { sceneName: string }) => this.update({ programScene: e.sceneName }));
    socket.on('SceneListChanged', () => void this.refresh());
    socket.on('InputCreated', () => void this.refresh());
    socket.on('InputRemoved', () => void this.refresh());
    socket.on('InputNameChanged', () => void this.refresh());
    socket.on('ConnectionClosed', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.update({ state: 'error', error: 'The connection to OBS was lost. Reconnect in Setup › OBS.', programScene: null });
    });
    const version = await socket.call('GetVersion');
    this.update({ state: 'connected', version: version.obsVersion ?? null });
    await this.refresh();
  }

  async refresh() {
    const socket = this.socket;
    if (!socket) return;
    try {
      const [scenes, inputs] = await Promise.all([socket.call('GetSceneList'), socket.call('GetInputList')]);
      this.update({
        programScene: scenes.currentProgramSceneName ?? null,
        scenes: (scenes.scenes ?? []).map((s: { sceneName: string }) => s.sceneName),
        videoInputs: (inputs.inputs ?? [])
          .filter((i: { inputName: string; inputKind: string }) => !AUDIO_OR_BROWSER.test(i.inputKind) && !i.inputName.startsWith('Air · '))
          .map((i: { inputName: string }) => i.inputName),
      });
    } catch {
      // A failed read leaves the last known status; ConnectionClosed reports real loss.
    }
  }

  async install(rows: SceneRow[], owned: Owned, saveOwned: (owned: Owned) => void) {
    if (!this.socket) throw new Error('Connect to OBS first.');
    const result = await installScenes({ socket: this.socket, rows, owned, saveOwned });
    await this.refresh();
    return result;
  }

  async disconnect() {
    const socket = this.socket;
    this.socket = null;
    if (socket) await socket.disconnect().catch(() => {});
    this.update({ state: 'disconnected', error: null, programScene: null, scenes: [], videoInputs: [], version: null });
  }
}
