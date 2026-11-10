// Replay (F3): save the OBS replay buffer, play the clip on the Replay scene through the stinger,
// then return to the scene that was on air. Ported from the legacy src/obs-replay.js.
//
// Air never starts the replay buffer or the stream. If the buffer is off or there is no stinger,
// it says what to do in OBS.

import { EventEmitter } from 'node:events';
import { REPLAY_CLIP, SCENES } from '../shared/scenes.ts';
import type { ObsLink } from './obs.ts';

const SAVE_TIMEOUT_MS = 5000;

export interface ReplayResult {
  ok: boolean;
  error?: string;
}

export class Replay extends EventEmitter {
  private readonly link: ObsLink;
  private readonly canReturn: () => boolean;
  private readonly stinger: () => string | null;
  private session: { previousScene: string; generation: number; choice: { mode: 'stinger'; name: string } } | null = null;
  private saving = false;
  private generation = 0;
  private bound: unknown = null;

  constructor(link: ObsLink, options: { canReturn?: () => boolean; stinger?: () => string | null } = {}) {
    super();
    this.link = link;
    this.canReturn = options.canReturn ?? (() => true);
    this.stinger = options.stinger ?? (() => null);
  }

  get busy() {
    return this.saving || this.session !== null;
  }

  cancel() {
    this.generation += 1;
    this.session = null;
  }

  /** Listens for the clip finishing; call once after the link connects. */
  attach() {
    const socket = this.link.raw;
    if (!socket || this.bound === socket) return;
    this.bound = socket;
    socket.on('MediaInputPlaybackEnded', (e: { inputName: string }) => void this.ended(e.inputName));
    socket.on('CurrentProgramSceneChanged', (e: { sceneName: string }) => {
      if (e.sceneName !== SCENES.replay.name && this.session) this.cancel();
    });
  }

  async play(): Promise<ReplayResult> {
    const socket = this.link.raw;
    if (!socket) return { ok: false, error: 'Connect to OBS first.' };
    this.attach();
    if (this.busy) return { ok: false, error: 'A replay is already being saved or played.' };
    this.saving = true;
    const generation = this.generation;
    const replayScene = SCENES.replay.name;
    try {
      let active = false;
      try {
        active = !!(await socket.call('GetReplayBufferStatus')).outputActive;
      } catch {
        return { ok: false, error: 'OBS has no replay buffer set up. Enable it in OBS › Settings › Output › Replay Buffer.' };
      }
      if (!active) return { ok: false, error: 'Start the replay buffer in OBS before saving a replay.' };
      const previousScene = this.link.status.programScene;
      if (!this.link.status.scenes.includes(replayScene)) return { ok: false, error: 'Add the Esportra scenes to OBS first (Scenes › Add for me).' };
      if (!previousScene || previousScene === replayScene) return { ok: false, error: 'Put a scene on air before starting a replay.' };
      const choice = this.link.stingerChoice(this.stinger());
      if (!choice) return { ok: false, error: 'Add a Stinger transition in OBS before starting a replay.' };
      const path = await this.save(socket);
      if (!path) return { ok: false, error: 'OBS did not save a replay within five seconds.' };
      if (generation !== this.generation || this.link.status.programScene !== previousScene) return { ok: false, error: 'Replay cancelled because the scene on air changed during the save.' };
      await this.prepareClip(socket, path, replayScene);
      const taken = await this.link.take(choice as { mode: 'stinger'; name: string }, { scene: replayScene, stillAllowed: () => generation === this.generation && this.canReturn() });
      if (!taken.ok) return taken;
      this.session = { previousScene, generation, choice: choice as { mode: 'stinger'; name: string } };
      await socket.call('TriggerMediaInputAction', { inputName: REPLAY_CLIP, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
      return { ok: true };
    } catch {
      this.session = null;
      return { ok: false, error: 'Could not prepare the replay. Check the Esportra Replay scene in OBS.' };
    } finally {
      this.saving = false;
    }
  }

  private async prepareClip(socket: NonNullable<ObsLink['raw']>, path: string, scene: string) {
    const settings = { is_local_file: true, local_file: path, looping: false, restart_on_activate: false, close_when_inactive: false };
    const { inputs = [] } = await socket.call('GetInputList');
    const input = inputs.find((i: { inputName: string }) => i.inputName === REPLAY_CLIP);
    if (!input) {
      await socket.call('CreateInput', { sceneName: scene, inputName: REPLAY_CLIP, inputKind: 'ffmpeg_source', inputSettings: settings, sceneItemEnabled: true });
      return;
    }
    const { sceneItems = [] } = await socket.call('GetSceneItemList', { sceneName: scene });
    const item = sceneItems.find((i: { sourceName: string }) => i.sourceName === REPLAY_CLIP);
    if (input.inputKind !== 'ffmpeg_source' || !item) throw new Error('The replay source name belongs to another input.');
    await socket.call('SetInputSettings', { inputName: REPLAY_CLIP, inputSettings: settings, overlay: true });
    await socket.call('SetSceneItemEnabled', { sceneName: scene, sceneItemId: item.sceneItemId, sceneItemEnabled: true });
  }

  private save(socket: NonNullable<ObsLink['raw']>): Promise<string | null> {
    return new Promise((resolve) => {
      const finish = (path: string | null) => {
        clearTimeout(timer);
        socket.off?.('ReplayBufferSaved', saved);
        resolve(path);
      };
      const saved = (e: { savedReplayPath?: string }) => finish(typeof e?.savedReplayPath === 'string' && e.savedReplayPath ? e.savedReplayPath : null);
      const timer = setTimeout(() => finish(null), SAVE_TIMEOUT_MS);
      socket.on('ReplayBufferSaved', saved);
      socket.call('SaveReplayBuffer').catch(() => finish(null));
    });
  }

  private async ended(inputName: string) {
    const session = this.session;
    if (inputName !== REPLAY_CLIP || !session) return;
    this.session = null;
    if (session.generation !== this.generation || this.link.status.programScene !== SCENES.replay.name) return;
    if (!this.canReturn()) {
      this.emit('error-message', 'Replay finished during a pause. Return was skipped; take your scene manually after resuming.');
      return;
    }
    const result = await this.link.take(session.choice, { scene: session.previousScene, stillAllowed: () => this.canReturn() });
    if (!result.ok) this.emit('error-message', 'Replay ended but Air could not return to the previous scene. Take it manually.');
  }
}
