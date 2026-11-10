import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObsLink } from '../src/main/obs.ts';
import { emptyOwned, type BuildScene, type Owned } from '../src/main/scene-build.ts';
import { SCENES } from '../src/shared/scenes.ts';
import { FakeObs } from './fake-obs.ts';

const FORBIDDEN = ['StartStream', 'StopStream', 'StartRecord', 'StopRecord', 'SetCurrentSceneCollection', 'StartReplayBuffer', 'StopReplayBuffer'];
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };
const src = (id: string, enabled = true) => ({ id, inputName: `Esportra · ${id}`, url: `http://127.0.0.1:5300/o/${id}`, frame: FULL, enabled });

const plan = (): BuildScene[] => [
  { name: SCENES.holding.name, exclusive: false, sources: [src('holding'), src('ticker')], slots: [] },
  { name: SCENES.gameplay.name, exclusive: false, sources: [src('in-game')], slots: [{ id: 'game', sceneName: 'Esportra · Game feed', frame: FULL }] },
  { name: SCENES.fullscreen.name, exclusive: true, sources: [src('match-intro'), src('map-veto'), src('series')], slots: [] },
  { name: SCENES.replay.name, exclusive: false, sources: [src('replay-bug')], slots: [] },
  { name: SCENES.casters.name, exclusive: false, sources: [src('casters')], slots: [
    { id: 'cam1', sceneName: 'Esportra · Caster cam 1', frame: { x: 120, y: 250, width: 820, height: 462 } },
    { id: 'cam2', sceneName: 'Esportra · Caster cam 2', frame: { x: 980, y: 250, width: 820, height: 462 } },
  ] },
];
const SLOT_SCENES = ['Esportra · Game feed', 'Esportra · Caster cam 1', 'Esportra · Caster cam 2'];

async function connected(setup: (obs: FakeObs) => void = () => {}) {
  const obs = new FakeObs();
  setup(obs);
  const link = new ObsLink(() => obs, { backoffMs: [10, 10] });
  link.watchSlots(SLOT_SCENES);
  await link.connect('127.0.0.1', 4455, 'secret');
  return { obs, link };
}

test('connects, reads status, and rejects a wrong password without retrying', async () => {
  const obs = new FakeObs();
  const link = new ObsLink(() => obs, { backoffMs: [5] });
  await assert.rejects(link.connect('localhost', 4455, 'wrong'), /rejected the password/);
  assert.equal(link.status.state, 'error');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(obs.requests.length, 0, 'no automatic retry with a wrong password');
  await link.connect('localhost', 4455, 'secret');
  assert.equal(link.status.state, 'connected');
  assert.equal(link.status.version, '31.0.0');
  assert.equal(link.status.collection, 'Test collection');
  assert.deepEqual(link.status.videoInputs, ['Game Capture']);
  assert.deepEqual(link.status.transitions.map((t) => t.kind), ['cut', 'fade', 'stinger']);
  await assert.rejects(link.connect('bad host', 4455, ''), /address/);
});

test('builds the five scenes with video slots under the graphics and never switches', async () => {
  const { obs, link } = await connected();
  let owned: Owned = emptyOwned();
  const result = await link.build(plan(), owned, (o) => { owned = o; });
  assert.equal(result.created.length, 5 + 3);
  for (const scene of [SCENES.holding.name, SCENES.gameplay.name, SCENES.fullscreen.name, SCENES.replay.name, SCENES.casters.name, ...SLOT_SCENES]) assert.ok(obs.scenes.has(scene), scene);

  const gameplay = obs.scenes.get(SCENES.gameplay.name)!;
  assert.deepEqual(gameplay.map((i) => i.sourceName).sort(), ['Esportra · Game feed', 'Esportra · in-game']);
  assert.equal(gameplay.find((i) => i.sourceName === 'Esportra · Game feed')!.index, 0, 'the game feed sits below the HUD');
  const cam1 = obs.scenes.get(SCENES.casters.name)!.find((i) => i.sourceName === 'Esportra · Caster cam 1')!;
  assert.deepEqual((cam1.transform as { positionX: number; boundsWidth: number }).positionX, 120, 'the camera sits in the casters graphic’s window');

  const fullscreen = obs.scenes.get(SCENES.fullscreen.name)!;
  assert.deepEqual(fullscreen.map((i) => i.enabled), [true, false, false], 'only one full-screen graphic is visible');
  assert.equal(obs.inputs.get('Esportra · in-game')!.settings.url, 'http://127.0.0.1:5300/o/in-game');
  assert.deepEqual(obs.requests.filter((r) => FORBIDDEN.includes(r) || r.startsWith('SetCurrent')), []);
  assert.equal(obs.program, 'Scene');

  // Re-installing is idempotent and keeps layout edits made in OBS.
  const ingame = gameplay.find((i) => i.sourceName === 'Esportra · in-game')!;
  ingame.transform = { edited: 'in OBS' };
  const before = obs.scenes.get(SCENES.gameplay.name)!.length;
  await link.build(plan(), owned, (o) => { owned = o; });
  assert.deepEqual(ingame.transform, { edited: 'in OBS' });
  assert.equal(obs.scenes.get(SCENES.gameplay.name)!.length, before);
});

