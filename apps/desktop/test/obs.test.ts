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

test('the new names replace Air’s old ones in place: nothing duplicated, the crew’s own sources kept', async () => {
  const { obs, link } = await connected();
  let owned: Owned = emptyOwned();
  await link.build(plan(), owned, (o) => { owned = o; });
  obs.addSource('Esportra · Caster cam 1', 'Desk camera (crew)');
  const renamed = (p: BuildScene[]): BuildScene[] => p.map((scene) => ({
    ...scene,
    name: scene.name.replace('Esportra · ', 'ESPORTRA · ').replace('Casters', 'Desk'),
    formerly: scene.name,
    sources: scene.sources.map((x) => ({ ...x, inputName: x.inputName.replace('Esportra · ', 'ESPORTRA · '), formerly: x.inputName })),
    slots: scene.slots.map((x) => ({ ...x, sceneName: x.sceneName.replace('Esportra · ', 'ESPORTRA · '), formerly: x.sceneName })),
  }));
  const before = { scenes: obs.scenes.size, inputs: obs.inputs.size };
  const result = await link.build(renamed(plan()), owned, (o) => { owned = o; });
  assert.deepEqual(result.created, [], 'renamed, not created again');
  assert.deepEqual({ scenes: obs.scenes.size, inputs: obs.inputs.size }, before);
  assert.ok(obs.scenes.has('ESPORTRA · Desk') && !obs.scenes.has('Esportra · Casters'));
  assert.deepEqual(obs.scenes.get('ESPORTRA · Caster cam 1')!.map((i) => i.sourceName), ['Desk camera (crew)'], 'the crew’s camera stays in the slot');
  assert.ok(obs.inputs.has('ESPORTRA · in-game') && !obs.inputs.has('Esportra · in-game'));
  assert.ok(Object.keys(owned.scenes).every((name) => name.startsWith('ESPORTRA · ')), 'Air remembers its scenes by the new names');
  assert.deepEqual(obs.requests.filter((r) => FORBIDDEN.includes(r) || r.startsWith('SetCurrent')), []);
});

test('a scene the crew made with Air’s old name is never renamed', async () => {
  const { obs, link } = await connected((o) => o.scenes.set('Esportra · Holding', []));
  const p: BuildScene[] = [{ name: 'ESPORTRA · Break', formerly: 'Esportra · Holding', exclusive: false, sources: [], slots: [] }];
  await link.build(p, emptyOwned(), () => {});
  assert.ok(obs.scenes.has('Esportra · Holding') && obs.scenes.has('ESPORTRA · Break'), 'the crew’s scene is left alone; Air makes its own');
});

test('sponsor videos are looping media sources, hidden until shown', async () => {
  const { obs, link } = await connected();
  const p: BuildScene[] = [{ name: 'ESPORTRA · Break', exclusive: false, slots: [], sources: [
    { id: 'holding', inputName: 'ESPORTRA · Holding', url: 'http://127.0.0.1:5300/o/holding', frame: FULL, enabled: true },
    { id: 'sponsor:nova', inputName: 'ESPORTRA · Sponsor video · Nova', kind: 'media', url: 'C:\\Sponsors\\nova.mp4', frame: FULL, enabled: false },
  ] }];
  let owned = emptyOwned();
  await link.build(p, owned, (o) => { owned = o; });
  const video = obs.inputs.get('ESPORTRA · Sponsor video · Nova')!;
  assert.equal(video.inputKind, 'ffmpeg_source');
  assert.deepEqual([video.settings.local_file, video.settings.looping], ['C:\\Sponsors\\nova.mp4', true]);
  assert.equal(obs.scenes.get('ESPORTRA · Break')!.find((i) => i.sourceName === 'ESPORTRA · Sponsor video · Nova')!.enabled, false);
  // A new file replaces the old one in place.
  p[0]!.sources[1]!.url = 'C:\\Sponsors\\nova-2.mp4';
  await link.build(p, owned, (o) => { owned = o; });
  assert.equal(obs.inputs.get('ESPORTRA · Sponsor video · Nova')!.settings.local_file, 'C:\\Sponsors\\nova-2.mp4');
});

test('talent cameras fill the desk windows; a new person replaces Air’s old camera, the crew’s sources stay', async () => {
  const { obs, link } = await connected((o) => o.inputs.set('Desk cam 2', { inputKind: 'dshow_input', settings: {} }));
  const desk = (cam1: any, cam2: any): BuildScene[] => [{ name: 'ESPORTRA · Desk', exclusive: false, sources: [], slots: [
    { id: 'cam1', sceneName: 'ESPORTRA · Desk camera 1', frame: { x: 120, y: 250, width: 820, height: 462 }, ...(cam1 ? { fill: cam1 } : {}) },
    { id: 'cam2', sceneName: 'ESPORTRA · Desk camera 2', frame: { x: 980, y: 250, width: 820, height: 462 }, ...(cam2 ? { fill: cam2 } : {}) },
  ] }];
  let owned = emptyOwned();
  await link.build(desk({ kind: 'link', inputName: 'ESPORTRA · Camera · Sara', url: 'https://vdo.ninja/?view=abc' }, { kind: 'source', sourceName: 'Desk cam 2' }), owned, (o) => { owned = o; });
  assert.deepEqual(obs.scenes.get('ESPORTRA · Desk camera 1')!.map((i) => i.sourceName), ['ESPORTRA · Camera · Sara']);
  assert.equal(obs.inputs.get('ESPORTRA · Camera · Sara')!.settings.url, 'https://vdo.ninja/?view=abc');
  assert.deepEqual(obs.scenes.get('ESPORTRA · Desk camera 2')!.map((i) => i.sourceName), ['Desk cam 2'], 'an OBS source the crew already has');
  obs.addSource('ESPORTRA · Desk camera 1', 'Crew overlay');
  await link.build(desk({ kind: 'link', inputName: 'ESPORTRA · Camera · Lena', url: 'https://vdo.ninja/?view=xyz' }, null), owned, (o) => { owned = o; });
  assert.deepEqual(obs.scenes.get('ESPORTRA · Desk camera 1')!.map((i) => i.sourceName), ['Crew overlay', 'ESPORTRA · Camera · Lena'], 'Sara’s camera leaves, the crew’s item stays');
  assert.deepEqual(obs.scenes.get('ESPORTRA · Desk camera 2')!.map((i) => i.sourceName), ['Desk cam 2'], 'the crew’s own source is never removed');
  await assert.rejects(link.build(desk({ kind: 'source', sourceName: 'Missing cam' }, null), owned, () => {}), /no source called “Missing cam”/);
});
