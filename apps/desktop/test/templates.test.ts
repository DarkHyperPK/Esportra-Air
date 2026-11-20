// Graphics templates: the model Air checks, the parts list it shares with the HUD, and the styles the HUD applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { GRAPHICS, DEFAULT_BRAND, graphicPage, templatesFor, validBrand, validTemplate, type Template } from '../src/shared/templates.ts';
import { validRow } from '../src/main/autopilot/rundown.ts';
import type { RowInput } from '../src/shared/autopilot.ts';

const hud = createRequire(import.meta.url)(resolve(import.meta.dirname, '../../../esportra-valorant-hud/core/templates.js'));
const ok = { id: 'tpl-1', name: 'Gold veto', graphic: 'map-veto|band', parts: { panel: { y: -24, radius: 18, fill: { kind: 'gradient', a: 'brand.panel', b: '#05060c', alpha: 0.9 }, border: { sides: 'top', color: 'brand.secondary', width: 3 }, depth: 'strong', entrance: { kind: 'rise', ms: 600, delay: 0 } }, title: { label: 'VETO', color: 'brand.secondary', font: 'barlow', weight: 800, spacing: 0.12 } } };

test('Air and the HUD list the same graphics and parts', () => {
  assert.deepEqual(Object.keys(GRAPHICS).sort(), Object.keys(hud.GRAPHICS).sort());
  for (const [g, def] of Object.entries(GRAPHICS)) {
    assert.deepEqual(def.parts.map((p) => [p[0], !!p[2]]), hud.GRAPHICS[g].parts.map((p: unknown[]) => [p[0], !!p[3]]), g);
    assert.equal(new Set(def.parts.map((p) => p[0])).size, def.parts.length, `${g}: part ids are unique`);
  }
  assert.deepEqual([graphicPage('map-veto|band'), graphicPage('map-veto|full'), graphicPage('hud')], ['map-veto-band', 'map-veto', 'ingame']);
});

test('a template is checked against its graphic before it is saved or sent', () => {
  const t = validTemplate(ok, 5);
  assert.equal(t.updatedAt, 5);
  assert.deepEqual(t.parts.title, { label: 'VETO', color: 'brand.secondary', font: 'barlow', weight: 800, spacing: 0.12 });
  const bad = (parts: unknown, re: RegExp, extra: Record<string, unknown> = {}) => assert.throws(() => validTemplate({ ...ok, parts, ...extra }), re);
  bad({ panel: { radius: 500 } }, /corners must be between 0 and 80/);
  bad({ panel: { color: 'red' } }, /choose a swatch or a colour/);
  bad({ panel: { color: 'brand.gold' } }, /choose a swatch or a colour/);
  bad({ panel: { font: 'comic' } }, /fonts Air has/);
  bad({ panel: { css: 'x' } }, /unknown setting “css”/, );
  bad({ wings: {} }, /not a part of Map veto/);
  bad({ captions: { label: 'HI' } }, /come from the match/, );
  bad({ title: { label: '<b>VETO</b>' } }, /without < or >/);
  bad({ panel: { fill: { kind: 'gradient', a: '#000000' } } }, /second colour/);
  bad({ panel: { border: { sides: 'top' } } }, /colour and a width/);
  bad({ panel: { entrance: { kind: 'spin' } } }, /rise, fade, slide or wipe/);
  assert.throws(() => validTemplate({ ...ok, graphic: 'map-veto|sideways' }), /which graphic/);
  assert.throws(() => validTemplate({ ...ok, name: ' ' }), /Name the template/);
  assert.throws(() => validTemplate({ ...ok, id: '../x' }), /needs an id/);
  assert.throws(() => validTemplate({ ...ok, timer: { dx: 4 } }), /Only the in-game HUD/);
});

test('a HUD timer window stays within what the game timer allows', () => {
  assert.throws(() => validTemplate({ id: 'h', name: 'HUD', graphic: 'hud', parts: {}, timer: { dx: 999 } }), /Timer window position/);
  assert.deepEqual(validTemplate({ id: 'h', name: 'HUD', graphic: 'hud', parts: {}, timer: { dx: 4, width: 150, plate: 'nope' } }).timer, { dx: 4, width: 150, plate: '#17181e' });
});

test('the brand kit: Primary is the event colour, the rest have defaults', () => {
  assert.deepEqual(validBrand(undefined, '#112233'), { ...DEFAULT_BRAND, primary: '#112233' });
  assert.equal(validBrand({ atk: '#FF0000' }).atk, '#ff0000');
  assert.throws(() => validBrand({ text: 'white' }), /Text: use a colour/);
});

