import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLobbyScenes, sourcesMissing } from '../src/main/scene-plan.ts';
import { buildScenes, emptyOwned, type Owned } from '../src/main/scene-build.ts';
import { obsSceneView } from '../src/main/snapshot-parts.ts';
import { LOBBY_SCENE_KEYS, SCENES, lobbySlotWanted } from '../src/shared/scenes.ts';
import { lobbyPage } from '../src/shared/br-screens.ts';
import { FakeObs } from './fake-obs.ts';

const sponsors = [{ id: 's1', name: 'Acme', video: 'C:\\acme.mp4' }, { id: 's2', name: 'NoVideo', video: '' }] as never;
const plan = (code = 'LAAAAAAA') => planLobbyScenes({ port: 5300, code, sponsors });
const scene = (p: ReturnType<typeof plan>, name: string) => p.find((x) => x.name === name)!;

test('a lobby plan builds Break, Gameplay and Full screen from the lobby’s own pages', () => {
  const p = plan();
  assert.deepEqual(p.map((x) => x.name).sort(), ['ESPORTRA · Break', 'ESPORTRA · Full screen', 'ESPORTRA · Gameplay']);
  assert.ok(p.every((x) => x.name.startsWith('ESPORTRA · ') && x.sources.every((s) => s.inputName.startsWith('ESPORTRA · '))), 'everything Air adds starts ESPORTRA · ');
  const game = scene(p, 'ESPORTRA · Gameplay');
  assert.deepEqual(game.slots.map((x) => x.sceneName), ['ESPORTRA · Game feed'], 'the game feed holder only');
  assert.deepEqual(game.sources.map((x) => [x.inputName, x.url]), [
    ['ESPORTRA · In-game HUD', lobbyPage(5300, 'LAAAAAAA', 'br-hud')],
    ['ESPORTRA · Full screen over game', lobbyPage(5300, 'LAAAAAAA', 'fullscreen', '&over=1')],
  ]);
  assert.ok(game.sources[1]!.url.includes('over=1'), 'over the game only overlay-bar versions show');
  assert.deepEqual(scene(p, 'ESPORTRA · Full screen').sources.map((x) => [x.inputName, x.url]), [['ESPORTRA · Full screen graphics', lobbyPage(5300, 'LAAAAAAA', 'fullscreen')]]);
  const brk = scene(p, 'ESPORTRA · Break');
  assert.equal(brk.slots.length, 0, 'no Break windows for a lobby');
  assert.ok(brk.sources[0]!.url.includes('only=br-lobby'), 'Break shows Starting soon');
  const loops = brk.sources.filter((x) => x.kind === 'media');
  assert.deepEqual(loops.map((x) => [x.inputName, x.enabled]), [['ESPORTRA · Sponsor video · Acme', false]], 'sponsor videos wait hidden, only those with a video');
  assert.ok(plan().every((x) => !['ESPORTRA · Replay', 'ESPORTRA · Desk'].includes(x.name)), 'replay and desk stay the crew’s');
  assert.deepEqual(LOBBY_SCENE_KEYS.map((k) => SCENES[k].name).sort(), p.map((x) => x.name).sort());
  assert.equal(lobbySlotWanted('game') && !lobbySlotWanted('cam1') && !lobbySlotWanted('break1'), true);
});

test('building a lobby plan makes only Air’s scenes, never switches, and a crew scene with the same name is left alone', async () => {
  const obs = new FakeObs();
  let owned: Owned = emptyOwned();
  const out = await buildScenes({ socket: obs, scenes: plan(), owned, saveOwned: (o) => { owned = o; } });
  assert.deepEqual(out.created.sort(), ['ESPORTRA · Break', 'ESPORTRA · Full screen', 'ESPORTRA · Game feed', 'ESPORTRA · Gameplay']);
  assert.equal(obs.program, 'Scene', 'the program scene is never changed');
  assert.deepEqual(obs.requests.filter((r) => /Stream|Record|SetCurrent|ReplayBuffer|Transition/.test(r) && r !== 'GetStreamStatus' && r !== 'GetRecordStatus'), []);

  const crew = new FakeObs();
  crew.scenes.set('ESPORTRA · Gameplay', []);
  crew.addSource('ESPORTRA · Gameplay', 'My observer cam');
  await assert.rejects(buildScenes({ socket: crew, scenes: plan(), owned: emptyOwned(), saveOwned: () => {} }), /already has a scene called “ESPORTRA · Gameplay” that Air did not create/);
  assert.deepEqual(crew.scenes.get('ESPORTRA · Gameplay')!.map((i) => i.sourceName), ['My observer cam'], 'the crew scene is untouched');
  assert.equal(crew.scenes.has('ESPORTRA · Break'), false, 'nothing half-built');
});

test('choosing another lobby repoints the same sources; drift and the missing-scenes check follow the lobby plan', async () => {
  const obs = new FakeObs();
  let owned: Owned = emptyOwned();
  await buildScenes({ socket: obs, scenes: plan('LAAAAAAA'), owned, saveOwned: (o) => { owned = o; } });
  const before = obs.scenes.get('ESPORTRA · Gameplay')!.length;
  await buildScenes({ socket: obs, scenes: plan('LBBBBBBB'), owned, saveOwned: (o) => { owned = o; } });
  assert.equal(obs.scenes.get('ESPORTRA · Gameplay')!.length, before, 'no duplicates');
  assert.equal(obs.inputs.get('ESPORTRA · In-game HUD')!.settings.url, lobbyPage(5300, 'LBBBBBBB', 'br-hud'), 'the HUD now reads the other lobby');
  assert.equal(obs.inputs.get('ESPORTRA · Full screen graphics')!.settings.url, lobbyPage(5300, 'LBBBBBBB', 'fullscreen'));
  assert.ok((obs.inputs.get('ESPORTRA · Holding')!.settings.url as string).includes('match=LBBBBBBB'));

  const p = plan('LBBBBBBB');
  const items = Object.fromEntries(p.map((s) => [s.name, [...s.sources.map((x) => x.inputName), ...s.slots.map((x) => x.sceneName)]]));
  assert.deepEqual(sourcesMissing(p, items), []);
  const status = (scenes: string[], its: Record<string, string[]>) => ({ state: 'connected', scenes, items: its, slots: {} }) as never;
  const names = [...p.map((s) => s.name), 'ESPORTRA · Game feed'];
  const ok = obsSceneView(status(names, items), p, lobbySlotWanted, LOBBY_SCENE_KEYS);
  assert.equal(ok.installed, true, 'installed without Replay or Desk');
  assert.deepEqual(ok.sceneStatus.map((x) => x.key).sort(), ['fullscreen', 'gameplay', 'holding']);
  items['ESPORTRA · Gameplay'] = items['ESPORTRA · Gameplay']!.filter((n) => n !== 'ESPORTRA · In-game HUD');
  const drift = obsSceneView(status(names, items), p, lobbySlotWanted, LOBBY_SCENE_KEYS);
  assert.deepEqual([drift.installed, drift.missingSources], [false, ['ESPORTRA · In-game HUD']]);
  const gone = obsSceneView(status(names.filter((n) => n !== 'ESPORTRA · Break'), items), p, lobbySlotWanted, LOBBY_SCENE_KEYS);
  assert.deepEqual(gone.missingScenes, ['ESPORTRA · Break']);
});
