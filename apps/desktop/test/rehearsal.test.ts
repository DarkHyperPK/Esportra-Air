import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_GAME_NAMES } from '../src/shared/rehearsal.ts';
import { rehearsalRoster } from '../src/main/rehearsal.ts';

test('the sample game names match the engine’s test round, in scoreboard order per team', () => {
  const script = JSON.parse(readFileSync(new URL('../../../engine/crates/air-engine/test-round.json', import.meta.url), 'utf8'));
  const found: [string[], string[]] = [[], []];
  for (const step of script.steps) {
    for (const msg of Array.isArray(step.body) ? step.body : [step.body]) {
      const m = /^scoreboard_(\d)$/.exec(String(msg?.key ?? ''));
      if (!m) continue;
      const p = JSON.parse(msg.data);
      found[p.team as 0 | 1][Number(m[1]) % 5] = p.name;
    }
  }
  assert.deepEqual(found, SAMPLE_GAME_NAMES);
});

test('each sample player is known by the match’s own player in the same position', () => {
  const match = { players: [[{ name: 'Juno Park', photo: '/air-assets/x', gameId: 'Juno#EU1', realName: '', id: 'a' }], []] } as never;
  const roster = rehearsalRoster(match);
  assert.deepEqual(roster[0]![0], { gameId: 'JUNO#NWL', name: 'Juno Park', photo: '/air-assets/x' });
  assert.deepEqual(roster[1]![4], { gameId: 'ZEN#CRF', name: '', photo: '' }, 'no player there: the sample name stays');
});