test('rebuilding after the crew deleted a scene restores its placement', async () => {
  const { obs, link } = await connected();
  let owned: Owned = emptyOwned();
  await link.build(plan(), owned, (o) => { owned = o; });
  obs.scenes.delete(SCENES.casters.name);
  obs.scenes.delete('Esportra · Caster cam 1');
  obs.inputs.delete('Esportra · casters');
  await link.build(plan(), owned, (o) => { owned = o; });
  const items = obs.scenes.get(SCENES.casters.name)!;
  assert.deepEqual(items.map((i) => i.sourceName).sort(), ['Esportra · Caster cam 1', 'Esportra · Caster cam 2', 'Esportra · casters']);
  for (const item of items) assert.ok(item.transform, `${item.sourceName} is positioned`);
  assert.equal(items.find((i) => i.sourceName === 'Esportra · Caster cam 1')!.index, 0);
});

test('slots read "add your source" until the crew fills them, and update from OBS events', async () => {
  const { obs, link } = await connected();
  let owned: Owned = emptyOwned();
  await link.build(plan(), owned, (o) => { owned = o; });
  assert.deepEqual(link.status.slots, { 'Esportra · Game feed': null, 'Esportra · Caster cam 1': null, 'Esportra · Caster cam 2': null });
  obs.addSource('Esportra · Caster cam 1', 'Cam A');
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(link.status.slots['Esportra · Caster cam 1'], 'Cam A');
  await link.useSource('Esportra · Game feed', 'Game Capture');
  assert.equal(link.status.slots['Esportra · Game feed'], 'Game Capture');
  await assert.rejects(link.useSource('Esportra · Game feed', 'Desktop Audio'), /not an available video source/);
});

test('refuses collisions, foreign sources and building while streaming', async () => {
  const { obs, link } = await connected((o) => o.scenes.set(SCENES.holding.name, []));
  await assert.rejects(link.build(plan(), emptyOwned(), () => {}), /did not create/);
  obs.scenes.delete(SCENES.holding.name);
  obs.inputs.set('Esportra · holding', { inputKind: 'image_source', settings: {} });
  await assert.rejects(link.build(plan(), emptyOwned(), () => {}), /already exists/);
  obs.inputs.delete('Esportra · holding');
  obs.streaming = true;
  await assert.rejects(link.build(plan(), emptyOwned(), () => {}), /Stop streaming and recording/);
  assert.equal(obs.scenes.has(SCENES.gameplay.name), false, 'nothing created when a check fails');
});

test('reconnects by itself after OBS drops', async () => {
  const { obs, link } = await connected();
  obs.drop();
  assert.equal(link.status.state, 'error');
  assert.match(link.status.error ?? '', /lost/);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(link.status.state, 'connected');
  await link.disconnect();
  obs.drop();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(link.status.state, 'disconnected', 'an intentional disconnect stays disconnected');
});

test('the link has no way to switch scenes', async () => {
  const { link } = await connected();
  for (const name of ['take', 'setPreview', 'setStudioMode', 'cutChoice', 'stingerChoice', 'showFullscreen']) assert.equal(name in link, false, name);
});
