import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesForScene, SCENES } from '../src/shared/scenes.ts';
import { DEFAULT_SCREENS } from '../src/main/store.ts';

const screens = DEFAULT_SCREENS.map((x) => ({ ...x, enabled: ['holding', 'in-game', 'stinger', 'fullscreen', 'replay-bug', 'casters', 'map-veto'].includes(x.id) }));

test('the program preview draws only the Air pages of the scene on air', () => {
  assert.deepEqual(pagesForScene(SCENES.holding.name, screens), [{ overlay: 'holding' }], 'Break shows the break page, never the HUD over it');
  assert.deepEqual(pagesForScene(SCENES.gameplay.name, screens), [{ overlay: 'ingame' }, { overlay: 'stinger' }, { overlay: 'fullscreen', over: true }], 'Gameplay: the HUD, the stinger and overlay bars');
  assert.deepEqual(pagesForScene(SCENES.fullscreen.name, screens), [{ overlay: 'fullscreen' }], 'Full screen: the host with full-screen looks');
  assert.deepEqual(pagesForScene(SCENES.casters.name, screens), [{ overlay: 'casters' }, { overlay: 'fullscreen', over: true }]);
  assert.equal(pagesForScene('My observer cam', screens), null, 'a crew scene is the OBS picture alone');
  assert.deepEqual(pagesForScene('Esportra · Holding', screens), [{ overlay: 'holding' }], 'a scene with its old name still counts as Air’s');
  assert.deepEqual(pagesForScene(null, screens), [{ overlay: 'ingame' }, { overlay: 'fullscreen', over: true }], 'without OBS: the sample over the game');
});
