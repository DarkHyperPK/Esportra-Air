import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameRecorder } from '../../../packages/capture/src/recorder.ts';

test('Record game data: raw lines to a local file, stopping by itself 10 s after the map ends', () => {
  let now = 1_000_000;
  const dir = mkdtempSync(join(tmpdir(), 'rec-'));
  const rec = new GameRecorder({ dir, now: () => now });
  rec.write('info', { key: 'ignored' });
  assert.equal(rec.view().on, false, 'nothing is written before it starts');
  rec.start();
  const file = rec.view().file!;
  rec.write('info', { feature: 'match_info', key: 'roster_0', value: '{"name":"A"}' });
  rec.write('event', { feature: 'match_info', key: 'match_end', value: null });
  now += 5_000;
  rec.write('info', { feature: 'match_info', key: 'match_outcome', value: 'victory' });
  assert.equal(rec.view().on, true, 'still recording what follows the map end');
  now += 6_000;
  rec.write('info', { feature: 'game_info', key: 'scene', value: 'MainMenu' });
  assert.deepEqual([rec.view().on, rec.view().stopped], [false, 'The map ended.']);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0].message, { feature: 'match_info', key: 'roster_0', value: '{"name":"A"}' }, 'exactly as the game gave it');
  rec.write('info', { key: 'after' });
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 4, 'nothing after it stopped');
});
