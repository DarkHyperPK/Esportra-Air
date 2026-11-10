import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, defaults } from '../src/main/store.ts';

test('older saves move event, sponsors and lineups onto each match', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'air-store-')), 'air.json');
  const old = defaults() as any;
  old.setup.brand = { eventName: 'Community Cup', stage: 'Playoffs' };
  old.setup.sponsors = ['Acme'];
  old.matches = [
    { id: 'm1', code: 'Q1234567', kind: 'quick', title: 'A vs B', bestOf: 3, teams: [{ name: 'A', tag: 'A', color: '#fff', logo: '' }, { name: 'B', tag: 'B', color: '#000', logo: '' }], casters: [], createdAt: 1 },
    { id: 'm2', code: 'E1234567', kind: 'esportra', title: 'C vs D', bestOf: 1, teams: [{ name: 'C', tag: 'C', color: '#fff', logo: '' }, { name: 'D', tag: 'D', color: '#000', logo: '' }], casters: [], createdAt: 2, source: { matchId: 'x', tournamentId: 't', tournament: 'Spring Open', scheduledAt: null, lineups: [['P1', 'P2'], ['Q1']] } },
  ];
  writeFileSync(file, JSON.stringify(old));
  const store = new Store(file);
  const [a, b] = store.data.matches;
  assert.deepEqual([a!.game, a!.event, a!.sponsors, a!.players], ['valorant', { name: 'Community Cup', stage: 'Playoffs' }, ['Acme'], [[], []]]);
  assert.equal(b!.event.name, 'Spring Open', 'an Esportra match keeps its tournament name');
  assert.deepEqual(b!.players.map((t) => t.map((p) => p.name)), [['P1', 'P2'], ['Q1']]);
  assert.match(b!.players[0]![0]!.id, /^[0-9a-f-]{36}$/);
});