test('the HUD turns settings into inline styles and drops anything it does not know', () => {
  const css = hud.styles(validTemplate(ok).parts.panel);
  assert.equal(css.translate, '0px -24px');
  assert.equal(css['border-radius'], '18px');
  assert.equal(css['border-top'], '3px solid var(--brand-secondary)');
  assert.match(css.background, /^linear-gradient\(180deg, color-mix\(in srgb, var\(--brand-panel\) 90%, transparent\)/);
  assert.match(css['box-shadow'], /48px/);
  assert.deepEqual(hud.styles({ color: 'url(javascript:x)', size: 'big', radius: -5, x: 'NaN', font: 'Comic Sans' }), { 'border-radius': '0px' }, 'bad values are left out (a radius is clamped)');
  assert.equal(hud.styles({ color: 'team.b' }).color, 'var(--team-b)');
  assert.equal(hud.styles({ font: 'poppins', weight: 800 })['font-family'], 'PXB, sans-serif');
});

test('a Rundown row picks a template for its own screen; the template decides the style', () => {
  const tpl = validTemplate(ok) as Template;
  const hudTpl = validTemplate({ id: 'tpl-h', name: 'HUD', graphic: 'hud', parts: {} });
  const row: RowInput = { section: 'pre', show: 'map-veto', trigger: 'manual', map: 'every', forSeconds: 20, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0, style: 'full', template: 'tpl-1' };
  const r = validRow(row, 'r1', 3, ['map-veto', 'in-game'], [tpl, hudTpl]);
  assert.deepEqual([r.style, r.template], ['band', 'tpl-1']);
  assert.throws(() => validRow({ ...row, template: 'tpl-h' }, 'r1', 3, ['map-veto'], [tpl, hudTpl]), /different graphic/);
  assert.throws(() => validRow({ ...row, template: 'gone' }, 'r1', 3, ['map-veto'], [tpl]), /different graphic/);
  const h = validRow({ ...row, section: 'game', show: 'in-game', template: 'tpl-h' }, 'h', 3, ['in-game'], [tpl, hudTpl]);
  assert.equal(h.template, 'tpl-h', 'the HUD row keeps a HUD template');
  assert.equal(validRow({ ...row, template: undefined }, 'r1', 3, ['map-veto'], [tpl]).template, undefined);
  assert.deepEqual(templatesFor([tpl, hudTpl], 'map-veto').map((t) => t.id), ['tpl-1']);
});

test('font weights snap to the weights Air has, in Air and in the HUD', () => {
  const t = validTemplate({ id: 'w', name: 'W', graphic: 'map-veto|band', parts: { title: { font: 'montserrat', weight: 900 }, captions: { font: 'barlow', weight: 400 }, panel: { weight: 650 } } });
  assert.deepEqual([t.parts.title!.weight, t.parts.captions!.weight, t.parts.panel!.weight], [800, 600, 700]);
  assert.equal(hud.styles({ font: 'rajdhani', weight: 900 })['font-weight'], '700');
  assert.equal(hud.styles({ font: 'poppins', weight: 400 })['font-family'], 'PMd, sans-serif');
});

test('Break and Desk rows keep a look; for Break, over the game is the frame', () => {
  const frame = validTemplate({ id: 'tpl-f', name: 'Frame', graphic: 'holding|band', parts: {} });
  const desk = validTemplate({ id: 'tpl-d', name: 'Desk', graphic: 'casters|full', parts: { toplabel: { label: 'LIVE DESK' } } });
  const base: RowInput = { section: 'pre', show: 'holding', trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 };
  const b = validRow({ ...base, template: 'tpl-f' }, 'b', 3, ['holding', 'casters'], [frame, desk]);
  assert.deepEqual([b.style, b.template], ['band', 'tpl-f']);
  assert.equal(validRow({ ...base, style: 'band' }, 'b', 3, ['holding'], []).style, 'band', 'the built-in frame');
  assert.equal(validRow(base, 'b', 3, ['holding'], []).style, 'full');
  const d = validRow({ ...base, section: 'post', show: 'casters', template: 'tpl-d' }, 'd', 3, ['casters'], [frame, desk]);
  assert.equal(d.template, 'tpl-d');
  assert.throws(() => validRow({ ...base, template: 'tpl-d' }, 'b', 3, ['holding'], [frame, desk]), /different graphic/);
});

test('layers: order among siblings and lock are kept; the HUD draws only the order (20 Nov)', () => {
  const t = validTemplate({ ...ok, parts: { panel: { z: 12, locked: true }, title: { z: -3 } } });
  assert.deepEqual(t.parts.panel, { z: 12, locked: true });
  assert.throws(() => validTemplate({ ...ok, parts: { panel: { z: 140 } } }), /layer must be between -99 and 99/);
  assert.throws(() => validTemplate({ ...ok, parts: { panel: { locked: 'yes' } } }), /locked or not/);
  assert.deepEqual(hud.styles({ z: 12, locked: true }), { 'z-index': '12' }, 'lock is an editor setting only');
});

test('picture slots: the same in Air and the HUD; only pack or upload pictures, of a kind that fits, kit art kept as it is (20 Nov)', async () => {
  const { slotsOf, SLOTS } = await import('../src/shared/templates.ts');
  for (const g of Object.keys(GRAPHICS)) assert.deepEqual(hud.slotsOf(g), slotsOf(g), g);
  assert.deepEqual(hud.SLOTS, SLOTS);
  const pack = `/packs/pubgm/${'a'.repeat(64)}.png`;
  const base = { id: 'look1', name: 'Look', graphic: 'map-result|full' };
  const t = validTemplate({ ...base, parts: { background: { picture: { src: pack, kind: 'wallpaper', flip: true } } } });
  assert.deepEqual(t.parts.background, { picture: { src: pack, kind: 'wallpaper', flip: true } });
  assert.throws(() => validTemplate({ ...base, parts: { background: { picture: { src: 'https://example.com/x.png', kind: 'wallpaper' } } } }), /game pack or your uploads/);
  assert.throws(() => validTemplate({ ...base, parts: { background: { picture: { src: pack, kind: 'logo-ci' } } } }), /doesn't fit here/);
  assert.throws(() => validTemplate({ ...base, parts: { background: { picture: { src: pack, kind: 'wallpaper' }, opacity: 0.4 } } }), /used as they are/);
  assert.throws(() => validTemplate({ ...base, parts: { title: { picture: { src: pack, kind: 'wallpaper' } } } }), /comes from the graphic/);
  // The producer's own upload may be faded.
  validTemplate({ ...base, parts: { background: { picture: { src: '/air-assets/7d8c2c55-3a4e-4a8c-9f0e-1b2a3c4d5e6f', kind: 'other' }, opacity: 0.4 } } });
  const css = hud.styles(t.parts.background);
  assert.equal(css['background-image'], `url("${pack}")`);
  assert.equal(css.transform, 'scaleX(-1)');
});
