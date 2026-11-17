import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapArt } from '../src/shared/map-art.ts';
import { VALORANT_MAPS, deciderSideTeam, vetoNeedsSide } from '../src/shared/match-data.ts';

test('every map Air knows has its picture in the HUD catalogue', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../../../esportra-valorant-hud/core/catalog.js'), 'utf8');
  const cat = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  for (const m of VALORANT_MAPS) {
    const url = mapArt(5310, m)!;
    assert.equal(url.replace('http://127.0.0.1:5310/art/', 'https://media.valorant-api.com/'), cat.maps[m].tall, m);
  }
});

test('the decider side is chosen as on Esportra, and a pick without a side holds the veto', () => {
  assert.deepEqual([deciderSideTeam(1, 0), deciderSideTeam(3, 1), deciderSideTeam(5, 0)], [0, 1, 1]);
  assert.equal(vetoNeedsSide([{ team: 0, action: 'ban', map: 'ABYSS' }]), -1);
  assert.equal(vetoNeedsSide([{ team: 0, action: 'ban', map: 'ABYSS' }, { team: 1, action: 'pick', map: 'LOTUS' }]), 1);
  assert.equal(vetoNeedsSide([{ team: -1, action: 'decider', map: 'SUNSET', side: 'DEF' }]), -1);
});
