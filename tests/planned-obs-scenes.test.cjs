const { test } = require('node:test');
const assert = require('node:assert/strict');
const OBSController = require('../src/obs-controller');
const { plannedScreenUrls } = require('../src/screen-scenes');
function controller(kind = 'browser_source') {
  const obs = new OBSController(), calls = [];
  obs._state = 'ready';
  obs._obs = { call: async (name, input) => {
    calls.push({ name, input });
    if (name === 'GetSceneList') return { scenes: ['ESA_Holding', 'ESA_Gameplay', 'ESA_Fullscreen', 'ESA_Replay', 'ESA_Casters', 'Operator camera'].map(sceneName => ({ sceneName })) };
    if (name === 'GetInputList') return { inputs: [{ inputName: 'ESA_Gameplay_source', inputKind: kind }, { inputName: 'Operator camera', inputKind: 'dshow_input' }] };
    return {};
  } };
  return { obs, calls };
}
test('planned Map keeps the existing gameplay composition and updates only its HUD source', async () => {
  const { obs, calls } = controller();
  const result = await obs.buildScenes(plannedScreenUrls([{ overlay: 'ingame' }, { overlay: 'match-intro' }], 'NEXT'));
  assert.deepEqual(result.created, ['ESA_Screen_match_intro']);
  const updates = calls.filter(call => call.name === 'SetInputSettings');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].input.inputName, 'ESA_Gameplay_source');
  assert.ok(updates[0].input.inputSettings.url.endsWith('match=NEXT'));
  assert.equal(calls.some(call => ['RemoveScene', 'RemoveInput', 'SetSceneItemEnabled'].includes(call.name)), false);
});
test('scene setup rejects an operator input with a conflicting generated source name', async () => {
  const { obs, calls } = controller('dshow_input');
  await assert.rejects(() => obs.buildScenes(plannedScreenUrls([{ overlay: 'ingame' }], 'NEXT')), /another input type/);
  assert.equal(calls.some(call => call.name === 'SetInputSettings'), false);
});
