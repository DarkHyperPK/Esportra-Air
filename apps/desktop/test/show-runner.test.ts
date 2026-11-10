import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShowRunner, type Clock, type RunnerPorts, type TakeOutcome, type RunnerLog } from '../src/main/autopilot/show-runner.ts';
import { buildRundown } from '../src/main/autopilot/rundown.ts';

class FakeClock implements Clock {
  t = 1_000;
  private timers: Array<{ id: number; at: number; fn: () => void }> = [];
  private next = 1;
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = this.next++; this.timers.push({ id, at: this.t + ms, fn }); return id; }
  clearTimeout(handle: unknown) { this.timers = this.timers.filter((x) => x.id !== handle); }
  /** Advances time, firing timers in order and letting promises settle between them. */
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
      await settle();
    }
    this.t = end;
  }
}
const settle = () => new Promise<void>((r) => setImmediate(r));

function setup(options: { outcome?: () => TakeOutcome | Promise<TakeOutcome> } = {}) {
  const clock = new FakeClock();
  const taken: string[] = [];
  const logs: RunnerLog[] = [];
  const ports: RunnerPorts = {
    take: async (seg, stillAllowed) => {
      const result = (await options.outcome?.()) ?? { ok: true };
      if (!stillAllowed()) return { ok: false, error: 'Take cancelled because production changed.' };
      if (result.ok) taken.push(seg.id);
      return result;
    },
  };
  const runner = new ShowRunner(ports, clock);
  runner.on('log', (l: RunnerLog) => logs.push(l));
  runner.load(buildRundown(3));
  runner.setSeriesMaps(0);
  /** Takes everything before `until` by hand, confirming each on air through the tally. */
  const walkTo = async (until: string) => {
    for (;;) {
      const next = runner.view().next!;
      if (next.id === until) return;
      const result = await runner.take(next.id);
      assert.ok(result.ok, result.error);
      runner.onProgram(next.scene);
    }
  };
  return { clock, runner, taken, logs, walkTo };
}

const live = { type: 'round.phase', phase: 'live' };

test('start arms the first segment; manual segments never take themselves', async () => {
  const { runner, clock, taken } = setup();
  assert.equal(runner.start().ok, true);
  assert.equal(runner.view().next!.id, 'starting-soon');
  await clock.advance(120_000);
  assert.deepEqual(taken, []);
  assert.equal(runner.view().next!.state, 'armed');
});

test('take puts a segment on air once OBS confirms, then arms the next', async () => {
  const { runner, taken } = setup();
  runner.start();
  assert.equal((await runner.take()).ok, true);
  assert.equal(runner.view().next!.state, 'taking');
  runner.onProgram('Esportra · Holding');
  assert.equal(runner.view().now!.id, 'starting-soon');
  assert.equal(runner.view().next!.id, 'intro');
  assert.deepEqual(taken, ['starting-soon']);
});

test('a take OBS never confirms returns to armed after three seconds', async () => {
  const { runner, clock, logs } = setup();
  runner.start();
  await runner.take();
  await clock.advance(3100);
  assert.equal(runner.view().next!.state, 'armed');
  assert.match(logs.at(-1)!.message ?? '', /did not confirm/);
});

test('the matching game event opens a visible hold window, then takes automatically', async () => {
  const { runner, clock, taken, walkTo } = setup();
  runner.start();
  await walkTo('map1-live');
  runner.onGameEvent(live);
  const view = runner.view();
  assert.equal(view.next!.state, 'holding');
  assert.equal(view.holdTotalMs, 5000);
  assert.equal(view.holdEndsAt, clock.t + 5000);
  await clock.advance(4900);
  assert.equal(taken.includes('map1-live'), false);
  await clock.advance(200);
  assert.equal(taken.at(-1), 'map1-live');
});

test('hold freezes the countdown until Take; skip moves on', async () => {
  const { runner, clock, taken, walkTo, logs } = setup();
  runner.start();
  await walkTo('map1-live');
  runner.onGameEvent(live);
  assert.equal(runner.hold().ok, true);
  assert.equal(runner.view().holdEndsAt, null);
  assert.equal(runner.view().next!.heldBy, 'operator');
  await clock.advance(60_000);
  assert.equal(taken.includes('map1-live'), false);
  assert.equal(runner.skip().ok, true);
  assert.equal(runner.view().next!.id, 'map1-result');
  assert.equal(logs.some((l) => l.kind === 'held' && l.actor === 'operator'), true);
  assert.equal(logs.some((l) => l.kind === 'skipped'), true);
});

test('an event for another map does not arm the segment', async () => {
  const { runner, walkTo } = setup();
  runner.start();
  runner.setSeriesMaps(1); // the score says a map is already won, so this is map 2
  await walkTo('map1-live');
  runner.onGameEvent(live);
  assert.equal(runner.view().next!.state, 'armed');
  runner.setSeriesMaps(0);
  runner.onGameEvent(live);
  assert.equal(runner.view().next!.state, 'holding');
});

