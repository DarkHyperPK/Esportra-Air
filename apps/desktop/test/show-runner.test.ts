import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShowRunner, mapComplete, triggerMatches, withScores, type Clock, type RunnerPorts, type TakeOutcome, type RunnerLog } from '../src/main/autopilot/show-runner.ts';
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
  /** Takes everything before `until` by hand. */
  const walkTo = async (until: string) => {
    for (;;) {
      const next = runner.view().next!;
      if (next.id === until) return;
      const result = await runner.take(next.id);
      assert.ok(result.ok, result.error);
    }
  };
  return { clock, runner, taken, logs, walkTo };
}

const live = { type: 'round.phase', phase: 'live' };

test('start arms the first step; manual steps never take themselves', async () => {
  const { runner, clock, taken } = setup();
  assert.equal(runner.start().ok, true);
  assert.equal(runner.view().next!.id, 'intro');
  await clock.advance(120_000);
  assert.deepEqual(taken, []);
  assert.equal(runner.view().next!.state, 'armed');
});

test('take puts the graphic on air at once (no OBS tally) and arms the next step', async () => {
  const { runner, taken } = setup();
  runner.start();
  assert.equal((await runner.take()).ok, true);
  assert.equal(runner.view().now!.id, 'intro');
  assert.equal(runner.view().next!.id, 'map1-live');
  assert.equal(runner.view().next!.state, 'armed');
  assert.deepEqual(taken, ['intro']);
});

test('the matching game event opens a visible hold window, then takes automatically', async () => {
  const { runner, clock, taken, walkTo } = setup();
  runner.start();
  await walkTo('map1-live');
  runner.onGameEvent(live);
  const view = runner.view();
  assert.equal(view.next!.state, 'holding');
  assert.equal(view.holdTotalMs, 3000);
  assert.equal(view.holdEndsAt, clock.t + 3000);
  await clock.advance(2900);
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
  assert.equal(runner.view().next!.id, 'map1-half');
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
  await clock.advance(3100);
  assert.equal(runner.view().now!.id, 'map1-live');
  await walkTo('map1-result');
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
  assert.equal((await runner.take(null, { commandId: 'c1' })).ok, true);
  assert.deepEqual(taken, ['intro'], 'the second c1 did nothing');
  assert.equal(runner.view().next!.id, 'map1-live');
});

test('a failed take returns the segment to a held state with the reason', async () => {
  const { runner, logs } = setup({ outcome: () => ({ ok: false, error: 'The match intro graphic is switched off for this production.' }) });
  runner.start();
  const result = await runner.take();
  assert.equal(result.ok, false);
  assert.equal(runner.view().next!.state, 'holding');
  assert.equal(runner.view().next!.heldBy, 'operator');
  assert.match(logs.at(-1)!.message!, /switched off/);
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
  runner.edit('intro', { trigger: 'delay', mode: 'automatic', holdMode: 'window', holdSeconds: 2, delaySeconds: 10 });
  runner.start();
  await clock.advance(9_000);
  assert.deepEqual(taken, []);
  await clock.advance(1_000);
  assert.equal(runner.view().next!.state, 'holding');
  await clock.advance(2_100);
  assert.deepEqual(taken, ['intro']);
});

test('only segments that have not started can be edited or moved', () => {
  const { runner } = setup();
  runner.start();
  assert.match(runner.edit('intro', { holdSeconds: 9 }).error!, /started/);
  assert.equal(runner.edit('map1-live', { holdSeconds: 9 }).ok, true);
  assert.equal(runner.move('map1-live', 1).ok, true);
  assert.equal(runner.view().segments[2]!.id, 'map1-live');
  assert.equal(runner.move('intro', 1).ok, false);
  assert.equal(runner.view().segments.find((s) => s.id === 'map1-live')!.holdSeconds, 9);
});

test('halftime fires on the twelfth round won, not before', async () => {
  const { runner, clock, taken, walkTo } = setup();
  runner.start();
  await walkTo('map1-half');
  runner.onGameEvent({ type: 'round.won', round: 11 });
  assert.equal(runner.view().next!.state, 'armed');
  runner.onGameEvent({ type: 'round.won', round: 12 });
  assert.equal(runner.view().next!.state, 'holding');
  await clock.advance(3100);
  assert.equal(taken.at(-1), 'map1-half');
});

test('the match start trigger takes an automatic step when the game begins', async () => {
  const { runner, clock, taken } = setup();
  runner.load(buildRundown(1));
  runner.edit('intro', { trigger: 'match_start', mode: 'automatic', holdMode: 'window', holdSeconds: 2 });
  runner.start();
  runner.onGameEvent({ type: 'round.phase', phase: 'live' });
  assert.equal(runner.view().next!.state, 'armed');
  runner.onGameEvent({ type: 'match.start' });
  await clock.advance(2100);
  assert.deepEqual(taken, ['intro']);
});

test('after a 2–0 in a best-of 3, the map 3 steps are skipped and the champion is next', async () => {
  const { runner, walkTo, logs } = setup();
  runner.start();
  await walkTo('map2-series');
  // The producer records the series (Fix data) before map 3 would start.
  runner.setSeriesMaps(2, true);
  assert.equal((await runner.take('map2-series')).ok, true);
  assert.equal(runner.view().next!.id, 'champion');
  assert.ok(runner.view().segments.filter((s) => s.mapNumber === 3).every((s) => s.state === 'done'));
  assert.ok(logs.some((l) => l.kind === 'skipped' && l.message === 'series won'));

  // A series still going (1–1) keeps map 3.
  const other = setup();
  other.runner.start();
  await other.walkTo('map2-series');
  other.runner.setSeriesMaps(2, false);
  assert.equal((await other.runner.take('map2-series')).ok, true);
  assert.equal(other.runner.view().next!.id, 'map3-live');
});

test('halftime is the 12th round played and a map end is a finished map, read from the score', () => {
  const won = (round: number, a?: number, b?: number) => withScores({ type: 'round.won', round }, a === undefined ? undefined : [{ score: a }, { score: b }]);
  assert.ok(triggerMatches('halftime', won(9, 7, 5)), 'rounds add up to 12, though the parser counted 9 (capture started late)');
  assert.ok(!triggerMatches('halftime', won(12, 7, 6)), '13 rounds played is not halftime');
  assert.ok(triggerMatches('halftime', won(12)), 'without scores, the round count');
  const end = (a: number, b: number) => withScores({ type: 'match.end' }, [{ score: a }, { score: b }]);
  assert.ok(triggerMatches('map_end', end(13, 7)));
  assert.ok(triggerMatches('map_end', end(15, 13)), 'overtime');
  assert.ok(!triggerMatches('map_end', end(3, 2)), 'a remake is not a map end');
  assert.ok(!triggerMatches('map_end', end(13, 13)));
  assert.ok(triggerMatches('map_end', { type: 'match.end' }), 'without scores Air trusts the game');
  assert.deepEqual([mapComplete([13, 11]), mapComplete([12, 10]), mapComplete([14, 12])], [true, false, true]);
  assert.deepEqual(withScores({ type: 'round.phase' }, [{ score: 1 }, { score: 2 }]), { type: 'round.phase' }, 'only rounds won and map ends carry scores');
});
