import { test } from 'node:test';
import assert from 'node:assert/strict';

test('a name OBS already uses for something else stops the build before anything is created', async () => {
  const { FakeObs } = await import('./fake-obs.ts');
  const { buildScenes, emptyOwned } = await import('../src/main/scene-build.ts');
  const obs = new FakeObs();
  obs.inputs.set('ESPORTRA · Replay', { inputKind: 'image_source', settings: {} });
  const scenes = [{ name: 'ESPORTRA · Break', exclusive: false, sources: [], slots: [] }, { name: 'ESPORTRA · Replay', exclusive: false, sources: [], slots: [] }];
  await assert.rejects(buildScenes({ socket: obs, scenes, owned: emptyOwned(), saveOwned: () => {} }), /already has a source called “ESPORTRA · Replay”/);
  assert.equal(obs.scenes.has('ESPORTRA · Break'), false, 'nothing half-built');
  const clash = [{ name: 'ESPORTRA · Full screen', exclusive: true, slots: [], sources: [{ id: 'fullscreen', inputName: 'ESPORTRA · Full screen', url: 'http://x', frame: { x: 0, y: 0, width: 1920, height: 1080 }, enabled: true }] }];
  await assert.rejects(buildScenes({ socket: new FakeObs(), scenes: clash, owned: emptyOwned(), saveOwned: () => {} }), /same name as a scene/);
});
