const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProductionSetup } = require('../src/obs-production-setup');
function fixture() {
  let current = 'User collection', stream = false;
  const collections = ['User collection'], scenes = new Set(), calls = [], items = new Map();
  const socket = { call: async (name, input = {}) => {
    calls.push({ name, input });
    if (name === 'GetStreamStatus') return { outputActive: stream };
    if (name === 'GetRecordStatus') return { outputActive: false };
    if (name === 'GetSceneCollectionList') return { currentSceneCollectionName: current, sceneCollections: [...collections] };
    if (name === 'CreateSceneCollection') { current = input.sceneCollectionName; collections.push(current); }
    if (name === 'SetCurrentSceneCollection') current = input.sceneCollectionName;
    if (name === 'GetSceneList') return { scenes: [...scenes].map(sceneName => ({ sceneName })) };
    if (name === 'CreateScene') scenes.add(input.sceneName);
    if (name === 'GetSceneItemList') return { sceneItems: items.get(input.sceneName) || [] };
    if (name === 'CreateSceneItem') { const source = { sourceName: input.sourceName, sceneItemId: calls.length }; items.set(input.sceneName, [...items.get(input.sceneName) || [], source]); return source; }
    if (name === 'GetInputList') return { inputs: [{ inputName: 'Observer video', inputKind: 'game_capture' }, { inputName: 'Camera', inputKind: 'dshow_input' }] };
    return {};
  } };
  let owned = null;
  const setup = new ProductionSetup({ socket, saveOwned: name => { owned = name; }, buildScenes: async () => { ['ESA_Gameplay','ESA_Casters'].forEach(name => scenes.add(name)); return { created: ['ESA_Gameplay','ESA_Casters'] }; } });
  return { setup, calls, get owned() { return owned; }, setStream: value => { stream = value; } };
}
test('dedicated collection has labelled slots and rebuild preserves user source content', async () => {
  const f = fixture();
  const first = await f.setup.build({ name: 'Esportra · Test', outputUrls: {} });
  assert.equal(first.owned, true); assert.equal(first.slots.length, 3);
  assert.ok(f.calls.some(call => call.name === 'SetSceneItemIndex' && call.input.sceneName === 'ESA_Gameplay' && call.input.sceneItemIndex === 0));
  const assigned = await f.setup.assign(f.owned, 'game', 'Observer video');
  assert.deepEqual(assigned.slots[0].sources, ['Observer video']);
  await f.setup.build({ name: 'Esportra · Test', ownedCollection: f.owned, outputUrls: {} });
  assert.deepEqual((await f.setup.inspect(f.owned)).slots[0].sources, ['Observer video']);
  assert.equal(f.calls.filter(call => call.name === 'CreateSceneCollection').length, 1);
  assert.ok(!f.calls.some(call => /Remove|Delete|Rename/.test(call.name)));
});
test('streaming blocks collection changes and source assignments before side effects', async () => {
  const f = fixture(); f.setStream(true);
  await assert.rejects(f.setup.build({ name: 'Esportra · Test', outputUrls: {} }), /Stop OBS/);
  assert.equal(f.calls.filter(call => call.name.startsWith('Create')).length, 0);
  f.setStream(false); await f.setup.build({ name: 'Esportra · Test', outputUrls: {} });
  f.setStream(true); await assert.rejects(f.setup.assign(f.owned, 'game', 'Observer video'), /Stop streaming/);
});
test('unowned collection and unknown input cannot be silently adopted', async () => {
  const f = fixture();
  await assert.rejects(f.setup.build({ name: 'User collection', outputUrls: {} }), /will not take ownership/);
  await f.setup.build({ name: 'Esportra · Test', outputUrls: {} });
  await assert.rejects(f.setup.assign(f.owned, 'game', 'Missing camera'), /existing OBS input/);
});
