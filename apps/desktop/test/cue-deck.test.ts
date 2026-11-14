import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CueDeck, type GraphicAction } from '../src/main/cue-deck.ts';

function deck(opts: { failOn?: string } = {}) {
  let match: { id: string; code: string } | null = { id: 'm1', code: 'M1' };
  const onAir: GraphicAction[] = [];
  const logs: string[] = [];
  const client = { get: async () => ({ state: {} }), put: async () => ({}), post: async () => ({}) } as never;
  const d = new CueDeck({
    match: () => match, client: () => client, engineRunning: () => true,
    act: async (name, args) => { if (name === opts.failOn) throw new Error('engine refused'); onAir.push({ name, args }); },
    refresh: async () => {}, matchesAir: (a) => a.at(-1)!.name === 'fullscreen.show' && a.at(-1)!.args.screen === 'on-air-now',
    log: (t) => logs.push(t), changed: () => {},
  });
  return { d, onAir, logs, setMatch: (m: typeof match) => { match = m; } };
}
const fs = (screen: string | null): GraphicAction[] => [{ name: 'fullscreen.show', args: { screen } }];

test('a later cue for the same slot replaces the earlier one; going back to what is on air uncues it', async () => {
  const { d, logs } = deck();
  await d.graphic('Series', fs('series'));
  await d.graphic('Map result', fs('map-result'));
  assert.deepEqual(d.pending.map((c) => c.label), ['Map result'], 'one full-screen graphic at a time');
  await d.graphic('On air already', fs('on-air-now'));
  assert.deepEqual(d.pending, []);
  assert.ok(logs.includes('Uncued · On air already'));
});

test('Take puts everything cued on air; a failure keeps what did not go on air cued', async () => {
  const { d, onAir } = deck({ failOn: 'lowerthird.show' });
  await d.graphic('Map result', fs('map-result'));
  await d.graphic('Lower third', [{ name: 'lowerthird.show', args: {} }]);
  await assert.rejects(d.take('cut'), /engine refused/);
  assert.deepEqual(onAir.map((a) => a.name), ['fullscreen.show']);
  assert.deepEqual(d.pending.map((c) => c.label), ['Lower third'], 'the rest stays cued for another Take');
});

test('cues belong to their match; cueing off sends straight to air', async () => {
  const { d, onAir, setMatch } = deck();
  await d.graphic('Map result', fs('map-result'));
  setMatch({ id: 'm2', code: 'M2' });
  assert.deepEqual(d.pending, [], 'switching match drops them');
  await assert.rejects(d.take(), /Nothing is cued/);
  d.setMode(false);
  await d.graphic('Series', fs('series'));
  assert.equal(onAir.at(-1)!.args.screen, 'series');
  setMatch(null);
  await assert.rejects(d.graphic('x', fs('x')), /Choose a match/);
});
