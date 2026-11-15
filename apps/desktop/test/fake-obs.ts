// A small in-memory OBS WebSocket server model for tests: scenes, inputs, Studio Mode, transitions,
// screenshots, the replay buffer and the events OBS emits.
import { EventEmitter } from 'node:events';
import type { ObsSocket } from '../src/main/obs-types.ts';

interface Item { sceneItemId: number; sourceName: string; enabled?: boolean; transform?: unknown; index?: number }

export class FakeObs extends EventEmitter implements ObsSocket {
  scenes = new Map<string, Item[]>([['Scene', []]]);
  inputs = new Map<string, { inputKind: string; settings: Record<string, any> }>([
    ['Game Capture', { inputKind: 'game_capture', settings: {} }],
    ['Desktop Audio', { inputKind: 'wasapi_output_capture', settings: {} }],
  ]);
  transitions = [
    { transitionName: 'Cut', transitionKind: 'cut_transition' },
    { transitionName: 'Fade', transitionKind: 'fade_transition' },
    { transitionName: 'Esportra Stinger', transitionKind: 'obs_stinger_transition' },
  ];
  currentTransition = 'Fade';
  program = 'Scene';
  preview: string | null = null;
  studio = false;
  streaming = false;
  replayBuffer: boolean | 'unconfigured' = true;
  password = 'secret';
  requests: string[] = [];
  /** How long a transition takes before the program scene changes (0 = instant). */
  transitionMs = 0;
  private nextId = 1;

  async connect(_url: string, password?: string) {
    if (password !== this.password) throw new Error('Authentication failed');
    return { obsWebSocketVersion: '5.5.0' };
  }
  async disconnect() {}
  /** Simulates the connection dropping. */
  drop() { this.emit('ConnectionClosed'); }
  /** The crew adds their own source inside a scene in OBS. */
  addSource(scene: string, sourceName: string) {
    this.scenes.get(scene)!.push({ sceneItemId: this.nextId++, sourceName });
    this.emit('SceneItemCreated', { sceneName: scene, sourceName });
  }
  /** Like OBS: scenes and inputs are all sources, so a name can be used once (error 601). */
  private unique(name: string) {
    if (this.scenes.has(name) || this.inputs.has(name)) throw Object.assign(new Error(`A source already exists by that name: ${name}`), { code: 601 });
  }
  private item(scene: string, id: number) { return this.scenes.get(scene)!.find((i) => i.sceneItemId === id)!; }

