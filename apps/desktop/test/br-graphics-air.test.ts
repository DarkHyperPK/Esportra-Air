import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrGraphics, packField, validLook } from '../src/main/br-graphics.ts';
import type { Lobby } from '../src/shared/api.ts';
import type { GameAsset } from '../src/shared/game-assets.ts';

// Lobby graphics on air (22 Nov): the pack's pictures the pages read, the look's checks, Take/Clear on the lobby room.
const sha = (c: string) => c.repeat(64);
const asset = (id: string, kind: GameAsset['kind'], name: string, c: string, variant?: string): GameAsset =>
  ({ id, kind, name, w: 100, h: 100, file: { sha256: sha(c), ext: 'png', size: 1 }, source: 'kit', ...(variant ? { variant } : {}) }) as unknown as GameAsset;

const lobby = (over: Partial<Lobby> = {}): Lobby => ({
  id: 'l1', code: 'LABC1234', eventId: 'e1', game: 'pubgm', title: 'Group A', stage: '', createdAt: 1,
  teams: [{ id: 't1', teamId: null, name: 'ALPHA', tag: 'ALP', color: '#fff', logo: '', players: [] }],
  games: [{ n: 1, map: 'Erangel' }], scoring: { placement: [10, 6], perElim: 1, tiebreak: ['wins'] } as Lobby['scoring'], ...over,
});

test('the pack field takes white logos, wallpapers, characters and maps by name', () => {
  const f = packField('pubgm', [
    asset('a', 'logo-esports', 'Esports', 'a', 'black'), asset('b', 'logo-esports', 'Esports', 'b', 'white'),
    asset('c', 'logo-ci', 'CI', 'c'), asset('d', 'wallpaper', 'W', 'd'), asset('e', 'character', 'C', 'e'),
    asset('f', 'map', 'Erangel', 'f'), asset('g', 'map', 'Erangel', '0'),
  ]);
  assert.equal(f.esports, `/packs/pubgm/${sha('b')}.png`);
  assert.equal(f.ci, `/packs/pubgm/${sha('c')}.png`);
  assert.deepEqual(f.wallpaper, [`/packs/pubgm/${sha('d')}.png`]);
  assert.deepEqual(f.character, [`/packs/pubgm/${sha('e')}.png`]);
  assert.deepEqual(f.maps, { erangel: `/packs/pubgm/${sha('f')}.png` });
  assert.deepEqual(packField('pubgm', []), { esports: '', ci: '', wallpaper: [], character: [], maps: {} });
});

test('a look takes known layouts and only templates made for that graphic', () => {
  const graphicOf = (id: string) => ({ t1: 'br-overall|full', t2: 'map-veto|full', t3: 'brhud' } as Record<string, string>)[id] ?? null;
  assert.deepEqual(validLook({ hud: 'grid', popup: true, templates: { 'br-overall|full': 't1', brhud: 't3' } }, graphicOf), { hud: 'grid', popup: true, templates: { 'br-overall|full': 't1', brhud: 't3' } });
  assert.deepEqual(validLook({ hud: 'sideways' }, graphicOf), { hud: 'rail', popup: false, templates: {} });
  assert.deepEqual(validLook({ templates: { 'br-overall|full': '' } }, graphicOf).templates, {}, 'an empty choice clears');
  assert.throws(() => validLook({ templates: { 'br-overall|full': 't2' } }, graphicOf), /not for this graphic/);
  assert.throws(() => validLook({ templates: { 'map-veto|full': 't2' } }, graphicOf), /not for this graphic/);
});

test('Take and Clear go to the lobby room with the chosen look', async () => {
  const sent: Array<[string, string, Record<string, unknown>]> = [];
  const g = new BrGraphics({
    action: async (room, name, args) => { sent.push([room, name, args]); },
    assets: () => [], templates: () => ({ airTemplates: [], airPageTemplates: { 'holding|full': null } }), templateGraphic: () => null, eventName: () => 'Cup',
  });
  const l = lobby({ look: { hud: 'strip', popup: true, templates: { 'br-wwcd|full': 'tw', brhud: 'th' } } });
  await g.take(l, 'br-wwcd');
  assert.deepEqual(sent[0], ['LABC1234', 'fullscreen.show', { screen: 'br-wwcd', style: 'full', template: 'tw' }]);
  assert.equal(g.onAir(l), 'br-wwcd');
  await g.take(l, null);
  assert.deepEqual(sent[1]![2], { screen: null, style: 'full', template: null });
  assert.equal(g.onAir(l), null);
  await assert.rejects(g.take(l, 'map-veto'), /lobby graphics/);
  await assert.rejects(g.take(lobby({ teams: [] }), 'br-overall'), /teams first/);
  const f = g.roomFields(l);
  assert.deepEqual(f.layout, { brHud: 'strip' });
  assert.equal(f.brPopup, true);
  assert.equal(f.brEvent, 'Cup');
  assert.deepEqual(f.airPageTemplates, { 'holding|full': null, brhud: 'th' });
});
