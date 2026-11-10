import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObsLink, type Owned, type SceneRow } from '../src/main/obs.ts';
import { FakeObs } from './fake-obs.ts';

const SWITCHING = ['SetCurrentProgramScene', 'SetCurrentPreviewScene', 'TriggerStudioModeTransition', 'StartStream', 'StopStream', 'StartRecord', 'StopRecord', 'SetCurrentSceneCollection'];

const rows = (background: string | null = 'Game Capture'): SceneRow[] => [
  { sceneName: 'Air · Starting soon', url: 'http://127.0.0.1:5300/o/soon', x: 0, y: 0, width: 1920, height: 1080, background: null },
  { sceneName: 'Air · In-game', url: 'http://127.0.0.1:5300/o/ingame', x: 0, y: 0, width: 1920, height: 1080, background },
];

test('connects, installs Air scenes over gameplay, and never switches', async () => {
  const obs = new FakeObs();
  const link = new ObsLink(() => obs);
  await assert.rejects(link.connect('localhost', 4455, 'wrong'), /rejected the password/);
  await link.connect('localhost', 4455, 'secret');
  assert.equal(link.status.state, 'connected');
  assert.deepEqual(link.status.videoInputs, ['Game Capture'], 'audio and browser sources are not offered as gameplay');

  let owned: Owned = {};
  const result = await link.install(rows(), owned, (o) => { owned = o; });
  assert.deepEqual(result.scenes, ['Air · Starting soon', 'Air · In-game']);
  const ingame = obs.scenes.get('Air · In-game')!;
  assert.deepEqual(ingame.map((i) => i.sourceName).sort(), ['Air · In-game · Graphics', 'Game Capture']);
  assert.equal(ingame.find((i) => i.sourceName === 'Game Capture')!.index, 0, 'gameplay sits under the graphics');
  assert.equal(obs.inputs.get('Air · In-game · Graphics')!.settings.url, 'http://127.0.0.1:5300/o/ingame');
  assert.ok(link.status.scenes.includes('Air · In-game'));
  assert.equal(obs.program, 'Scene');
  assert.deepEqual(obs.requests.filter((r) => SWITCHING.includes(r)), []);

  // Re-installing keeps a transform edited in OBS when Air's own layout did not change.
  const graphics = ingame.find((i) => i.sourceName === 'Air · In-game · Graphics')!;
  graphics.transform = { edited: 'in OBS' };
  await link.install(rows(), owned, (o) => { owned = o; });
  assert.deepEqual(graphics.transform, { edited: 'in OBS' });
  assert.equal(obs.scenes.get('Air · In-game')!.length, 2, 'nothing duplicated');
});

test('refuses collisions, unknown gameplay sources, and changes while live', async () => {
  const obs = new FakeObs();
  obs.scenes.set('Air · Starting soon', []);
  const link = new ObsLink(() => obs);
  await link.connect('127.0.0.1', 4455, 'secret');
  await assert.rejects(link.install(rows(), {}, () => {}), /did not create/);
  obs.scenes.delete('Air · Starting soon');
  await assert.rejects(link.install(rows('Desktop Audio'), {}, () => {}), /not an available video source/);
  obs.streaming = true;
  await assert.rejects(link.install(rows(), {}, () => {}), /Stop streaming and recording/);
  assert.equal(obs.scenes.has('Air · Starting soon'), false, 'nothing created when a check fails');
});

test('rejects malformed addresses before connecting', async () => {
  const link = new ObsLink(() => new FakeObs());
  await assert.rejects(link.connect('bad host', 4455, ''), /address/);
  await assert.rejects(link.connect('localhost', 70000, ''), /port/i);
});
