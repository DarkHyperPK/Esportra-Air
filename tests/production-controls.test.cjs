const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const OBSController = require('../src/obs-controller');
const { ShowRunner } = require('../src/show-runner');

function controller() {
  const socket = new EventEmitter(), calls = [];
  let replayActive = true, failedSave = false;
  const transitions = [
    { transitionName: 'Cut', transitionKind: 'cut_transition' },
    { transitionName: 'Fade', transitionKind: 'fade_transition' },
    { transitionName: 'Show sting', transitionKind: 'obs_stinger_transition' },
  ];
  socket.call = async (name, input) => {
    calls.push({ name, input });
    if (name === 'GetSceneTransitionList') return { transitions };
    if (name === 'GetReplayBufferStatus') return { outputActive: replayActive };
    if (name === 'GetInputList') return { inputs: [] };
    if (name === 'SaveReplayBuffer') {
      if (failedSave) throw new Error('Cannot save');
      queueMicrotask(() => socket.emit('ReplayBufferSaved', { savedReplayPath: 'C:/clips/replay.mp4' }));
    }
    if (name === 'GetVersion') return { obsVersion: '32.0.0', obsWebSocketVersion: '5.6.0' };
    if (name === 'GetSceneCollectionList') return { currentSceneCollectionName: 'Operator collection' };
    if (name === 'GetSceneList') return { scenes: [{ sceneName: 'Game' }, { sceneName: 'ESA_Replay' }] };
    return {};
  };
  const obs = new OBSController({ websocket: socket });
  obs._state = 'studio_mode_detected'; obs._tally.program = 'Game';
  return { obs, socket, calls, transitions, setReplay: value => { replayActive = value; }, failSave: () => { failedSave = true; } };
}

test('next action advances while the previous segment stays on air, with three coming up', async () => {
  const runner = new ShowRunner({ logger: { error() {}, warn() {} } });
  runner.loadRundown(['Opening', 'Map', 'Break', 'Results', 'Closing'].map((name, i) => ({ id: String(i), name, scene: name })));
  runner.start(); await runner.take('0'); runner._onTallyChanged({ program: 'Opening' });
  const state = runner.getState();
  assert.equal(state.onAirSegment.name, 'Opening');
  assert.equal(state.activeSegment.name, 'Map');
  assert.deepEqual(state.comingUp.map(item => item.name), ['Break', 'Results', 'Closing']);
  runner.loadRundown([]);
});

test('Cut and Fade use validated live transitions before Studio Mode takes', async () => {
  const { obs, calls } = controller();
  await obs.take('Game', { mode: 'fade', name: 'Fade', durationMs: 450 });
  assert.deepEqual(calls.map(call => call.name), ['GetSceneTransitionList', 'SetCurrentSceneTransition', 'SetCurrentSceneTransitionDuration', 'SetCurrentPreviewScene', 'TriggerStudioModeTransition']);
  calls.length = 0;
  const result = await obs.take('Game', { mode: 'stinger', name: 'Fade' });
  assert.equal(result.ok, false);
  assert.equal(calls.some(call => call.name.startsWith('SetCurrent')), false);
});

test('invalid transition duration cannot reach OBS', async () => {
  const { obs, calls } = controller();
  const result = await obs.take('Game', { mode: 'fade', name: 'Fade', durationMs: -1 });
  assert.equal(result.ok, false); assert.equal(calls.length, 0);
});

test('direct mode supports Cut but rejects animated transitions without Studio Mode', async () => {
  const { obs, calls } = controller(); obs._state = 'ready';
  assert.equal((await obs.take('Game', { mode: 'cut', name: 'Cut' })).ok, true);
  assert.equal((await obs.take('Game', { mode: 'stinger', name: 'Show sting' })).ok, false);
  assert.equal(calls.filter(call => call.name === 'SetCurrentProgramScene').length, 1);
});

test('OBS inspection reports version, collection, scene names, transitions and replay readiness', async () => {
  const { obs } = controller(); const state = await obs.inspect();
  assert.equal(state.version, '32.0.0'); assert.equal(state.collection, 'Operator collection');
  assert.deepEqual(state.scenes, ['Game', 'ESA_Replay']); assert.equal(state.replayBufferActive, true);
});

test('replay loads the saved clip and returns only on its media-ended event', async () => {
  const { obs, socket, calls } = controller();
  assert.equal((await obs.triggerReplay()).ok, true);
  const input = calls.find(call => call.name === 'CreateInput').input;
  assert.equal(input.inputSettings.local_file, 'C:/clips/replay.mp4');
  assert.equal(input.inputSettings.looping, false);
  socket.emit('CurrentProgramSceneChanged', { sceneName: 'ESA_Replay' });
  await obs._replay.ended('Another clip');
  assert.equal(calls.filter(call => call.name === 'SetCurrentPreviewScene').length, 1);
  await obs._replay.ended('ESA_Replay_clip');
  assert.equal(calls.filter(call => call.name === 'SetCurrentPreviewScene').at(-1).input.sceneName, 'Game');
});

test('a manual scene change cancels replay return and an inactive buffer cannot save', async () => {
  const { obs, socket, calls, setReplay } = controller();
  await obs.triggerReplay();
  socket.emit('CurrentProgramSceneChanged', { sceneName: 'ESA_Replay' });
  socket.emit('CurrentProgramSceneChanged', { sceneName: 'Camera' });
  const before = calls.length; await obs._replay.ended('ESA_Replay_clip'); assert.equal(calls.length, before);
  setReplay(false); assert.equal((await obs.triggerReplay()).ok, false);
  assert.equal(calls.filter(call => call.name === 'SaveReplayBuffer').length, 1);
});