  async call(request: string, data: any = {}): Promise<any> {
    this.requests.push(request);
    switch (request) {
      case 'GetVersion': return { obsVersion: '31.0.0' };
      case 'GetStreamStatus': return { outputActive: this.streaming };
      case 'GetRecordStatus': return { outputActive: false };
      case 'GetSceneList': return { currentProgramSceneName: this.program, scenes: [...this.scenes.keys()].map((sceneName) => ({ sceneName })) };
      case 'GetSceneCollectionList': return { currentSceneCollectionName: 'Test collection', sceneCollections: ['Test collection'] };
      case 'GetInputList': return { inputs: [...this.inputs].map(([inputName, i]) => ({ inputName, inputKind: i.inputKind })) };
      case 'CreateScene': this.unique(data.sceneName); this.scenes.set(data.sceneName, []); return {};
      case 'SetSceneName': {
        this.unique(data.newSceneName);
        const items = this.scenes.get(data.sceneName)!;
        this.scenes.delete(data.sceneName);
        this.scenes.set(data.newSceneName, items);
        // A nested scene is a source of its parent: its items follow the new name.
        for (const list of this.scenes.values()) for (const i of list) if (i.sourceName === data.sceneName) i.sourceName = data.newSceneName;
        return {};
      }
      case 'SetInputName': {
        this.unique(data.newInputName);
        this.inputs.set(data.newInputName, this.inputs.get(data.inputName)!);
        this.inputs.delete(data.inputName);
        for (const list of this.scenes.values()) for (const i of list) if (i.sourceName === data.inputName) i.sourceName = data.newInputName;
        return {};
      }
      case 'CreateInput': {
        this.unique(data.inputName);
        this.inputs.set(data.inputName, { inputKind: data.inputKind, settings: data.inputSettings });
        const sceneItemId = this.nextId++;
        this.scenes.get(data.sceneName)!.push({ sceneItemId, sourceName: data.inputName, enabled: data.sceneItemEnabled });
        return { sceneItemId };
      }
      case 'GetInputSettings': return { inputSettings: this.inputs.get(data.inputName)!.settings };
      case 'SetInputSettings': Object.assign(this.inputs.get(data.inputName)!.settings, data.inputSettings); return {};
      case 'GetSceneItemList': {
        if (!this.scenes.has(data.sceneName)) throw new Error('No scene');
        return { sceneItems: this.scenes.get(data.sceneName)!.map((i) => ({ ...i, sceneItemEnabled: i.enabled !== false })) };
      }
      case 'CreateSceneItem': {
        const sceneItemId = this.nextId++;
        this.scenes.get(data.sceneName)!.push({ sceneItemId, sourceName: data.sourceName, enabled: data.sceneItemEnabled });
        this.emit('SceneItemCreated', { sceneName: data.sceneName, sourceName: data.sourceName });
        return { sceneItemId };
      }
      case 'RemoveSceneItem': this.scenes.set(data.sceneName, this.scenes.get(data.sceneName)!.filter((i) => i.sceneItemId !== data.sceneItemId)); return {};
      case 'SetSceneItemTransform': this.item(data.sceneName, data.sceneItemId).transform = data.sceneItemTransform; return {};
      case 'SetSceneItemIndex': this.item(data.sceneName, data.sceneItemId).index = data.sceneItemIndex; return {};
      case 'SetSceneItemEnabled': this.item(data.sceneName, data.sceneItemId).enabled = data.sceneItemEnabled; return {};
      case 'GetStudioModeEnabled': return { studioModeEnabled: this.studio };
      case 'SetStudioModeEnabled':
        this.studio = data.studioModeEnabled;
        this.preview = this.studio ? this.program : null;
        this.emit('StudioModeStateChanged', { studioModeEnabled: this.studio });
        return {};
      case 'GetCurrentPreviewScene':
        if (!this.studio) throw new Error('Studio mode not enabled');
        return { currentPreviewSceneName: this.preview };
      case 'SetCurrentPreviewScene':
        if (!this.studio) throw new Error('Studio mode not enabled');
        this.preview = data.sceneName;
        this.emit('CurrentPreviewSceneChanged', { sceneName: data.sceneName });
        return {};
      case 'SetCurrentProgramScene': this.program = data.sceneName; this.emit('CurrentProgramSceneChanged', { sceneName: data.sceneName }); return {};
      case 'GetSceneTransitionList': return { currentSceneTransitionName: this.currentTransition, transitions: this.transitions };
      case 'SetCurrentSceneTransition':
        this.currentTransition = data.transitionName;
        this.emit('CurrentSceneTransitionChanged', { transitionName: data.transitionName });
        return {};
      case 'SetCurrentSceneTransitionDuration': return {};
      case 'TriggerStudioModeTransition': {
        if (!this.studio) throw new Error('Studio mode not enabled');
        this.emit('SceneTransitionStarted', { transitionName: this.currentTransition });
        const finish = () => {
          this.program = this.preview!;
          this.emit('CurrentProgramSceneChanged', { sceneName: this.program });
          this.emit('SceneTransitionEnded', { transitionName: this.currentTransition });
        };
        if (this.transitionMs) setTimeout(finish, this.transitionMs); else finish();
        return {};
      }
      case 'GetSourceScreenshot': {
        // A renderable stand-in for OBS's frame: a coloured card naming the scene.
        const hue = [...String(data.sourceName)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
        const label = String(data.sourceName).replace(/[<&>]/g, '');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="hsl(${hue} 35% 18%)"/><rect x="24" y="24" width="432" height="222" fill="none" stroke="hsl(${hue} 40% 40%)" stroke-width="2"/><text x="240" y="142" fill="#e4e4e7" font-family="sans-serif" font-size="26" text-anchor="middle">${label}</text></svg>`;
        return { imageData: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
      }
      case 'GetReplayBufferStatus':
        if (this.replayBuffer === 'unconfigured') throw new Error('Replay buffer not configured (604)');
        return { outputActive: this.replayBuffer };
      case 'SaveReplayBuffer':
        setTimeout(() => this.emit('ReplayBufferSaved', { savedReplayPath: '/tmp/replay.mp4' }), 5);
        return {};
      case 'TriggerMediaInputAction': return {};
      default: throw new Error(`FakeObs: unsupported ${request}`);
    }
  }
}
