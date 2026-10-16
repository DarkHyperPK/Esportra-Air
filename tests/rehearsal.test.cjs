const { test } = require('node:test');
const assert = require('node:assert/strict');
const Harness = require('../src/simulation/harness');
const { Rehearsal, ROOM } = require('../src/simulation/rehearsal');
const VirtualTimers = require('../src/simulation/virtual-timers');

test('rehearsal graphic dismissal follows virtual time and stays frozen during pause', async () => {
  let position = 0; const fired = [];
  const timers = new VirtualTimers({ position: () => position });
  const id = timers.schedule(() => fired.push('graphic'), 4000);
  position = 1000; await timers.advance(); assert.equal(fired.length, 0);
  // Wall-clock waits cannot expire a timer while virtual match time is paused.
  await timers.advance(); assert.equal(fired.length, 0);
  position = 4000; await timers.advance(); assert.deepEqual(fired, ['graphic']);
  timers.schedule(() => fired.push('cancelled'), 1000); timers.cancel(id + 1);
  position = 6000; await timers.advance(); assert.deepEqual(fired, ['graphic']);
});

test('rehearsal clock pauses, changes speed and scrubs without firing history', async () => {
  let now = 0; const fired = [], sought = [];
  const player = new Harness({ now: () => now, schedule: () => 1, cancel() {}, onEvent: event => fired.push(event.ts), onSeek: (ms, history) => sought.push(history.map(event => event.ts)) });
  await player.load([{ ts: 0 }, { ts: 1000 }, { ts: 2000 }, { ts: 3000 }]);
  assert.deepEqual(sought, [[0]]); player.resume(); now = 1000; await player.tick();
  assert.deepEqual(fired, [1000]); player.pause(); now = 5000; await player.tick();
  assert.equal(player.positionMs, 1000); await player.seek(2500);
  assert.deepEqual(fired, [1000]); assert.deepEqual(sought.at(-1), [0, 1000, 2000]);
  player.setSpeed(2); player.resume(); now = 5250; await player.tick();
  assert.deepEqual(fired, [1000, 3000]); assert.equal(player.playing, false);
  assert.throws(() => player.setSpeed(0), /Choose/); await assert.rejects(player.seek(-1), /inside/);
});

test('sample HUD stays isolated; OBS is opt-in and rechecks production at every take', async () => {
  let now = 0, allowed = true; const writes = [], takes = [];
  const rehearsal = new Rehearsal({ now: () => now, harnessOptions: { now: () => now, schedule: () => 1, cancel() {} }, writeSnapshot: async (code, state) => writes.push({ code, state }), hudPatch: async (code, patch) => writes.push({ code, patch }), takeScene: async scene => { takes.push(scene); return { ok: true }; }, canUseObs: () => allowed });
  await rehearsal.control({ action: 'load' });
  assert.equal(rehearsal.getStatus().allowObs, false); assert.equal(writes[0].state.airContext.simulation, true);
  await rehearsal.control({ action: 'play' }); now = 30000; await rehearsal.harness.tick();
  assert.equal(takes.length, 0); assert.equal(rehearsal.getStatus().rundown.onAirSegment.name, 'Sample round 1');
  await rehearsal.control({ action: 'seek', value: 0 });
  await rehearsal.control({ action: 'obs', allowObs: true, scene: 'ESA_Gameplay' });
  await rehearsal.control({ action: 'play' }); now = 60000; await rehearsal.harness.tick();
  assert.deepEqual(takes, ['ESA_Gameplay']);
  await rehearsal.control({ action: 'seek', value: 0 }); allowed = false;
  await rehearsal.control({ action: 'play' }); now = 90000; await rehearsal.harness.tick();
  assert.equal(rehearsal.getStatus().allowObs, false); assert.equal(rehearsal.getStatus().playing, false);
  assert.equal(takes.length, 1); assert.ok(writes.every(write => write.code.startsWith(ROOM)));
  await assert.rejects(rehearsal.control({ action: 'obs', allowObs: true, scene: 'Game' }), /Stop production/);
  rehearsal.stop();
});
