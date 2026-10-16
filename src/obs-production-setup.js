'use strict';
const SLOTS = Object.freeze([
  { id: 'game', scene: 'ESA_Game_Feed', parent: 'ESA_Gameplay', label: 'Game feed', x: 0, width: 1920 },
  { id: 'camera1', scene: 'ESA_Camera_1', parent: 'ESA_Casters', label: 'Talent camera 1', x: 0, width: 960 },
  { id: 'camera2', scene: 'ESA_Camera_2', parent: 'ESA_Casters', label: 'Talent camera 2', x: 960, width: 960 },
]);
class ProductionSetup {
  constructor({ socket, buildScenes, saveOwned }) { this.socket = socket; this.buildScenes = buildScenes; this.saveOwned = saveOwned; this.busy = false; }
  async build({ name, ownedCollection, outputUrls }) {
    if (this.busy) throw new Error('Scene preparation is already running.');
    this.busy = true;
    try {
      const [stream, recording, collections] = await Promise.all(['GetStreamStatus', 'GetRecordStatus', 'GetSceneCollectionList'].map(request => this.socket.call(request)));
      if (stream.outputActive !== false || recording.outputActive !== false) throw new Error('Stop OBS streaming and recording before switching collections.');
      if (!name || typeof name !== 'string' || name.length > 100 || /[\x00-\x1f]/.test(name)) throw new Error('Invalid broadcast collection name.');
      if (ownedCollection) {
        if (!(collections.sceneCollections || []).includes(ownedCollection)) throw new Error('The saved broadcast collection is missing in OBS. Restore it before rebuilding.');
        if (collections.currentSceneCollectionName !== ownedCollection) await this.socket.call('SetCurrentSceneCollection', { sceneCollectionName: ownedCollection });
      } else {
        if ((collections.sceneCollections || []).includes(name)) throw new Error('A collection with this name already exists. Air will not take ownership of it.');
        await this.socket.call('CreateSceneCollection', { sceneCollectionName: name });
        this.saveOwned(name); ownedCollection = name;
      }
      const result = await this.buildScenes(outputUrls);
      const sceneList = await this.socket.call('GetSceneList');
      const scenes = new Set((sceneList.scenes || []).map(scene => scene.sceneName));
      for (const slot of SLOTS) {
        if (!scenes.has(slot.scene)) await this.socket.call('CreateScene', { sceneName: slot.scene });
        const { sceneItems = [] } = await this.socket.call('GetSceneItemList', { sceneName: slot.parent });
        if (sceneItems.some(item => item.sourceName === slot.scene)) continue;
        const { sceneItemId } = await this.socket.call('CreateSceneItem', { sceneName: slot.parent, sourceName: slot.scene, sceneItemEnabled: true });
        // Video remains below the HUD browser source in the parent composition.
        await this.socket.call('SetSceneItemIndex', { sceneName: slot.parent, sceneItemId, sceneItemIndex: 0 });
        await this.socket.call('SetSceneItemTransform', { sceneName: slot.parent, sceneItemId, sceneItemTransform: { positionX: slot.x, positionY: 0, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: slot.width, boundsHeight: 1080 } });
      }
      return { ...result, collection: ownedCollection, ...(await this.inspect(ownedCollection)) };
    } finally { this.busy = false; }
  }
  async inspect(ownedCollection) {
    const collections = await this.socket.call('GetSceneCollectionList');
    if (!ownedCollection || collections.currentSceneCollectionName !== ownedCollection) return { owned: false, currentCollection: collections.currentSceneCollectionName, slots: [], inputs: [] };
    const [{ inputs = [] }, { scenes = [] }] = await Promise.all([this.socket.call('GetInputList'), this.socket.call('GetSceneList')]);
    const available = new Set(scenes.map(scene => scene.sceneName));
    const slots = await Promise.all(SLOTS.map(async slot => ({ id: slot.id, label: slot.label, scene: slot.scene, sources: available.has(slot.scene) ? ((await this.socket.call('GetSceneItemList', { sceneName: slot.scene })).sceneItems || []).map(item => item.sourceName) : [] })));
    return { owned: true, currentCollection: ownedCollection, slots, inputs: inputs.filter(input => !input.inputName.startsWith('ESA_')).map(input => ({ name: input.inputName, kind: input.inputKind })) };
  }
  async assign(ownedCollection, slotId, sourceName) {
    if (this.busy) throw new Error('Wait for scene preparation to finish.');
    const status = await this.inspect(ownedCollection), slot = SLOTS.find(item => item.id === slotId);
    if (!status.owned || !slot || !status.inputs.some(input => input.name === sourceName)) throw new Error('Choose an existing OBS input in the saved broadcast collection.');
    const [stream, recording] = await Promise.all(['GetStreamStatus', 'GetRecordStatus'].map(request => this.socket.call(request)));
    if (stream.outputActive !== false || recording.outputActive !== false) throw new Error('Stop streaming and recording before changing source slots.');
    if (status.slots.find(item => item.id === slotId).sources.includes(sourceName)) return status;
    await this.socket.call('CreateSceneItem', { sceneName: slot.scene, sourceName, sceneItemEnabled: true });
    return this.inspect(ownedCollection);
  }
}
module.exports = { ProductionSetup, SLOTS };
