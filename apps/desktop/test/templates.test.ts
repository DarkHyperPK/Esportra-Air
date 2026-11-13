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
