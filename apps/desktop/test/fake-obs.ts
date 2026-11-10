// A small in-memory OBS WebSocket server model for tests.
import { EventEmitter } from 'node:events';
import type { ObsSocket } from '../src/main/obs.ts';

export class FakeObs extends EventEmitter implements ObsSocket {
  scenes = new Map<string, Array<{ sceneItemId: number; sourceName: string; transform?: unknown; index?: number }>>([['Scene', []]]);
  inputs = new Map<string, { inputKind: string; settings: Record<string, unknown> }>([
    ['Game Capture', { inputKind: 'game_capture', settings: {} }],
    ['Desktop Audio', { inputKind: 'wasapi_output_capture', settings: {} }],
  ]);
  program = 'Scene';
  streaming = false;
  password = 'secret';
  requests: string[] = [];
  private nextId = 1;

  async connect(_url: string, password?: string) {
    if (password !== this.password) throw new Error('Authentication failed');
    return { obsWebSocketVersion: '5.5.0' };
  }
  async disconnect() {}
  async call(request: string, data: any = {}): Promise<any> {
    this.requests.push(request);
    switch (request) {
      case 'GetVersion': return { obsVersion: '31.0.0' };
      case 'GetStreamStatus': return { outputActive: this.streaming };
      case 'GetRecordStatus': return { outputActive: false };
      case 'GetSceneList': return { currentProgramSceneName: this.program, scenes: [...this.scenes.keys()].map((sceneName) => ({ sceneName })) };
      case 'GetInputList': return { inputs: [...this.inputs].map(([inputName, i]) => ({ inputName, inputKind: i.inputKind })) };
      case 'CreateScene': this.scenes.set(data.sceneName, []); return {};
      case 'CreateInput': {
        this.inputs.set(data.inputName, { inputKind: data.inputKind, settings: data.inputSettings });
        const sceneItemId = this.nextId++;
        this.scenes.get(data.sceneName)!.push({ sceneItemId, sourceName: data.inputName });
        return { sceneItemId };
      }
      case 'GetInputSettings': return { inputSettings: this.inputs.get(data.inputName)!.settings };
      case 'SetInputSettings': Object.assign(this.inputs.get(data.inputName)!.settings, data.inputSettings); return {};
      case 'GetSceneItemList': return { sceneItems: this.scenes.get(data.sceneName) ?? [] };
      case 'CreateSceneItem': { const sceneItemId = this.nextId++; this.scenes.get(data.sceneName)!.push({ sceneItemId, sourceName: data.sourceName }); return { sceneItemId }; }
      case 'RemoveSceneItem': this.scenes.set(data.sceneName, this.scenes.get(data.sceneName)!.filter((i) => i.sceneItemId !== data.sceneItemId)); return {};
      case 'SetSceneItemTransform': { const item = this.scenes.get(data.sceneName)!.find((i) => i.sceneItemId === data.sceneItemId)!; item.transform = data.sceneItemTransform; return {}; }
      case 'SetSceneItemIndex': { const item = this.scenes.get(data.sceneName)!.find((i) => i.sceneItemId === data.sceneItemId)!; item.index = data.sceneItemIndex; return {}; }
      default: throw new Error(`FakeObs: unsupported ${request}`);
    }
  }
}
