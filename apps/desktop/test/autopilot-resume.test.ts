import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Autopilot } from '../src/main/autopilot/autopilot.ts';
import { Store } from '../src/main/store.ts';

const screens = ['match-intro', 'halftime', 'map-result', 'champion'].map((id) => ({ id, enabled: true })) as never;
const settle = () => new Promise<void>((r) => setImmediate(r));

function make(store: Store, persist = true) {
  return new Autopilot({ store, match: () => ({ id: 'm1', bestOf: 1 }) as never, screens: () => screens, showGraphic: async () => {}, showing: () => null, log: () => {}, changed: () => {}, persist });
}

test('after a restart autopilot resumes where it was instead of starting over', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'air-ap-')), 'air.json');
  const a = make(new Store(file));
  a.loadForMatch();
  a.start();
  await a.take(); // intro
  await a.take(); // back to the game
  await settle();
  assert.equal(a.view().now?.id, 'map1-live');
  a.stopAll();

  // Air restarts: a new store read from disk, a new autopilot.
  const b = make(new Store(file));
  b.loadForMatch();
  const v = b.view();
  assert.equal(v.enabled, false, 'never switches itself on');
  assert.equal(v.resumeAt, 'Map 1 · halftime');
  assert.deepEqual(v.segments.map((s) => `${s.id}:${s.state}`).slice(0, 3), ['intro:done', 'map1-live:on_air', 'map1-half:queued']);
  b.start();
  assert.equal(b.view().next?.id, 'map1-half', 'resumes at the next unfinished step');
  b.stop();

  // Starting the rundown again forgets the progress.
  b.restartRundown();
  assert.equal(b.view().resumeAt, null);
  assert.ok(b.view().segments.every((s) => s.state === 'queued'));
  b.stopAll();
});

test('the private rehearsal never saves autopilot progress', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'air-ap-')), 'air.json'));
  const r = make(store, false);
  r.loadForMatch();
  r.start();
  await r.take();
  await settle();
  assert.equal(store.data.autopilotProgress?.m1, undefined);
  r.stopAll();
});