test('the map counter advances by itself when a map result is taken or skipped', async () => {
  const { runner, clock, walkTo } = setup();
  runner.start();
  assert.equal(runner.view().map, 1);
  await walkTo('map1-live');
  runner.onGameEvent(live);
  await clock.advance(5100);
  runner.onProgram('Esportra · Gameplay');
  assert.equal(runner.view().map, 1, 'still map 1 until its result is done');
  runner.onGameEvent({ type: 'match.end' });
  runner.skip(); // the producer skips the result
  assert.equal(runner.view().map, 2);
  await walkTo('map2-live');
  runner.onGameEvent(live);
  assert.equal(runner.view().next!.state, 'holding', 'map 2 arms without anyone entering a score');
});

test('a pause cancels the countdown and the take is not replayed after resume', async () => {
  const { runner, clock, taken, walkTo } = setup();
  runner.start();
  await walkTo('map1-live');
  runner.onGameEvent(live);
  runner.pause('tech');
  await clock.advance(30_000);
  assert.equal(taken.includes('map1-live'), false);
  assert.equal(runner.view().next!.state, 'armed');
  assert.equal(runner.view().holdEndsAt, null);
  runner.resume();
  await clock.advance(30_000);
  assert.equal(taken.includes('map1-live'), false, 'no catch-up take');
  assert.equal((await runner.take()).ok, true, 'the operator can still take');
});

test('nothing takes during a pause or timeout, and timeout ending does not clear a tech pause', async () => {
  const { runner } = setup();
  runner.start();
  runner.pause('timeout');
  assert.match((await runner.take()).error!, /timeout/i);
  runner.pause('tech');
  assert.equal(runner.view().paused, 'tech');
  runner.resume('timeout');
  assert.equal(runner.view().paused, 'tech');
  assert.match((await runner.take()).error!, /Technical pause/);
  runner.resume('tech');
  assert.equal(runner.view().paused, null);
});

test('OBS disconnect pauses; a later operator pause does not hide it', () => {
  const { runner } = setup();
  runner.start();
  runner.pause('obs');
  runner.pause('tech');
  assert.equal(runner.view().paused, 'obs');
  runner.resume('tech');
  assert.equal(runner.view().paused, 'obs');
  runner.resume('obs');
  assert.equal(runner.view().paused, null);
});

test('a pause that arrives while a take is being prepared cancels it', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { runner, taken } = setup({ outcome: async () => { await gate; return { ok: true }; } });
  runner.start();
  const pending = runner.take();
  await settle();
  runner.pause('tech');
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.deepEqual(taken, []);
  assert.equal(runner.view().next!.state, 'armed');
});

test('duplicate command ids are ignored', async () => {
  const { runner, taken } = setup();
  runner.start();
  assert.equal((await runner.take(null, { commandId: 'c1' })).ok, true);
  runner.onProgram('Esportra · Holding');
  assert.equal((await runner.take(null, { commandId: 'c1' })).ok, true);
  assert.deepEqual(taken, ['starting-soon'], 'the second c1 did nothing');
  assert.equal(runner.view().next!.id, 'intro');
});

test('a failed take returns the segment to a held state with the reason', async () => {
  const { runner, logs } = setup({ outcome: () => ({ ok: false, error: 'Turn on Studio Mode so takes go through Preview.' }) });
  runner.start();
  const result = await runner.take();
  assert.equal(result.ok, false);
  assert.equal(runner.view().next!.state, 'holding');
  assert.equal(runner.view().next!.heldBy, 'operator');
  assert.match(logs.at(-1)!.message!, /Studio Mode/);
});

test('a scene that is already on air confirms without waiting for OBS', async () => {
  const { runner } = setup({ outcome: () => ({ ok: true, alreadyOnAir: true }) });
  runner.start();
  await runner.take();
  assert.equal(runner.view().now!.id, 'starting-soon');
});

test('stop is Run manually: countdowns clear and nothing takes', async () => {
  const { runner, clock, taken, walkTo } = setup();
  runner.start();
  await walkTo('map1-live');
  runner.onGameEvent(live);
  runner.stop();
  await clock.advance(20_000);
  assert.equal(taken.includes('map1-live'), false);
  assert.equal(runner.view().enabled, false);
  assert.match((await runner.take()).error!, /off/i);
  runner.onGameEvent(live);
  assert.equal(runner.view().next, null);
});

test('the delay trigger counts from arming', async () => {
  const { runner, clock, taken } = setup();
  runner.load(buildRundown(1));
  runner.edit('starting-soon', { trigger: 'delay', mode: 'automatic', holdMode: 'window', holdSeconds: 2, delaySeconds: 10 });
  runner.start();
  await clock.advance(9_000);
  assert.deepEqual(taken, []);
  await clock.advance(1_000);
  assert.equal(runner.view().next!.state, 'holding');
  await clock.advance(2_100);
  assert.deepEqual(taken, ['starting-soon']);
});

test('only segments that have not started can be edited or moved', () => {
  const { runner } = setup();
  runner.start();
  assert.match(runner.edit('starting-soon', { holdSeconds: 9 }).error!, /started/);
  assert.equal(runner.edit('intro', { holdSeconds: 9 }).ok, true);
  assert.equal(runner.move('intro', 1).ok, true);
  assert.equal(runner.view().segments[2]!.id, 'intro');
  assert.equal(runner.move('starting-soon', 1).ok, false);
  assert.equal(runner.view().segments.find((s) => s.id === 'intro')!.holdSeconds, 9);
});
