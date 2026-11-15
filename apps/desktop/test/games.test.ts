import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, PROFILES, gameOf } from '../src/shared/games.ts';

test('every game module says what Air shows for it, in the producer’s words', () => {
  for (const g of GAMES) {
    if (!g.available) {
      assert.deepEqual([g.identity, g.matchData, g.playerPcData, g.pack], [null, '', null, ''], `${g.name} is coming later and promises nothing`);
      continue;
    }
    assert.ok(g.identity && g.identity.label && g.identity.placeholder && g.identity.help, `${g.name} identity`);
    assert.ok(g.matchData && g.pack, `${g.name} match data and pack`);
    for (const line of [g.matchData, g.playerPcData ?? '', g.identity!.label, g.identity!.help]) {
      assert.doesNotMatch(line, /overwolf|gep|websocket|riot|engine|ingest/i, `no vendor or internal words: ${line}`);
    }
  }
  assert.equal(gameOf('valorant')?.name, 'Valorant');
  assert.equal(gameOf(null), null);
  assert.deepEqual(PROFILES.map((p) => p.id), ['one-pc', 'observer', 'player-pcs']);
});
