import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShowTemplates, loadShowTemplates } from '../src/main/show-templates.ts';
import { DEFAULT_SCREENS } from '../src/main/store.ts';
import { ALL_PICK_SCREENS } from '../src/shared/show-templates.ts';
import { readFileSync } from 'node:fs';
import type { RundownRow } from '../src/shared/autopilot.ts';
import { defaultSection } from '../src/shared/autopilot.ts';

function harness() {
  const data: any = {};
  let rows: RundownRow[] = [];
  let theme = 'broadcast', pause: 'box' | 'panel' | 'bar' = 'box';
  const match = { id: 'm1', bestOf: 3 as const, get theme() { return theme; } } as any;
  const shows = new ShowTemplates({
    store: { data, save() {} } as any, match: () => match, rows: () => rows,
    replaceRows: (r) => { rows = r; }, screens: () => DEFAULT_SCREENS.map((s) => s.id), looks: () => [],
    sectionOf: (s) => defaultSection(s), purposeOf: () => null,
    pause: () => pause, setPause: async (p) => { pause = p; }, setTheme: async (t) => { theme = t; }, log: () => {},
  });
  return { shows, data, rows: () => rows, setTheme: (t: string) => { theme = t; }, setPause: (p: typeof pause) => { pause = p; }, pause: () => pause, theme: () => theme };
}

test('New match offers every screen the show templates know', () => {
  const src = readFileSync(new URL('../src/renderer/components/ScreenPicker.tsx', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/\{ id: '([a-z-]+)', overlay:/g)].map((m) => m[1]), ALL_PICK_SCREENS);
});

test('a show template sets the match’s rows, banner style and pause; a match’s show can be kept as a template', async () => {
  const h = harness();
  assert.deepEqual(h.shows.views().filter((v) => v.builtIn).map((v) => v.name), ['Standard', 'Results only', 'Everything', 'Just the HUD']);
  await h.shows.apply('builtin:results');
  assert.deepEqual([...new Set(h.rows().map((r) => r.show))].filter(Boolean).sort(), ['champion', 'in-game', 'map-result', 'series']);
  // Change the show, then keep it.
  const rows = h.rows().map((r) => (r.show === 'map-result' ? { ...r, style: 'band' as const } : r));
  (h as any).shows.ctx.replaceRows(rows, 'standard');
  h.setTheme('monument'); h.setPause('bar');
  const id = h.shows.save({ name: 'Northstar finals' });
  assert.throws(() => h.shows.save({ name: 'northstar finals' }), /already called/);
  const view = h.shows.views().find((v) => v.id === id)!;
  assert.deepEqual([view.builtIn, view.theme, view.pause, view.uses], [false, 'monument', 'bar', 1]);
  assert.equal(view.screens.find((x) => x.show === 'map-result')?.style, 'band');
  // Applying it elsewhere brings everything back.
  await h.shows.apply('builtin:standard');
  h.setTheme('broadcast'); h.setPause('box');
  await h.shows.apply(id);
  assert.deepEqual([h.theme(), h.pause()], ['monument', 'bar']);
  assert.equal(h.rows().find((r) => r.show === 'map-result')?.style, 'band');
  // Copies, renames and deletes; built-ins stay.
  const copy = h.shows.duplicate('builtin:standard');
  h.shows.rename(copy, 'Standard plus');
  assert.ok(h.shows.views().some((v) => v.name === 'Standard plus'));
  h.shows.remove(copy);
  assert.throws(() => h.shows.remove('builtin:standard'), /cannot be deleted/);
  await assert.rejects(h.shows.apply('nope'), /no longer exists/);
});

test('saved show templates are checked when read from disk', () => {
  assert.deepEqual(loadShowTemplates('x'), []);
  const t = loadShowTemplates([{ id: 'a', name: 'A', rows: [], theme: 'nope', pause: 'nope' }, { bad: 1 }]);
  assert.deepEqual(t, [{ id: 'a', name: 'A', rows: [], theme: 'broadcast', pause: 'box' }]);
});
