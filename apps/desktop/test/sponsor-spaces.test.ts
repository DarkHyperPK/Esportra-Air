import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spaceSponsors, spacesOf, type Sponsor } from '../src/shared/model.ts';
import { engineConfig, validSpaces } from '../src/main/event-model.ts';

const sp = (id: string, name: string, spaces?: Sponsor['spaces'], logo = `https://example.com/${id}.png`): Sponsor => ({ id, name, logo, logoLight: '', tier: 'partner', video: '', read: '', ...(spaces ? { spaces } : {}) });

test('each space shows one sponsor: the match\'s choice, the event\'s, or the first that bought it; its own logo first', () => {
  const north = sp('n', 'Northwind', { rotator: { logo: '' }, 'map-veto': { logo: 'https://example.com/n-veto.png' }, timeout: { logo: '' } });
  const pixel = sp('p', 'Pixelforge', { 'map-veto': { logo: '' }, victory: { logo: '' } });
  const old = sp('o', 'Old Sponsor');
  const all = [north, pixel, old];
  assert.deepEqual(spacesOf(old), ['rotator'], 'a sponsor from before spaces stays in the rotator');
  let s = spaceSponsors(all, undefined, undefined);
  assert.deepEqual(s['map-veto'], { name: 'NORTHWIND', logo: 'https://example.com/n-veto.png' });
  assert.deepEqual(s.victory, { name: 'PIXELFORGE', logo: 'https://example.com/p.png' }, 'the main logo when the space has none');
  assert.equal(s.toast, null, 'nobody bought the toast');
  s = spaceSponsors(all, { 'map-veto': 'p' }, undefined);
  assert.equal(s['map-veto']!.name, 'PIXELFORGE', 'the event\'s choice');
  s = spaceSponsors(all, { 'map-veto': 'p' }, { 'map-veto': 'n', timeout: null });
  assert.deepEqual([s['map-veto']!.name, s.timeout], ['NORTHWIND', null], 'the match\'s own choice, or none in this match');
  s = spaceSponsors([pixel, old], { timeout: 'n' }, undefined);
  assert.equal(s.timeout, null, 'a choice whose sponsor is off in this match shows the first that bought it, or nothing');
});

test('spaces are checked, and only rotator sponsors rotate', () => {
  assert.deepEqual(validSpaces({ rotator: { logo: '' }, timeout: { logo: 'https://example.com/t.png' }, toast: false }), { rotator: { logo: '' }, timeout: { logo: 'https://example.com/t.png' } });
  assert.throws(() => validSpaces({ jumbotron: { logo: '' } }), /spaces again/);
  assert.throws(() => validSpaces({ timeout: { logo: 'javascript:alert(1)' } }), /choose the image again/);
  const match = { stage: '', bestOf: 3, talentOff: [], sponsorsOff: [] } as never;
  const event = { name: 'Cup', talent: [], sponsors: [sp('n', 'Northwind', { rotator: { logo: '' } }), sp('p', 'Pixelforge', { victory: { logo: '' } }), sp('o', 'Old')] } as never;
  assert.deepEqual(engineConfig(match, event, 'x').sponsors.map((x) => x.name), ['NORTHWIND', 'OLD', 'NORTHWIND', 'OLD'], 'Pixelforge bought only Victory');
});
