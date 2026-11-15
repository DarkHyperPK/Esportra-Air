import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, inShow, showLink, showPatch } from '../src/shared/library.ts';
import { DEFAULT_HUD, defaultSetup } from '../src/main/store.ts';

test('every graphic in the pack joins My show through a real OBS source or HUD switch', () => {
  const setup = defaultSetup();
  for (const item of LIBRARY.valorant) {
    const link = showLink(item);
    if (link.kind === 'screen') assert.ok(setup.screens.some((x) => x.overlay === link.overlay), `${item.title}: an OBS graphic Air installs`);
    if (link.kind === 'hud') assert.ok(link.key in DEFAULT_HUD, `${item.title}: a HUD switch`);
  }
  assert.equal(showLink({ overlay: 'ingame' }).kind, 'always', 'the in-game HUD itself is always in the show');
});

test('adding and removing a graphic round-trips; graphics inside the HUD cannot be removed', () => {
  const setup = defaultSetup();
  const halftime = LIBRARY.valorant.find((i) => i.overlay === 'halftime')!;
  const winProb = LIBRARY.valorant.find((i) => i.overlay === 'win-probability')!;
  const banners = LIBRARY.valorant.find((i) => i.overlay === 'banners')!;
  assert.equal(inShow(setup, halftime), true);
  const off = { ...setup, ...showPatch(setup, halftime, false)! };
  assert.equal(inShow(off, halftime), false);
  assert.equal(inShow({ ...off, ...showPatch(off, halftime, true)! }, halftime), true);
  assert.equal(inShow(setup, winProb), false, 'win probability starts off');
  assert.equal(inShow({ ...setup, ...showPatch(setup, winProb, true)! }, winProb), true);
  assert.equal(showPatch(setup, banners, false), null);
  assert.equal(inShow(setup, banners), true);
});