test('failed replay saves remove event listeners and never change program', async () => {
  const { obs, socket, calls, failSave } = controller(); failSave();
  assert.equal((await obs.triggerReplay()).ok, false);
  assert.equal(socket.listenerCount('ReplayBufferSaved'), 0);
  assert.equal(calls.some(call => call.name === 'SetCurrentPreviewScene'), false);
});

test('timeout and technical pause are independent, and ending them never retries old automatic takes', async () => {
  const runner = new ShowRunner({ logger: { error() {}, warn() {} } });
  runner.loadRundown([{ id: 'map', name: 'Map', scene: 'Game', autoTake: true, holdWindowMs: 10 }]);
  runner.start(); runner.queueAutomaticTake('map'); runner.setTimeoutPaused(true); runner.techPause();
  assert.equal((await runner.take('map')).ok, false);
  runner.setTimeoutPaused(false); assert.equal(runner.getState().techPaused, true);
  runner.resume(); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(runner.getState().activeSegment.state, 'holding');
  assert.equal(runner.getState().holdCountdown, null);
  runner.loadRundown([]);
});

test('an operator pause during OBS disconnection survives reconnect, and replay returns are dropped during pause', async () => {
  const socket = new EventEmitter(), runner = new ShowRunner({ obsController: socket, logger: { error() {} } });
  socket.emit('disconnected'); assert.equal(runner.getState().pauseSource, 'obs_disconnected');
  runner.techPause(); socket.emit('connected'); assert.equal(runner.isTechPaused(), true); assert.equal(runner.getState().pauseSource, 'operator');
  const { obs, calls } = controller(); obs.canReplayReturn = () => false;
  await obs.triggerReplay(); obs._tally.program = 'ESA_Replay';
  const before = calls.length; await obs._replay.ended('ESA_Replay_clip'); assert.equal(calls.length, before);
  assert.equal(obs._replay.session, null); runner.loadRundown([]);
});

test('production changing during preview preparation cancels before OBS takes Program', async () => {
  const { obs, socket, calls } = controller(); let allowed = true; const original = socket.call;
  socket.call = async (name, input) => { const result = await original(name, input); if (name === 'SetCurrentPreviewScene') allowed = false; return result; };
  const result = await obs.take('Game', null, { stillAllowed: () => allowed });
  assert.equal(result.ok, false); assert.match(result.error, /cancelled/);
  assert.equal(calls.some(call => call.name === 'TriggerStudioModeTransition'), false);
});

test('operator hold cancels an automatic window until an explicit take, even after repeated triggers', async () => {
  const obs = new EventEmitter(); let takes = 0;
  obs.take = async () => { takes++; return { ok: true }; };
  const runner = new ShowRunner({ obsController: obs, logger: { error() {} } });
  runner.loadRundown([{ id: 'map', name: 'Map', scene: 'Game', autoTake: true, holdWindowMs: 20 }]);
  runner.start(); assert.equal(runner.queueAutomaticTake('map').ok, true);
  assert.ok(runner.getState().holdCountdown > 0);
  assert.equal(runner.hold('map').ok, true);
  assert.equal(runner.queueAutomaticTake('map').ok, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(takes, 0); assert.equal(runner.getState().holdCountdown, null);
  assert.equal(runner.getState().activeSegment.heldBy, 'operator');
  assert.equal((await runner.take('map')).ok, true);
  obs.emit('tally-changed', { program: 'Game' });
  assert.equal(takes, 1); assert.equal(runner.getState().onAirSegment.id, 'map');
  runner.loadRundown([]);
});

test('missing OBS tally never becomes an assumed on-air segment', async () => {
  const errors = [];
  const runner = new ShowRunner({ logger: { error() {}, warn() {} } });
  runner.on('error', error => errors.push(error.message));
  runner.loadRundown([{ id: 'map', name: 'Map', scene: 'Game' }]); runner.start(); await runner.take('map');
  await new Promise(resolve => setTimeout(resolve, 3050));
  assert.equal(runner.getState().onAirSegment, null);
  assert.equal(runner.getState().activeSegment.state, 'armed');
  assert.match(errors[0], /did not confirm/); runner.loadRundown([]);
});
test('failed authentication keeps reconnect backoff and only one scheduled retry', async () => {
  const socket = new EventEmitter(), jobs = [], delays = [];
  socket.connect = async () => { socket.emit('ConnectionOpened'); socket.emit('ConnectionClosed'); throw new Error('Authentication failed'); };
  const obs = new OBSController({ websocket: socket, logger: { info() {}, warn() {} }, setTimeout: (run, ms) => { jobs.push(run); delays.push(ms); return jobs.length; }, clearTimeout: () => {} });
  await assert.rejects(obs.connect('127.0.0.1', 4455, 'synthetic-password'));
  for (let index = 0; index < 4; index++) await jobs[index]();
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10000]);
  await obs.disconnect();
});


test('an unavailable optional replay buffer does not block OBS screen setup or session readiness', async () => {
  const {obs,socket,calls}=controller();
  const original=socket.call;
  socket.call=async(name,input)=>{if(name==='GetReplayBufferStatus'){const error=new Error('Replay buffer not configured');error.code=604;throw error;}return original(name,input);};
  const state=await obs.inspect();
  assert.equal(state.inspectionIncomplete,false);
  assert.equal(state.replayStatusAvailable,false);
  assert.equal(state.replayBufferActive,null);
  assert.equal(state.collection,'Operator collection');
  assert.equal(calls.some(call=>/^Set|^Create|^Trigger/.test(call.name)),false);
  const required=socket.call;
  socket.call=async(name,input)=>{if(name==='GetSceneList')throw new Error('Unavailable');return required(name,input);};
  assert.equal((await obs.inspect()).inspectionIncomplete,true,'required scene inspection still blocks unsafe setup');
});
