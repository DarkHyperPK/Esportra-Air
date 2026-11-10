import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptureStats, featuresOf } from '../src/main/capture-stats.ts';

test('GEP messages map to the features the page lists', () => {
  assert.deepEqual(featuresOf({ feature: 'match_info', key: 'scoreboard_3', data: '{}' }), ['match_info.scoreboard']);
  assert.deepEqual(featuresOf({ info: { match_info: { round_phase: 'combat', round_number: '2' } }, feature: 'match_info' }).sort(), ['match_info.round_number', 'match_info.round_phase']);
  assert.deepEqual(featuresOf({ events: [{ name: 'kill_feed', data: '' }, { name: 'spike_defused', data: '' }] }).sort(), ['event.kill_feed', 'event.spike']);
  assert.deepEqual(featuresOf({ events: [{ name: 'match_end' }] }), ['event.match']);
  assert.deepEqual(featuresOf({ info: { me: { health: '100' } } }), ['me']);
  assert.deepEqual(featuresOf({ type: 'heartbeat' }), [], 'heartbeats carry no feature');
  assert.deepEqual(featuresOf(null), []);
});

test('freshness, sparklines, rate and gaps follow the clock', () => {
  let t = 1_000_000;
  const stats = new CaptureStats(() => t);
  const view = () => stats.view();
  const row = (id: string) => view().features.find((f) => f.id === id)!;
  assert.equal(row('match_info.round_phase').status, 'waiting');
  assert.equal(row('me').status, 'player-pc');
  stats.record({ feature: 'match_info', key: 'round_phase', data: 'combat' });
  stats.record({ feature: 'match_info', key: 'round_phase', data: 'end' });
  assert.equal(row('match_info.round_phase').status, 'live');
  assert.equal(row('match_info.round_phase').spark.at(-1), 2);
  assert.equal(view().messagesPerSec, 0.4);
  t += 12_000;
  assert.equal(row('match_info.round_phase').status, 'quiet', 'a stream that went silent');
  stats.record({ events: [{ name: 'kill_feed' }] });
  assert.equal(view().gaps, 1, 'a 12 s silence is a gap');
  t += 120_000;
  assert.equal(row('event.kill_feed').status, 'live', 'events stay seen for the match');
  assert.equal(row('match_info.round_phase').spark.every((n) => n === 0), true, 'the sparkline slid past old data');
  assert.equal(view().messagesPerSec, 0);
  stats.reset();
  assert.equal(row('event.kill_feed').status, 'waiting');
  assert.equal(view().total, 0);
});
