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

test('the scene plan is plain data: graphics in their scenes, the host over game and desk, sponsor loops hidden; drift is what is missing', async () => {
  const { planScenes, sourcesMissing } = await import('../src/main/scene-plan.ts');
  const { DEFAULT_SCREENS } = await import('../src/main/store.ts');
  const screens = DEFAULT_SCREENS.map((s, i) => ({ ...s, outputId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const sponsors = [{ id: 's1', name: 'Acme', video: 'C:\\\\acme.mp4' }] as never;
  const talent = [{ id: 't1', name: 'Sara', camera: { kind: 'obs', obsSource: 'Cam A' } }] as never;
  const plan = planScenes({ port: 5300, screens, talent, sponsors, slotWanted: (id) => !id.startsWith('break') });
  const scene = (n: string) => plan.find((x) => x.name === n)!;
  assert.ok(scene('ESPORTRA · Gameplay').sources.some((x) => x.inputName === 'ESPORTRA · Full screen over game'));
  assert.ok(scene('ESPORTRA · Desk').sources.some((x) => x.inputName === 'ESPORTRA · Full screen over desk'));
  assert.equal(scene('ESPORTRA · Full screen').sources[0]!.inputName, 'ESPORTRA · Full screen graphics', 'never the scene’s own name');
  const loop = scene('ESPORTRA · Break').sources.find((x) => x.id === 'sponsor:s1')!;
  assert.deepEqual([loop.kind, loop.enabled], ['media', false], 'sponsor loops wait hidden');
  assert.deepEqual(scene('ESPORTRA · Desk').slots.find((x) => x.id === 'cam1')!.fill, { kind: 'source', sourceName: 'Cam A' });
  assert.equal(scene('ESPORTRA · Break').slots.length, 0, 'classic break: no windows');
  assert.ok(plan.every((s) => s.sources.every((x) => x.kind === 'media' || x.url.startsWith('http://127.0.0.1:5300/o/'))));
  const items = Object.fromEntries(plan.map((s) => [s.name, [...s.sources.map((x) => x.inputName), ...s.slots.map((x) => x.sceneName)]]));
  assert.deepEqual(sourcesMissing(plan, items), [], 'all there: no drift');
  items['ESPORTRA · Gameplay'] = items['ESPORTRA · Gameplay']!.filter((n) => n !== 'ESPORTRA · In-game HUD');
  delete items['ESPORTRA · Replay'];
  assert.deepEqual(sourcesMissing(plan, items), ['ESPORTRA · In-game HUD'], 'a scene not in OBS is the missing-scenes check’s job');
});
