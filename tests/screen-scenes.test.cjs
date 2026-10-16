const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plannedScreenUrls, validateSceneUrls, screenScene } = require('../src/screen-scenes');
const { applyRundown } = require('../src/rundown-config');
test('only selected match screens enter the runner, with their actual overlay scenes', () => {
  let loaded;
  applyRundown({ selectedMatchId: 'a', rundown: [
    { id: '1', title: 'Match Introduction', type: 'pre_show', overlay: 'match-intro', matchId: 'a' },
    { id: '2', title: 'Results', type: 'post_show', overlay: 'map-result', matchId: 'b' },
  ] }, { getState: () => ({ segments: [] }), loadRundown: items => { loaded = items; } });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].scene, 'ESA_Screen_match_intro');
  assert.equal(loaded[0].autoTake, false);
});
test('scene setup rejects remote, preview and unknown sources', () => {
  assert.equal(screenScene('ingame'), 'ESA_Gameplay');
  const urls = plannedScreenUrls([{ overlay: 'match-intro' }], 'MAIN');
  assert.equal(validateSceneUrls(urls), urls);
  for (const url of ['https://evil.test/overlays/ingame.html?match=MAIN', 'http://localhost:5300/control.html?match=MAIN', 'http://localhost:5300/overlays/ingame.html?match=MAIN&preview=1']) assert.throws(() => validateSceneUrls({ gameplay: url }));
  assert.throws(() => plannedScreenUrls([{ overlay: '../server' }], 'MAIN'));
});


test('isolated HUD setup accepts only the configured local port without widening URL origins', () => {
  const {validateSceneUrls}=require('../src/screen-scenes');
  const urls={gameplay:'http://localhost:54321/overlays/ingame.html?match=MAIN'};
  assert.throws(()=>validateSceneUrls(urls));
  assert.deepEqual(validateSceneUrls(urls,54321),urls);
  assert.throws(()=>validateSceneUrls({gameplay:'http://localhost:5300/overlays/ingame.html?match=MAIN'},54321));
  assert.throws(()=>validateSceneUrls({gameplay:'http://other.invalid:54321/overlays/ingame.html?match=MAIN'},54321));
});
